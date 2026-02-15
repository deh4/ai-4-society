import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fetchAllSources } from "./signal-scout/fetcher.js";
import { classifyArticles } from "./signal-scout/classifier.js";
import { storeSignals } from "./signal-scout/store.js";
import { trackUsage } from "./usage-monitor.js";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const BATCH_SIZE = 10; // matches classifier batch size

export const signalScout = onSchedule(
  {
    schedule: "every 6 hours",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Signal Scout: starting pipeline run");

    // Step 1: Fetch articles from all sources
    const articles = await fetchAllSources();
    logger.info(`Fetched ${articles.length} unique articles`);

    if (articles.length === 0) {
      logger.info("No articles found. Ending run.");
      await trackUsage({
        articlesFetched: 0,
        geminiCalls: 0,
        signalsStored: 0,
        firestoreReads: 1, // dedup check
        firestoreWrites: 3, // usage tracking writes
      });
      return;
    }

    // Step 2: Classify with Gemini
    const signals = await classifyArticles(articles, geminiApiKey.value());
    const geminiCalls = Math.ceil(articles.length / BATCH_SIZE);
    logger.info(`Classified ${signals.length} relevant signals`);

    if (signals.length === 0) {
      logger.info("No relevant signals found. Ending run.");
      await trackUsage({
        articlesFetched: articles.length,
        geminiCalls,
        signalsStored: 0,
        firestoreReads: 1,
        firestoreWrites: 3,
      });
      return;
    }

    // Step 3: Store in Firestore
    const stored = await storeSignals(signals);
    logger.info(`Pipeline complete. Stored ${stored} new signals.`);

    // Step 4: Track usage
    await trackUsage({
      articlesFetched: articles.length,
      geminiCalls,
      signalsStored: stored,
      firestoreReads: 1 + signals.length, // dedup query + existing URL check
      firestoreWrites: stored + 3, // signal writes + usage tracking
    });
  }
);

/**
 * Simple HTTP endpoint to check current usage stats.
 * GET https://<region>-ai-4-society.cloudfunctions.net/usageReport
 */
export const usageReport = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (_req, res) => {
    const db = getFirestore();
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);

    const [dailySnap, monthlySnap, signalsSnap] = await Promise.all([
      db.collection("_usage").doc(`daily-${dateKey}`).get(),
      db.collection("_usage").doc(`monthly-${monthKey}`).get(),
      db.collection("signals").count().get(),
    ]);

    const daily = dailySnap.exists ? dailySnap.data() : null;
    const monthly = monthlySnap.exists ? monthlySnap.data() : null;
    const totalSignals = signalsSnap.data().count;

    const FREE_TIER = {
      firestoreReadsPerDay: 50_000,
      firestoreWritesPerDay: 20_000,
      functionInvocationsPerMonth: 2_000_000,
    };

    res.json({
      status: "ok",
      today: dateKey,
      month: monthKey,
      totalSignalsInCollection: totalSignals,
      daily: daily
        ? {
            runs: daily.runs,
            firestoreReads: daily.firestoreReads,
            firestoreWrites: daily.firestoreWrites,
            readsPctOfFreeTier: `${Math.round(((daily.firestoreReads as number) / FREE_TIER.firestoreReadsPerDay) * 100)}%`,
            writesPctOfFreeTier: `${Math.round(((daily.firestoreWrites as number) / FREE_TIER.firestoreWritesPerDay) * 100)}%`,
          }
        : "No runs today",
      monthly: monthly
        ? {
            totalRuns: monthly.totalRuns,
            totalGeminiCalls: monthly.totalGeminiCalls,
            totalSignalsStored: monthly.totalSignalsStored,
            totalFirestoreReads: monthly.totalFirestoreReads,
            totalFirestoreWrites: monthly.totalFirestoreWrites,
            runsPctOfFreeTier: `${Math.round(((monthly.totalRuns as number) / FREE_TIER.functionInvocationsPerMonth) * 100)}%`,
          }
        : "No runs this month",
    });
  }
);
