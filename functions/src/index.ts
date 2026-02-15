import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { fetchAllSources } from "./signal-scout/fetcher.js";
import { classifyArticles } from "./signal-scout/classifier.js";
import { storeSignals } from "./signal-scout/store.js";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

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
      return;
    }

    // Step 2: Classify with Gemini
    const signals = await classifyArticles(articles, geminiApiKey.value());
    logger.info(`Classified ${signals.length} relevant signals`);

    if (signals.length === 0) {
      logger.info("No relevant signals found. Ending run.");
      return;
    }

    // Step 3: Store in Firestore
    const stored = await storeSignals(signals);
    logger.info(`Pipeline complete. Stored ${stored} new signals.`);
  }
);
