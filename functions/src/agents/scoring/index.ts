// functions/src/agents/scoring/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const BATCH_SIZE = 5;

async function dispatchScoringBatches(): Promise<{
  nodeCount: number;
  batchCount: number;
}> {
  const db = getFirestore();

  const nodesSnap = await db.collection("nodes")
    .where("type", "in", ["risk", "solution"])
    .get();

  const nodeIds = nodesSnap.docs.map((d) => d.id);
  const batches: string[][] = [];

  for (let i = 0; i < nodeIds.length; i += BATCH_SIZE) {
    batches.push(nodeIds.slice(i, i + BATCH_SIZE));
  }

  // Fan out to batch workers via Cloud Tasks
  const queue = getFunctions().taskQueue("scoringBatchWorker");
  for (const batch of batches) {
    await queue.enqueue({ nodeIds: batch });
  }

  logger.info(
    `Scoring coordinator dispatched ${batches.length} batches for ${nodeIds.length} nodes`
  );

  return { nodeCount: nodeIds.length, batchCount: batches.length };
}

/**
 * Monthly scoring coordinator. Loads all risk/solution nodes,
 * splits into batches of 5, and dispatches each batch to a
 * separate Cloud Function invocation to avoid timeout.
 */
export const scheduledScoring = onSchedule(
  {
    schedule: "0 9 1 * *", // 1st of month, 09:00 UTC
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const runStartedAt = new Date();
    const db = getFirestore();
    const configSnap = await db
      .collection("agents")
      .doc("scoring-agent")
      .collection("config")
      .doc("current")
      .get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Scoring Agent is paused, skipping scheduled run");
      return;
    }

    logger.info("Scoring Agent: starting monthly run");

    try {
      const { nodeCount, batchCount } = await dispatchScoringBatches();

      await writeAgentRunSummary({
        agentId: "scoring-agent",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        modelId: "gemini-2.5-pro",
        memoryMiB: 256,
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 1,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });

      logger.info(
        `Scoring Agent: dispatched ${batchCount} batches for ${nodeCount} nodes`
      );
    } catch (err) {
      logger.error("Scoring Agent coordinator failed:", err);
      await writeAgentRunSummary({
        agentId: "scoring-agent",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        modelId: "gemini-2.5-pro",
        memoryMiB: 256,
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);

// Manual trigger
export const triggerScoring = onCall(
  { memory: "256MiB", timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Scoring Agent: manual trigger by ${request.auth.uid}`);
    const { nodeCount, batchCount } = await dispatchScoringBatches();
    return {
      success: true,
      message: `Dispatched ${batchCount} batches for ${nodeCount} nodes`,
    };
  }
);
