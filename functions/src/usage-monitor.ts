import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Firebase free tier limits (Blaze plan still gets these for free)
const FREE_TIER = {
  firestoreReadsPerDay: 50_000,
  firestoreWritesPerDay: 20_000,
  functionInvocationsPerMonth: 2_000_000,
  functionGbSecondsPerMonth: 400_000,
  secretAccessPerMonth: 10_000,
  firestoreStorageGb: 1,
};

export interface RunStats {
  articlesFetched: number;
  geminiCalls: number;
  signalsStored: number;
  firestoreReads: number; // approximate
  firestoreWrites: number; // approximate
}

export interface CumulativeUsage {
  dailyReads: number;
  dailyWrites: number;
  monthlyGbSeconds: number;
}

/**
 * Log a pipeline run's usage to Firestore and warn if approaching free tier limits.
 */
export async function trackUsage(stats: RunStats): Promise<CumulativeUsage> {
  const db = getFirestore();
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthKey = now.toISOString().slice(0, 7); // YYYY-MM

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

// ─── Pipeline Health Tracking ───────────────────────────────────────────────

export type PipelineOutcome = "success" | "partial" | "empty" | "error";

interface PipelineRunInfo {
  articlesFetched: number;
  signalsStored: number;
}

/**
 * Update the _pipeline_health/status doc after each pipeline run.
 * Tracks consecutive failures/empty runs and records when signals were last stored.
 */
export async function updatePipelineHealth(
  outcome: PipelineOutcome,
  info: PipelineRunInfo
): Promise<void> {
  const db = getFirestore();
  const healthRef = db.collection("_pipeline_health").doc("status");
  const healthSnap = await healthRef.get();
  const prev = healthSnap.data() ?? {};

  const consecutiveEmptyRuns =
    outcome === "empty"
      ? ((prev.consecutiveEmptyRuns as number) ?? 0) + 1
      : 0;

  const consecutiveErrors =
    outcome === "error"
      ? ((prev.consecutiveErrors as number) ?? 0) + 1
      : 0;

  const totalSignals =
    ((prev.totalSignals as number) ?? 0) + info.signalsStored;

  const update: Record<string, unknown> = {
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunOutcome: outcome,
    consecutiveEmptyRuns,
    consecutiveErrors,
    totalSignals,
    articlesFetched: info.articlesFetched,
    signalsStored: info.signalsStored,
  };

  if (info.signalsStored > 0) {
    update.lastNewSignalAt = FieldValue.serverTimestamp();
  }

  await healthRef.set(update, { merge: true });
  logger.info(`Pipeline health updated: ${outcome}, ${info.signalsStored} stored`);
}

// ─── Agent Run Summaries ────────────────────────────────────────────────────

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

// Free tier daily/monthly allowances
const FREE_TIER_DAILY = {
  firestoreReads: 50_000,
  firestoreWrites: 20_000,
};

const FREE_TIER_MONTHLY = {
  functionGbSeconds: 400_000,
};

export interface CostBreakdown {
  geminiTokens: number;
  firestoreReads: number;
  firestoreWrites: number;
  functionsCompute: number;
  total: number;
}

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
