// functions/src/agents/validator/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { assessNode, type SignalInfo } from "./assessor.js";
import { storeValidationProposal, resetPendingCache } from "./store.js";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

async function runValidatorAgent(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  const runStartedAt = new Date();
  const db = getFirestore();
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let geminiCalls = 0;
  let proposalsStored = 0;

  resetPendingCache();

  try {
    // Step 1: Read all risk and solution nodes
    const nodesSnap = await db.collection("nodes")
      .where("type", "in", ["risk", "solution"])
      .get();

    // Step 2: Read signals from last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const signalsSnap = await db.collection("signals")
      .where("status", "in", ["pending", "approved", "edited"])
      .where("fetched_at", ">", cutoff)
      .get();

    const allSignals: (SignalInfo & { related_node_ids: string[] })[] = signalsSnap.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? "",
      summary: (d.data().summary as string) ?? "",
      severity_hint: (d.data().severity_hint as string) ?? "Emerging",
      source_name: (d.data().source_name as string) ?? "",
      published_date: (d.data().published_date as string) ?? "",
      signal_type: (d.data().signal_type as string) ?? "risk",
      related_node_ids: (d.data().related_node_ids as string[]) ?? [],
    }));

    logger.info(`Validator v2: ${nodesSnap.size} nodes, ${allSignals.length} signals`);

    // Step 3: Assess each risk/solution node
    for (const nodeDoc of nodesSnap.docs) {
      const nodeId = nodeDoc.id;
      const nodeType = (nodeDoc.data().type as string) ?? "";
      const nodeName = (nodeDoc.data().name as string) ?? nodeId;

      // Find signals related to this node via related_node_ids
      const relevantSignals = allSignals.filter(
        (s) => s.related_node_ids.includes(nodeId)
      );

      const { result, tokenUsage } = await assessNode(
        nodeId, nodeType, nodeDoc.data() as Record<string, unknown>,
        relevantSignals, apiKey,
      );

      totalTokensInput += tokenUsage.input;
      totalTokensOutput += tokenUsage.output;
      geminiCalls++;

      if (result) {
        await storeValidationProposal(
          nodeId, nodeName, nodeType, result,
          relevantSignals.map((s) => s.id),
        );
        proposalsStored++;
      }
    }

    await writeAgentRunSummary({
      agentId: "validator-agent", startedAt: runStartedAt, outcome: "success", error: null,
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: {
        articlesFetched: allSignals.length, signalsStored: proposalsStored, geminiCalls,
        tokensInput: totalTokensInput, tokensOutput: totalTokensOutput,
        firestoreReads: 2, firestoreWrites: proposalsStored,
      },
      sourcesUsed: [],
    });

    return { success: true, message: `${proposalsStored} proposals from ${geminiCalls} assessments` };
  } catch (err) {
    logger.error("Validator Agent v2 failed:", err);
    await writeAgentRunSummary({
      agentId: "validator-agent", startedAt: runStartedAt, outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, firestoreReads: 0, firestoreWrites: 0 },
      sourcesUsed: [],
    });
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

export const scheduledValidator = onSchedule(
  {
    schedule: "0 9 * * 1", // Weekly, Monday 09:00 UTC
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("validator-agent").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Validator Agent is paused, skipping scheduled run");
      return;
    }
    logger.info("Validator Agent v2: starting weekly run");
    await runValidatorAgent(geminiApiKey.value());
  }
);

export const triggerValidator = onCall(
  { memory: "512MiB", timeoutSeconds: 540, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Validator Agent v2: manual trigger by ${request.auth.uid}`);
    return await runValidatorAgent(geminiApiKey.value());
  }
);
