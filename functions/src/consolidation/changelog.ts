import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ChangelogChange, ChangelogStats } from "./types.js";

const RISK_DIFF_FIELDS = ["score_2026", "score_2035", "velocity", "expert_severity", "public_perception"];
const SOLUTION_DIFF_FIELDS = ["adoption_score_2026", "adoption_score_2035", "implementation_stage", "timeline_narrative"];

function extractChanges(
  currentValues: Record<string, unknown>,
  proposedChanges: Record<string, unknown>,
  fields: string[]
): ChangelogChange[] {
  const changes: ChangelogChange[] = [];
  for (const field of fields) {
    const oldVal = currentValues[field];
    const newVal = proposedChanges[field];
    if (oldVal === undefined || newVal === undefined) continue;
    // Deep compare for objects (timeline_narrative)
    if (typeof oldVal === "object" && typeof newVal === "object") {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    } else if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

export async function processChangelogs(): Promise<ChangelogStats> {
  const db = getFirestore();
  const stats: ChangelogStats = { riskChangelogsWritten: 0, solutionChangelogsWritten: 0, skippedNoChanges: 0 };

  // Read approved-but-unconsolidated risk updates
  const riskUpdatesSnap = await db.collection("risk_updates")
    .where("status", "==", "approved")
    .where("consolidated", "!=", true)
    .get();

  // Read approved-but-unconsolidated solution updates
  const solutionUpdatesSnap = await db.collection("solution_updates")
    .where("status", "==", "approved")
    .where("consolidated", "!=", true)
    .get();

  logger.info(`Found ${riskUpdatesSnap.size} risk updates and ${solutionUpdatesSnap.size} solution updates to consolidate`);

  // Process risk updates
  for (const updateDoc of riskUpdatesSnap.docs) {
    const data = updateDoc.data();
    const currentValues = (data.currentValues ?? {}) as Record<string, unknown>;
    const proposedChanges = (data.proposedChanges ?? {}) as Record<string, unknown>;
    const changes = extractChanges(currentValues, proposedChanges, RISK_DIFF_FIELDS);

    if (changes.length === 0) {
      stats.skippedNoChanges++;
      await updateDoc.ref.update({ consolidated: true });
      continue;
    }

    // Read current version from risk doc
    const riskRef = db.collection("risks").doc(data.riskId as string);
    const riskSnap = await riskRef.get();
    const currentVersion = (riskSnap.exists ? (riskSnap.data()?.version as number) : 0) || 0;
    const newVersion = currentVersion + 1;

    // Atomic batch: changelog + version bump + mark consolidated
    const batch = db.batch();

    const changelogRef = db.collection("changelogs").doc();
    batch.set(changelogRef, {
      documentType: "risk",
      documentId: data.riskId,
      version: newVersion,
      changes,
      updateId: updateDoc.id,
      reviewedBy: data.reviewedBy ?? "unknown",
      reviewedAt: data.reviewedAt ?? null,
      createdBy: data.createdBy ?? "risk-evaluation",
      reasoning: data.reasoning ?? "",
      confidence: data.confidence ?? 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(riskRef, {
      version: newVersion,
      "metadata.lastUpdated": FieldValue.serverTimestamp(),
      "metadata.lastUpdatedBy": "consolidation",
      "metadata.lastChangelogId": changelogRef.id,
    });

    batch.update(updateDoc.ref, { consolidated: true });

    await batch.commit();
    stats.riskChangelogsWritten++;
    logger.info(`Changelog v${newVersion} for risk ${data.riskId}: ${changes.length} field(s) changed`);
  }

  // Process solution updates
  for (const updateDoc of solutionUpdatesSnap.docs) {
    const data = updateDoc.data();
    const currentValues = (data.currentValues ?? {}) as Record<string, unknown>;
    const proposedChanges = (data.proposedChanges ?? {}) as Record<string, unknown>;
    const changes = extractChanges(currentValues, proposedChanges, SOLUTION_DIFF_FIELDS);

    if (changes.length === 0) {
      stats.skippedNoChanges++;
      await updateDoc.ref.update({ consolidated: true });
      continue;
    }

    // Read current version from solution doc
    const solutionRef = db.collection("solutions").doc(data.solutionId as string);
    const solutionSnap = await solutionRef.get();
    const currentVersion = (solutionSnap.exists ? (solutionSnap.data()?.version as number) : 0) || 0;
    const newVersion = currentVersion + 1;

    // Atomic batch
    const batch = db.batch();

    const changelogRef = db.collection("changelogs").doc();
    batch.set(changelogRef, {
      documentType: "solution",
      documentId: data.solutionId,
      version: newVersion,
      changes,
      updateId: updateDoc.id,
      reviewedBy: data.reviewedBy ?? "unknown",
      reviewedAt: data.reviewedAt ?? null,
      createdBy: data.createdBy ?? "solution-evaluation",
      reasoning: data.reasoning ?? "",
      confidence: data.confidence ?? 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(solutionRef, {
      version: newVersion,
      "metadata.lastUpdated": FieldValue.serverTimestamp(),
      "metadata.lastUpdatedBy": "consolidation",
      "metadata.lastChangelogId": changelogRef.id,
    });

    batch.update(updateDoc.ref, { consolidated: true });

    await batch.commit();
    stats.solutionChangelogsWritten++;
    logger.info(`Changelog v${newVersion} for solution ${data.solutionId}: ${changes.length} field(s) changed`);
  }

  return stats;
}
