import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { AssessmentResult } from "./assessor.js";

export async function storeValidationProposal(
  documentType: "risk" | "solution",
  documentId: string,
  documentName: string,
  assessment: AssessmentResult,
  supportingSignalIds: string[]
): Promise<void> {
  const db = getFirestore();

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

  logger.info(`Validator: stored proposal for ${documentType} ${documentId}`);
}
