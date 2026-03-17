// functions/src/agents/validator/store.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { AssessmentResult } from "./assessor.js";

/** Cache of node IDs that already have pending update proposals (populated once per run) */
let pendingNodeIds: Set<string> | null = null;

async function getPendingNodeIds(): Promise<Set<string>> {
  if (pendingNodeIds) return pendingNodeIds;

  const db = getFirestore();
  const snap = await db.collection("graph_proposals")
    .where("status", "==", "pending")
    .where("proposal_type", "==", "update_node")
    .get();

  pendingNodeIds = new Set(
    snap.docs.map((d) => (d.data().update_data?.node_id as string) ?? "")
  );
  logger.info(`Validator: ${pendingNodeIds.size} existing pending update proposals found`);
  return pendingNodeIds;
}

export function resetPendingCache(): void {
  pendingNodeIds = null;
}

export async function storeValidationProposal(
  nodeId: string,
  nodeName: string,
  nodeType: string,
  assessment: AssessmentResult,
  supportingSignalIds: string[],
): Promise<boolean> {
  const db = getFirestore();

  const pending = await getPendingNodeIds();
  if (pending.has(nodeId)) {
    logger.info(`Validator: skipping ${nodeType} ${nodeId} — pending proposal already exists`);
    return false;
  }

  await db.collection("graph_proposals").add({
    proposal_type: "update_node",
    update_data: {
      node_id: nodeId,
      node_name: nodeName,
      node_type: nodeType,
      proposed_changes: assessment.proposed_changes,
      overall_reasoning: assessment.overall_reasoning,
    },
    supporting_signal_ids: supportingSignalIds,
    confidence: assessment.confidence,
    created_by: "validator-agent",
    status: "pending",
    created_at: FieldValue.serverTimestamp(),
  });

  pending.add(nodeId);
  logger.info(`Validator: stored update proposal for ${nodeType} ${nodeId}`);
  return true;
}
