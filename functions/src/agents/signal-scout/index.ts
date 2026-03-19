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
    const { articles, sourceHealth } = await fetchAllSources(enabledSourceIds);
    logger.info(`Fetched ${articles.length} unique articles`);

    if (articles.length === 0) {
      await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-flash", memoryMiB: 512,
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 1, firestoreWrites: 3 },
        sourcesUsed: enabledSourcesList,
        sourceHealth,
      });
      return { success: true, message: "No articles fetched" };
    }

    // Step 2: Stage 1 — Cheap filter
    const existingSnap = await db.collection("signals").select("source_url").get();
    const existingUrls = new Set(existingSnap.docs.map((d) => d.data().source_url as string));
    const filterTerms = await loadFilterTerms();
    const { articles: filteredArticles } = filterArticles(
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
        sourceHealth,
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
        sourceHealth,
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
      sourceHealth,
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
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("signal-scout").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Signal Scout is paused, skipping scheduled run");
      return;
    }
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
