import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { AssessmentResult } from "./assessor.js";

/** Set of document IDs that already have a pending validation proposal (populated once per run) */
let pendingDocIds: Set<string> | null = null;

/** Load pending validation proposal document IDs (cached for the run) */
async function getPendingDocIds(): Promise<Set<string>> {
  if (pendingDocIds) return pendingDocIds;

  const db = getFirestore();
  const snap = await db.collection("validation_proposals")
    .where("status", "==", "pending")
    .get();

  pendingDocIds = new Set(snap.docs.map((d) => d.data().document_id as string));
  logger.info(`Validator: ${pendingDocIds.size} existing pending proposals found`);
  return pendingDocIds;
}

/** Reset the cache (call at start of each agent run) */
export function resetPendingCache(): void {
  pendingDocIds = null;
}

export async function storeValidationProposal(
  documentType: "risk" | "solution",
  documentId: string,
  documentName: string,
  assessment: AssessmentResult,
  supportingSignalIds: string[]
): Promise<boolean> {
  const db = getFirestore();

  // Check for existing pending proposal targeting the same document
  const pending = await getPendingDocIds();
  if (pending.has(documentId)) {
    logger.info(`Validator: skipping ${documentType} ${documentId} — pending proposal already exists`);
    return false;
  }

  await db.collection("validation_proposals").add({
    document_type: documentType,
    document_id: documentId,
    document_name: documentName,
    proposed_changes: assessment.proposed_changes,
    overall_reasoning: assessment.overall_reasoning,
    confidence: assessment.confidence,
    supporting_signal_ids: supportingSignalIds,
    status: "pending",
    created_at: FieldValue.serverTimestamp(),
    created_by: "validator-agent",
  });

  // Track the newly stored ID so subsequent calls in the same run are also deduped
  pending.add(documentId);
  logger.info(`Validator: stored proposal for ${documentType} ${documentId}`);
  return true;
}
