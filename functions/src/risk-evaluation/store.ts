import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { RiskEvaluation } from "./evaluator.js";
import type { EvalRiskInput } from "./evaluator.js";

export interface RiskUpdateInput {
  risk: EvalRiskInput;
  evaluation: RiskEvaluation;
  topicIds: string[];
  signalCount: number;
}

export async function storeRiskUpdates(
  updates: RiskUpdateInput[],
  runId: string
): Promise<number> {
  if (updates.length === 0) {
    logger.info("No risk updates to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const update of updates) {
    const ref = db.collection("risk_updates").doc();
    const scoreDelta = Math.abs(update.evaluation.score_2026 - update.risk.score_2026);

    batch.set(ref, {
      riskId: update.risk.id,
      riskName: update.risk.risk_name,
      status: "pending",
      proposedChanges: {
        score_2026: update.evaluation.score_2026,
        score_2035: update.evaluation.score_2035,
        velocity: update.evaluation.velocity,
        expert_severity: update.evaluation.expert_severity,
        public_perception: update.evaluation.public_perception,
      },
      newSignalEvidence: update.evaluation.newSignalEvidence,
      currentValues: {
        score_2026: update.risk.score_2026,
        score_2035: update.risk.score_2035,
        velocity: update.risk.velocity,
        expert_severity: update.risk.expert_severity,
        public_perception: update.risk.public_perception,
      },
      reasoning: update.evaluation.reasoning,
      confidence: update.evaluation.confidence,
      topicIds: update.topicIds,
      signalCount: update.signalCount,
      scoreDelta,
      requiresEscalation: scoreDelta >= 5,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "risk-evaluation",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${updates.length} risk updates.`);
  return updates.length;
}
