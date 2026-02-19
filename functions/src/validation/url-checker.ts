import { logger } from "firebase-functions/v2";

const TIMEOUT_MS = 5_000;
const MAX_CONCURRENCY = 10;

export interface UrlCheckResult {
  url: string;
  reachable: boolean;
  status?: number;
  error?: string;
}

async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "AI4Society-Validator/1.0" },
      redirect: "follow",
    });

    clearTimeout(timeout);
    const reachable = res.status >= 200 && res.status < 400;
    return { url, reachable, status: res.status };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      url,
      reachable: false,
      error: isTimeout ? "timeout" : (err instanceof Error ? err.message : "unknown"),
    };
  }
}

export async function checkUrls(urls: string[]): Promise<{
  results: Map<string, UrlCheckResult>;
  stats: { total: number; reachable: number; unreachable: number; timeouts: number };
}> {
  const unique = [...new Set(urls)];
  const results = new Map<string, UrlCheckResult>();
  const stats = { total: unique.length, reachable: 0, unreachable: 0, timeouts: 0 };

  // Process in batches of MAX_CONCURRENCY
  for (let i = 0; i < unique.length; i += MAX_CONCURRENCY) {
    const batch = unique.slice(i, i + MAX_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkUrl));
    for (const result of batchResults) {
      results.set(result.url, result);
      if (result.reachable) {
        stats.reachable++;
      } else if (result.error === "timeout") {
        stats.timeouts++;
      } else {
        stats.unreachable++;
      }
    }
  }

  logger.info(`URL checks: ${stats.reachable}/${stats.total} reachable, ${stats.unreachable} unreachable, ${stats.timeouts} timeouts`);
  return { results, stats };
}
