# Agent Observatory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/observatory` page with agent registry, per-agent health/config/run-history views, and refactor Signal Scout to write structured observability data.

**Architecture:** Firestore `agents/{agentId}` collection with subcollections for config, health, and runs. Real-time UI via `onSnapshot`. Signal Scout reads runtime config from Firestore and writes token-level metrics per run.

**Tech Stack:** React 19, TypeScript, Tailwind 3, Firebase Firestore, Cloud Functions v2, `@google/generative-ai`

---

### Task 1: Seed Script — Populate Agent Registry

**Files:**
- Create: `src/scripts/seed-agents.ts`

**Step 1: Write the seed script**

This script creates 7 agent registry docs + Signal Scout's config doc. Run with `npx ts-node src/scripts/seed-agents.ts`.

```typescript
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Use default credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
initializeApp();
const db = getFirestore();

interface AgentSeed {
  id: string;
  name: string;
  description: string;
  tier: string;
  status: "active" | "disabled" | "not_deployed";
  deployedAt: FieldValue | null;
  functionName: string | null;
  schedule: string | null;
  overseerRole: string;
}

const agents: AgentSeed[] = [
  {
    id: "signal-scout",
    name: "Signal Scout",
    description: "Discovers and collects real-world evidence from news sources, research papers, and global event databases. Classifies articles by AI risk category using Gemini.",
    tier: "2A",
    status: "active",
    deployedAt: FieldValue.serverTimestamp(),
    functionName: "signalScout",
    schedule: "every 6 hours",
    overseerRole: "Source Sentinel",
  },
  {
    id: "topic-tracker",
    name: "Topic Tracker",
    description: "Monitors specific AI domains and emerging themes. Detects emerging risk patterns not yet in the database and tracks shifts in public/expert sentiment.",
    tier: "2A",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Causality Cartographer",
  },
  {
    id: "risk-evaluation",
    name: "Risk Evaluation",
    description: "Assesses and updates risk metrics based on incoming signals. Generates narrative content, identifies affected stakeholders, and determines risk velocity.",
    tier: "2B",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Severity Steward",
  },
  {
    id: "solution-evaluation",
    name: "Solution Evaluation",
    description: "Tracks solution development and adoption progress. Monitors implementation stages, identifies barriers and enablers, and updates adoption scores.",
    tier: "2B",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Greenlight Gardener",
  },
  {
    id: "validation",
    name: "Validation",
    description: "Ensures data quality and accuracy. Fact-checks signal evidence URLs, verifies narrative consistency, detects anomalies, and validates score calculations.",
    tier: "2C",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Gap Engineer",
  },
  {
    id: "consolidation",
    name: "Consolidation",
    description: "Aggregates updates from multiple agents, resolves conflicts, maintains data versioning, executes atomic database writes, and generates change logs.",
    tier: "2C",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Forecast Scribe",
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Master coordinator and decision-maker. Schedules subordinate agents, manages workflow state, handles conflict resolution, and maintains system health metrics.",
    tier: "1",
    status: "not_deployed",
    deployedAt: null,
    functionName: null,
    schedule: null,
    overseerRole: "Observatory Steward",
  },
];

const signalScoutSources: Record<string, { enabled: boolean; name: string; type: "rss" | "api" }> = {
  "arxiv-ai": { enabled: true, name: "arXiv CS.AI", type: "rss" },
  "mit-tech-review": { enabled: true, name: "MIT Technology Review", type: "rss" },
  "ars-ai": { enabled: true, name: "Ars Technica AI", type: "rss" },
  "verge-ai": { enabled: true, name: "The Verge AI", type: "rss" },
  "techcrunch-ai": { enabled: true, name: "TechCrunch AI", type: "rss" },
  "wired-ai": { enabled: true, name: "Wired AI", type: "rss" },
  "gdelt-ai": { enabled: true, name: "GDELT DOC API", type: "api" },
};

async function seed() {
  console.log("Seeding agent registry...");

  for (const agent of agents) {
    const { id, ...data } = agent;
    await db.collection("agents").doc(id).set(data);
    console.log(`  ✓ agents/${id}`);
  }

  // Signal Scout config
  await db.collection("agents").doc("signal-scout").collection("config").doc("current").set({
    sources: signalScoutSources,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "seed-script",
  });
  console.log("  ✓ agents/signal-scout/config/current");

  // Signal Scout initial health doc (empty baseline)
  await db.collection("agents").doc("signal-scout").collection("health").doc("latest").set({
    lastRunAt: null,
    lastRunOutcome: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveErrors: 0,
    consecutiveEmptyRuns: 0,
    lastRunTokens: null,
    totalTokensToday: { input: 0, output: 0 },
    totalTokensMonth: { input: 0, output: 0 },
    estimatedCostMonth: 0,
    lastRunArticlesFetched: 0,
    lastRunSignalsStored: 0,
    totalSignalsLifetime: 0,
  });
  console.log("  ✓ agents/signal-scout/health/latest");

  console.log("\nDone! Seeded 7 agents + Signal Scout config + health.");
}

seed().catch(console.error);
```

**Step 2: Run the seed script against production**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx ts-node src/scripts/seed-agents.ts`
Expected: 7 agent docs + config + health created.

**Step 3: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat: add agent registry seed script"
```

---

### Task 2: Firestore Security Rules — Add Agent Collection Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Add rules for the agents collection**

Add after the `_usage` rules block (line 47), before the `isAdmin()` function:

```
    // Agent registry: public read for status badges
    match /agents/{agentId} {
      allow read: if true;
      allow write: if false;
    }

    // Agent config: admin read + write
    match /agents/{agentId}/config/{doc} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    // Agent health: admin read, server write only
    match /agents/{agentId}/health/{doc} {
      allow read: if isAdmin();
      allow write: if false;
    }

    // Agent run history: admin read, server write only
    match /agents/{agentId}/runs/{runId} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

**Step 2: Validate the rules**

Run: `cd /Users/dehakuran/Projects/ai-4-society && firebase emulators:exec --only firestore "echo rules ok"` or use the Firebase MCP tool to validate.

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for agent registry"
```

---

### Task 3: Refactor Signal Scout — Read Config from Firestore

**Files:**
- Modify: `functions/src/signal-scout/fetcher.ts`
- Modify: `functions/src/index.ts`

**Step 1: Update `fetcher.ts` to accept a sources filter**

Change `fetchAllSources()` to accept an optional set of enabled source IDs. If provided, skip disabled sources. If not provided (config doc missing), use all sources.

In `functions/src/signal-scout/fetcher.ts`, change the `fetchAllSources` function signature and loop:

```typescript
export async function fetchAllSources(enabledSourceIds?: Set<string>): Promise<RawArticle[]> {
  const results: RawArticle[] = [];

  for (const source of DATA_SOURCES) {
    // Skip disabled sources if config is provided
    if (enabledSourceIds && !enabledSourceIds.has(source.id)) {
      logger.info(`Skipping disabled source: ${source.name}`);
      continue;
    }

    try {
      const articles =
        source.type === "rss"
          ? await fetchRSS(source)
          : await fetchGDELT(source);
      results.push(...articles);
      logger.info(`Fetched ${articles.length} articles from ${source.name}`);
    } catch (err) {
      logger.warn(`Failed to fetch from ${source.name}:`, err);
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
```

**Step 2: Update `index.ts` to read config before fetching**

In the `signalScout` function body, before `fetchAllSources()`, add config reading:

```typescript
// Read runtime config from Firestore
const db = getFirestore();
let enabledSourceIds: Set<string> | undefined;
try {
  const configSnap = await db.collection("agents").doc("signal-scout").collection("config").doc("current").get();
  if (configSnap.exists) {
    const config = configSnap.data()!;
    const sources = config.sources as Record<string, { enabled: boolean }>;
    enabledSourceIds = new Set(
      Object.entries(sources)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k)
    );
    logger.info(`Config loaded: ${enabledSourceIds.size} sources enabled`);
  }
} catch (err) {
  logger.warn("Failed to read agent config, using all sources:", err);
}

// Step 1: Fetch articles from enabled sources
const articles = await fetchAllSources(enabledSourceIds);
```

**Step 3: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: Clean compile, no errors.

**Step 4: Commit**

```bash
git add functions/src/signal-scout/fetcher.ts functions/src/index.ts
git commit -m "feat: Signal Scout reads enabled sources from Firestore config"
```

---

### Task 4: Refactor Signal Scout — Capture Gemini Token Usage

**Files:**
- Modify: `functions/src/signal-scout/classifier.ts`

**Step 1: Update `classifyArticles` to return token counts**

Change the return type to include accumulated token usage:

```typescript
export interface ClassificationResult {
  signals: ClassifiedSignal[];
  tokenUsage: { input: number; output: number };
}

export async function classifyArticles(
  articles: RawArticle[],
  geminiApiKey: string
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const results: ClassifiedSignal[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Process in batches
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
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      // Capture token usage
      const usage = result.response.usageMetadata;
      if (usage) {
        totalInputTokens += usage.promptTokenCount ?? 0;
        totalOutputTokens += usage.candidatesTokenCount ?? 0;
      }

      const text = result.response.text();
      const parsed: Array<{
        index: number;
        relevant: boolean;
        summary?: string;
        risk_categories?: string[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
      }> = JSON.parse(text);

      for (const item of parsed) {
        if (!item.relevant) continue;
        const article = batch[item.index];
        if (!article) continue;

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          risk_categories: item.risk_categories ?? [],
          severity_hint: item.severity_hint ?? "Emerging",
          affected_groups: item.affected_groups ?? [],
          confidence_score: item.confidence_score ?? 0.5,
        });
      }

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} relevant signals so far (tokens: ${totalInputTokens}/${totalOutputTokens})`
      );
    } catch (err) {
      logger.error(`Gemini batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
    }
  }

  return { signals: results, tokenUsage: { input: totalInputTokens, output: totalOutputTokens } };
}
```

**Step 2: Update `index.ts` to use the new return type**

Where `classifyArticles` is called, destructure the result:

```typescript
// Step 2: Classify with Gemini
const { signals, tokenUsage } = await classifyArticles(articles, geminiApiKey.value());
const geminiCalls = Math.ceil(articles.length / BATCH_SIZE);
logger.info(`Classified ${signals.length} relevant signals (tokens: ${tokenUsage.input}in/${tokenUsage.output}out)`);
```

Update all downstream references: `signals.length` stays the same (it's now destructured), and `storeSignals(signals)` stays the same.

**Step 3: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: Clean compile.

**Step 4: Commit**

```bash
git add functions/src/signal-scout/classifier.ts functions/src/index.ts
git commit -m "feat: capture Gemini token usage per classification batch"
```

---

### Task 5: Refactor Signal Scout — Write Run Summary + Health to Agent Registry

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/src/usage-monitor.ts`

**Step 1: Add `writeAgentRunSummary` function to `usage-monitor.ts`**

Add at the bottom of `functions/src/usage-monitor.ts`:

```typescript
// ─── Agent Observatory: Run Summary + Health ────────────────────────────────

// Gemini 2.0 Flash pricing (per 1M tokens, as of Feb 2026)
const GEMINI_FLASH_PRICING = {
  inputPerMillion: 0.10,
  outputPerMillion: 0.40,
};

export interface AgentRunData {
  agentId: string;
  startedAt: Date;
  outcome: PipelineOutcome;
  error: string | null;
  metrics: {
    articlesFetched: number;
    signalsStored: number;
    geminiCalls: number;
    tokensInput: number;
    tokensOutput: number;
    firestoreReads: number;
    firestoreWrites: number;
  };
  sourcesUsed: string[];
}

export async function writeAgentRunSummary(data: AgentRunData): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const completedAt = now;
  const duration = completedAt.getTime() - data.startedAt.getTime();

  // 1. Write run summary
  await db.collection("agents").doc(data.agentId).collection("runs").add({
    startedAt: data.startedAt,
    completedAt: FieldValue.serverTimestamp(),
    duration,
    outcome: data.outcome,
    error: data.error,
    metrics: data.metrics,
    sourcesUsed: data.sourcesUsed,
  });

  // 2. Update health doc
  const healthRef = db.collection("agents").doc(data.agentId).collection("health").doc("latest");
  const healthSnap = await healthRef.get();
  const prev = healthSnap.data() ?? {};

  const consecutiveErrors = data.outcome === "error"
    ? ((prev.consecutiveErrors as number) ?? 0) + 1
    : 0;
  const consecutiveEmptyRuns = data.outcome === "empty"
    ? ((prev.consecutiveEmptyRuns as number) ?? 0) + 1
    : 0;

  // Rolling token totals
  const prevToday = (prev.totalTokensToday as { input: number; output: number }) ?? { input: 0, output: 0 };
  const prevMonth = (prev.totalTokensMonth as { input: number; output: number }) ?? { input: 0, output: 0 };

  // Check if day/month rolled over
  const prevRunDate = prev.lastRunAt?.toDate?.() ?? null;
  const sameDay = prevRunDate && prevRunDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  const sameMonth = prevRunDate && prevRunDate.toISOString().slice(0, 7) === now.toISOString().slice(0, 7);

  const totalTokensToday = sameDay
    ? { input: prevToday.input + data.metrics.tokensInput, output: prevToday.output + data.metrics.tokensOutput }
    : { input: data.metrics.tokensInput, output: data.metrics.tokensOutput };

  const totalTokensMonth = sameMonth
    ? { input: prevMonth.input + data.metrics.tokensInput, output: prevMonth.output + data.metrics.tokensOutput }
    : { input: data.metrics.tokensInput, output: data.metrics.tokensOutput };

  const estimatedCostMonth =
    (totalTokensMonth.input / 1_000_000) * GEMINI_FLASH_PRICING.inputPerMillion +
    (totalTokensMonth.output / 1_000_000) * GEMINI_FLASH_PRICING.outputPerMillion;

  const totalSignalsLifetime = ((prev.totalSignalsLifetime as number) ?? 0) + data.metrics.signalsStored;

  await healthRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunOutcome: data.outcome,
    lastError: data.error,
    lastErrorAt: data.error ? FieldValue.serverTimestamp() : (prev.lastErrorAt ?? null),
    consecutiveErrors,
    consecutiveEmptyRuns,
    lastRunTokens: { input: data.metrics.tokensInput, output: data.metrics.tokensOutput },
    totalTokensToday,
    totalTokensMonth,
    estimatedCostMonth: Math.round(estimatedCostMonth * 10000) / 10000, // 4 decimal places
    lastRunArticlesFetched: data.metrics.articlesFetched,
    lastRunSignalsStored: data.metrics.signalsStored,
    totalSignalsLifetime,
  });

  logger.info(`Agent run summary written for ${data.agentId}: ${data.outcome}, ${duration}ms`);
}
```

**Step 2: Update `index.ts` to call `writeAgentRunSummary`**

Import the new function:

```typescript
import { trackUsage, updatePipelineHealth, writeAgentRunSummary } from "./usage-monitor.js";
```

In the `signalScout` function, capture the start time at the beginning:

```typescript
const runStartedAt = new Date();
```

Before each `return` and in the `catch`, add `writeAgentRunSummary` calls. For the success path (after `trackUsage` and `updatePipelineHealth`):

```typescript
// Write to agent observatory
const enabledSourcesList = enabledSourceIds
  ? [...enabledSourceIds]
  : DATA_SOURCES.map((s) => s.id);

await writeAgentRunSummary({
  agentId: "signal-scout",
  startedAt: runStartedAt,
  outcome,
  error: null,
  metrics: {
    articlesFetched: articles.length,
    signalsStored: stored,
    geminiCalls,
    tokensInput: tokenUsage.input,
    tokensOutput: tokenUsage.output,
    firestoreReads: 1 + signals.length,
    firestoreWrites: stored + 3,
  },
  sourcesUsed: enabledSourcesList,
});
```

Similar calls for the empty-articles and empty-signals early returns, and in the `catch` block (with `error: (err as Error).message`).

**Step 3: Also import DATA_SOURCES in index.ts**

Add at the top of `functions/src/index.ts`:

```typescript
import { DATA_SOURCES } from "./config/sources.js";
```

**Step 4: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: Clean compile.

**Step 5: Commit**

```bash
git add functions/src/usage-monitor.ts functions/src/index.ts
git commit -m "feat: write structured run summaries to agent registry"
```

---

### Task 6: Extend Data Lifecycle — Prune Old Run Summaries

**Files:**
- Modify: `functions/src/data-lifecycle.ts`

**Step 1: Add run summary cleanup**

At the end of `runDataLifecycle()`, before the `return stats`, add cleanup of old agent runs. Add `runsDeleted` to the `LifecycleStats` interface.

Update the interface:

```typescript
interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
}
```

Initialize it:

```typescript
const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0 };
```

Add before `return stats`:

```typescript
  // 4. Delete old agent run summaries (>90 days)
  const runCutoff = daysAgo(90);
  const agentsSnap = await db.collection("agents").get();
  for (const agentDoc of agentsSnap.docs) {
    const runsQuery = agentDoc.ref
      .collection("runs")
      .where("startedAt", "<", runCutoff)
      .limit(BATCH_SIZE);

    let runsSnap = await runsQuery.get();
    while (!runsSnap.empty) {
      const batch = db.batch();
      for (const runDoc of runsSnap.docs) {
        batch.delete(runDoc.ref);
        stats.agentRunsDeleted++;
      }
      await batch.commit();
      logger.info(`Deleted ${runsSnap.size} old runs from ${agentDoc.id}`);

      if (runsSnap.size < BATCH_SIZE) break;
      runsSnap = await runsQuery.get();
    }
  }
```

**Step 2: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat: data lifecycle prunes agent run summaries older than 90 days"
```

---

### Task 7: Observatory Page — Agent List View

**Files:**
- Create: `src/pages/Observatory.tsx`
- Modify: `src/App.tsx`

**Step 1: Create the Observatory page**

Create `src/pages/Observatory.tsx` with the agent list grid view. This reads from `agents` collection (public read) and `agents/{id}/health/latest` (admin read) via `onSnapshot`.

```typescript
import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import AgentDetail from '../components/observatory/AgentDetail';

interface AgentRegistry {
  id: string;
  name: string;
  description: string;
  tier: string;
  status: 'active' | 'disabled' | 'not_deployed';
  functionName: string | null;
  schedule: string | null;
  overseerRole: string;
}

interface AgentHealth {
  lastRunAt: { seconds: number } | null;
  lastRunOutcome: 'success' | 'partial' | 'empty' | 'error' | null;
  consecutiveErrors: number;
  consecutiveEmptyRuns: number;
  totalTokensMonth: { input: number; output: number };
  estimatedCostMonth: number;
  totalSignalsLifetime: number;
}

type HealthDot = 'green' | 'yellow' | 'red' | 'gray';

function computeHealthDot(agent: AgentRegistry, health: AgentHealth | null): HealthDot {
  if (agent.status === 'not_deployed') return 'gray';
  if (!health || !health.lastRunAt) return 'gray';

  const hoursAgo = (Date.now() - health.lastRunAt.seconds * 1000) / (1000 * 60 * 60);
  if (hoursAgo > 12 || health.consecutiveErrors >= 2) return 'red';
  if (hoursAgo > 7 || health.consecutiveEmptyRuns >= 3) return 'yellow';
  return 'green';
}

const DOT_COLORS: Record<HealthDot, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  gray: '#6b7280',
};

const DOT_LABELS: Record<HealthDot, string> = {
  green: 'Healthy',
  yellow: 'Warning',
  red: 'Error',
  gray: 'Not Deployed',
};

function timeAgo(seconds: number): string {
  const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Observatory() {
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRegistry[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealth>>({});
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Subscribe to agent registry
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'agents'), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentRegistry));
      // Sort: active first, then by tier
      docs.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return a.tier.localeCompare(b.tier);
      });
      setAgents(docs);
    });
    return unsubscribe;
  }, []);

  // Subscribe to health docs for all agents
  useEffect(() => {
    if (agents.length === 0) return;

    const unsubscribes = agents
      .filter((a) => a.status !== 'not_deployed')
      .map((agent) =>
        onSnapshot(
          doc(db, 'agents', agent.id, 'health', 'latest'),
          (snap) => {
            if (snap.exists()) {
              setHealthMap((prev) => ({ ...prev, [agent.id]: snap.data() as AgentHealth }));
            }
          },
          (err) => console.error(`Health listener error for ${agent.id}:`, err)
        )
      );

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [agents]);

  // System summary
  const totalTokensMonth = Object.values(healthMap).reduce(
    (acc, h) => ({
      input: acc.input + (h.totalTokensMonth?.input ?? 0),
      output: acc.output + (h.totalTokensMonth?.output ?? 0),
    }),
    { input: 0, output: 0 }
  );
  const totalCostMonth = Object.values(healthMap).reduce((acc, h) => acc + (h.estimatedCostMonth ?? 0), 0);
  const totalSignals = Object.values(healthMap).reduce((acc, h) => acc + (h.totalSignalsLifetime ?? 0), 0);

  if (selectedAgent) {
    const agent = agents.find((a) => a.id === selectedAgent);
    if (agent) {
      return (
        <AgentDetail
          agent={agent}
          health={healthMap[agent.id] ?? null}
          onBack={() => setSelectedAgent(null)}
        />
      );
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white transition-colors">
            &larr; Home
          </button>
          <h1 className="text-lg font-bold">Observatory</h1>
          <span className="text-xs text-gray-500">{agents.filter((a) => a.status === 'active').length} active agents</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{user?.email}</span>
          <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors">
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {agents.map((agent) => {
            const health = healthMap[agent.id] ?? null;
            const dot = computeHealthDot(agent, health);

            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className="p-4 rounded-lg border border-white/10 cursor-pointer transition-all hover:border-white/20 hover:bg-white/5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: DOT_COLORS[dot] }}
                  />
                  <h3 className="text-sm font-bold">{agent.name}</h3>
                  <span className="text-[10px] text-gray-500 ml-auto">Tier {agent.tier}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{
                      color: DOT_COLORS[dot],
                      backgroundColor: `${DOT_COLORS[dot]}15`,
                    }}
                  >
                    {agent.status === 'not_deployed' ? 'Not Deployed' : DOT_LABELS[dot]}
                  </span>
                  {health?.lastRunAt && (
                    <span className="text-[10px] text-gray-500">
                      Last: {timeAgo(health.lastRunAt.seconds)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* System Summary */}
        <div className="p-4 rounded-lg border border-white/10 max-w-md">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">System Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Tokens this month</span>
              <span>{((totalTokensMonth.input + totalTokensMonth.output) / 1000).toFixed(1)}k</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Est. cost</span>
              <span>${totalCostMonth.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total signals (lifetime)</span>
              <span>{totalSignals}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add route in `App.tsx`**

Add import at top:

```typescript
import Observatory from './pages/Observatory';
```

Add route after the `/admin` route:

```typescript
<Route path="/observatory" element={
  <ProtectedRoute>
    <Observatory />
  </ProtectedRoute>
} />
```

**Step 3: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Clean compile (AgentDetail component doesn't exist yet — this will fail until Task 8 is done. Create a stub first if needed).

**Step 4: Commit**

```bash
git add src/pages/Observatory.tsx src/App.tsx
git commit -m "feat: add Observatory page with agent list grid view"
```

---

### Task 8: Observatory — Agent Detail Component (Health + Config + Run History)

**Files:**
- Create: `src/components/observatory/AgentDetail.tsx`

**Step 1: Create the AgentDetail component**

This is a large component with three tabs. It handles:
- **Health tab**: displays health snapshot from props + real-time updates
- **Config tab**: reads `agents/{id}/config/current`, allows toggling sources, saves to Firestore
- **Run History tab**: reads `agents/{id}/runs` ordered by `startedAt` desc, paginated

```typescript
import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, updateDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

interface AgentRegistry {
  id: string;
  name: string;
  description: string;
  tier: string;
  status: 'active' | 'disabled' | 'not_deployed';
  functionName: string | null;
  schedule: string | null;
  overseerRole: string;
}

interface AgentHealth {
  lastRunAt: { seconds: number } | null;
  lastRunOutcome: string | null;
  lastError: string | null;
  lastErrorAt: { seconds: number } | null;
  consecutiveErrors: number;
  consecutiveEmptyRuns: number;
  lastRunTokens: { input: number; output: number } | null;
  totalTokensToday: { input: number; output: number };
  totalTokensMonth: { input: number; output: number };
  estimatedCostMonth: number;
  lastRunArticlesFetched: number;
  lastRunSignalsStored: number;
  totalSignalsLifetime: number;
}

interface AgentConfig {
  sources: Record<string, { enabled: boolean; name: string; type: string }>;
  updatedAt: { seconds: number } | null;
  updatedBy: string;
}

interface RunSummary {
  id: string;
  startedAt: { seconds: number };
  completedAt: { seconds: number };
  duration: number;
  outcome: string;
  error: string | null;
  metrics: {
    articlesFetched: number;
    signalsStored: number;
    geminiCalls: number;
    tokensInput: number;
    tokensOutput: number;
  };
  sourcesUsed: string[];
}

type Tab = 'health' | 'config' | 'history';

function timeAgo(seconds: number): string {
  const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const OUTCOME_ICONS: Record<string, string> = {
  success: '✓',
  partial: '⚠',
  empty: '○',
  error: '✗',
};

const OUTCOME_COLORS: Record<string, string> = {
  success: 'text-green-400',
  partial: 'text-yellow-400',
  empty: 'text-gray-400',
  error: 'text-red-400',
};

interface Props {
  agent: AgentRegistry;
  health: AgentHealth | null;
  onBack: () => void;
}

export default function AgentDetail({ agent, health, onBack }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('health');
  const [liveHealth, setLiveHealth] = useState<AgentHealth | null>(health);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [editedSources, setEditedSources] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Live health subscription
  useEffect(() => {
    if (agent.status === 'not_deployed') return;
    const unsubscribe = onSnapshot(
      doc(db, 'agents', agent.id, 'health', 'latest'),
      (snap) => { if (snap.exists()) setLiveHealth(snap.data() as AgentHealth); }
    );
    return unsubscribe;
  }, [agent.id, agent.status]);

  // Config subscription
  useEffect(() => {
    if (agent.status === 'not_deployed') return;
    const unsubscribe = onSnapshot(
      doc(db, 'agents', agent.id, 'config', 'current'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AgentConfig;
          setConfig(data);
          setEditedSources(
            Object.fromEntries(Object.entries(data.sources).map(([k, v]) => [k, v.enabled]))
          );
        }
      }
    );
    return unsubscribe;
  }, [agent.id, agent.status]);

  // Runs subscription
  useEffect(() => {
    if (agent.status === 'not_deployed') return;
    const q = query(
      collection(db, 'agents', agent.id, 'runs'),
      orderBy('startedAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RunSummary)));
    });
    return unsubscribe;
  }, [agent.id, agent.status]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updatedSources = { ...config.sources };
      for (const [key, enabled] of Object.entries(editedSources)) {
        if (updatedSources[key]) {
          updatedSources[key] = { ...updatedSources[key], enabled };
        }
      }
      await updateDoc(doc(db, 'agents', agent.id, 'config', 'current'), {
        sources: updatedSources,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? 'unknown',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasConfigChanges = config && Object.entries(editedSources).some(
    ([key, enabled]) => config.sources[key]?.enabled !== enabled
  );

  // Not deployed view
  if (agent.status === 'not_deployed') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors">&larr; Back</button>
          <h1 className="text-lg font-bold">{agent.name}</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-500/15 text-gray-500">Not Deployed</span>
        </div>
        <div className="p-6 max-w-2xl">
          <div className="bg-white/5 rounded-lg p-6 space-y-4">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Description</span>
              <p className="text-sm text-gray-300 mt-1">{agent.description}</p>
            </div>
            <div className="flex gap-8">
              <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Tier</span>
                <p className="text-sm mt-1">{agent.tier}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Overseer</span>
                <p className="text-sm mt-1">{agent.overseerRole}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const h = liveHealth;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors">&larr; Back</button>
        <h1 className="text-lg font-bold">{agent.name}</h1>
        <span className="text-xs text-gray-500">Tier {agent.tier} · Overseer: {agent.overseerRole}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 border-b border-white/10">
        {(['health', 'config', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 ${
              tab === t ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            {t === 'history' ? 'Run History' : t}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-3xl">
        {/* Health Tab */}
        {tab === 'health' && h && (
          <div className="space-y-6">
            {/* Status row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Status</span>
                <p className="text-sm font-bold mt-1 capitalize">{h.lastRunOutcome ?? 'N/A'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Last Run</span>
                <p className="text-sm font-bold mt-1">{h.lastRunAt ? timeAgo(h.lastRunAt.seconds) : 'Never'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Consecutive Errors</span>
                <p className={`text-sm font-bold mt-1 ${h.consecutiveErrors > 0 ? 'text-red-400' : ''}`}>
                  {h.consecutiveErrors}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Lifetime Signals</span>
                <p className="text-sm font-bold mt-1">{h.totalSignalsLifetime}</p>
              </div>
            </div>

            {/* Last run metrics */}
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Last Run Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Articles fetched</span>
                  <p className="font-bold">{h.lastRunArticlesFetched}</p>
                </div>
                <div>
                  <span className="text-gray-500">Signals stored</span>
                  <p className="font-bold">{h.lastRunSignalsStored}</p>
                </div>
                <div>
                  <span className="text-gray-500">Tokens (in)</span>
                  <p className="font-bold">{h.lastRunTokens?.input?.toLocaleString() ?? 0}</p>
                </div>
                <div>
                  <span className="text-gray-500">Tokens (out)</span>
                  <p className="font-bold">{h.lastRunTokens?.output?.toLocaleString() ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Monthly totals */}
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Monthly Totals</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Tokens (in/out)</span>
                  <p className="font-bold">
                    {(h.totalTokensMonth?.input ?? 0).toLocaleString()} / {(h.totalTokensMonth?.output ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Est. cost</span>
                  <p className="font-bold">${h.estimatedCostMonth?.toFixed(4) ?? '0.0000'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Consecutive empty</span>
                  <p className={`font-bold ${h.consecutiveEmptyRuns >= 3 ? 'text-yellow-400' : ''}`}>
                    {h.consecutiveEmptyRuns}
                  </p>
                </div>
              </div>
            </div>

            {/* Last error */}
            {h.lastError && (
              <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-4">
                <h3 className="text-xs uppercase tracking-widest text-red-400 mb-2">Last Error</h3>
                <p className="text-sm text-red-300 font-mono">{h.lastError}</p>
                {h.lastErrorAt && (
                  <p className="text-[10px] text-red-400/60 mt-2">{timeAgo(h.lastErrorAt.seconds)}</p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'health' && !h && (
          <p className="text-gray-500 text-sm">No health data available yet.</p>
        )}

        {/* Config Tab */}
        {tab === 'config' && (
          <div className="space-y-6">
            {config ? (
              <>
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Data Sources</h3>
                  <div className="space-y-2">
                    {Object.entries(config.sources).map(([key, source]) => (
                      <label key={key} className="flex items-center gap-3 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editedSources[key] ?? source.enabled}
                          onChange={(e) => setEditedSources((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-600 bg-transparent accent-cyan-400"
                        />
                        <span className="text-sm">{source.name}</span>
                        <span className="text-[10px] text-gray-500 uppercase">{source.type}</span>
                      </label>
                    ))}
                  </div>
                  {hasConfigChanges && (
                    <button
                      onClick={saveConfig}
                      disabled={saving}
                      className="mt-4 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                </div>

                {/* View-only fields */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">System Config (read-only)</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Schedule</span>
                      <span>{agent.schedule ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cloud Function</span>
                      <span className="font-mono text-xs">{agent.functionName ?? 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-sm">No configuration available for this agent.</p>
            )}
          </div>
        )}

        {/* Run History Tab */}
        {tab === 'history' && (
          <div>
            {runs.length === 0 ? (
              <p className="text-gray-500 text-sm">No runs recorded yet.</p>
            ) : (
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] text-gray-500 uppercase tracking-widest">
                      <th className="text-left p-3">Time</th>
                      <th className="text-left p-3">Outcome</th>
                      <th className="text-right p-3">Duration</th>
                      <th className="text-right p-3">Signals</th>
                      <th className="text-right p-3">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <>
                        <tr
                          key={run.id}
                          onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                          className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                        >
                          <td className="p-3 text-gray-300">
                            {run.startedAt ? formatDate(run.startedAt.seconds) : '—'}
                          </td>
                          <td className={`p-3 ${OUTCOME_COLORS[run.outcome] ?? 'text-gray-400'}`}>
                            {OUTCOME_ICONS[run.outcome] ?? '?'} {run.outcome}
                          </td>
                          <td className="p-3 text-right text-gray-400">
                            {run.duration ? `${(run.duration / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td className="p-3 text-right">{run.metrics?.signalsStored ?? 0}</td>
                          <td className="p-3 text-right text-gray-400">
                            {((run.metrics?.tokensInput ?? 0) + (run.metrics?.tokensOutput ?? 0)).toLocaleString()}
                          </td>
                        </tr>
                        {expandedRun === run.id && (
                          <tr key={`${run.id}-detail`} className="border-b border-white/5">
                            <td colSpan={5} className="p-4 bg-white/5">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-500">Articles fetched</span>
                                  <p>{run.metrics?.articlesFetched ?? 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Gemini calls</span>
                                  <p>{run.metrics?.geminiCalls ?? 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Tokens in / out</span>
                                  <p>{run.metrics?.tokensInput?.toLocaleString() ?? 0} / {run.metrics?.tokensOutput?.toLocaleString() ?? 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Sources used</span>
                                  <p>{run.sourcesUsed?.length ?? 0}</p>
                                </div>
                              </div>
                              {run.error && (
                                <div className="mt-3 p-2 rounded bg-red-400/10 text-red-300 text-xs font-mono">
                                  {run.error}
                                </div>
                              )}
                              {run.sourcesUsed && run.sourcesUsed.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {run.sourcesUsed.map((s) => (
                                    <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create the directory**

Run: `mkdir -p /Users/dehakuran/Projects/ai-4-society/src/components/observatory`

**Step 3: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Clean compile.

**Step 4: Commit**

```bash
git add src/components/observatory/AgentDetail.tsx
git commit -m "feat: add AgentDetail component with health, config, and run history tabs"
```

---

### Task 9: Add Observatory Link to Existing Navigation

**Files:**
- Modify: `src/pages/Admin.tsx`
- Modify: `src/pages/Dashboard.tsx` (if it has nav links)

**Step 1: Add Observatory link to Admin header**

In `src/pages/Admin.tsx`, in the header's left section (around line 104), add after the "Observatory" back link:

```typescript
<button onClick={() => navigate('/observatory')} className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
    Agent Observatory
</button>
```

**Step 2: Build and verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat: add Observatory link to Admin page header"
```

---

### Task 10: Deploy Functions + Hosting + Rules

**Step 1: Build functions**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build`
Expected: Clean compile.

**Step 2: Build frontend**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Clean compile.

**Step 3: Check active Firebase project**

Run: `firebase use`
Expected: `ai-4-society`

**Step 4: Deploy everything**

Run: `firebase deploy`
Expected: Firestore rules, functions, and hosting all deploy successfully.

**Step 5: Run seed script**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx ts-node src/scripts/seed-agents.ts`
Expected: 7 agents seeded.

**Step 6: Verify in browser**

Navigate to `https://ai-4-society.web.app/observatory` (must be signed in as admin). Verify:
- 7 agent cards render (1 active, 6 not deployed)
- Signal Scout card is clickable, shows health/config/run history tabs
- Config tab shows 7 data sources with toggles
- Not-deployed agents show info card only

**Step 7: Commit any final fixes and deploy again if needed**

```bash
git add -A
git commit -m "feat: deploy agent observatory v1"
```
