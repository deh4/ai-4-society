# Plan 2: Backend Agents v2

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all four backend agents (Signal Scout, Discovery Agent, Validator Agent, Data Lifecycle) to work with the v2 graph model, add a Stage 1 cheap filter to Signal Scout, and create a unified graph proposal approval flow.

**Architecture:** v2 agents live in `functions/src/agents/` alongside Graph Builder and Feed Curator from Plan 1. They read from the `nodes`/`edges` collections (not v1 `risks`/`solutions`), store proposals to the unified `graph_proposals` collection, and use `related_nodes[]`/`related_node_ids[]` for signal-node relationships. The existing fetcher and usage monitor are reused without modification.

**Tech Stack:** TypeScript, Firebase Cloud Functions v2, Firestore, Gemini 2.5 Flash/Pro, Node 20, rss-parser

**Spec reference:** `docs/superpowers/specs/2026-03-16-ai4society-v2-redesign-design.md` (sections 3.1–3.4)

**Depends on:** Plan 1 (Foundation & Migration) — `src/types/`, `functions/src/shared/firestore.ts`, `functions/src/agents/graph-builder/`, `functions/src/agents/feed-curator/`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `functions/src/agents/signal-scout/filter.ts` | Stage 1 cheap filter (credibility, keyword, dedup, recency) |
| `functions/src/agents/signal-scout/classifier.ts` | v2 Gemini classification against dynamic graph taxonomy |
| `functions/src/agents/signal-scout/store.ts` | Store signals with `related_nodes[]`, `impact_score` |
| `functions/src/agents/signal-scout/index.ts` | v2 Signal Scout orchestrator (scheduled + manual) |
| `functions/src/agents/discovery/analyzer.ts` | v2 discovery analysis — proposes nodes AND edges |
| `functions/src/agents/discovery/store.ts` | Store proposals to `graph_proposals` collection |
| `functions/src/agents/discovery/index.ts` | v2 Discovery Agent orchestrator |
| `functions/src/agents/validator/assessor.ts` | v2 node assessment via `related_node_ids` queries |
| `functions/src/agents/validator/store.ts` | Store update proposals to `graph_proposals` |
| `functions/src/agents/validator/index.ts` | v2 Validator Agent orchestrator |
| `functions/src/agents/data-lifecycle/index.ts` | v2 data lifecycle with updated retention policies |
| `functions/src/agents/approval/index.ts` | Unified `approveGraphProposal` callable |

### Modified files
| File | Changes |
|------|---------|
| `functions/src/config/sources.ts` | Add `credibility` and `tier` fields to `DataSource` |
| `functions/src/agents/graph-builder/index.ts` | Auto-update `filterTerms` after building snapshot |
| `functions/src/shared/firestore.ts` | Add `getNodeById()`, `getGraphProposals()` helpers |
| `functions/src/index.ts` | Replace v1 agent exports with v2, add `approveGraphProposal` |

### Unchanged files (reused as-is)
| File | Why unchanged |
|------|--------------|
| `functions/src/signal-scout/fetcher.ts` | Article fetching logic is the same — v2 imports it directly |
| `functions/src/usage-monitor.ts` | Usage tracking is agent-agnostic — works with any `agentId` |
| `functions/src/config/sources.ts` (structure) | Source list stays the same, we only add fields |

---

## Chunk 1: Source Config & Stage 1 Cheap Filter

### Task 1: Add credibility scores to source config

**Files:**
- Modify: `functions/src/config/sources.ts`

- [ ] **Step 1: Update `DataSource` interface and add credibility scores**

Add `credibility` and `tier` fields to the interface, then add values to each source based on the spec's source tier table (section 3.2):

```typescript
export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "api";
  url: string;
  category?: string;
  maxItems?: number;
  credibility: number;  // 0-1, default used when no admin override
  tier: 1 | 2 | 3 | 4 | 5;
}
```

Credibility values per source:
| Source | Tier | Credibility |
|--------|------|-------------|
| arXiv CS.AI | 1 | 0.85 |
| MIT Technology Review | 2 | 0.80 |
| Ars Technica AI | 2 | 0.75 |
| The Verge AI | 3 | 0.65 |
| TechCrunch AI | 3 | 0.60 |
| Wired AI | 2 | 0.75 |
| TLDR AI | 5 | 0.65 |
| Import AI | 5 | 0.70 |
| Last Week in AI | 5 | 0.65 |
| GDELT DOC API | 4 | 0.50 |

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS (no compile errors)

- [ ] **Step 3: Commit**

```bash
git add functions/src/config/sources.ts
git commit -m "feat(sources): add credibility scores and tier classification"
```

---

### Task 2: Create Stage 1 cheap filter

**Files:**
- Create: `functions/src/agents/signal-scout/filter.ts`

The cheap filter runs BEFORE any Gemini API call. It applies five filters sequentially:
1. **Source credibility** — skip articles from sources below a configurable threshold (default 0.3)
2. **Recency** — skip articles older than 7 days
3. **URL dedup** — skip articles with URLs already in the `signals` collection
4. **Title similarity dedup** — catch same story from different outlets (Jaccard similarity > 0.6 on normalized word sets)
5. **Keyword relevance** — at least one filter term appears in title or snippet

Filter terms are loaded from Firestore (`agents/signal-scout/config/current.filterTerms`) and fall back to a hardcoded default set derived from node names.

- [ ] **Step 1: Write the filter module**

```typescript
// functions/src/agents/signal-scout/filter.ts
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
const DEFAULT_CREDIBILITY_THRESHOLD = 0.3; // Drop articles from sources below this

// Fallback filter terms when Firestore config is empty or missing.
// Graph Builder auto-updates these in agents/signal-scout/config/current.filterTerms.
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

/**
 * Load filter terms from Firestore agent config.
 * Falls back to DEFAULT_FILTER_TERMS if config is missing.
 */
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

/** Normalize a title for comparison: lowercase, strip punctuation, split to words > 2 chars */
function normalizeWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/** Jaccard similarity between two word sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Apply Stage 1 cheap filters to raw articles.
 * Filters: credibility → recency → URL dedup → title similarity dedup → keyword relevance.
 */
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
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/signal-scout/filter.ts
git commit -m "feat(signal-scout): add Stage 1 cheap filter with credibility, recency, dedup, and keyword checks"
```

---

## Chunk 2: Signal Scout v2 (Classifier + Store + Orchestrator)

### Task 3: Create v2 classifier (graph-based taxonomy)

**Files:**
- Create: `functions/src/agents/signal-scout/classifier.ts`

The v2 classifier builds its taxonomy dynamically from the `nodes` collection instead of hardcoded R01-R10/S01-S10 codes. It returns `related_nodes[]` with relevance scores and computes `impact_score`.

- [ ] **Step 1: Write the v2 classifier**

```typescript
// functions/src/agents/signal-scout/classifier.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "../../signal-scout/fetcher.js";

export interface RelatedNode {
  node_id: string;
  node_type: "risk" | "solution" | "stakeholder" | "milestone";
  relevance: number; // 0-1
}

export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both" | "unmatched";
  related_nodes: RelatedNode[];
  related_node_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  proposed_topic?: string;
}

export interface ClassificationResult {
  signals: ClassifiedSignal[];
  tokenUsage: { input: number; output: number };
}

interface GraphNodeInfo {
  id: string;
  type: string;
  name: string;
  summary: string;
}

const BATCH_SIZE = 25;
const RELEVANCE_THRESHOLD = 0.8;

function buildSystemPrompt(nodes: GraphNodeInfo[]): string {
  const riskNodes = nodes.filter((n) => n.type === "risk");
  const solutionNodes = nodes.filter((n) => n.type === "solution");
  const stakeholderNodes = nodes.filter((n) => n.type === "stakeholder");

  const riskTaxonomy = riskNodes.length > 0
    ? riskNodes.map((n) => `- ${n.id}: ${n.name} (${n.summary.slice(0, 100)})`).join("\n")
    : "No risk nodes in the graph yet.";

  const solutionTaxonomy = solutionNodes.length > 0
    ? solutionNodes.map((n) => `- ${n.id}: ${n.name} (${n.summary.slice(0, 100)})`).join("\n")
    : "No solution nodes in the graph yet.";

  const stakeholderList = stakeholderNodes.length > 0
    ? stakeholderNodes.map((n) => `- ${n.id}: ${n.name}`).join("\n")
    : "No stakeholder nodes in the graph yet.";

  return `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

RISK NODES (current graph):
${riskTaxonomy}

SOLUTION NODES (current graph):
${solutionTaxonomy}

STAKEHOLDER NODES (current graph):
${stakeholderList}

For each article provided, determine:
1. Is this article about a societal risk OR a solution/countermeasure related to AI's impact?
2. If yes, classify it against the graph nodes above.

signal_type rules:
- "risk": article is primarily about a risk, harm, or negative trend
- "solution": article is primarily about a countermeasure, policy, or mitigation
- "both": article covers both a risk and a response/solution
- "unmatched": article is relevant to AI society impact but does NOT fit any existing node

For relevant articles (matched to existing nodes):
{
  "index": <number>,
  "relevant": true,
  "signal_type": "risk" | "solution" | "both",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "related_nodes": [
    { "node_id": "<ID>", "node_type": "risk" | "solution" | "stakeholder", "relevance": <0.0-1.0> }
  ],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

For unmatched articles (relevant but outside current graph):
{
  "index": <number>,
  "relevant": true,
  "signal_type": "unmatched",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "proposed_topic": "<3-8 word label describing the novel topic>",
  "related_nodes": [],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

For irrelevant articles:
{ "index": <number>, "relevant": false }

Rules:
- related_nodes must reference valid node IDs from the graph above
- Each related_node needs a relevance score (0-1) indicating how strongly this article relates
- For "unmatched" signals, related_nodes must be empty [] and proposed_topic is required
- Only include node references you are confident about
- Prefer specific nodes over broad matches

Only output valid JSON array. No markdown fences. No explanation.`;
}

export async function classifyArticles(
  articles: RawArticle[],
  nodes: GraphNodeInfo[],
  geminiApiKey: string,
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const systemPrompt = buildSystemPrompt(nodes);

  // Build set of valid node IDs for validation
  const validNodeIds = new Set(nodes.map((n) => n.id));

  const results: ClassifiedSignal[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const articleList = batch
      .map(
        (a, idx) =>
          `[${idx}] Title: ${a.title}\nSource: ${a.source_name}\nDate: ${a.published_date}\nSnippet: ${a.snippet ?? "N/A"}`
      )
      .join("\n\n");

    const prompt = `Classify these articles:\n\n${articleList}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const usage = result.response.usageMetadata;
      if (usage) {
        totalInputTokens += usage.promptTokenCount ?? 0;
        totalOutputTokens += usage.candidatesTokenCount ?? 0;
      }

      const parsed: Array<{
        index: number;
        relevant: boolean;
        signal_type?: "risk" | "solution" | "both" | "unmatched";
        summary?: string;
        related_nodes?: RelatedNode[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
        proposed_topic?: string;
      }> = JSON.parse(result.response.text());

      for (const item of parsed) {
        if (!item.relevant) continue;
        const confidence = item.confidence_score ?? 0.5;
        if (confidence < RELEVANCE_THRESHOLD) {
          logger.info(`Skipping low-confidence signal (${confidence.toFixed(2)}): ${batch[item.index]?.title}`);
          continue;
        }
        const article = batch[item.index];
        if (!article) continue;

        const signalType = item.signal_type ?? "risk";

        // Unmatched: require proposed_topic, skip taxonomy checks
        if (signalType === "unmatched") {
          const topic = item.proposed_topic ?? "";
          if (!topic) {
            logger.info(`Dropping unmatched signal with no proposed_topic: ${article.title}`);
            continue;
          }
          results.push({
            title: article.title,
            summary: item.summary ?? "",
            source_url: article.url,
            source_name: article.source_name,
            published_date: article.published_date,
            signal_type: "unmatched",
            related_nodes: [],
            related_node_ids: [],
            severity_hint: item.severity_hint ?? "Emerging",
            affected_groups: item.affected_groups ?? [],
            confidence_score: confidence,
            proposed_topic: topic,
          });
          continue;
        }

        // Validate and filter related_nodes to only valid node IDs
        const rawRelated = item.related_nodes ?? [];
        const validRelated = rawRelated.filter((rn) => validNodeIds.has(rn.node_id));

        if (validRelated.length === 0) {
          logger.info(`Dropping signal with no valid related_nodes: ${article.title}`);
          continue;
        }

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          signal_type: signalType,
          related_nodes: validRelated,
          related_node_ids: validRelated.map((rn) => rn.node_id),
          severity_hint: item.severity_hint ?? "Emerging",
          affected_groups: item.affected_groups ?? [],
          confidence_score: confidence,
        });
      }

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} relevant signals so far`
      );
    } catch (err) {
      logger.error(`Gemini batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
    }
  }

  return { signals: results, tokenUsage: { input: totalInputTokens, output: totalOutputTokens } };
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/signal-scout/classifier.ts
git commit -m "feat(signal-scout): add v2 classifier with dynamic graph-based taxonomy"
```

---

### Task 4: Create v2 signal store

**Files:**
- Create: `functions/src/agents/signal-scout/store.ts`

The v2 store writes `related_nodes[]`, `related_node_ids[]`, `source_credibility`, and `impact_score` instead of the v1 `risk_categories[]`/`solution_ids[]`.

- [ ] **Step 1: Write the v2 store**

```typescript
// functions/src/agents/signal-scout/store.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClassifiedSignal } from "./classifier.js";

const BATCH_LIMIT = 500;

/** Compute impact_score from credibility, confidence, and recency.
 * Formula: credibility * confidence * recency_decay
 * Recency decay: 1.0 at day 0, 0.1 at day 30 (linear).
 * severity_hint is NOT factored into impact_score — it's a separate display field.
 */
function computeImpactScore(
  sourceCredibility: number,
  confidenceScore: number,
  publishedDate: string,
): number {
  const pubMs = new Date(publishedDate).getTime();
  const daysSincePublished = Math.max(0, (Date.now() - pubMs) / (1000 * 60 * 60 * 24));
  const recencyDecay = Math.max(0.1, 1 - daysSincePublished / 30);
  return sourceCredibility * confidenceScore * recencyDecay;
}

export async function storeSignals(
  signals: ClassifiedSignal[],
  sourceCredibilityMap: Map<string, number>,
): Promise<number> {
  const db = getFirestore();
  const collection = db.collection("signals");

  // URL dedup against existing signals (belt-and-suspenders — filter.ts already did URL dedup,
  // but this catches races between concurrent runs)
  const existingSnap = await collection.select("source_url").get();
  const existingUrls = new Set(
    existingSnap.docs.map((doc) => doc.data().source_url as string)
  );
  const newSignals = signals.filter((s) => !existingUrls.has(s.source_url));

  if (newSignals.length === 0) {
    logger.info("No new signals to store (all duplicates).");
    return 0;
  }

  let stored = 0;
  for (let i = 0; i < newSignals.length; i += BATCH_LIMIT) {
    const chunk = newSignals.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const signal of chunk) {
      const sourceCredibility = sourceCredibilityMap.get(signal.source_name) ?? 0.5;
      const impactScore = computeImpactScore(
        sourceCredibility,
        signal.confidence_score,
        signal.published_date,
      );

      const ref = collection.doc();
      const doc: Record<string, unknown> = {
        title: signal.title,
        summary: signal.summary,
        source_url: signal.source_url,
        source_name: signal.source_name,
        published_date: signal.published_date,
        signal_type: signal.signal_type,
        related_nodes: signal.related_nodes,
        related_node_ids: signal.related_node_ids,
        severity_hint: signal.severity_hint,
        affected_groups: signal.affected_groups,
        confidence_score: signal.confidence_score,
        source_credibility: sourceCredibility,
        impact_score: impactScore,
        status: "pending",
        fetched_at: FieldValue.serverTimestamp(),
      };

      if (signal.proposed_topic) {
        doc.proposed_topic = signal.proposed_topic;
      }

      batch.set(ref, doc);
    }

    await batch.commit();
    stored += chunk.length;
  }

  logger.info(`Stored ${stored} new signals.`);
  return stored;
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/signal-scout/store.ts
git commit -m "feat(signal-scout): add v2 store with related_nodes and impact_score"
```

---

### Task 5: Create v2 Signal Scout orchestrator

**Files:**
- Create: `functions/src/agents/signal-scout/index.ts`

The orchestrator wires together: config reading → fetch → Stage 1 filter → Stage 2 classify → store → usage tracking. It exports both a scheduled function and a manual trigger callable.

- [ ] **Step 1: Write the v2 orchestrator**

```typescript
// functions/src/agents/signal-scout/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { fetchAllSources } from "../../signal-scout/fetcher.js";
import { DATA_SOURCES } from "../../config/sources.js";
import { loadFilterTerms, filterArticles } from "./filter.js";
import { classifyArticles } from "./classifier.js";
import { storeSignals } from "./store.js";
import {
  trackUsage,
  updatePipelineHealth,
  writeAgentRunSummary,
} from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const BATCH_SIZE = 25;

interface GraphNodeInfo {
  id: string;
  type: string;
  name: string;
  summary: string;
}

async function runSignalScout(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  const runStartedAt = new Date();
  const db = getFirestore();

  try {
    // Step 0: Read agent config (single read — used for sources, credibility overrides, and thresholds)
    let enabledSourceIds: Set<string> | undefined;
    let agentConfig: Record<string, unknown> | null = null;
    try {
      const configSnap = await db
        .collection("agents")
        .doc("signal-scout")
        .collection("config")
        .doc("current")
        .get();
      if (configSnap.exists) {
        agentConfig = configSnap.data() as Record<string, unknown>;
        const sources = agentConfig.sources as Record<string, { enabled: boolean }> | undefined;
        if (sources) {
          enabledSourceIds = new Set(
            Object.entries(sources)
              .filter(([, v]) => v.enabled)
              .map(([k]) => k)
          );
          logger.info(`Config loaded: ${enabledSourceIds.size} sources enabled`);
        }
      }
    } catch (err) {
      logger.warn("Failed to read agent config, using all sources:", err);
    }

    const enabledSourcesList = enabledSourceIds
      ? [...enabledSourceIds]
      : DATA_SOURCES.map((s) => s.id);

    // Build source credibility map from defaults + admin overrides (single build, used by filter + store)
    const sourceCredibilityMap = new Map<string, number>();
    for (const src of DATA_SOURCES) {
      sourceCredibilityMap.set(src.name, src.credibility);
    }
    if (agentConfig?.sources) {
      const sources = agentConfig.sources as Record<string, { credibility?: number }>;
      for (const [sourceId, config] of Object.entries(sources)) {
        if (config.credibility !== undefined) {
          const src = DATA_SOURCES.find((s) => s.id === sourceId);
          if (src) sourceCredibilityMap.set(src.name, config.credibility);
        }
      }
    }

    // Step 1: Fetch articles
    const articles = await fetchAllSources(enabledSourceIds);
    logger.info(`Fetched ${articles.length} unique articles`);

    if (articles.length === 0) {
      await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-flash", memoryMiB: 512,
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 1, firestoreWrites: 3 },
        sourcesUsed: enabledSourcesList,
      });
      return { success: true, message: "No articles fetched" };
    }

    // Step 2: Stage 1 — Cheap filter
    const existingSnap = await db.collection("signals").select("source_url").get();
    const existingUrls = new Set(existingSnap.docs.map((d) => d.data().source_url as string));
    const filterTerms = await loadFilterTerms();
    const { articles: filteredArticles, stats: filterStats } = filterArticles(
      articles, existingUrls, filterTerms, sourceCredibilityMap,
    );

    if (filteredArticles.length === 0) {
      logger.info("No articles passed Stage 1 filter. Ending run.");
      const usage = await trackUsage({
        articlesFetched: articles.length, geminiCalls: 0, signalsStored: 0,
        firestoreReads: 1 + existingSnap.size, firestoreWrites: 3,
      });
      await updatePipelineHealth("empty", { articlesFetched: articles.length, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-flash", memoryMiB: 512,
        metrics: {
          articlesFetched: articles.length, signalsStored: 0, geminiCalls: 0,
          tokensInput: 0, tokensOutput: 0,
          firestoreReads: 1 + existingSnap.size, firestoreWrites: 3,
        },
        sourcesUsed: enabledSourcesList,
      }, usage);
      return { success: true, message: `${articles.length} fetched, 0 passed filter` };
    }

    // Step 3: Load graph nodes for dynamic taxonomy
    const nodesSnap = await db.collection("nodes").get();
    const graphNodes: GraphNodeInfo[] = nodesSnap.docs.map((d) => ({
      id: d.id,
      type: (d.data().type as string) ?? "",
      name: (d.data().name as string) ?? "",
      summary: ((d.data().summary as string) ?? "").slice(0, 200),
    }));

    // Step 4: Stage 2 — Gemini classification
    const { signals, tokenUsage } = await classifyArticles(
      filteredArticles, graphNodes, apiKey,
    );
    const geminiCalls = Math.ceil(filteredArticles.length / BATCH_SIZE);
    logger.info(`Classified ${signals.length} relevant signals from ${filteredArticles.length} articles`);

    if (signals.length === 0) {
      const usage = await trackUsage({
        articlesFetched: articles.length, geminiCalls, signalsStored: 0,
        firestoreReads: 1 + existingSnap.size + nodesSnap.size, firestoreWrites: 3,
      });
      await updatePipelineHealth("empty", { articlesFetched: filteredArticles.length, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-flash", memoryMiB: 512,
        metrics: {
          articlesFetched: articles.length, signalsStored: 0, geminiCalls,
          tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output,
          firestoreReads: 1 + existingSnap.size + nodesSnap.size, firestoreWrites: 3,
        },
        sourcesUsed: enabledSourcesList,
      }, usage);
      return { success: true, message: `${filteredArticles.length} classified, 0 relevant signals` };
    }

    // Step 5: Store signals (sourceCredibilityMap already built, reuse it)
    const stored = await storeSignals(signals, sourceCredibilityMap);

    // Step 6: Track usage + health
    const usage = await trackUsage({
      articlesFetched: articles.length, geminiCalls, signalsStored: stored,
      firestoreReads: 1 + existingSnap.size + nodesSnap.size + signals.length,
      firestoreWrites: stored + 3,
    });

    const outcome = stored > 0 ? "success" : "partial";
    await updatePipelineHealth(outcome, { articlesFetched: filteredArticles.length, signalsStored: stored });
    await writeAgentRunSummary({
      agentId: "signal-scout", startedAt: runStartedAt, outcome, error: null,
      modelId: "gemini-2.5-flash", memoryMiB: 512,
      metrics: {
        articlesFetched: articles.length, signalsStored: stored, geminiCalls,
        tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output,
        firestoreReads: 1 + existingSnap.size + nodesSnap.size + signals.length,
        firestoreWrites: stored + 3,
      },
      sourcesUsed: enabledSourcesList,
    }, usage);

    return {
      success: true,
      message: `Fetched ${articles.length}, filtered to ${filteredArticles.length}, stored ${stored} signals`,
    };
  } catch (err) {
    logger.error("Signal Scout v2 pipeline error:", err);
    await updatePipelineHealth("error", { articlesFetched: 0, signalsStored: 0 });
    await writeAgentRunSummary({
      agentId: "signal-scout", startedAt: runStartedAt, outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      modelId: "gemini-2.5-flash", memoryMiB: 512,
      metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
      sourcesUsed: [],
    }, null);
    return { success: false, message: err instanceof Error ? err.message : "Pipeline failed" };
  }
}

export const scheduledSignalScout = onSchedule(
  {
    schedule: "every 12 hours",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Signal Scout v2: starting scheduled run");
    await runSignalScout(geminiApiKey.value());
  }
);

export const triggerSignalScout = onCall(
  { memory: "512MiB", timeoutSeconds: 300, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Signal Scout v2: manual trigger by ${request.auth.uid}`);
    return await runSignalScout(geminiApiKey.value());
  }
);
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/signal-scout/index.ts
git commit -m "feat(signal-scout): add v2 orchestrator with Stage 1 filter + graph-based classification"
```

---

## Chunk 3: Discovery Agent v2

### Task 6: Create v2 discovery analyzer

**Files:**
- Create: `functions/src/agents/discovery/analyzer.ts`

The v2 analyzer reads from the `nodes` collection (not `risks`/`solutions`), can propose `new_edge` relationships in addition to `new_node` proposals, and checks for fuzzy name matching against all existing nodes.

- [ ] **Step 1: Write the v2 analyzer**

```typescript
// functions/src/agents/discovery/analyzer.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface GraphNodeInfo {
  id: string;
  type: string;
  name: string;
  summary: string;
}

export interface SignalInfo {
  id: string;
  title: string;
  summary: string;
  signal_type: string;
  related_node_ids: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface UnmatchedSignalInfo {
  id: string;
  title: string;
  summary: string;
  proposed_topic: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface NewNodeProposal {
  proposal_type: "new_node";
  node_data: {
    type: "risk" | "solution" | "stakeholder";
    name: string;
    description: string;
    why_novel: string;
    key_themes: string[];
    suggested_parent_risk_id?: string;
  };
  supporting_signal_ids: string[];
  confidence: number;
}

export interface NewEdgeProposal {
  proposal_type: "new_edge";
  edge_data: {
    from_node: string;
    to_node: string;
    relationship: string;
    reasoning: string;
  };
  supporting_signal_ids: string[];
  confidence: number;
}

export type DiscoveryProposal = NewNodeProposal | NewEdgeProposal;

export interface PendingProposalInfo {
  name: string;
  type: string;
  description: string;
}

export interface DiscoveryResult {
  proposals: DiscoveryProposal[];
  tokenUsage: { input: number; output: number };
}

const MIN_SUPPORTING_SIGNALS = 3;

export async function analyzeSignals(
  signals: SignalInfo[],
  unmatchedSignals: UnmatchedSignalInfo[],
  nodes: GraphNodeInfo[],
  edges: Array<{ from_node: string; to_node: string; relationship: string }>,
  pendingProposals: PendingProposalInfo[],
  geminiApiKey: string,
): Promise<DiscoveryResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const nodeSection = nodes
    .map((n) => `- ${n.id} [${n.type}]: ${n.name} — ${n.summary.slice(0, 150)}`)
    .join("\n");

  const edgeSection = edges
    .map((e) => `- ${e.from_node} --[${e.relationship}]--> ${e.to_node}`)
    .join("\n");

  const pendingSection = pendingProposals.length > 0
    ? pendingProposals.map((p) => `- [${p.type}] ${p.name} — ${p.description}`).join("\n")
    : "None";

  const signalSection = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
        `Type: ${s.signal_type} | Nodes: ${s.related_node_ids.join(",") || "none"}\n` +
        `Summary: ${s.summary}`
    )
    .join("\n\n");

  const unmatchedSection = unmatchedSignals.length > 0
    ? unmatchedSignals
        .map(
          (s) =>
            `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
            `Proposed topic: ${s.proposed_topic}\n` +
            `Summary: ${s.summary}`
        )
        .join("\n\n")
    : "None";

  const systemPrompt = `You are a discovery analyst for the AI 4 Society Observatory.

Your task: given a body of signals and the current graph (nodes + edges), identify:
1. Genuinely NEW topics that warrant a new node (risk, solution, or stakeholder)
2. Missing relationships between existing nodes that warrant a new edge

CURRENT GRAPH NODES:
${nodeSection}

CURRENT GRAPH EDGES:
${edgeSection || "No edges yet."}

ALREADY-PENDING PROPOSALS (do NOT re-propose these):
${pendingSection}

Rules for new_node proposals:
- Must NOT be a sub-variant or reframing of an existing node
- Must NOT overlap with pending proposals
- Must be supported by at least ${MIN_SUPPORTING_SIGNALS} signals
- Must represent a distinct societal risk, solution, or affected stakeholder group
- For stakeholder proposals: propose when a distinct affected group appears across multiple signals
- For solution proposals: include suggested_parent_risk_id if a clear parent risk exists

Rules for new_edge proposals:
- The edge must connect two EXISTING nodes (use valid node IDs)
- The relationship must not already exist in the current graph edges
- Valid relationship types: "correlates_with", "addressed_by", "impacts", "amplifies", "depends_on"
- Must be supported by at least 2 signals showing the relationship

Respond with a JSON array of proposals (can be empty []):

For new nodes:
{
  "proposal_type": "new_node",
  "node_data": {
    "type": "risk" | "solution" | "stakeholder",
    "name": "<concise name>",
    "description": "<2-3 sentence description>",
    "why_novel": "<1-2 sentences explaining why not covered by existing nodes>",
    "key_themes": ["<theme1>", "<theme2>"],
    "suggested_parent_risk_id": "<node ID or omit>"
  },
  "supporting_signal_ids": ["<id1>", "<id2>", ...],
  "confidence": <0.0-1.0>
}

For new edges:
{
  "proposal_type": "new_edge",
  "edge_data": {
    "from_node": "<existing node ID>",
    "to_node": "<existing node ID>",
    "relationship": "correlates_with" | "addressed_by" | "impacts" | "amplifies" | "depends_on",
    "reasoning": "<1 sentence explaining why this relationship exists>"
  },
  "supporting_signal_ids": ["<id1>", "<id2>", ...],
  "confidence": <0.0-1.0>
}

Only output valid JSON array. No markdown. No explanation outside JSON.`;

  const prompt = `CLASSIFIED SIGNALS (last 30 days):\n\n${signalSection}\n\nUNMATCHED SIGNALS (potential novel topics):\n\n${unmatchedSection}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const usage = result.response.usageMetadata;
    const tokenUsage = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };

    const parsed: DiscoveryProposal[] = JSON.parse(result.response.text());

    // Validate proposals
    const validSignalIds = new Set([
      ...signals.map((s) => s.id),
      ...unmatchedSignals.map((s) => s.id),
    ]);
    const validNodeIds = new Set(nodes.map((n) => n.id));

    const filtered = parsed.filter((p) => {
      // Validate signal references
      const validRefs = p.supporting_signal_ids.filter((id) => validSignalIds.has(id));

      if (p.proposal_type === "new_node") {
        if (validRefs.length < MIN_SUPPORTING_SIGNALS) {
          logger.info(`Discovery: dropping new_node "${p.node_data.name}" — only ${validRefs.length} valid signal refs`);
          return false;
        }
        p.supporting_signal_ids = validRefs;
        return true;
      }

      if (p.proposal_type === "new_edge") {
        // Validate both node IDs exist
        if (!validNodeIds.has(p.edge_data.from_node) || !validNodeIds.has(p.edge_data.to_node)) {
          logger.info(`Discovery: dropping new_edge — invalid node IDs`);
          return false;
        }
        if (validRefs.length < 2) {
          logger.info(`Discovery: dropping new_edge — only ${validRefs.length} valid signal refs`);
          return false;
        }
        p.supporting_signal_ids = validRefs;
        return true;
      }

      return false;
    });

    logger.info(`Discovery: ${parsed.length} proposals from Gemini, ${filtered.length} passed validation`);
    return { proposals: filtered, tokenUsage };
  } catch (err) {
    logger.error("Discovery Agent v2 Gemini call failed:", err);
    return { proposals: [], tokenUsage: { input: 0, output: 0 } };
  }
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/discovery/analyzer.ts
git commit -m "feat(discovery): add v2 analyzer with node + edge proposals against graph"
```

---

### Task 7: Create v2 discovery store

**Files:**
- Create: `functions/src/agents/discovery/store.ts`

Stores proposals to the unified `graph_proposals` collection with fuzzy dedup against existing pending proposals.

- [ ] **Step 1: Write the v2 store**

```typescript
// functions/src/agents/discovery/store.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { DiscoveryProposal } from "./analyzer.js";

/** Normalize a name for fuzzy comparison */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Check if two names are similar enough to be duplicates (60%+ word overlap) */
function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize >= 0.6;
}

export async function storeDiscoveryProposals(
  proposals: DiscoveryProposal[],
  existingNodeNames: string[] = [],
): Promise<number> {
  if (proposals.length === 0) return 0;

  const db = getFirestore();
  const col = db.collection("graph_proposals");

  // Fetch existing pending proposals for dedup
  const existingSnap = await col.where("status", "==", "pending").get();
  const existingNames: string[] = [...existingNodeNames]; // Include current graph node names
  const existingEdges: Array<{ from: string; to: string; rel: string }> = [];

  for (const d of existingSnap.docs) {
    const data = d.data();
    if (data.proposal_type === "new_node" && data.node_data?.name) {
      existingNames.push(data.node_data.name as string);
    }
    if (data.proposal_type === "new_edge" && data.edge_data) {
      existingEdges.push({
        from: data.edge_data.from_node as string,
        to: data.edge_data.to_node as string,
        rel: data.edge_data.relationship as string,
      });
    }
  }

  let stored = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    if (proposal.proposal_type === "new_node") {
      // Check for similar existing pending node proposals
      const name = proposal.node_data.name;
      const duplicate = existingNames.find((n) => isSimilarName(n, name));
      if (duplicate) {
        logger.info(`Discovery: skipping "${name}" — similar to pending "${duplicate}"`);
        skipped++;
        continue;
      }

      await col.add({
        proposal_type: "new_node",
        node_data: proposal.node_data,
        supporting_signal_ids: proposal.supporting_signal_ids,
        confidence: proposal.confidence,
        created_by: "discovery-agent",
        status: "pending",
        created_at: FieldValue.serverTimestamp(),
      });
      existingNames.push(name);
      stored++;
    } else if (proposal.proposal_type === "new_edge") {
      // Check for duplicate edge proposals
      const isDuplicate = existingEdges.some(
        (e) =>
          e.from === proposal.edge_data.from_node &&
          e.to === proposal.edge_data.to_node &&
          e.rel === proposal.edge_data.relationship
      );
      if (isDuplicate) {
        logger.info(`Discovery: skipping edge ${proposal.edge_data.from_node}->${proposal.edge_data.to_node} — already pending`);
        skipped++;
        continue;
      }

      await col.add({
        proposal_type: "new_edge",
        edge_data: proposal.edge_data,
        supporting_signal_ids: proposal.supporting_signal_ids,
        confidence: proposal.confidence,
        created_by: "discovery-agent",
        status: "pending",
        created_at: FieldValue.serverTimestamp(),
      });
      existingEdges.push({
        from: proposal.edge_data.from_node,
        to: proposal.edge_data.to_node,
        rel: proposal.edge_data.relationship,
      });
      stored++;
    }
  }

  logger.info(`Discovery: stored ${stored} proposals, skipped ${skipped} duplicates`);
  return stored;
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/discovery/store.ts
git commit -m "feat(discovery): add v2 store for graph_proposals with node + edge dedup"
```

---

### Task 8: Create v2 Discovery Agent orchestrator

**Files:**
- Create: `functions/src/agents/discovery/index.ts`

- [ ] **Step 1: Write the v2 orchestrator**

```typescript
// functions/src/agents/discovery/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  analyzeSignals,
  type SignalInfo,
  type UnmatchedSignalInfo,
  type GraphNodeInfo,
  type PendingProposalInfo,
} from "./analyzer.js";
import { storeDiscoveryProposals } from "./store.js";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

async function runDiscoveryAgent(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  const runStartedAt = new Date();
  const db = getFirestore();

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    // Step 1: Read classified signals (last 30 days)
    const signalsSnap = await db
      .collection("signals")
      .where("status", "in", ["pending", "approved", "edited"])
      .where("fetched_at", ">", cutoff)
      .orderBy("fetched_at", "desc")
      .get();

    const signals: SignalInfo[] = signalsSnap.docs
      .filter((d) => d.data().signal_type !== "unmatched")
      .map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        signal_type: (d.data().signal_type as string) ?? "risk",
        related_node_ids: (d.data().related_node_ids as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

    // Step 2: Read unmatched signals (last 30 days)
    const unmatchedSnap = await db
      .collection("signals")
      .where("signal_type", "==", "unmatched")
      .where("fetched_at", ">", cutoff)
      .orderBy("fetched_at", "desc")
      .get();

    const unmatchedSignals: UnmatchedSignalInfo[] = unmatchedSnap.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? "",
      summary: (d.data().summary as string) ?? "",
      proposed_topic: (d.data().proposed_topic as string) ?? "",
      severity_hint: (d.data().severity_hint as string) ?? "Emerging",
      source_name: (d.data().source_name as string) ?? "",
      published_date: (d.data().published_date as string) ?? "",
    }));

    logger.info(`Discovery v2: ${signals.length} classified + ${unmatchedSignals.length} unmatched signals`);

    if (signals.length < 5 && unmatchedSignals.length < 3) {
      logger.info("Discovery v2: insufficient signals, skipping Gemini call");
      await writeAgentRunSummary({
        agentId: "discovery-agent", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-pro", memoryMiB: 512,
        metrics: { articlesFetched: signals.length + unmatchedSignals.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 2, firestoreWrites: 0 },
        sourcesUsed: [],
      });
      return { success: true, message: `Insufficient signals (${signals.length} classified, ${unmatchedSignals.length} unmatched)` };
    }

    // Step 3: Read graph (nodes + edges) and pending proposals
    const [nodesSnap, edgesSnap, pendingSnap] = await Promise.all([
      db.collection("nodes").get(),
      db.collection("edges").get(),
      db.collection("graph_proposals").where("status", "==", "pending").get(),
    ]);

    const nodes: GraphNodeInfo[] = nodesSnap.docs.map((d) => ({
      id: d.id,
      type: (d.data().type as string) ?? "",
      name: (d.data().name as string) ?? "",
      summary: ((d.data().summary as string) ?? "").slice(0, 200),
    }));

    const edges = edgesSnap.docs.map((d) => ({
      from_node: (d.data().from_node as string) ?? "",
      to_node: (d.data().to_node as string) ?? "",
      relationship: (d.data().relationship as string) ?? "",
    }));

    const pendingProposals: PendingProposalInfo[] = pendingSnap.docs.map((d) => {
      const data = d.data();
      if (data.proposal_type === "new_node") {
        return {
          name: (data.node_data?.name as string) ?? "",
          type: `new_node:${(data.node_data?.type as string) ?? ""}`,
          description: (data.node_data?.description as string) ?? "",
        };
      }
      return {
        name: `${data.edge_data?.from_node ?? ""}->${data.edge_data?.to_node ?? ""}`,
        type: "new_edge",
        description: (data.edge_data?.reasoning as string) ?? "",
      };
    });

    // Step 4: Analyze with Gemini 2.5 Pro
    const { proposals, tokenUsage } = await analyzeSignals(
      signals, unmatchedSignals, nodes, edges, pendingProposals, apiKey,
    );

    // Step 5: Store proposals (pass existing node names for fuzzy dedup)
    const existingNodeNames = nodes.map((n) => n.name);
    const stored = await storeDiscoveryProposals(proposals, existingNodeNames);

    await writeAgentRunSummary({
      agentId: "discovery-agent", startedAt: runStartedAt,
      outcome: stored > 0 ? "success" : "empty", error: null,
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: {
        articlesFetched: signals.length + unmatchedSignals.length, signalsStored: stored,
        geminiCalls: 1, tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output,
        firestoreReads: 4, firestoreWrites: stored,
      },
      sourcesUsed: [],
    });

    return { success: true, message: `${stored} proposals from ${signals.length + unmatchedSignals.length} signals` };
  } catch (err) {
    logger.error("Discovery Agent v2 failed:", err);
    await writeAgentRunSummary({
      agentId: "discovery-agent", startedAt: runStartedAt, outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
      sourcesUsed: [],
    });
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

export const scheduledDiscovery = onSchedule(
  {
    schedule: "0 10 * * 0", // Weekly, Sunday 10:00 UTC
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Discovery Agent v2: starting weekly run");
    await runDiscoveryAgent(geminiApiKey.value());
  }
);

export const triggerDiscovery = onCall(
  { memory: "512MiB", timeoutSeconds: 300, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Discovery Agent v2: manual trigger by ${request.auth.uid}`);
    return await runDiscoveryAgent(geminiApiKey.value());
  }
);
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/discovery/index.ts
git commit -m "feat(discovery): add v2 orchestrator reading from graph model"
```

---

## Chunk 4: Validator Agent v2

### Task 9: Create v2 validator assessor

**Files:**
- Create: `functions/src/agents/validator/assessor.ts`

The v2 assessor works with the `nodes` collection and uses `related_node_ids` to find signals for each node. Assessment fields depend on node type.

- [ ] **Step 1: Write the v2 assessor**

```typescript
// functions/src/agents/validator/assessor.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface SignalInfo {
  id: string;
  title: string;
  summary: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface ProposedChange {
  current_value: unknown;
  proposed_value: unknown;
  reasoning: string;
}

export interface AssessmentResult {
  proposed_changes: Record<string, ProposedChange>;
  overall_reasoning: string;
  confidence: number;
  has_changes: boolean;
}

const CONFIDENCE_THRESHOLD = 0.6;

const RISK_FIELDS = [
  "score_2026", "score_2035", "velocity", "expert_severity",
  "summary", "deep_dive", "mitigation_strategies", "timeline_narrative",
];

const SOLUTION_FIELDS = [
  "adoption_score_2026", "adoption_score_2035", "implementation_stage",
  "key_players", "barriers", "summary", "deep_dive", "timeline_narrative",
];

function buildNodePrompt(
  nodeType: string,
  nodeData: Record<string, unknown>,
  signals: SignalInfo[],
): string {
  const signalText = signals.length > 0
    ? signals.map(
        (s) => `- [${s.id}] "${s.title}" (${s.source_name}, ${s.published_date}, ${s.severity_hint})\n  ${s.summary}`
      ).join("\n")
    : "No recent signals for this node.";

  if (nodeType === "risk") {
    return `CURRENT RISK NODE:
Name: ${nodeData.name as string}
Score 2026: ${nodeData.score_2026 ?? "N/A"} | Score 2035: ${nodeData.score_2035 ?? "N/A"}
Velocity: ${nodeData.velocity ?? "N/A"}
Expert Severity: ${nodeData.expert_severity ?? "N/A"}
Summary: ${nodeData.summary ?? ""}
Deep Dive: ${nodeData.deep_dive ?? ""}
Timeline: ${JSON.stringify(nodeData.timeline_narrative ?? {})}
Mitigation Strategies: ${JSON.stringify(nodeData.mitigation_strategies ?? [])}

RECENT SIGNALS (last 30 days):
${signalText}`;
  }

  if (nodeType === "solution") {
    return `CURRENT SOLUTION NODE:
Name: ${nodeData.name as string}
Type: ${nodeData.solution_type ?? "N/A"}
Adoption Score 2026: ${nodeData.adoption_score_2026 ?? "N/A"} | 2035: ${nodeData.adoption_score_2035 ?? "N/A"}
Implementation Stage: ${nodeData.implementation_stage ?? "N/A"}
Key Players: ${JSON.stringify(nodeData.key_players ?? [])}
Barriers: ${JSON.stringify(nodeData.barriers ?? [])}
Summary: ${nodeData.summary ?? ""}
Deep Dive: ${nodeData.deep_dive ?? ""}
Timeline: ${JSON.stringify(nodeData.timeline_narrative ?? {})}

RECENT SIGNALS (last 30 days):
${signalText}`;
  }

  // stakeholder and milestone — limited assessment
  return `CURRENT ${nodeType.toUpperCase()} NODE:
Name: ${nodeData.name as string}
Description: ${nodeData.description ?? ""}

RECENT SIGNALS (last 30 days):
${signalText}`;
}

async function runAssessment(
  nodeType: string,
  docText: string,
  allowedFields: string[],
  geminiApiKey: string,
): Promise<AssessmentResult & { _tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const systemPrompt = `You are a validator for the AI 4 Society Observatory. Your job is to assess whether a ${nodeType} node's attributes still accurately reflect reality given recent evidence.

Proposable fields: ${allowedFields.join(", ")}

Rules:
- For scores (0–100): only propose changes if evidence clearly supports a shift; changes should be incremental (rarely >10 points)
- For velocity (risks): "Critical" | "High" | "Medium" | "Low"
- For implementation_stage (solutions): "Research" | "Policy Debate" | "Pilot" | "Early Adoption" | "Scaling" | "Mainstream" — advance at most one stage
- For array fields (key_players, barriers, mitigation_strategies): only propose additions, not removals
- For text fields (summary, deep_dive, timeline_narrative): only propose if content is meaningfully outdated
- If nothing needs to change, return has_changes: false

Respond with JSON:
{
  "has_changes": true | false,
  "confidence": <0.0–1.0>,
  "overall_reasoning": "<brief explanation>",
  "proposed_changes": {
    "<field>": {
      "current_value": <current value>,
      "proposed_value": <proposed value>,
      "reasoning": "<why this field should change>"
    }
  }
}

Only output valid JSON. No markdown. No explanation outside JSON.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: docText }] }],
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const usage = result.response.usageMetadata;
  const parsed = JSON.parse(result.response.text()) as AssessmentResult;

  return {
    ...parsed,
    _tokenUsage: {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    },
  };
}

export async function assessNode(
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>,
  signals: SignalInfo[],
  geminiApiKey: string,
): Promise<{ result: AssessmentResult | null; tokenUsage: { input: number; output: number } }> {
  // Only assess risk and solution nodes — stakeholders and milestones
  // don't have scored fields worth validating automatically
  if (nodeType !== "risk" && nodeType !== "solution") {
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }

  const allowedFields = nodeType === "risk" ? RISK_FIELDS : SOLUTION_FIELDS;

  try {
    const docText = buildNodePrompt(nodeType, nodeData, signals);
    const assessment = await runAssessment(nodeType, docText, allowedFields, geminiApiKey);
    const { _tokenUsage: tokenUsage, ...result } = assessment;

    if (!result.has_changes || result.confidence < CONFIDENCE_THRESHOLD) {
      logger.info(`Validator: no changes needed for ${nodeType} ${nodeId} (confidence: ${result.confidence})`);
      return { result: null, tokenUsage };
    }
    return { result, tokenUsage };
  } catch (err) {
    logger.error(`Validator: failed to assess ${nodeType} ${nodeId}:`, err);
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/validator/assessor.ts
git commit -m "feat(validator): add v2 assessor working with graph nodes"
```

---

### Task 10: Create v2 validator store

**Files:**
- Create: `functions/src/agents/validator/store.ts`

Stores `update_node` proposals to the `graph_proposals` collection with one-per-node dedup.

**Note:** The store writes `node_type` into `update_data` which is not in the current `GraphProposal` TypeScript type. The type in `src/types/proposal.ts` should be updated in Plan 4 (Frontend Admin) to include `node_type?: string` in the `update_data` interface. At runtime, Firestore is schemaless so this works fine.

- [ ] **Step 1: Write the v2 store**

```typescript
// functions/src/agents/validator/store.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { AssessmentResult } from "./assessor.js";

/** Cache of node IDs that already have pending update proposals (populated once per run) */
let pendingNodeIds: Set<string> | null = null;

async function getPendingNodeIds(): Promise<Set<string>> {
  if (pendingNodeIds) return pendingNodeIds;

  const db = getFirestore();
  const snap = await db.collection("graph_proposals")
    .where("status", "==", "pending")
    .where("proposal_type", "==", "update_node")
    .get();

  pendingNodeIds = new Set(
    snap.docs.map((d) => (d.data().update_data?.node_id as string) ?? "")
  );
  logger.info(`Validator: ${pendingNodeIds.size} existing pending update proposals found`);
  return pendingNodeIds;
}

export function resetPendingCache(): void {
  pendingNodeIds = null;
}

export async function storeValidationProposal(
  nodeId: string,
  nodeName: string,
  nodeType: string,
  assessment: AssessmentResult,
  supportingSignalIds: string[],
): Promise<boolean> {
  const db = getFirestore();

  const pending = await getPendingNodeIds();
  if (pending.has(nodeId)) {
    logger.info(`Validator: skipping ${nodeType} ${nodeId} — pending proposal already exists`);
    return false;
  }

  await db.collection("graph_proposals").add({
    proposal_type: "update_node",
    update_data: {
      node_id: nodeId,
      node_name: nodeName,
      node_type: nodeType,
      proposed_changes: assessment.proposed_changes,
      overall_reasoning: assessment.overall_reasoning,
    },
    supporting_signal_ids: supportingSignalIds,
    confidence: assessment.confidence,
    created_by: "validator-agent",
    status: "pending",
    created_at: FieldValue.serverTimestamp(),
  });

  pending.add(nodeId);
  logger.info(`Validator: stored update proposal for ${nodeType} ${nodeId}`);
  return true;
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/validator/store.ts
git commit -m "feat(validator): add v2 store for graph_proposals update_node"
```

---

### Task 11: Create v2 Validator Agent orchestrator

**Files:**
- Create: `functions/src/agents/validator/index.ts`

- [ ] **Step 1: Write the v2 orchestrator**

```typescript
// functions/src/agents/validator/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { assessNode, type SignalInfo } from "./assessor.js";
import { storeValidationProposal, resetPendingCache } from "./store.js";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

async function runValidatorAgent(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  const runStartedAt = new Date();
  const db = getFirestore();
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let geminiCalls = 0;
  let proposalsStored = 0;

  resetPendingCache();

  try {
    // Step 1: Read all risk and solution nodes
    const nodesSnap = await db.collection("nodes")
      .where("type", "in", ["risk", "solution"])
      .get();

    // Step 2: Read signals from last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const signalsSnap = await db.collection("signals")
      .where("status", "in", ["pending", "approved", "edited"])
      .where("fetched_at", ">", cutoff)
      .get();

    const allSignals: (SignalInfo & { related_node_ids: string[] })[] = signalsSnap.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? "",
      summary: (d.data().summary as string) ?? "",
      severity_hint: (d.data().severity_hint as string) ?? "Emerging",
      source_name: (d.data().source_name as string) ?? "",
      published_date: (d.data().published_date as string) ?? "",
      related_node_ids: (d.data().related_node_ids as string[]) ?? [],
    }));

    logger.info(`Validator v2: ${nodesSnap.size} nodes, ${allSignals.length} signals`);

    // Step 3: Assess each risk/solution node
    for (const nodeDoc of nodesSnap.docs) {
      const nodeId = nodeDoc.id;
      const nodeType = (nodeDoc.data().type as string) ?? "";
      const nodeName = (nodeDoc.data().name as string) ?? nodeId;

      // Find signals related to this node via related_node_ids
      const relevantSignals = allSignals.filter(
        (s) => s.related_node_ids.includes(nodeId)
      );

      const { result, tokenUsage } = await assessNode(
        nodeId, nodeType, nodeDoc.data() as Record<string, unknown>,
        relevantSignals, apiKey,
      );

      totalTokensInput += tokenUsage.input;
      totalTokensOutput += tokenUsage.output;
      geminiCalls++;

      if (result) {
        await storeValidationProposal(
          nodeId, nodeName, nodeType, result,
          relevantSignals.map((s) => s.id),
        );
        proposalsStored++;
      }
    }

    await writeAgentRunSummary({
      agentId: "validator-agent", startedAt: runStartedAt, outcome: "success", error: null,
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: {
        articlesFetched: allSignals.length, signalsStored: proposalsStored, geminiCalls,
        tokensInput: totalTokensInput, tokensOutput: totalTokensOutput,
        firestoreReads: 2, firestoreWrites: proposalsStored,
      },
      sourcesUsed: [],
    });

    return { success: true, message: `${proposalsStored} proposals from ${geminiCalls} assessments` };
  } catch (err) {
    logger.error("Validator Agent v2 failed:", err);
    await writeAgentRunSummary({
      agentId: "validator-agent", startedAt: runStartedAt, outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, firestoreReads: 0, firestoreWrites: 0 },
      sourcesUsed: [],
    });
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

export const scheduledValidator = onSchedule(
  {
    schedule: "0 9 * * 1", // Weekly, Monday 09:00 UTC
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Validator Agent v2: starting weekly run");
    await runValidatorAgent(geminiApiKey.value());
  }
);

export const triggerValidator = onCall(
  { memory: "512MiB", timeoutSeconds: 540, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Validator Agent v2: manual trigger by ${request.auth.uid}`);
    return await runValidatorAgent(geminiApiKey.value());
  }
);
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/validator/index.ts
git commit -m "feat(validator): add v2 orchestrator with related_node_ids signal matching"
```

---

## Chunk 5: Data Lifecycle v2 + Graph Builder Update + Approval Flow + Integration

### Task 12: Create v2 data lifecycle

**Files:**
- Create: `functions/src/agents/data-lifecycle/index.ts`

Updated retention policies per spec section 3.3:
- `graph_proposals` rejected: delete after 90 days
- `graph_proposals` pending: auto-reject after 30 days without review
- `feed_items`: delete after 30 days (rebuilt by Feed Curator)
- Archived signals: hard delete after 1 year
- Changelogs: keep indefinitely (removed the 180-day delete)
- v1 collections (`discovery_proposals`, `validation_proposals`): clean up any remaining docs

- [ ] **Step 1: Write the v2 data lifecycle**

```typescript
// functions/src/agents/data-lifecycle/index.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const BATCH_SIZE = 200;

interface LifecycleStats {
  signalsArchived: number;
  signalsDeleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  graphProposalsDeleted: number;
  graphProposalsExpired: number;
  feedItemsDeleted: number;
  archivedSignalsDeleted: number;
  v1ProposalsDeleted: number;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function deleteBatched(
  db: FirebaseFirestore.Firestore,
  query: FirebaseFirestore.Query,
  batchSize: number,
): Promise<number> {
  let total = 0;
  let snap = await query.limit(batchSize).get();
  while (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < batchSize) break;
    snap = await query.limit(batchSize).get();
  }
  return total;
}

export async function runDataLifecycle(): Promise<LifecycleStats> {
  const db = getFirestore();
  const stats: LifecycleStats = {
    signalsArchived: 0, signalsDeleted: 0, evidenceMarkedStale: 0,
    agentRunsDeleted: 0, graphProposalsDeleted: 0, graphProposalsExpired: 0,
    feedItemsDeleted: 0, archivedSignalsDeleted: 0, v1ProposalsDeleted: 0,
  };

  // 1. Archive approved/edited signals older than 90 days
  const archiveCutoff = daysAgo(90);
  const approvedQuery = db.collection("signals")
    .where("status", "in", ["approved", "edited"])
    .where("fetched_at", "<", archiveCutoff);

  let snap = await approvedQuery.limit(BATCH_SIZE).get();
  while (!snap.empty) {
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.set(
        db.collection("_archive").doc("signals").collection("items").doc(doc.id),
        { ...doc.data(), archivedAt: FieldValue.serverTimestamp() },
      );
      batch.delete(doc.ref);
      stats.signalsArchived++;
    }
    await batch.commit();
    if (snap.size < BATCH_SIZE) break;
    snap = await approvedQuery.limit(BATCH_SIZE).get();
  }

  // 2. Hard delete rejected signals older than 30 days
  stats.signalsDeleted = await deleteBatched(
    db,
    db.collection("signals").where("status", "==", "rejected").where("fetched_at", "<", daysAgo(30)),
    BATCH_SIZE,
  );

  // 3. Mark stale evidence (isNew: true → false after 180 days)
  const staleQuery = db.collection("signals")
    .where("isNew", "==", true)
    .where("fetched_at", "<", daysAgo(180));

  let staleSnap = await staleQuery.limit(BATCH_SIZE).get();
  while (!staleSnap.empty) {
    const batch = db.batch();
    staleSnap.docs.forEach((d) => batch.update(d.ref, { isNew: false }));
    await batch.commit();
    stats.evidenceMarkedStale += staleSnap.size;
    if (staleSnap.size < BATCH_SIZE) break;
    staleSnap = await staleQuery.limit(BATCH_SIZE).get();
  }

  // 4. Delete old agent run summaries (> 90 days)
  const agentsSnap = await db.collection("agents").get();
  for (const agentDoc of agentsSnap.docs) {
    const count = await deleteBatched(
      db,
      agentDoc.ref.collection("runs").where("startedAt", "<", daysAgo(90)),
      BATCH_SIZE,
    );
    stats.agentRunsDeleted += count;
  }

  // 5. graph_proposals: delete rejected after 90 days
  stats.graphProposalsDeleted = await deleteBatched(
    db,
    db.collection("graph_proposals")
      .where("status", "==", "rejected")
      .where("created_at", "<", daysAgo(90)),
    BATCH_SIZE,
  );

  // 6. graph_proposals: auto-reject pending proposals older than 30 days
  const expiredProposals = await db.collection("graph_proposals")
    .where("status", "==", "pending")
    .where("created_at", "<", daysAgo(30))
    .limit(BATCH_SIZE)
    .get();

  if (!expiredProposals.empty) {
    const batch = db.batch();
    expiredProposals.docs.forEach((d) =>
      batch.update(d.ref, {
        status: "rejected",
        reviewed_at: FieldValue.serverTimestamp(),
        reviewed_by: "data-lifecycle",
        rejection_reason: "Expired: no review within 30 days",
      })
    );
    await batch.commit();
    stats.graphProposalsExpired = expiredProposals.size;
  }

  // 7. feed_items: delete older than 30 days
  stats.feedItemsDeleted = await deleteBatched(
    db,
    db.collection("feed_items").where("createdAt", "<", daysAgo(30)),
    BATCH_SIZE,
  );

  // 8. Archived signals: hard delete after 1 year
  stats.archivedSignalsDeleted = await deleteBatched(
    db,
    db.collection("_archive").doc("signals").collection("items")
      .where("archivedAt", "<", daysAgo(365)),
    BATCH_SIZE,
  );

  // 9. v1 cleanup: delete remaining discovery_proposals and validation_proposals
  const v1DiscoveryCount = await deleteBatched(
    db, db.collection("discovery_proposals"), BATCH_SIZE,
  );
  const v1ValidationCount = await deleteBatched(
    db, db.collection("validation_proposals"), BATCH_SIZE,
  );
  stats.v1ProposalsDeleted = v1DiscoveryCount + v1ValidationCount;

  // Note: changelogs are kept indefinitely (audit trail, low volume)

  logger.info("Data lifecycle v2 complete:", stats);
  return stats;
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/data-lifecycle/index.ts
git commit -m "feat(data-lifecycle): add v2 with graph_proposals retention and auto-expiry"
```

---

### Task 13: Update Graph Builder to auto-update filterTerms

**Files:**
- Modify: `functions/src/agents/graph-builder/index.ts`

After building the graph snapshot, collect node names + categories as filter terms and write them to `agents/signal-scout/config/current.filterTerms`. This keeps the cheap filter's keyword list in sync with the evolving graph.

- [ ] **Step 1: Add filterTerms update after snapshot write**

After the existing `await writeGraphSnapshot({...})` block (around line 66), add:

```typescript
    // Auto-update filter terms for Signal Scout Stage 1 filter
    const filterTerms: string[] = [];
    for (const node of nodes) {
      const name = (node.name as string) ?? "";
      if (name) filterTerms.push(name.toLowerCase());
      const category = (node.category as string) ?? "";
      if (category) filterTerms.push(category.toLowerCase());
    }
    // Deduplicate
    const uniqueTerms = [...new Set(filterTerms)].filter((t) => t.length > 2);
    await getDb()
      .collection("agents")
      .doc("signal-scout")
      .collection("config")
      .doc("current")
      .set({ filterTerms: uniqueTerms }, { merge: true });
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/graph-builder/index.ts
git commit -m "feat(graph-builder): auto-update signal scout filter terms from graph nodes"
```

---

### Task 14: Add shared Firestore helpers

**Files:**
- Modify: `functions/src/shared/firestore.ts`

Add helpers needed by the approval flow and other v2 agents.

- [ ] **Step 1: Add `getNodeById()` and `getGraphProposals()` helpers**

Add after the existing `getSignalsForNode` function:

```typescript
export async function getNodeById(nodeId: string): Promise<DocWithId | null> {
  const snap = await getDb().doc(`nodes/${nodeId}`).get();
  if (!snap.exists) return null;
  return { ...snap.data()!, id: snap.id } as DocWithId;
}

export async function getGraphProposals(status: string): Promise<DocWithId[]> {
  const snap = await getDb()
    .collection("graph_proposals")
    .where("status", "==", status)
    .orderBy("created_at", "desc")
    .get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/shared/firestore.ts
git commit -m "feat(firestore): add getNodeById and getGraphProposals helpers"
```

---

### Task 15: Create unified graph proposal approval callable

**Files:**
- Create: `functions/src/agents/approval/index.ts`

Handles all three proposal types:
- `new_node` → create node in `nodes` collection
- `new_edge` → create edge in `edges` collection
- `update_node` → update existing node in `nodes` collection + write changelog

After any approval, triggers Graph Builder and Feed Curator inline.

- [ ] **Step 1: Write the approval callable**

```typescript
// functions/src/agents/approval/index.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getAllNodes, getAllEdges, writeGraphSnapshot, writeNodeSummary, getSignalsForNode, getDb } from "../../shared/firestore.js";

export const approveGraphProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    const uid = request.auth.uid;

    // Check admin role (v2 uses isAdmin flag)
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new HttpsError("permission-denied", "No user profile found");
    const userData = userSnap.data()!;
    if (!userData.isAdmin && !userData.isReviewer) {
      throw new HttpsError("permission-denied", "Requires reviewer or admin role");
    }

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const action = (request.data.action as string) ?? "approve";
    if (action !== "approve" && action !== "reject") {
      throw new HttpsError("invalid-argument", "action must be 'approve' or 'reject'");
    }

    const proposalRef = db.collection("graph_proposals").doc(proposalId);

    return db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);
      if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");

      const proposal = proposalSnap.data()!;
      if (proposal.status !== "pending") {
        throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status as string}`);
      }

      // Rejection path
      if (action === "reject") {
        tx.update(proposalRef, {
          status: "rejected",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          rejection_reason: (request.data.reason as string) ?? "",
        });
        return { success: true, action: "rejected" };
      }

      // Approval path — handle each proposal type
      const proposalType = proposal.proposal_type as string;

      if (proposalType === "new_node") {
        const nodeData = proposal.node_data as Record<string, unknown>;
        const nodeRef = db.collection("nodes").doc(); // auto-ID for new nodes
        tx.set(nodeRef, {
          ...nodeData,
          id: nodeRef.id,
          createdAt: FieldValue.serverTimestamp(),
          created_by: proposal.created_by ?? "discovery-agent",
          approved_by: uid,
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          created_node_id: nodeRef.id,
        });

        logger.info(`Approved new_node: ${nodeData.name as string} → ${nodeRef.id}`);
        return { success: true, action: "approved", nodeId: nodeRef.id };
      }

      if (proposalType === "new_edge") {
        const edgeData = proposal.edge_data as Record<string, unknown>;
        const fromNode = edgeData.from_node as string;
        const toNode = edgeData.to_node as string;
        const relationship = edgeData.relationship as string;
        const edgeId = `${fromNode}-${toNode}-${relationship}`;
        const edgeRef = db.doc(`edges/${edgeId}`);

        // Look up node types for from_type and to_type (required by Edge schema)
        const fromSnap = await tx.get(db.doc(`nodes/${fromNode}`));
        const toSnap = await tx.get(db.doc(`nodes/${toNode}`));
        if (!fromSnap.exists || !toSnap.exists) {
          throw new HttpsError("failed-precondition", "Referenced nodes no longer exist");
        }

        tx.set(edgeRef, {
          id: edgeId,
          from_node: fromNode,
          from_type: fromSnap.data()!.type ?? "",
          to_node: toNode,
          to_type: toSnap.data()!.type ?? "",
          relationship,
          properties: { reasoning: edgeData.reasoning ?? "" },
          created_by: proposal.created_by ?? "discovery-agent",
          approved_by: uid,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          created_edge_id: edgeId,
        });

        logger.info(`Approved new_edge: ${edgeId}`);
        return { success: true, action: "approved", edgeId };
      }

      if (proposalType === "update_node") {
        const updateData = proposal.update_data as Record<string, unknown>;
        const nodeId = updateData.node_id as string;
        const proposedChanges = updateData.proposed_changes as Record<string, { proposed_value: unknown }>;

        const nodeRef = db.doc(`nodes/${nodeId}`);
        const nodeSnap = await tx.get(nodeRef);
        if (!nodeSnap.exists) throw new HttpsError("not-found", `Node ${nodeId} not found`);

        const currentDoc = nodeSnap.data()!;
        const updates: Record<string, unknown> = {};
        const changeLog: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

        for (const [field, change] of Object.entries(proposedChanges)) {
          updates[field] = change.proposed_value;
          changeLog.push({
            field,
            old_value: currentDoc[field] ?? null,
            new_value: change.proposed_value,
          });
        }

        const currentVersion = (currentDoc.version as number) ?? 0;
        updates.version = currentVersion + 1;
        updates.lastUpdated = FieldValue.serverTimestamp();
        updates.lastUpdatedBy = uid;

        tx.update(nodeRef, updates);

        // Write changelog
        const changelogRef = db.collection("changelogs").doc();
        tx.set(changelogRef, {
          node_id: nodeId,
          node_name: updateData.node_name ?? "",
          node_type: updateData.node_type ?? "",
          version: currentVersion + 1,
          changes: changeLog,
          proposal_id: proposalId,
          reviewed_by: uid,
          reviewed_at: FieldValue.serverTimestamp(),
          overall_reasoning: updateData.overall_reasoning ?? "",
          confidence: proposal.confidence ?? 0,
          created_at: FieldValue.serverTimestamp(),
          created_by: proposal.created_by ?? "validator-agent",
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
        });

        // Increment reviewer's totalReviews counter
        const reviewerRef = db.collection("users").doc(uid);
        const reviewerSnap = await tx.get(reviewerRef);
        if (reviewerSnap.exists) {
          tx.update(reviewerRef, { totalReviews: FieldValue.increment(1) });
        }

        logger.info(`Approved update_node: ${nodeId}, ${changeLog.length} changes applied`);
        return { success: true, action: "approved", changesApplied: changeLog.length };
      }

      throw new HttpsError("invalid-argument", `Unknown proposal_type: ${proposalType}`);
    });

    // Post-approval: trigger Graph Builder rebuild (fire-and-forget)
    // This runs outside the transaction to avoid blocking the response.
    if (result.action === "approved") {
      try {
        // Inline a lightweight graph snapshot rebuild
        const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);
        const snapshotNodes = nodes.map((n) => {
          const node: Record<string, unknown> = { id: n.id, type: n.type, name: n.name };
          if (n.velocity) node.velocity = n.velocity;
          if (n.implementation_stage) node.implementation_stage = n.implementation_stage;
          if (n.significance) node.significance = n.significance;
          if (n.score_2026 !== undefined) node.score_2026 = n.score_2026;
          return node;
        });
        const snapshotEdges = edges.map((e) => ({
          from: e.from_node, to: e.to_node, relationship: e.relationship,
        }));
        await writeGraphSnapshot({
          nodes: snapshotNodes, edges: snapshotEdges,
          nodeCount: snapshotNodes.length, edgeCount: snapshotEdges.length,
        });
        logger.info("Post-approval: graph snapshot rebuilt");
      } catch (err) {
        logger.warn("Post-approval graph rebuild failed (non-fatal):", err);
      }
    }

    return result;
  }
);

export const rejectGraphProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const db = getFirestore();
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!userSnap.exists) throw new HttpsError("permission-denied", "No user profile found");
    const userData = userSnap.data()!;
    if (!userData.isAdmin && !userData.isReviewer) {
      throw new HttpsError("permission-denied", "Requires reviewer or admin role");
    }

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const proposalRef = db.collection("graph_proposals").doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");
    if (proposalSnap.data()!.status !== "pending") {
      throw new HttpsError("failed-precondition", "Proposal is not pending");
    }

    await proposalRef.update({
      status: "rejected",
      reviewed_at: FieldValue.serverTimestamp(),
      reviewed_by: request.auth.uid,
      rejection_reason: (request.data.reason as string) ?? "",
    });

    return { success: true };
  }
);
```

- [ ] **Step 2: Build to verify compile**

Run: `cd functions && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/approval/index.ts
git commit -m "feat(approval): add unified approveGraphProposal and rejectGraphProposal callables"
```

---

### Task 16: Update index.ts with v2 agent exports

**Files:**
- Modify: `functions/src/index.ts`

Replace v1 agent scheduled functions with v2 exports. Keep v1 callable functions (`applyValidationProposal`, `triggerAgentRun`) during transition but add deprecation comments. Add v2 agent exports.

**Important:** The v1 `signalScout`, `discoveryAgent`, `validatorAgent`, and `dataLifecycle` scheduled functions will be replaced by v2 versions. The v1 code in `signal-scout/`, `discovery-agent/`, `validator-agent/`, and `data-lifecycle.ts` remains on disk as backup but is no longer exported.

- [ ] **Step 1: Replace v1 scheduled exports with v2**

At the end of `index.ts`, after the existing v2 exports section (line 882+), the file currently has:

```typescript
// --- v2 agents ---
export { buildGraph } from "./agents/graph-builder/index.js";
export { scheduledFeedCurator, triggerFeedCurator } from "./agents/feed-curator/index.js";
export { onVoteWritten } from "./triggers/vote-aggregation.js";
export { migrateV1toV2 } from "./migration/v1-to-v2.js";
```

Replace with:

```typescript
// --- v2 agents ---
export { buildGraph } from "./agents/graph-builder/index.js";
export { scheduledFeedCurator, triggerFeedCurator } from "./agents/feed-curator/index.js";
export { onVoteWritten } from "./triggers/vote-aggregation.js";
export { migrateV1toV2 } from "./migration/v1-to-v2.js";
export { scheduledSignalScout, triggerSignalScout } from "./agents/signal-scout/index.js";
export { scheduledDiscovery, triggerDiscovery } from "./agents/discovery/index.js";
export { scheduledValidator, triggerValidator } from "./agents/validator/index.js";
export { approveGraphProposal, rejectGraphProposal } from "./agents/approval/index.js";
```

- [ ] **Step 2: Comment out v1 scheduled exports**

The v1 `signalScout`, `discoveryAgent`, `validatorAgent` exports (at lines ~49, ~338, ~482) need to be commented out to avoid duplicate schedule conflicts. Also comment out the v1 `dataLifecycle` (line ~323).

Add a comment before each: `// v1 — replaced by v2 agents in functions/src/agents/`

Keep the v1 `applyValidationProposal` and `triggerAgentRun` callables active for now — they reference v1 collections (`risks`, `solutions`, `validation_proposals`) which may still have data during the transition period.

**Note:** Do NOT delete the v1 imports at the top of the file — only comment out the `export const` lines that create the Cloud Functions. The imports may still be used by `triggerAgentRun`.

- [ ] **Step 3: Update `triggerAgentRun` to support v2 agents**

In the `triggerAgentRun` callable (around line 713), update the `validAgents` array to include v2 agent IDs and add routing:

```typescript
const validAgents = [
  "signal-scout", "discovery-agent", "validator-agent",  // v1 (legacy)
  "signal-scout-v2", "discovery-v2", "validator-v2",     // v2
];
```

Add v2 handling branches after the existing v1 branches. For v2 agents, import and call the `run*` functions from the new agent modules. Alternatively, since v2 agents have their own `trigger*` callables, `triggerAgentRun` can simply call those internally.

**Simpler approach:** Since v2 agents export their own `trigger*` callables, the admin UI should call those directly. Update `triggerAgentRun` to only add a deprecation warning:

```typescript
logger.warn(`triggerAgentRun is deprecated for ${agentId}. Use the v2 trigger* callables directly.`);
```

- [ ] **Step 4: Add v2 data lifecycle export**

Import and export the v2 data lifecycle:

```typescript
import { runDataLifecycle as runDataLifecycleV2 } from "./agents/data-lifecycle/index.js";
```

Replace the v1 `dataLifecycle` scheduled function with:

```typescript
export const dataLifecycleV2 = onSchedule(
  {
    schedule: "0 3 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    logger.info("Data lifecycle v2: starting daily run");
    const stats = await runDataLifecycleV2();
    logger.info("Data lifecycle v2 complete:", stats);
  }
);
```

- [ ] **Step 5: Build to verify all exports compile**

Run: `cd functions && npm run build`
Expected: PASS — no TypeScript errors, all exports resolve

- [ ] **Step 6: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): replace v1 agent exports with v2, add approval + lifecycle exports"
```

---

### Task 17: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

Run: `cd functions && rm -rf lib && npm run build`
Expected: PASS — no TypeScript errors

- [ ] **Step 2: Check all exports are valid**

Run: `cd functions && node -e "const f = require('./lib/index.js'); console.log(Object.keys(f).sort().join('\n'))"`
Expected: List includes all v2 functions:
- `approveGraphProposal`
- `buildGraph`
- `dataLifecycleV2`
- `migrateV1toV2`
- `onVoteWritten`
- `rejectGraphProposal`
- `scheduledDiscovery`
- `scheduledFeedCurator`
- `scheduledSignalScout`
- `scheduledValidator`
- `triggerDiscovery`
- `triggerFeedCurator`
- `triggerSignalScout`
- `triggerValidator`
- Plus any v1 callables still exported (`applyValidationProposal`, `triggerAgentRun`, `usageReport`, `pipelineHealth`)

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
git add -A functions/
git commit -m "fix(functions): resolve build issues from v2 agent integration"
```

---

### Task 18: Deploy and verify

**Files:** None (deployment)

- [ ] **Step 1: Check active Firebase project**

Run: `firebase use`
Expected: `ai-4-society`

- [ ] **Step 2: Deploy functions**

Run: `firebase deploy --only functions`

**Note:** First deploy of new functions may take longer. If Eventarc permissions errors occur (like v1 `onVoteWritten`), wait 60 seconds and retry.

- [ ] **Step 3: Verify functions are deployed**

Run: `firebase functions:list`
Expected: All v2 functions appear in the list

- [ ] **Step 4: Commit any deploy-related fixes**

```bash
git add -A
git commit -m "chore: post-deploy fixes for v2 agents"
```

---

## Summary of v1 → v2 Agent Changes

| Agent | v1 Location | v2 Location | Key Change |
|-------|-------------|-------------|------------|
| Signal Scout | `signal-scout/` | `agents/signal-scout/` | Stage 1 filter + graph-based classification |
| Discovery | `discovery-agent/` | `agents/discovery/` | Proposes edges + stakeholders, reads from `nodes` |
| Validator | `validator-agent/` | `agents/validator/` | Uses `related_node_ids`, writes to `graph_proposals` |
| Data Lifecycle | `data-lifecycle.ts` | `agents/data-lifecycle/` | v2 retention + auto-expiry + v1 cleanup |
| Graph Builder | `agents/graph-builder/` | (same) | Added filterTerms auto-update |
| Approval | (inline in index.ts) | `agents/approval/` | Unified callable for all proposal types |
