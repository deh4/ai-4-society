import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "../../signal-scout/fetcher.js";

export interface FilterStats {
  input: number;
  afterCredibility: number;
  afterRecency: number;
  afterUrlDedup: number;
  afterTitleDedup: number;
  afterKeyword: number;
}

export interface FilterResult {
  articles: RawArticle[];
  stats: FilterStats;
}

const RECENCY_DAYS = 7;
const TITLE_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_CREDIBILITY_THRESHOLD = 0.3;

const DEFAULT_FILTER_TERMS = [
  "artificial intelligence", "ai", "machine learning", "deep learning",
  "neural network", "large language model", "llm", "generative ai",
  "algorithmic", "bias", "discrimination", "privacy", "surveillance",
  "deepfake", "disinformation", "autonomous weapon", "labor displacement",
  "job automation", "ai regulation", "ai governance", "ai safety",
  "ai alignment", "ai ethics", "facial recognition", "data scraping",
  "model collapse", "synthetic data", "open source ai", "ai act",
  "federated learning", "content provenance", "ai audit",
];

export async function loadFilterTerms(): Promise<string[]> {
  try {
    const db = getFirestore();
    const configSnap = await db
      .collection("agents")
      .doc("signal-scout")
      .collection("config")
      .doc("current")
      .get();

    if (configSnap.exists) {
      const terms = configSnap.data()?.filterTerms as string[] | undefined;
      if (terms && terms.length > 0) {
        logger.info(`Filter: loaded ${terms.length} filter terms from config`);
        return terms.map((t) => t.toLowerCase());
      }
    }
  } catch (err) {
    logger.warn("Filter: failed to load filter terms from config:", err);
  }

  logger.info(`Filter: using ${DEFAULT_FILTER_TERMS.length} default filter terms`);
  return DEFAULT_FILTER_TERMS;
}

function normalizeWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function filterArticles(
  articles: RawArticle[],
  existingUrls: Set<string>,
  filterTerms: string[],
  sourceCredibilityMap: Map<string, number>,
  credibilityThreshold = DEFAULT_CREDIBILITY_THRESHOLD,
): FilterResult {
  const stats: FilterStats = {
    input: articles.length,
    afterCredibility: 0,
    afterRecency: 0,
    afterUrlDedup: 0,
    afterTitleDedup: 0,
    afterKeyword: 0,
  };

  // 1. Source credibility: skip articles from sources below threshold
  let remaining = articles.filter((a) => {
    const credibility = sourceCredibilityMap.get(a.source_name) ?? 0.5;
    return credibility >= credibilityThreshold;
  });
  stats.afterCredibility = remaining.length;

  // 2. Recency: skip articles older than 7 days
  const recencyCutoff = new Date();
  recencyCutoff.setDate(recencyCutoff.getDate() - RECENCY_DAYS);

  remaining = remaining.filter((a) => {
    const pubDate = new Date(a.published_date);
    return pubDate >= recencyCutoff;
  });
  stats.afterRecency = remaining.length;

  // 3. URL dedup: skip articles already in signals collection
  remaining = remaining.filter((a) => a.url && !existingUrls.has(a.url));
  stats.afterUrlDedup = remaining.length;

  // 4. Title similarity dedup: within this batch, drop articles with > 0.6 Jaccard to an earlier article
  const kept: RawArticle[] = [];
  const keptWordSets: Set<string>[] = [];

  for (const article of remaining) {
    const words = normalizeWords(article.title);
    const isDuplicate = keptWordSets.some(
      (existing) => jaccardSimilarity(words, existing) > TITLE_SIMILARITY_THRESHOLD
    );
    if (!isDuplicate) {
      kept.push(article);
      keptWordSets.push(words);
    }
  }
  remaining = kept;
  stats.afterTitleDedup = remaining.length;

  // 5. Keyword relevance: article title or snippet must contain at least one filter term
  remaining = remaining.filter((a) => {
    const haystack = `${a.title} ${a.snippet ?? ""}`.toLowerCase();
    return filterTerms.some((term) => haystack.includes(term));
  });
  stats.afterKeyword = remaining.length;

  logger.info(
    `Filter: ${stats.input} → credibility ${stats.afterCredibility} → recency ${stats.afterRecency} → URL dedup ${stats.afterUrlDedup} → title dedup ${stats.afterTitleDedup} → keyword ${stats.afterKeyword}`
  );

  return { articles: remaining, stats };
}
