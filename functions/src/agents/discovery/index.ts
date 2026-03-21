// functions/src/agents/discovery/index.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  analyzeSignals,
  type SignalInfo,
  type UnmatchedSignalInfo,
  type GraphNodeInfo,
  type PendingProposalInfo,
} from "./analyzer.js";
import { storeDiscoveryProposals } from "./store.js";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

async function runDiscoveryAgent(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  const runStartedAt = new Date();
  const db = getFirestore();

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    // Step 1: Read classified signals (last 30 days) — includes rejected for emergent pattern detection
    const signalsSnap = await db
      .collection("signals")
      .where("status", "in", ["pending", "approved", "edited", "rejected"])
      .where("fetched_at", ">", cutoff)
      .orderBy("fetched_at", "desc")
      .get();

    const signals: SignalInfo[] = signalsSnap.docs
      .filter((d) => d.data().signal_type !== "unmatched")
      .map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        signal_type: (d.data().signal_type as string) ?? "risk",
        related_node_ids: (d.data().related_node_ids as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
        review_status: (d.data().status as string) ?? "pending",
      }));

    // Step 2: Read unmatched signals (last 30 days)
    const unmatchedSnap = await db
      .collection("signals")
      .where("signal_type", "==", "unmatched")
      .where("fetched_at", ">", cutoff)
      .orderBy("fetched_at", "desc")
      .get();

    const unmatchedSignals: UnmatchedSignalInfo[] = unmatchedSnap.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? "",
      summary: (d.data().summary as string) ?? "",
      proposed_topic: (d.data().proposed_topic as string) ?? "",
      severity_hint: (d.data().severity_hint as string) ?? "Emerging",
      source_name: (d.data().source_name as string) ?? "",
      published_date: (d.data().published_date as string) ?? "",
      review_status: (d.data().status as string) ?? "pending",
    }));

    logger.info(`Discovery v2: ${signals.length} classified + ${unmatchedSignals.length} unmatched signals`);

    if (signals.length < 5 && unmatchedSignals.length < 3) {
      logger.info("Discovery v2: insufficient signals, skipping Gemini call");
      await writeAgentRunSummary({
        agentId: "discovery-agent", startedAt: runStartedAt, outcome: "empty", error: null,
        modelId: "gemini-2.5-pro", memoryMiB: 512,
        metrics: { articlesFetched: signals.length + unmatchedSignals.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 2, firestoreWrites: 0 },
        sourcesUsed: [],
      });
      return { success: true, message: `Insufficient signals (${signals.length} classified, ${unmatchedSignals.length} unmatched)` };
    }

    // Step 3: Read graph (nodes + edges) and pending proposals
    const [nodesSnap, edgesSnap, pendingSnap] = await Promise.all([
      db.collection("nodes").get(),
      db.collection("edges").get(),
      db.collection("graph_proposals").where("status", "==", "pending").get(),
    ]);

    const nodes: GraphNodeInfo[] = nodesSnap.docs.map((d) => ({
      id: d.id,
      type: (d.data().type as string) ?? "",
      name: (d.data().name as string) ?? "",
      summary: ((d.data().summary as string) ?? "").slice(0, 200),
    }));

    const edges = edgesSnap.docs.map((d) => ({
      from_node: (d.data().from_node as string) ?? "",
      to_node: (d.data().to_node as string) ?? "",
      relationship: (d.data().relationship as string) ?? "",
    }));

    const pendingProposals: PendingProposalInfo[] = pendingSnap.docs.map((d) => {
      const data = d.data();
      if (data.proposal_type === "new_node") {
        return {
          name: (data.node_data?.name as string) ?? "",
          type: `new_node:${(data.node_data?.type as string) ?? ""}`,
          description: (data.node_data?.description as string) ?? "",
        };
      }
      return {
        name: `${data.edge_data?.from_node ?? ""}->${data.edge_data?.to_node ?? ""}`,
        type: "new_edge",
        description: (data.edge_data?.reasoning as string) ?? "",
      };
    });

    // Step 4: Analyze with Gemini 2.5 Pro
    const { proposals, tokenUsage } = await analyzeSignals(
      signals, unmatchedSignals, nodes, edges, pendingProposals, apiKey,
    );

    // Step 5: Store proposals (pass existing node names for fuzzy dedup)
    const existingNodeNames = nodes.map((n) => n.name);
    const stored = await storeDiscoveryProposals(proposals, existingNodeNames);

    await writeAgentRunSummary({
      agentId: "discovery-agent", startedAt: runStartedAt,
      outcome: stored > 0 ? "success" : "empty", error: null,
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: {
        articlesFetched: signals.length + unmatchedSignals.length, signalsStored: stored,
        geminiCalls: 1, tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output,
        firestoreReads: 4, firestoreWrites: stored,
      },
      sourcesUsed: [],
    });

    return { success: true, message: `${stored} proposals from ${signals.length + unmatchedSignals.length} signals` };
  } catch (err) {
    logger.error("Discovery Agent v2 failed:", err);
    await writeAgentRunSummary({
      agentId: "discovery-agent", startedAt: runStartedAt, outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      modelId: "gemini-2.5-pro", memoryMiB: 512,
      metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
      sourcesUsed: [],
    });
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
}

export const scheduledDiscovery = onSchedule(
  {
    schedule: "0 10 * * 0", // Weekly, Sunday 10:00 UTC
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("discovery-agent").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Discovery Agent is paused, skipping scheduled run");
      return;
    }
    logger.info("Discovery Agent v2: starting weekly run");
    await runDiscoveryAgent(geminiApiKey.value());
  }
);

export const triggerDiscovery = onCall(
  { memory: "512MiB", timeoutSeconds: 300, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    logger.info(`Discovery Agent v2: manual trigger by ${request.auth.uid}`);
    return await runDiscoveryAgent(geminiApiKey.value());
  }
);
