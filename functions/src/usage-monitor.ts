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
