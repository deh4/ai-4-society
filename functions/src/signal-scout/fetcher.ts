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
    "User-Agent": "AI4Society-SignalScout/2.0",
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

function parseApiDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  try {
    return new Date(raw).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function fetchAPI(source: DataSource): Promise<RawArticle[]> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "AI4Society-SignalScout/2.0" },
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data = await res.json();

  // GDELT format: { articles: [{ title, url, seendate, domain }] }
  if (data.articles && Array.isArray(data.articles)) {
    return data.articles.map(
      (a: { title?: string; url?: string; seendate?: string; domain?: string; publishedAt?: string; description?: string; source?: { name?: string } }) => ({
        title: a.title ?? "Untitled",
        url: a.url ?? "",
        source_name: a.domain ?? a.source?.name ?? source.name,
        source_id: source.id,
        published_date: parseApiDate(a.seendate ?? a.publishedAt),
        snippet: (a.description ?? "").slice(0, 500),
      })
    );
  }

  // Semantic Scholar format: { data: [{ title, year, abstract, url, paperId }] }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map(
      (a: { title?: string; year?: number; abstract?: string; url?: string; paperId?: string }) => ({
        title: a.title ?? "Untitled",
        url: a.url ?? (a.paperId ? `https://www.semanticscholar.org/paper/${a.paperId}` : ""),
        source_name: source.name,
        source_id: source.id,
        published_date: a.year ? `${a.year}-01-01T00:00:00Z` : new Date().toISOString(),
        snippet: (a.abstract ?? "").slice(0, 500),
      })
    );
  }

  throw new Error(`Unrecognized API response format from ${source.name}`);
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
          : await fetchAPI(source);
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
