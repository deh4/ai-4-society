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

/**
 * Log a pipeline run's usage to Firestore and warn if approaching free tier limits.
 */
export async function trackUsage(stats: RunStats): Promise<void> {
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

// Gemini 2.0 Flash pricing (per 1M tokens)
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
  const duration = now.getTime() - data.startedAt.getTime();

  // Write run summary doc
  await db.collection("agents").doc(data.agentId).collection("runs").add({
    startedAt: data.startedAt,
    completedAt: FieldValue.serverTimestamp(),
    duration,
    outcome: data.outcome,
    error: data.error,
    metrics: data.metrics,
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
    estimatedCostMonth: Math.round(estimatedCostMonth * 10000) / 10000,
    lastRunArticlesFetched: data.metrics.articlesFetched,
    lastRunSignalsStored: data.metrics.signalsStored,
    totalSignalsLifetime,
  });

  logger.info(`Agent run summary written for ${data.agentId}: ${data.outcome}, ${duration}ms`);
}
