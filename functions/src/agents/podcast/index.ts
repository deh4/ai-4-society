// functions/src/agents/podcast/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { writeAgentRunSummary } from "../../usage-monitor.js";

/**
 * Podcast Agent (placeholder)
 *
 * When implemented, this agent will:
 * 1. Gather the last 7 days of approved risk/solution signals
 * 2. Generate a weekly audio briefing script via Gemini
 * 3. Convert to audio via TTS
 * 4. Store the episode for review before publishing
 */

async function runPodcastAgent(): Promise<{ success: boolean; message: string }> {
  const runStartedAt = new Date();
  const db = getFirestore();

  try {
    // Write health doc so the admin panel can display this agent
    await db
      .collection("agents")
      .doc("podcast")
      .collection("health")
      .doc("latest")
      .set(
        {
          lastRunAt: FieldValue.serverTimestamp(),
          lastRunOutcome: "empty",
          lastError: null,
          consecutiveErrors: 0,
          consecutiveEmptyRuns: 0,
          lastRunTokens: { input: 0, output: 0 },
          lastRunCost: { geminiTokens: 0, firestoreReads: 0, firestoreWrites: 0, functionsCompute: 0, total: 0 },
          totalTokensToday: { input: 0, output: 0 },
          totalTokensMonth: { input: 0, output: 0 },
          estimatedCostMonth: { geminiTokens: 0, firestoreReads: 0, firestoreWrites: 0, functionsCompute: 0, total: 0 },
          lastRunArticlesFetched: 0,
          lastRunSignalsStored: 0,
          totalSignalsLifetime: 0,
        },
        { merge: true },
      );

    logger.info("Podcast Agent: placeholder — not yet implemented");

    await writeAgentRunSummary({
      agentId: "podcast",
      startedAt: runStartedAt,
      outcome: "empty",
      error: null,
      modelId: "none",
      memoryMiB: 256,
      metrics: {
        articlesFetched: 0,
        signalsStored: 0,
        geminiCalls: 0,
        tokensInput: 0,
        tokensOutput: 0,
        firestoreReads: 0,
        firestoreWrites: 1,
      },
      sourcesUsed: [],
    });

    return { success: true, message: "Podcast Agent is a placeholder — not yet implemented" };
  } catch (err) {
    logger.error("Podcast Agent failed:", err);
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

export const scheduledPodcast = onSchedule(
  {
    schedule: "0 12 * * 5", // Weekly, Friday 12:00 UTC
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("podcast").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Podcast Agent is paused, skipping scheduled run");
      return;
    }
    await runPodcastAgent();
  },
);

export const triggerPodcast = onCall(
  { memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Podcast Agent: manual trigger by ${request.auth.uid}`);
    return await runPodcastAgent();
  },
);
