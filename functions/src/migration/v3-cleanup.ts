import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Known duplicate pairs: [keep, delete]
// The "keep" entry is the one with more edges/signals.
const KNOWN_DUPLICATES: Array<[string, string]> = [
  // Add pairs here as discovered, e.g. ["R05", "abc123autoId"]
];

const SEQUENTIAL_ID_REGEX = /^(R|S|M|SH|P)\d+$/;

// Seed node IDs that get created_by: "seed"
const SEED_NODE_IDS = [
  "R01","R02","R03","R04","R05","R06","R07","R08","R09","R10",
  "S01","S02","S03","S04","S05","S06","S07","S08","S09","S10",
];

const COLLECTIONS_WITH_NODE_REFS = [
  "edges",
  "signals",
  "editorial_hooks",
  "graph_proposals",
  "node_summaries",
  "changelogs",
];

/** Commit a batch and start a new one, tracking the count */
async function flushBatch(
  batch: WriteBatch,
  db: ReturnType<typeof getFirestore>,
  count: { ops: number }
): Promise<WriteBatch> {
  if (count.ops > 0) {
    await batch.commit();
    count.ops = 0;
  }
  return db.batch();
}

/** Add a write to the batch, flushing when we hit 490 ops */
async function batchUpdate(
  batch: WriteBatch,
  db: ReturnType<typeof getFirestore>,
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  count: { ops: number }
): Promise<WriteBatch> {
  batch.update(ref, data);
  count.ops++;
  if (count.ops >= 490) {
    return flushBatch(batch, db, count);
  }
  return batch;
}

async function batchDelete(
  batch: WriteBatch,
  db: ReturnType<typeof getFirestore>,
  ref: FirebaseFirestore.DocumentReference,
  count: { ops: number }
): Promise<WriteBatch> {
  batch.delete(ref);
  count.ops++;
  if (count.ops >= 490) {
    return flushBatch(batch, db, count);
  }
  return batch;
}

export const v3Cleanup = onRequest(
  { memory: "1GiB", timeoutSeconds: 540 },
  async (_req, res) => {
    const db = getFirestore();
    const report: Record<string, unknown> = {};

    // ─── Step 1: Deduplicate nodes ──────────────────────────────────────────
    logger.info("v3Cleanup Step 1: Deduplicating nodes");
    let step1Count = 0;

    for (const [keepId, deleteId] of KNOWN_DUPLICATES) {
      logger.info(`  Deduplicating: keep=${keepId}, delete=${deleteId}`);

      // Update all references across relevant collections
      for (const coll of COLLECTIONS_WITH_NODE_REFS) {
        const snap = await db.collection(coll).get();
        const count = { ops: 0 };
        let batch = db.batch();

        for (const doc of snap.docs) {
          const data = doc.data();
          let updated = false;
          const updates: Record<string, unknown> = {};

          // edges: from_node / to_node
          if (coll === "edges") {
            if (data.from_node === deleteId) {
              updates.from_node = keepId;
              updated = true;
            }
            if (data.to_node === deleteId) {
              updates.to_node = keepId;
              updated = true;
            }
          }

          // signals: related_node_ids array
          if (coll === "signals" && Array.isArray(data.related_node_ids)) {
            if (data.related_node_ids.includes(deleteId)) {
              updates.related_node_ids = data.related_node_ids.map((id: string) =>
                id === deleteId ? keepId : id
              );
              updated = true;
            }
          }

          // editorial_hooks: related_node_ids array
          if (coll === "editorial_hooks" && Array.isArray(data.related_node_ids)) {
            if (data.related_node_ids.includes(deleteId)) {
              updates.related_node_ids = data.related_node_ids.map((id: string) =>
                id === deleteId ? keepId : id
              );
              updated = true;
            }
          }

          // graph_proposals: node_id inside update_data or node_data
          if (coll === "graph_proposals") {
            if (data.update_data?.node_id === deleteId) {
              updates["update_data.node_id"] = keepId;
              updated = true;
            }
          }

          // changelogs / node_summaries: node_id field
          if ((coll === "changelogs" || coll === "node_summaries") && data.node_id === deleteId) {
            updates.node_id = keepId;
            updated = true;
          }

          if (updated) {
            batch = await batchUpdate(batch, db, doc.ref, updates, count);
          }
        }

        await flushBatch(batch, db, count);
      }

      // Delete the duplicate node
      await db.collection("nodes").doc(deleteId).delete();
      step1Count++;
    }

    report.step1_deduplicatedNodes = step1Count;
    logger.info(`v3Cleanup Step 1 done: ${step1Count} duplicates removed`);

    // ─── Step 2: Assign sequential IDs to discovery nodes ──────────────────
    logger.info("v3Cleanup Step 2: Assigning sequential IDs to auto-ID nodes");

    const allNodesSnap = await db.collection("nodes").get();

    // Find the highest existing sequential IDs per prefix
    const maxIds: Record<string, number> = { R: 0, S: 0, M: 0, SH: 0, P: 0 };
    const autoIdNodes: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const doc of allNodesSnap.docs) {
      if (SEQUENTIAL_ID_REGEX.test(doc.id)) {
        // Parse prefix and number
        const match = doc.id.match(/^(R|S|M|SH|P)(\d+)$/);
        if (match) {
          const prefix = match[1] as string;
          const num = parseInt(match[2], 10);
          if ((maxIds[prefix] ?? 0) < num) {
            maxIds[prefix] = num;
          }
        }
      } else {
        autoIdNodes.push(doc);
      }
    }

    logger.info(`  Found ${autoIdNodes.length} auto-ID nodes to reassign`);
    logger.info(`  Current maxIds: ${JSON.stringify(maxIds)}`);

    let step2Count = 0;

    for (const oldDoc of autoIdNodes) {
      const data = oldDoc.data();
      const nodeType: string = data.type ?? "risk";

      // Determine prefix from type
      let prefix: string;
      if (nodeType === "risk") prefix = "R";
      else if (nodeType === "solution") prefix = "S";
      else if (nodeType === "milestone") prefix = "M";
      else if (nodeType === "stakeholder") prefix = "SH";
      else if (nodeType === "policy") prefix = "P";
      else prefix = "R"; // fallback

      maxIds[prefix] = (maxIds[prefix] ?? 0) + 1;
      const newId = `${prefix}${String(maxIds[prefix]).padStart(2, "0")}`;
      const oldId = oldDoc.id;

      logger.info(`  Reassigning node ${oldId} → ${newId} (type: ${nodeType})`);

      // Create the new doc with sequential ID
      await db.collection("nodes").doc(newId).set({
        ...data,
        id: newId,
      });

      // Update all references in dependent collections
      for (const coll of COLLECTIONS_WITH_NODE_REFS) {
        const snap = await db.collection(coll).get();
        const count = { ops: 0 };
        let batch = db.batch();

        for (const doc of snap.docs) {
          const d = doc.data();
          let updated = false;
          const updates: Record<string, unknown> = {};

          if (coll === "edges") {
            if (d.from_node === oldId) { updates.from_node = newId; updated = true; }
            if (d.to_node === oldId) { updates.to_node = newId; updated = true; }
          }

          if ((coll === "signals" || coll === "editorial_hooks") && Array.isArray(d.related_node_ids)) {
            if (d.related_node_ids.includes(oldId)) {
              updates.related_node_ids = d.related_node_ids.map((id: string) =>
                id === oldId ? newId : id
              );
              updated = true;
            }
          }

          if (coll === "graph_proposals" && d.update_data?.node_id === oldId) {
            updates["update_data.node_id"] = newId;
            updated = true;
          }

          if ((coll === "changelogs" || coll === "node_summaries") && d.node_id === oldId) {
            updates.node_id = newId;
            updated = true;
          }

          if (updated) {
            batch = await batchUpdate(batch, db, doc.ref, updates, count);
          }
        }

        await flushBatch(batch, db, count);
      }

      // Delete the old auto-ID doc
      await db.collection("nodes").doc(oldId).delete();
      step2Count++;
    }

    report.step2_reassignedNodes = step2Count;
    logger.info(`v3Cleanup Step 2 done: ${step2Count} nodes reassigned`);

    // ─── Step 3: Normalize solution fields ─────────────────────────────────
    logger.info("v3Cleanup Step 3: Normalizing solution adoption_score fields");

    const solutionNodesSnap = await db
      .collection("nodes")
      .where("type", "==", "solution")
      .get();

    let step3Count = 0;
    const count3 = { ops: 0 };
    let batch3 = db.batch();

    for (const doc of solutionNodesSnap.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};

      if (data.adoption_score_2026 !== undefined) {
        updates.score_2026 = data.adoption_score_2026;
        updates.adoption_score_2026 = FieldValue.delete();
      }
      if (data.adoption_score_2035 !== undefined) {
        updates.score_2035 = data.adoption_score_2035;
        updates.adoption_score_2035 = FieldValue.delete();
      }

      if (Object.keys(updates).length > 0) {
        batch3 = await batchUpdate(batch3, db, doc.ref, updates, count3);
        step3Count++;
      }
    }

    await flushBatch(batch3, db, count3);
    report.step3_solutionFieldsNormalized = step3Count;
    logger.info(`v3Cleanup Step 3 done: ${step3Count} solution nodes normalized`);

    // ─── Step 4: Add missing fields to all nodes ────────────────────────────
    logger.info("v3Cleanup Step 4: Adding missing fields to all nodes");

    const allNodesSnap2 = await db.collection("nodes").get();
    let step4Count = 0;
    const count4 = { ops: 0 };
    let batch4 = db.batch();

    for (const doc of allNodesSnap2.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};

      if (data.principles === undefined) {
        updates.principles = [];
      }

      if (SEED_NODE_IDS.includes(doc.id) && data.created_by === undefined) {
        updates.created_by = "seed";
      }

      if (Object.keys(updates).length > 0) {
        batch4 = await batchUpdate(batch4, db, doc.ref, updates, count4);
        step4Count++;
      }
    }

    await flushBatch(batch4, db, count4);
    report.step4_nodesUpdatedWithMissingFields = step4Count;
    logger.info(`v3Cleanup Step 4 done: ${step4Count} nodes updated with missing fields`);

    // ─── Step 5: Fix changelog node_type ───────────────────────────────────
    logger.info("v3Cleanup Step 5: Fixing empty node_type in changelogs");

    const emptyTypeChangelogsSnap = await db
      .collection("changelogs")
      .where("node_type", "==", "")
      .get();

    // Build a node_id → type lookup (fetch once)
    const nodeTypeCache: Record<string, string> = {};
    for (const doc of allNodesSnap2.docs) {
      nodeTypeCache[doc.id] = (doc.data().type as string) ?? "";
    }

    let step5Count = 0;
    const count5 = { ops: 0 };
    let batch5 = db.batch();

    for (const doc of emptyTypeChangelogsSnap.docs) {
      const data = doc.data();
      const nodeId: string = data.node_id ?? "";
      const nodeType = nodeTypeCache[nodeId];

      if (nodeType) {
        batch5 = await batchUpdate(batch5, db, doc.ref, { node_type: nodeType }, count5);
        step5Count++;
      } else {
        logger.warn(`  Changelog ${doc.id} references unknown node ${nodeId}`);
      }
    }

    await flushBatch(batch5, db, count5);
    report.step5_changelogsFixed = step5Count;
    logger.info(`v3Cleanup Step 5 done: ${step5Count} changelogs fixed`);

    // ─── Step 6: Deduplicate edges ──────────────────────────────────────────
    logger.info("v3Cleanup Step 6: Deduplicating edges");

    const allEdgesSnap = await db.collection("edges").get();
    const seenEdges = new Map<string, string>(); // key → first doc id
    const edgesToDelete: FirebaseFirestore.DocumentReference[] = [];

    for (const doc of allEdgesSnap.docs) {
      const data = doc.data();
      const key = `${data.from_node as string}|${data.to_node as string}|${data.relationship as string}`;

      if (seenEdges.has(key)) {
        edgesToDelete.push(doc.ref);
      } else {
        seenEdges.set(key, doc.id);
      }
    }

    let step6Count = 0;
    const count6 = { ops: 0 };
    let batch6 = db.batch();

    for (const ref of edgesToDelete) {
      batch6 = await batchDelete(batch6, db, ref, count6);
      step6Count++;
    }

    await flushBatch(batch6, db, count6);
    report.step6_duplicateEdgesRemoved = step6Count;
    logger.info(`v3Cleanup Step 6 done: ${step6Count} duplicate edges removed`);

    // ─── Step 7: Add anti-recursion fields to signals ───────────────────────
    logger.info("v3Cleanup Step 7: Adding anti-recursion fields to signals");

    const allSignalsSnap = await db.collection("signals").get();
    let step7Count = 0;
    const count7 = { ops: 0 };
    let batch7 = db.batch();

    for (const doc of allSignalsSnap.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};

      if (data.classification_version === undefined) {
        updates.classification_version = 1;
      }
      if (data.last_classified_by === undefined) {
        updates.last_classified_by = "signal-classifier";
      }
      if (data.last_classified_at === undefined) {
        updates.last_classified_at = data.fetched_at ?? null;
      }
      if (data.discovery_locked === undefined) {
        updates.discovery_locked = false;
      }
      if (data.harm_status === undefined) {
        updates.harm_status = null;
      }
      if (data.principles === undefined) {
        updates.principles = [];
      }

      if (Object.keys(updates).length > 0) {
        batch7 = await batchUpdate(batch7, db, doc.ref, updates, count7);
        step7Count++;
      }
    }

    await flushBatch(batch7, db, count7);
    report.step7_signalsUpdated = step7Count;
    logger.info(`v3Cleanup Step 7 done: ${step7Count} signals updated with anti-recursion fields`);

    // ─── Done ───────────────────────────────────────────────────────────────
    logger.info("v3Cleanup complete", report);
    res.status(200).json({ success: true, ...report });
  }
);
