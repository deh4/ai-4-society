# Expanded Cost Tracking Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The cost tracking system has two issues:

1. **Wrong pricing constants** — A single `GEMINI_FLASH_PRICING` ($0.10/$0.40 per 1M tokens) is applied to all agents, but Signal Scout uses `gemini-2.5-flash` ($0.30/$2.50) while Discovery and Validator use `gemini-2.5-pro` ($1.25/$10.00). Costs are significantly understated.

2. **Incomplete cost tracking** — Only Gemini API token costs are estimated. Firestore read/write costs and Cloud Functions compute costs are not tracked, despite usage data already being captured.

## Design

### 1. Model Pricing Map

Replace the single `GEMINI_FLASH_PRICING` constant with a `MODEL_PRICING` map:

```ts
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gemini-2.5-flash": { inputPerMillion: 0.30, outputPerMillion: 2.50 },
  "gemini-2.5-pro":   { inputPerMillion: 1.25, outputPerMillion: 10.00 },
};
```

Add `modelId` to `AgentRunData` so each agent declares which model it used.

### 2. Firebase Cost Constants

```ts
const FIRESTORE_PRICING = {
  readPer100K: 0.036,   // $0.036 per 100K reads
  writePer100K: 0.108,  // $0.108 per 100K writes
};

const FUNCTIONS_PRICING = {
  gbSecondRate: 0.0000025,  // $0.0000025 per GB-second
};
```

### 3. Cost Breakdown Structure

Per-run and monthly costs stored as an object:

```ts
interface CostBreakdown {
  geminiTokens: number;
  firestoreReads: number;
  firestoreWrites: number;
  functionsCompute: number;
  total: number;
}
```

### 4. Free Tier Offset

Costs are calculated after subtracting Firebase free tier allowances:

- **Firestore:** 50K reads + 20K writes per day (tracked in `_usage/daily-*`)
- **Cloud Functions:** 400K GB-seconds per month (tracked in `_usage/monthly-*`)
- **Gemini API:** No free tier (always billed)

`trackUsage` returns cumulative daily/monthly totals so `writeAgentRunSummary` can apply the offset without extra Firestore reads.

### 5. AgentRunData Changes

```ts
export interface AgentRunData {
  agentId: string;
  modelId: string;      // NEW: e.g. "gemini-2.5-flash"
  memoryMiB: number;    // NEW: function memory allocation
  startedAt: Date;
  outcome: PipelineOutcome;
  error: string | null;
  metrics: { ... };     // unchanged
  sourcesUsed: string[];
}
```

### 6. Health Doc Changes

`estimatedCostMonth` changes from `number` to `CostBreakdown`. Each run doc also stores a `cost: CostBreakdown` field.

### 7. Frontend Changes

- **Observatory.tsx:** Aggregate `estimatedCostMonth.total` across agents (backward compatible).
- **AgentDetail.tsx Health tab:** Show cost breakdown (Gemini, Firestore, Functions, Total) instead of single number.
- **AgentDetail.tsx Run History:** Show per-run cost total in expandable rows.

## Files Changed

| File | Change |
|---|---|
| `functions/src/usage-monitor.ts` | New pricing maps, cost breakdown calculation, free tier offset, updated interfaces |
| `functions/src/index.ts` | Pass `modelId` and `memoryMiB` to all `writeAgentRunSummary` calls |
| `src/components/observatory/AgentDetail.tsx` | Display cost breakdown in Health tab and run rows |
| `src/pages/Observatory.tsx` | Handle `estimatedCostMonth` as object with `.total` |

## Pricing Sources

- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Firebase Pricing](https://firebase.google.com/pricing)
