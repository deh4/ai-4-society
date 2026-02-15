import Parser from "rss-parser";
import { DATA_SOURCES, type DataSource } from "../config/sources.js";
import { logger } from "firebase-functions/v2";

export interface RawArticle {
  title: string;
  url: string;
  source_name: string;
  source_id: string;
  published_date: string; // ISO string
  snippet?: string;
}

const rssParser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "AI4Society-SignalScout/1.0",
  },
});

async function fetchRSS(source: DataSource): Promise<RawArticle[]> {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.link ?? "",
    source_name: source.name,
    source_id: source.id,
    published_date: item.isoDate ?? new Date().toISOString(),
    snippet: item.contentSnippet?.slice(0, 500),
  }));
}

async function fetchGDELT(source: DataSource): Promise<RawArticle[]> {
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`GDELT returned ${res.status}`);
  const data = await res.json();
  const articles = data.articles ?? [];
  return articles.map((a: { title?: string; url?: string; seendate?: string; domain?: string }) => ({
    title: a.title ?? "Untitled",
    url: a.url ?? "",
    source_name: a.domain ?? source.name,
    source_id: source.id,
    published_date: a.seendate
      ? new Date(a.seendate).toISOString()
      : new Date().toISOString(),
  }));
}

export async function fetchAllSources(): Promise<RawArticle[]> {
  const results: RawArticle[] = [];

  for (const source of DATA_SOURCES) {
    try {
      const articles =
        source.type === "rss"
          ? await fetchRSS(source)
          : await fetchGDELT(source);
      results.push(...articles);
      logger.info(`Fetched ${articles.length} articles from ${source.name}`);
    } catch (err) {
      logger.warn(`Failed to fetch from ${source.name}:`, err);
      // Continue with other sources
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return results.filter((article) => {
    if (!article.url || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}
