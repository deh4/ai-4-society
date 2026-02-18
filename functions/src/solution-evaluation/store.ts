import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { SolutionEvaluation, EvalSolutionInput } from "./evaluator.js";

export interface SolutionUpdateInput {
  solution: EvalSolutionInput;
  evaluation: SolutionEvaluation;
  topicIds: string[];
  riskUpdateIds: string[];
  signalCount: number;
}

export async function storeSolutionUpdates(
  updates: SolutionUpdateInput[],
  runId: string
): Promise<number> {
  if (updates.length === 0) {
    logger.info("No solution updates to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const update of updates) {
    const ref = db.collection("solution_updates").doc();
    const scoreDelta = Math.abs(
      update.evaluation.adoption_score_2026 - update.solution.adoption_score_2026
    );
    const stageChanged =
      update.evaluation.implementation_stage !== update.solution.implementation_stage;

    batch.set(ref, {
      solutionId: update.solution.id,
      solutionTitle: update.solution.solution_title,
      parentRiskId: update.solution.parent_risk_id,
      status: "pending",
      proposedChanges: {
        adoption_score_2026: update.evaluation.adoption_score_2026,
        adoption_score_2035: update.evaluation.adoption_score_2035,
        implementation_stage: update.evaluation.implementation_stage,
        timeline_narrative: update.evaluation.timeline_narrative,
      },
      newKeyPlayers: update.evaluation.newKeyPlayers,
      newBarriers: update.evaluation.newBarriers,
      currentValues: {
        adoption_score_2026: update.solution.adoption_score_2026,
        adoption_score_2035: update.solution.adoption_score_2035,
        implementation_stage: update.solution.implementation_stage,
        key_players: update.solution.key_players,
        barriers: update.solution.barriers,
        timeline_narrative: update.solution.timeline_narrative,
      },
      reasoning: update.evaluation.reasoning,
      confidence: update.evaluation.confidence,
      topicIds: update.topicIds,
      signalCount: update.signalCount,
      riskUpdateIds: update.riskUpdateIds,
      scoreDelta,
      stageChanged,
      requiresEscalation: scoreDelta >= 10 || stageChanged,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "solution-evaluation",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${updates.length} solution updates.`);
  return updates.length;
}
