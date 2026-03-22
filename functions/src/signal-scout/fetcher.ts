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
  image_url?: string;
}

const rssParser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "AI4Society-SignalScout/2.0",
  },
});

async function extractOgImage(articleUrl: string): Promise<string | undefined> {
  if (!articleUrl) return undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(articleUrl, {
      headers: { "User-Agent": "AI4Society-SignalScout/2.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return undefined;

    // Only read first 50KB to find OG tags in <head>
    const reader = res.body?.getReader();
    if (!reader) return undefined;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    // Match og:image or og:image:secure_url
    const match = html.match(
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i
    );

    if (!match?.[1]) return undefined;

    // Resolve relative URLs
    let imageUrl = match[1];
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      const base = new URL(articleUrl);
      imageUrl = `${base.origin}${imageUrl}`;
    }

    return imageUrl;
  } catch {
    return undefined;
  }
}

async function fetchRSS(source: DataSource): Promise<RawArticle[]> {
  const feed = await rssParser.parseURL(source.url);
  const articles: RawArticle[] = [];

  for (const item of feed.items ?? []) {
    // Try RSS enclosure first (common for media-rich feeds)
    let image_url = (item.enclosure as { url?: string } | undefined)?.url;

    // Fall back to OG meta tag extraction
    if (!image_url && item.link) {
      image_url = await extractOgImage(item.link);
    }

    articles.push({
      title: item.title ?? "Untitled",
      url: item.link ?? "",
      source_name: source.name,
      source_id: source.id,
      published_date: item.isoDate ?? new Date().toISOString(),
      snippet: item.contentSnippet?.slice(0, 500),
      image_url,
    });
  }

  return articles;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let data: Record<string, unknown>;
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "AI4Society-SignalScout/2.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new Error(`API returned HTML instead of JSON (content-type: ${contentType})`);
    }

    data = await res.json();
  } finally {
    clearTimeout(timeout);
  }

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

async function fetchWithRetry(source: DataSource, maxRetries = 2): Promise<RawArticle[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return source.type === "rss"
        ? await fetchRSS(source)
        : await fetchAPI(source);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Only retry on transient network errors, not on format/content errors
      const isTransient = msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") ||
        msg.includes("ENOTFOUND") || msg.includes("abort") || msg.includes("network");
      if (!isTransient || attempt === maxRetries) break;
      const delay = 2_000 * (attempt + 1);
      logger.info(`Retrying ${source.name} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
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
      let articles = await fetchWithRetry(source);
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
