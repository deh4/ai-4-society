// functions/src/agents/scoring/batch-worker.ts
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { assessNode, type SignalInfo } from "./assessor.js";
import { storeValidationProposal } from "./store.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Processes a batch of up to 5 nodes for scoring.
 * Each node gets its own Gemini assessment.
 */
export const scoringBatchWorker = onTaskDispatched(
  {
    memory: "512MiB",
    timeoutSeconds: 300,
    secrets: [geminiApiKey],
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 3 },
  },
  async (req) => {
    const { nodeIds } = req.data as { nodeIds: string[] };
    const db = getFirestore();
    const apiKey = geminiApiKey.value();

    // Load signals from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const signalsSnap = await db
      .collection("signals")
      .where("status", "in", ["pending", "approved", "edited"])
      .where("fetched_at", ">", thirtyDaysAgo)
      .get();

    const allSignals: (SignalInfo & { related_node_ids: string[] })[] =
      signalsSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
        signal_type: (d.data().signal_type as string) ?? "risk",
        related_node_ids: (d.data().related_node_ids as string[]) ?? [],
      }));

    logger.info(
      `Scoring batch worker: processing ${nodeIds.length} nodes with ${allSignals.length} signals`
    );

    for (const nodeId of nodeIds) {
      const nodeDoc = await db.collection("nodes").doc(nodeId).get();
      if (!nodeDoc.exists) {
        logger.warn(`Scoring batch worker: node ${nodeId} not found, skipping`);
        continue;
      }

      const nodeData = nodeDoc.data()!;
      const nodeType = (nodeData.type as string) ?? "";
      const nodeName = (nodeData.name as string) ?? nodeId;

      // Find signals related to this node via related_node_ids
      const relevantSignals = allSignals.filter((s) =>
        s.related_node_ids.includes(nodeId)
      );

      const { result, tokenUsage } = await assessNode(
        nodeId,
        nodeType,
        nodeData as Record<string, unknown>,
        relevantSignals,
        apiKey
      );

      logger.info(
        `Scoring batch worker: assessed ${nodeType} ${nodeId} — ` +
          `tokens in=${tokenUsage.input} out=${tokenUsage.output}`
      );

      if (result) {
        await storeValidationProposal(
          nodeId,
          nodeName,
          nodeType, // Fixed: was empty string in validator
          result,
          relevantSignals.map((s) => s.id)
        );
      }
    }
  }
);
