// functions/src/agents/data-lifecycle/index.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const BATCH_SIZE = 200;

interface LifecycleStats {
  signalsArchived: number;
  signalsDeleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  graphProposalsDeleted: number;
  graphProposalsExpired: number;
  feedItemsDeleted: number;
  archivedSignalsDeleted: number;
  v1ProposalsDeleted: number;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function deleteBatched(
  db: FirebaseFirestore.Firestore,
  query: FirebaseFirestore.Query,
  batchSize: number,
): Promise<number> {
  let total = 0;
  let snap = await query.limit(batchSize).get();
  while (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < batchSize) break;
    snap = await query.limit(batchSize).get();
  }
  return total;
}

export async function runDataLifecycle(): Promise<LifecycleStats> {
  const db = getFirestore();
  const stats: LifecycleStats = {
    signalsArchived: 0, signalsDeleted: 0, evidenceMarkedStale: 0,
    agentRunsDeleted: 0, graphProposalsDeleted: 0, graphProposalsExpired: 0,
    feedItemsDeleted: 0, archivedSignalsDeleted: 0, v1ProposalsDeleted: 0,
  };

  // 1. Archive approved/edited signals older than 90 days
  const archiveCutoff = daysAgo(90);
  const approvedQuery = db.collection("signals")
    .where("status", "in", ["approved", "edited"])
    .where("fetched_at", "<", archiveCutoff);

  let snap = await approvedQuery.limit(BATCH_SIZE).get();
  while (!snap.empty) {
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.set(
        db.collection("_archive").doc("signals").collection("items").doc(doc.id),
        { ...doc.data(), archivedAt: FieldValue.serverTimestamp() },
      );
      batch.delete(doc.ref);
      stats.signalsArchived++;
    }
    await batch.commit();
    if (snap.size < BATCH_SIZE) break;
    snap = await approvedQuery.limit(BATCH_SIZE).get();
  }

  // 2. Hard delete rejected signals older than 30 days
  stats.signalsDeleted = await deleteBatched(
    db,
    db.collection("signals").where("status", "==", "rejected").where("fetched_at", "<", daysAgo(30)),
    BATCH_SIZE,
  );

  // 3. Mark stale evidence (isNew: true → false after 180 days)
  const staleQuery = db.collection("signals")
    .where("isNew", "==", true)
    .where("fetched_at", "<", daysAgo(180));

  let staleSnap = await staleQuery.limit(BATCH_SIZE).get();
  while (!staleSnap.empty) {
    const batch = db.batch();
    staleSnap.docs.forEach((d) => batch.update(d.ref, { isNew: false }));
    await batch.commit();
    stats.evidenceMarkedStale += staleSnap.size;
    if (staleSnap.size < BATCH_SIZE) break;
    staleSnap = await staleQuery.limit(BATCH_SIZE).get();
  }

  // 4. Delete old agent run summaries (> 90 days)
  const agentsSnap = await db.collection("agents").get();
  for (const agentDoc of agentsSnap.docs) {
    const count = await deleteBatched(
      db,
      agentDoc.ref.collection("runs").where("startedAt", "<", daysAgo(90)),
      BATCH_SIZE,
    );
    stats.agentRunsDeleted += count;
  }

  // 5. graph_proposals: delete rejected after 90 days
  stats.graphProposalsDeleted = await deleteBatched(
    db,
    db.collection("graph_proposals")
      .where("status", "==", "rejected")
      .where("created_at", "<", daysAgo(90)),
    BATCH_SIZE,
  );

  // 6. graph_proposals: auto-reject pending proposals older than 30 days
  const expiredProposals = await db.collection("graph_proposals")
    .where("status", "==", "pending")
    .where("created_at", "<", daysAgo(30))
    .limit(BATCH_SIZE)
    .get();

  if (!expiredProposals.empty) {
    const batch = db.batch();
    expiredProposals.docs.forEach((d) =>
      batch.update(d.ref, {
        status: "rejected",
        reviewed_at: FieldValue.serverTimestamp(),
        reviewed_by: "data-lifecycle",
        rejection_reason: "Expired: no review within 30 days",
      })
    );
    await batch.commit();
    stats.graphProposalsExpired = expiredProposals.size;
  }

  // 7. feed_items: delete older than 30 days
  stats.feedItemsDeleted = await deleteBatched(
    db,
    db.collection("feed_items").where("createdAt", "<", daysAgo(30)),
    BATCH_SIZE,
  );

  // 8. Archived signals: hard delete after 1 year
  stats.archivedSignalsDeleted = await deleteBatched(
    db,
    db.collection("_archive").doc("signals").collection("items")
      .where("archivedAt", "<", daysAgo(365)),
    BATCH_SIZE,
  );

  // 9. v1 cleanup: delete remaining discovery_proposals and validation_proposals
  const v1DiscoveryCount = await deleteBatched(
    db, db.collection("discovery_proposals"), BATCH_SIZE,
  );
  const v1ValidationCount = await deleteBatched(
    db, db.collection("validation_proposals"), BATCH_SIZE,
  );
  stats.v1ProposalsDeleted = v1DiscoveryCount + v1ValidationCount;

  // Note: changelogs are kept indefinitely (audit trail, low volume)

  logger.info("Data lifecycle v2 complete:", stats);
  return stats;
}
