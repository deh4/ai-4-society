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
  changelogsDeleted: number;
  rejectedDiscoveryProposalsDeleted: number;
  validationProposalsDeleted: number;
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
  const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0, changelogsDeleted: 0, rejectedDiscoveryProposalsDeleted: 0, validationProposalsDeleted: 0 };

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

  // 5. Delete old changelogs (>180 days — longer retention for audit trail)
  const changelogCutoff = daysAgo(180);
  const changelogsQuery = db
    .collection("changelogs")
    .where("createdAt", "<", changelogCutoff)
    .limit(BATCH_SIZE);

  let changelogsSnap = await changelogsQuery.get();
  while (!changelogsSnap.empty) {
    const batch = db.batch();
    for (const changelogDoc of changelogsSnap.docs) {
      batch.delete(changelogDoc.ref);
      stats.changelogsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${changelogsSnap.size} old changelogs`);

    if (changelogsSnap.size < BATCH_SIZE) break;
    changelogsSnap = await changelogsQuery.get();
  }

  // ── discovery_proposals: delete rejected after 90 days ───────────────────────
  const discoveryRejectedCutoff = new Date();
  discoveryRejectedCutoff.setDate(discoveryRejectedCutoff.getDate() - 90);

  const rejectedDiscoverySnap = await db.collection("discovery_proposals")
    .where("status", "==", "rejected")
    .where("created_at", "<", discoveryRejectedCutoff)
    .limit(200)
    .get();

  if (rejectedDiscoverySnap.size > 0) {
    const discoveryBatch = db.batch();
    rejectedDiscoverySnap.docs.forEach((d) => discoveryBatch.delete(d.ref));
    await discoveryBatch.commit();
    stats.rejectedDiscoveryProposalsDeleted += rejectedDiscoverySnap.size;
    logger.info(`Data lifecycle: deleted ${rejectedDiscoverySnap.size} old rejected discovery proposals`);
  }

  // ── validation_proposals: delete after 30 days ───────────────────────────────
  const validationProposalCutoff = new Date();
  validationProposalCutoff.setDate(validationProposalCutoff.getDate() - 30);

  const oldValidationSnap = await db.collection("validation_proposals")
    .where("created_at", "<", validationProposalCutoff)
    .limit(200)
    .get();

  if (oldValidationSnap.size > 0) {
    const validationBatch = db.batch();
    oldValidationSnap.docs.forEach((d) => validationBatch.delete(d.ref));
    await validationBatch.commit();
    stats.validationProposalsDeleted += oldValidationSnap.size;
    logger.info(`Data lifecycle: deleted ${oldValidationSnap.size} old validation proposals`);
  }

  return stats;
}
