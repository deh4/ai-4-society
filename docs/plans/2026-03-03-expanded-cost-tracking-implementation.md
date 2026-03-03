# Expanded Cost Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix understated cost estimates by adding per-model pricing, and expand tracking to include Firestore and Cloud Functions compute costs with free tier offsets.

**Architecture:** Replace the single hardcoded Gemini pricing constant with a model pricing map. Extend `AgentRunData` with `modelId` and `memoryMiB` fields. Calculate a full cost breakdown (Gemini + Firestore + Functions compute) in `writeAgentRunSummary`, with free tier deduction using cumulative usage from `trackUsage`. Update the Observatory frontend to display the cost breakdown.

**Tech Stack:** TypeScript, Firebase Cloud Functions v2, React 19, Firestore

---

### Task 1: Add Model Pricing Map and Firebase Cost Constants

**Files:**
- Modify: `functions/src/usage-monitor.ts:157-161`

**Step 1: Replace `GEMINI_FLASH_PRICING` with `MODEL_PRICING` map and add Firebase cost constants**

Replace lines 157-161:

```ts
// Gemini 2.0 Flash pricing (per 1M tokens)
const GEMINI_FLASH_PRICING = {
  inputPerMillion: 0.10,
  outputPerMillion: 0.40,
};
```

With:

```ts
// Gemini model pricing (per 1M tokens) — update when models change
// Source: https://ai.google.dev/gemini-api/docs/pricing
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gemini-2.5-flash": { inputPerMillion: 0.30, outputPerMillion: 2.50 },
  "gemini-2.5-pro":   { inputPerMillion: 1.25, outputPerMillion: 10.00 },
};

const DEFAULT_MODEL_PRICING = { inputPerMillion: 0.30, outputPerMillion: 2.50 }; // fallback to flash

// Firebase pricing (Blaze plan, pay-as-you-go above free tier)
// Source: https://firebase.google.com/pricing
const FIRESTORE_PRICING = {
  readPer100K: 0.036,
  writePer100K: 0.108,
};

const FUNCTIONS_PRICING = {
  gbSecondRate: 0.0000025,
};

// Free tier monthly/daily allowances
const FREE_TIER_DAILY = {
  firestoreReads: 50_000,
  firestoreWrites: 20_000,
};

const FREE_TIER_MONTHLY = {
  functionGbSeconds: 400_000,
};
```

**Step 2: Verify the functions project builds**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run functions:build`
Expected: Build succeeds (unused old constant removed, new ones not yet referenced — that's OK since they're module-level constants)

**Step 3: Commit**

```bash
git add functions/src/usage-monitor.ts
git commit -m "feat(cost): replace single Gemini pricing with model pricing map and Firebase cost constants"
```

---

### Task 2: Update `AgentRunData` Interface and `CostBreakdown` Type

**Files:**
- Modify: `functions/src/usage-monitor.ts:163-178`

**Step 1: Add `CostBreakdown` interface and update `AgentRunData`**

After the pricing constants, add:

```ts
export interface CostBreakdown {
  geminiTokens: number;
  firestoreReads: number;
  firestoreWrites: number;
  functionsCompute: number;
  total: number;
}
```

Update `AgentRunData` (currently lines 163-178) to add `modelId` and `memoryMiB`:

```ts
export interface AgentRunData {
  agentId: string;
  modelId: string;
  memoryMiB: number;
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
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run functions:build`
Expected: Build FAILS — callers of `writeAgentRunSummary` don't pass `modelId` / `memoryMiB` yet. That's expected; we'll fix callers in Task 4.

**Step 3: Commit (WIP)**

```bash
git add functions/src/usage-monitor.ts
git commit -m "feat(cost): add CostBreakdown type and modelId/memoryMiB to AgentRunData"
```

---

### Task 3: Update `trackUsage` to Return Cumulative Totals

**Files:**
- Modify: `functions/src/usage-monitor.ts:25-100` (the `trackUsage` function)

**Step 1: Change `trackUsage` return type to provide cumulative usage for free tier offset calculations**

Change the function signature from:

```ts
export async function trackUsage(stats: RunStats): Promise<void> {
```

To:

```ts
export interface CumulativeUsage {
  dailyReads: number;
  dailyWrites: number;
  monthlyGbSeconds: number;
}

export async function trackUsage(stats: RunStats): Promise<CumulativeUsage> {
```

At the end of the function (after the existing monthly logging on line ~99), before the closing `}`, add:

```ts
  // Return cumulative totals for cost calculation
  const dailyData = (await dailyRef.get()).data();
  return {
    dailyReads: (dailyData?.firestoreReads as number) ?? stats.firestoreReads,
    dailyWrites: (dailyData?.firestoreWrites as number) ?? stats.firestoreWrites,
    monthlyGbSeconds: 0, // Computed by caller from duration + memory
  };
```

Note: `trackUsage` already reads `dailyRef` on line 67 and `monthlyRef` on line 86, but those reads happen after the writes. We need the post-write values. The existing code already does `const dailySnap = await dailyRef.get()` on line 67 — reuse that snap's data. Actually, looking more carefully, the snap on line 67 is read AFTER the set on line 39, so it already has the updated values. Refactor to avoid the redundant read:

Replace the entire function body to reuse the existing snapshots:

```ts
export async function trackUsage(stats: RunStats): Promise<CumulativeUsage> {
  const db = getFirestore();
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  // Log this run
  await db.collection("_usage").doc("runs").collection("log").add({
    timestamp: FieldValue.serverTimestamp(),
    ...stats,
  });

  // Update daily counters
  const dailyRef = db.collection("_usage").doc(`daily-${dateKey}`);
  await dailyRef.set(
    {
      date: dateKey,
      firestoreReads: FieldValue.increment(stats.firestoreReads),
      firestoreWrites: FieldValue.increment(stats.firestoreWrites),
      runs: FieldValue.increment(1),
      lastRun: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Update monthly counters
  const monthlyRef = db.collection("_usage").doc(`monthly-${monthKey}`);
  await monthlyRef.set(
    {
      month: monthKey,
      totalRuns: FieldValue.increment(1),
      totalArticles: FieldValue.increment(stats.articlesFetched),
      totalGeminiCalls: FieldValue.increment(stats.geminiCalls),
      totalSignalsStored: FieldValue.increment(stats.signalsStored),
      totalFirestoreReads: FieldValue.increment(stats.firestoreReads),
      totalFirestoreWrites: FieldValue.increment(stats.firestoreWrites),
      lastRun: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Check daily limits
  const dailySnap = await dailyRef.get();
  const daily = dailySnap.data();
  if (daily) {
    const readPct = (daily.firestoreReads as number) / FREE_TIER.firestoreReadsPerDay;
    const writePct = (daily.firestoreWrites as number) / FREE_TIER.firestoreWritesPerDay;

    if (readPct > 0.8) {
      logger.warn(
        `FREE TIER WARNING: Firestore reads at ${Math.round(readPct * 100)}% of daily free tier (${daily.firestoreReads}/${FREE_TIER.firestoreReadsPerDay})`
      );
    }
    if (writePct > 0.8) {
      logger.warn(
        `FREE TIER WARNING: Firestore writes at ${Math.round(writePct * 100)}% of daily free tier (${daily.firestoreWrites}/${FREE_TIER.firestoreWritesPerDay})`
      );
    }
  }

  // Check monthly limits
  const monthlySnap = await monthlyRef.get();
  const monthly = monthlySnap.data();
  if (monthly) {
    const runsPct = (monthly.totalRuns as number) / FREE_TIER.functionInvocationsPerMonth;
    if (runsPct > 0.5) {
      logger.warn(
        `FREE TIER WARNING: Function invocations at ${Math.round(runsPct * 100)}% of monthly free tier (${monthly.totalRuns}/${FREE_TIER.functionInvocationsPerMonth})`
      );
    }

    logger.info(
      `Monthly usage (${monthKey}): ${monthly.totalRuns} runs, ${monthly.totalGeminiCalls} Gemini calls, ${monthly.totalSignalsStored} signals stored, ~${monthly.totalFirestoreReads} reads, ~${monthly.totalFirestoreWrites} writes`
    );
  }

  // Return cumulative totals for cost calculation
  return {
    dailyReads: (daily?.firestoreReads as number) ?? stats.firestoreReads,
    dailyWrites: (daily?.firestoreWrites as number) ?? stats.firestoreWrites,
    monthlyGbSeconds: 0,
  };
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run functions:build`
Expected: Build succeeds (return type changed, but callers ignore the return value so no error)

**Step 3: Commit**

```bash
git add functions/src/usage-monitor.ts
git commit -m "feat(cost): trackUsage returns cumulative totals for free tier offset"
```

---

### Task 4: Update `writeAgentRunSummary` to Calculate Full Cost Breakdown

**Files:**
- Modify: `functions/src/usage-monitor.ts:180-243` (the `writeAgentRunSummary` function)

**Step 1: Add a helper function to calculate cost breakdown**

Add before `writeAgentRunSummary`:

```ts
function calculateCostBreakdown(
  data: AgentRunData,
  durationMs: number,
  cumulativeUsage: CumulativeUsage | null,
): CostBreakdown {
  // Gemini token cost
  const pricing = MODEL_PRICING[data.modelId] ?? DEFAULT_MODEL_PRICING;
  const geminiTokens =
    (data.metrics.tokensInput / 1_000_000) * pricing.inputPerMillion +
    (data.metrics.tokensOutput / 1_000_000) * pricing.outputPerMillion;

  // Firestore cost (above daily free tier)
  let firestoreReadCost = 0;
  let firestoreWriteCost = 0;
  if (cumulativeUsage) {
    const billableReads = Math.max(0, cumulativeUsage.dailyReads - FREE_TIER_DAILY.firestoreReads);
    const billableWrites = Math.max(0, cumulativeUsage.dailyWrites - FREE_TIER_DAILY.firestoreWrites);
    // Only charge this run's proportion of billable reads/writes
    const runReadShare = cumulativeUsage.dailyReads > 0
      ? data.metrics.firestoreReads / cumulativeUsage.dailyReads
      : 0;
    const runWriteShare = cumulativeUsage.dailyWrites > 0
      ? data.metrics.firestoreWrites / cumulativeUsage.dailyWrites
      : 0;
    firestoreReadCost = (billableReads * runReadShare / 100_000) * FIRESTORE_PRICING.readPer100K;
    firestoreWriteCost = (billableWrites * runWriteShare / 100_000) * FIRESTORE_PRICING.writePer100K;
  }

  // Cloud Functions compute cost
  const gbSeconds = (data.memoryMiB / 1024) * (durationMs / 1000);
  // Free tier offset: we can't precisely attribute per-run share of 400K monthly free GB-seconds
  // without global state, so we track raw GB-seconds and note the free tier in monthly rollup
  const functionsCompute = gbSeconds * FUNCTIONS_PRICING.gbSecondRate;

  const total = geminiTokens + firestoreReadCost + firestoreWriteCost + functionsCompute;

  return {
    geminiTokens: Math.round(geminiTokens * 10000) / 10000,
    firestoreReads: Math.round(firestoreReadCost * 10000) / 10000,
    firestoreWrites: Math.round(firestoreWriteCost * 10000) / 10000,
    functionsCompute: Math.round(functionsCompute * 10000) / 10000,
    total: Math.round(total * 10000) / 10000,
  };
}
```

**Step 2: Update `writeAgentRunSummary` to use the new cost calculation**

Replace the entire `writeAgentRunSummary` function:

```ts
export async function writeAgentRunSummary(
  data: AgentRunData,
  cumulativeUsage: CumulativeUsage | null = null,
): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const duration = now.getTime() - data.startedAt.getTime();

  // Calculate cost breakdown for this run
  const runCost = calculateCostBreakdown(data, duration, cumulativeUsage);

  // Write run summary doc
  await db.collection("agents").doc(data.agentId).collection("runs").add({
    startedAt: data.startedAt,
    completedAt: FieldValue.serverTimestamp(),
    duration,
    outcome: data.outcome,
    error: data.error,
    metrics: data.metrics,
    modelId: data.modelId,
    cost: runCost,
    sourcesUsed: data.sourcesUsed,
  });

  // Update health doc
  const healthRef = db.collection("agents").doc(data.agentId).collection("health").doc("latest");
  const healthSnap = await healthRef.get();
  const prev = healthSnap.data() ?? {};

  const consecutiveErrors = data.outcome === "error"
    ? ((prev.consecutiveErrors as number) ?? 0) + 1 : 0;
  const consecutiveEmptyRuns = data.outcome === "empty"
    ? ((prev.consecutiveEmptyRuns as number) ?? 0) + 1 : 0;

  const prevToday = (prev.totalTokensToday as { input: number; output: number }) ?? { input: 0, output: 0 };
  const prevMonth = (prev.totalTokensMonth as { input: number; output: number }) ?? { input: 0, output: 0 };

  const prevRunDate = prev.lastRunAt?.toDate?.() ?? null;
  const sameDay = prevRunDate && prevRunDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  const sameMonth = prevRunDate && prevRunDate.toISOString().slice(0, 7) === now.toISOString().slice(0, 7);

  const totalTokensToday = sameDay
    ? { input: prevToday.input + data.metrics.tokensInput, output: prevToday.output + data.metrics.tokensOutput }
    : { input: data.metrics.tokensInput, output: data.metrics.tokensOutput };
  const totalTokensMonth = sameMonth
    ? { input: prevMonth.input + data.metrics.tokensInput, output: prevMonth.output + data.metrics.tokensOutput }
    : { input: data.metrics.tokensInput, output: data.metrics.tokensOutput };

  // Accumulate monthly cost breakdown
  const prevCostMonth = (prev.estimatedCostMonth as CostBreakdown | number | undefined);
  const prevCostBreakdown: CostBreakdown = (typeof prevCostMonth === 'object' && prevCostMonth !== null)
    ? prevCostMonth as CostBreakdown
    : { geminiTokens: 0, firestoreReads: 0, firestoreWrites: 0, functionsCompute: 0, total: 0 };

  const estimatedCostMonth: CostBreakdown = sameMonth
    ? {
        geminiTokens: Math.round((prevCostBreakdown.geminiTokens + runCost.geminiTokens) * 10000) / 10000,
        firestoreReads: Math.round((prevCostBreakdown.firestoreReads + runCost.firestoreReads) * 10000) / 10000,
        firestoreWrites: Math.round((prevCostBreakdown.firestoreWrites + runCost.firestoreWrites) * 10000) / 10000,
        functionsCompute: Math.round((prevCostBreakdown.functionsCompute + runCost.functionsCompute) * 10000) / 10000,
        total: Math.round((prevCostBreakdown.total + runCost.total) * 10000) / 10000,
      }
    : runCost;

  // Apply monthly free tier offset for functions compute
  const monthlyGbSeconds = (data.memoryMiB / 1024) * (duration / 1000);
  const prevMonthlyGbSeconds = sameMonth ? ((prev.totalGbSecondsMonth as number) ?? 0) : 0;
  const totalGbSecondsMonth = prevMonthlyGbSeconds + monthlyGbSeconds;
  const freeGbSecondsRemaining = Math.max(0, FREE_TIER_MONTHLY.functionGbSeconds - prevMonthlyGbSeconds);
  const billableGbSeconds = Math.max(0, monthlyGbSeconds - freeGbSecondsRemaining);
  const adjustedFunctionsCompute = Math.round(billableGbSeconds * FUNCTIONS_PRICING.gbSecondRate * 10000) / 10000;

  // Recalculate with free tier offset for functions
  estimatedCostMonth.functionsCompute = sameMonth
    ? Math.round((prevCostBreakdown.functionsCompute + adjustedFunctionsCompute) * 10000) / 10000
    : adjustedFunctionsCompute;
  estimatedCostMonth.total = Math.round(
    (estimatedCostMonth.geminiTokens + estimatedCostMonth.firestoreReads +
     estimatedCostMonth.firestoreWrites + estimatedCostMonth.functionsCompute) * 10000
  ) / 10000;

  const totalSignalsLifetime = ((prev.totalSignalsLifetime as number) ?? 0) + data.metrics.signalsStored;

  await healthRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunOutcome: data.outcome,
    lastError: data.error,
    lastErrorAt: data.error ? FieldValue.serverTimestamp() : (prev.lastErrorAt ?? null),
    consecutiveErrors,
    consecutiveEmptyRuns,
    lastRunTokens: { input: data.metrics.tokensInput, output: data.metrics.tokensOutput },
    lastRunCost: runCost,
    totalTokensToday,
    totalTokensMonth,
    totalGbSecondsMonth,
    estimatedCostMonth,
    lastRunArticlesFetched: data.metrics.articlesFetched,
    lastRunSignalsStored: data.metrics.signalsStored,
    totalSignalsLifetime,
  });

  logger.info(`Agent run summary written for ${data.agentId}: ${data.outcome}, ${duration}ms, cost $${runCost.total}`);
}
```

**Step 3: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run functions:build`
Expected: Build FAILS — callers still don't pass `modelId` / `memoryMiB`. Fixed in next task.

**Step 4: Commit**

```bash
git add functions/src/usage-monitor.ts
git commit -m "feat(cost): writeAgentRunSummary calculates full cost breakdown with free tier offset"
```

---

### Task 5: Update All Agent Callers in `index.ts`

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Update all `writeAgentRunSummary` calls for Signal Scout (scheduled)**

Every `writeAgentRunSummary` call in the `signalScout` scheduled function (lines ~95-197) needs `modelId: "gemini-2.5-flash"` and `memoryMiB: 512` added to the data object. Also capture `trackUsage` return value and pass it.

For the scheduled `signalScout` function, change `await trackUsage(...)` calls to:
```ts
const usage = await trackUsage({ ... });
```

And add to each `writeAgentRunSummary` call:
```ts
modelId: "gemini-2.5-flash",
memoryMiB: 512,
```

And pass `usage` as the second argument:
```ts
await writeAgentRunSummary({ ...data, modelId: "gemini-2.5-flash", memoryMiB: 512 }, usage);
```

For cases where `trackUsage` is not called (error path), pass `null`:
```ts
await writeAgentRunSummary({ ...data, modelId: "gemini-2.5-flash", memoryMiB: 512 }, null);
```

**Step 2: Update Discovery Agent calls**

The `discoveryAgent` scheduled function (lines ~324-450) does not call `trackUsage`. Add `modelId: "gemini-2.5-pro"` and `memoryMiB: 512` to all its `writeAgentRunSummary` calls. Pass `null` for cumulative usage.

**Step 3: Update Validator Agent calls**

The `validatorAgent` scheduled function (lines ~455-582) also does not call `trackUsage`. Add `modelId: "gemini-2.5-pro"` and `memoryMiB: 512` to its `writeAgentRunSummary` calls. Pass `null` for cumulative usage.

**Step 4: Update `triggerAgentRun` callable**

The `triggerAgentRun` function (lines ~680-833) has inline copies of each agent's logic. Update all `writeAgentRunSummary` calls within it:

- Signal Scout paths: `modelId: "gemini-2.5-flash"`, `memoryMiB: 512`
- Discovery Agent paths: `modelId: "gemini-2.5-pro"`, `memoryMiB: 512`
- Validator Agent paths: `modelId: "gemini-2.5-pro"`, `memoryMiB: 512`

For the `triggerAgentRun` function itself, the memory is 512MiB (line 681).

**Step 5: Also import `CumulativeUsage` from usage-monitor**

Update the import at line 10:
```ts
import { trackUsage, updatePipelineHealth, writeAgentRunSummary } from "./usage-monitor.js";
```
No change needed — `CumulativeUsage` is only used as a type, and the `null` literal handles it.

**Step 6: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run functions:build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(cost): pass modelId and memoryMiB from all agent callers"
```

---

### Task 6: Update Frontend Types in `AgentDetail.tsx`

**Files:**
- Modify: `src/components/observatory/AgentDetail.tsx:24-58`

**Step 1: Add `CostBreakdown` interface and update `AgentHealth` and `RunRecord`**

After the imports (line 10), before `AgentRegistry`, add:

```ts
interface CostBreakdown {
    geminiTokens: number;
    firestoreReads: number;
    firestoreWrites: number;
    functionsCompute: number;
    total: number;
}
```

Update `AgentHealth` — change `estimatedCostMonth` from `number` to support both old and new format:

```ts
interface AgentHealth {
    lastRunAt: { seconds: number } | null;
    lastRunOutcome: 'success' | 'partial' | 'empty' | 'error' | null;
    consecutiveErrors: number;
    consecutiveEmptyRuns: number;
    totalSignalsLifetime: number;
    lastRunArticlesFetched: number;
    lastRunSignalsStored: number;
    lastRunTokens: { input: number; output: number } | null;
    totalTokensMonth: { input: number; output: number };
    estimatedCostMonth: CostBreakdown | number;
    lastRunCost: CostBreakdown | null;
    lastError: string | null;
    lastErrorAt: { seconds: number } | null;
}
```

Update `RunRecord` to include `cost` and `modelId`:

```ts
interface RunRecord {
    id: string;
    startedAt: { seconds: number } | null;
    completedAt: { seconds: number } | null;
    duration: number;
    outcome: 'success' | 'partial' | 'empty' | 'error';
    metrics: {
        articlesFetched: number;
        signalsStored: number;
        tokensInput: number;
        tokensOutput: number;
    };
    modelId?: string;
    cost?: CostBreakdown;
    sourcesUsed: string[];
    error: string | null;
}
```

**Step 2: Add a helper to extract cost total (backward compatible)**

Add after the type definitions:

```ts
function getCostTotal(cost: CostBreakdown | number | null | undefined): number {
    if (cost === null || cost === undefined) return 0;
    if (typeof cost === 'number') return cost;
    return cost.total ?? 0;
}

function getCostBreakdown(cost: CostBreakdown | number | null | undefined): CostBreakdown | null {
    if (cost === null || cost === undefined) return null;
    if (typeof cost === 'number') return null; // old format, no breakdown available
    return cost;
}
```

**Step 3: Verify dev server**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Build succeeds (types are used internally, UI changes come next)

**Step 4: Commit**

```bash
git add src/components/observatory/AgentDetail.tsx
git commit -m "feat(cost): add CostBreakdown type and backward-compatible helpers to AgentDetail"
```

---

### Task 7: Update Health Tab to Show Cost Breakdown

**Files:**
- Modify: `src/components/observatory/AgentDetail.tsx` (the `HealthTab` component, around lines 232-277)

**Step 1: Replace the single "Est. Cost" cell with a cost breakdown**

Find the Monthly Totals section (around line 254-277). Replace the `Est. Cost` grid cell:

```tsx
<div>
    <div className="text-[10px] text-gray-500">Est. Cost</div>
    <div className="text-sm font-bold">${(health.estimatedCostMonth ?? 0).toFixed(4)}</div>
</div>
```

With a cost breakdown display:

```tsx
<div className="col-span-2 md:col-span-4 mt-2 pt-2 border-t border-white/5">
    <div className="text-[10px] text-gray-500 mb-2">Monthly Cost Breakdown</div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
            <div className="text-[10px] text-gray-600">Gemini Tokens</div>
            <div className="text-sm font-bold">${(getCostBreakdown(health.estimatedCostMonth)?.geminiTokens ?? getCostTotal(health.estimatedCostMonth)).toFixed(4)}</div>
        </div>
        <div>
            <div className="text-[10px] text-gray-600">Firestore Reads</div>
            <div className="text-sm font-bold">${(getCostBreakdown(health.estimatedCostMonth)?.firestoreReads ?? 0).toFixed(4)}</div>
        </div>
        <div>
            <div className="text-[10px] text-gray-600">Firestore Writes</div>
            <div className="text-sm font-bold">${(getCostBreakdown(health.estimatedCostMonth)?.firestoreWrites ?? 0).toFixed(4)}</div>
        </div>
        <div>
            <div className="text-[10px] text-gray-600">Functions Compute</div>
            <div className="text-sm font-bold">${(getCostBreakdown(health.estimatedCostMonth)?.functionsCompute ?? 0).toFixed(4)}</div>
        </div>
        <div>
            <div className="text-[10px] text-gray-600">Total</div>
            <div className="text-sm font-bold text-white">${getCostTotal(health.estimatedCostMonth).toFixed(4)}</div>
        </div>
    </div>
</div>
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/observatory/AgentDetail.tsx
git commit -m "feat(cost): display cost breakdown in agent health tab"
```

---

### Task 8: Update Run History Rows to Show Per-Run Cost

**Files:**
- Modify: `src/components/observatory/AgentDetail.tsx` (the `RunsTab` component, around lines 420-475)

**Step 1: Add cost column to run history table header**

Change the grid from `grid-cols-5` to `grid-cols-6` and add a "Cost" header:

```tsx
<div className="grid grid-cols-6 gap-4 px-4 py-2 border-b border-white/10 text-[10px] text-gray-500 uppercase tracking-wider">
    <div>Time</div>
    <div>Outcome</div>
    <div>Duration</div>
    <div>Signals</div>
    <div>Tokens</div>
    <div>Cost</div>
</div>
```

**Step 2: Add cost to each row**

In the row `div` (around line 440), also change `grid-cols-5` to `grid-cols-6` and add after the tokens column:

```tsx
<div className="text-gray-300">${(run.cost?.total ?? 0).toFixed(4)}</div>
```

**Step 3: Add model and cost breakdown to expanded detail**

In the expanded detail section (around line 456), add after the existing grid:

```tsx
{run.modelId && (
    <div>
        <span className="text-gray-500">Model:</span>{' '}
        <span className="text-gray-300">{run.modelId}</span>
    </div>
)}
{run.cost && (
    <div className="mt-2 pt-2 border-t border-white/5">
        <div className="text-[10px] text-gray-500 mb-1">Cost Breakdown</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div><span className="text-gray-500">Gemini:</span> <span className="text-gray-300">${run.cost.geminiTokens.toFixed(4)}</span></div>
            <div><span className="text-gray-500">Reads:</span> <span className="text-gray-300">${run.cost.firestoreReads.toFixed(4)}</span></div>
            <div><span className="text-gray-500">Writes:</span> <span className="text-gray-300">${run.cost.firestoreWrites.toFixed(4)}</span></div>
            <div><span className="text-gray-500">Compute:</span> <span className="text-gray-300">${run.cost.functionsCompute.toFixed(4)}</span></div>
            <div><span className="text-gray-500">Total:</span> <span className="text-white font-bold">${run.cost.total.toFixed(4)}</span></div>
        </div>
    </div>
)}
```

**Step 4: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/observatory/AgentDetail.tsx
git commit -m "feat(cost): show per-run cost and model in run history"
```

---

### Task 9: Update Observatory System Summary

**Files:**
- Modify: `src/pages/Observatory.tsx:153-160`

**Step 1: Update the `totalMonthlyCost` aggregation to handle both old and new formats**

Replace lines 157-160:

```ts
const totalMonthlyCost = Object.values(healthMap).reduce(
    (sum, h) => sum + (h.estimatedCostMonth || 0),
    0
);
```

With:

```ts
const totalMonthlyCost = Object.values(healthMap).reduce(
    (sum, h) => {
        const cost = h.estimatedCostMonth;
        if (typeof cost === 'number') return sum + cost;
        if (cost && typeof cost === 'object' && 'total' in cost) return sum + (cost as { total: number }).total;
        return sum;
    },
    0
);
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/pages/Observatory.tsx
git commit -m "feat(cost): Observatory summary handles CostBreakdown format"
```

---

### Task 10: Update Seed Script

**Files:**
- Modify: `src/scripts/seed-agents.ts:139-145`

**Step 1: Update the health baseline to use the new `CostBreakdown` format**

Replace:
```ts
estimatedCostMonth: 0,
```

With:
```ts
estimatedCostMonth: {
    geminiTokens: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    functionsCompute: 0,
    total: 0,
},
lastRunCost: null,
totalGbSecondsMonth: 0,
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat(cost): update seed script health baseline with CostBreakdown format"
```

---

### Task 11: Final Build Verification and Lint

**Step 1: Full build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build && npm run functions:build`
Expected: Both succeed

**Step 2: Lint**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run lint`
Expected: No new errors

**Step 3: Manual verification**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run dev`
Navigate to Observatory page, verify it loads without console errors. Existing health data (old `number` format) should display gracefully via the backward-compatible helpers.

**Step 4: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "chore: lint fixes for expanded cost tracking"
```
