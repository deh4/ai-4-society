import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Retention periods in days
const RETENTION = {
  approvedSignals: 90,   // Archive approved/edited signals after 90 days
  rejectedSignals: 30,   // Hard delete rejected signals after 30 days
  evidenceFreshness: 180, // Mark evidence as stale (isNew: false) after 180 days
} as const;

const BATCH_SIZE = 200;

interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  topicsDeleted: number;
  riskUpdatesDeleted: number;
  solutionUpdatesDeleted: number;
  validationReportsDeleted: number;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Run the full data lifecycle: archive old approved signals, delete old rejected signals,
 * and mark stale evidence items.
 */
export async function runDataLifecycle(): Promise<LifecycleStats> {
  const db = getFirestore();
  const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0, topicsDeleted: 0, riskUpdatesDeleted: 0, solutionUpdatesDeleted: 0, validationReportsDeleted: 0 };

  // 1. Archive approved/edited signals older than 90 days
  const archiveCutoff = daysAgo(RETENTION.approvedSignals);
  const approvedQuery = db
    .collection("signals")
    .where("status", "in", ["approved", "edited"])
    .where("fetched_at", "<", archiveCutoff)
    .limit(BATCH_SIZE);

  let approvedSnap = await approvedQuery.get();
  while (!approvedSnap.empty) {
    const batch = db.batch();
    for (const doc of approvedSnap.docs) {
      const archiveRef = db.collection("_archive").doc("signals").collection("items").doc(doc.id);
      batch.set(archiveRef, {
        ...doc.data(),
        archivedAt: FieldValue.serverTimestamp(),
      });
      batch.delete(doc.ref);
      stats.archived++;
    }
    await batch.commit();
    logger.info(`Archived ${approvedSnap.size} approved/edited signals`);

    if (approvedSnap.size < BATCH_SIZE) break;
    approvedSnap = await approvedQuery.get();
  }

  // 2. Hard delete rejected signals older than 30 days
  const deleteCutoff = daysAgo(RETENTION.rejectedSignals);
  const rejectedQuery = db
    .collection("signals")
    .where("status", "==", "rejected")
    .where("fetched_at", "<", deleteCutoff)
    .limit(BATCH_SIZE);

  let rejectedSnap = await rejectedQuery.get();
  while (!rejectedSnap.empty) {
    const batch = db.batch();
    for (const doc of rejectedSnap.docs) {
      batch.delete(doc.ref);
      stats.deleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${rejectedSnap.size} rejected signals`);

    if (rejectedSnap.size < BATCH_SIZE) break;
    rejectedSnap = await rejectedQuery.get();
  }

  // 3. Mark stale evidence (isNew: true → false after 180 days)
  const stalenessCutoff = daysAgo(RETENTION.evidenceFreshness);
  const staleQuery = db
    .collection("signals")
    .where("isNew", "==", true)
    .where("fetched_at", "<", stalenessCutoff)
    .limit(BATCH_SIZE);

  let staleSnap = await staleQuery.get();
  while (!staleSnap.empty) {
    const batch = db.batch();
    for (const doc of staleSnap.docs) {
      batch.update(doc.ref, { isNew: false });
      stats.evidenceMarkedStale++;
    }
    await batch.commit();
    logger.info(`Marked ${staleSnap.size} signals as no longer new`);

    if (staleSnap.size < BATCH_SIZE) break;
    staleSnap = await staleQuery.get();
  }

  // 4. Delete old agent run summaries (>90 days)
  const runCutoff = daysAgo(RETENTION.approvedSignals); // reuse 90-day retention
  const agentsSnap = await db.collection("agents").get();
  for (const agentDoc of agentsSnap.docs) {
    const runsQuery = agentDoc.ref
      .collection("runs")
      .where("startedAt", "<", runCutoff)
      .limit(BATCH_SIZE);

    let runsSnap = await runsQuery.get();
    while (!runsSnap.empty) {
      const batch = db.batch();
      for (const runDoc of runsSnap.docs) {
        batch.delete(runDoc.ref);
        stats.agentRunsDeleted++;
      }
      await batch.commit();
      logger.info(`Deleted ${runsSnap.size} old runs from ${agentDoc.id}`);

      if (runsSnap.size < BATCH_SIZE) break;
      runsSnap = await runsQuery.get();
    }
  }

  // 5. Delete old topics (>30 days — ephemeral analysis artifacts)
  const topicCutoff = daysAgo(30);
  const topicsQuery = db
    .collection("topics")
    .where("createdAt", "<", topicCutoff)
    .limit(BATCH_SIZE);

  let topicsSnap = await topicsQuery.get();
  while (!topicsSnap.empty) {
    const batch = db.batch();
    for (const topicDoc of topicsSnap.docs) {
      batch.delete(topicDoc.ref);
      stats.topicsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${topicsSnap.size} old topics`);

    if (topicsSnap.size < BATCH_SIZE) break;
    topicsSnap = await topicsQuery.get();
  }

  // 6. Delete old risk updates (>30 days — ephemeral staging artifacts)
  const riskUpdateCutoff = daysAgo(30);
  const riskUpdatesQuery = db
    .collection("risk_updates")
    .where("createdAt", "<", riskUpdateCutoff)
    .limit(BATCH_SIZE);

  let riskUpdatesSnap = await riskUpdatesQuery.get();
  while (!riskUpdatesSnap.empty) {
    const batch = db.batch();
    for (const updateDoc of riskUpdatesSnap.docs) {
      batch.delete(updateDoc.ref);
      stats.riskUpdatesDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${riskUpdatesSnap.size} old risk updates`);

    if (riskUpdatesSnap.size < BATCH_SIZE) break;
    riskUpdatesSnap = await riskUpdatesQuery.get();
  }

  // 7. Delete old solution updates (>30 days — ephemeral staging artifacts)
  const solutionUpdateCutoff = daysAgo(30);
  const solutionUpdatesQuery = db
    .collection("solution_updates")
    .where("createdAt", "<", solutionUpdateCutoff)
    .limit(BATCH_SIZE);

  let solutionUpdatesSnap = await solutionUpdatesQuery.get();
  while (!solutionUpdatesSnap.empty) {
    const batch = db.batch();
    for (const updateDoc of solutionUpdatesSnap.docs) {
      batch.delete(updateDoc.ref);
      stats.solutionUpdatesDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${solutionUpdatesSnap.size} old solution updates`);

    if (solutionUpdatesSnap.size < BATCH_SIZE) break;
    solutionUpdatesSnap = await solutionUpdatesQuery.get();
  }

  // 8. Delete old validation reports (>30 days)
  const validationReportCutoff = daysAgo(30);
  const validationReportsQuery = db
    .collection("validation_reports")
    .where("createdAt", "<", validationReportCutoff)
    .limit(BATCH_SIZE);

  let validationReportsSnap = await validationReportsQuery.get();
  while (!validationReportsSnap.empty) {
    const batch = db.batch();
    for (const reportDoc of validationReportsSnap.docs) {
      batch.delete(reportDoc.ref);
      stats.validationReportsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${validationReportsSnap.size} old validation reports`);

    if (validationReportsSnap.size < BATCH_SIZE) break;
    validationReportsSnap = await validationReportsQuery.get();
  }

  return stats;
}
