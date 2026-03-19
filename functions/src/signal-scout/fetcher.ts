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

export interface SourceFetchHealth {
  status: "ok" | "empty" | "error";
  count: number;
  error?: string;
}

export interface FetchAllResult {
  articles: RawArticle[];
  sourceHealth: Record<string, SourceFetchHealth>;
}

export async function fetchAllSources(enabledSourceIds?: Set<string>): Promise<FetchAllResult> {
  const results: RawArticle[] = [];
  const sourceHealth: Record<string, SourceFetchHealth> = {};

  for (const source of DATA_SOURCES) {
    if (enabledSourceIds && !enabledSourceIds.has(source.id)) {
      logger.info(`Skipping disabled source: ${source.name}`);
      continue;
    }
    try {
      let articles =
        source.type === "rss"
          ? await fetchRSS(source)
          : await fetchGDELT(source);
      if (source.maxItems && articles.length > source.maxItems) {
        articles = articles.slice(0, source.maxItems);
      }
      results.push(...articles);
      sourceHealth[source.id] = { status: articles.length > 0 ? "ok" : "empty", count: articles.length };
      logger.info(`Fetched ${articles.length} articles from ${source.name}`);
    } catch (err) {
      logger.warn(`Failed to fetch from ${source.name}:`, err);
      sourceHealth[source.id] = {
        status: "error",
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const articles = results.filter((article) => {
    if (!article.url || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });

  return { articles, sourceHealth };
}
