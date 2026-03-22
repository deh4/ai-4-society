import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

export const v3Cleanup = onRequest(
  { memory: "512MiB", timeoutSeconds: 540 },
  async (_req, res) => {
    const db = getFirestore();
    const results: Record<string, unknown> = {};

    // Step 1: Normalize solution fields in nodes collection
    logger.info("Step 1: Normalizing solution score fields...");
    const solutionSnap = await db.collection("nodes").where("type", "==", "solution").get();
    let normalizedScores = 0;
    for (let i = 0; i < solutionSnap.docs.length; i += 500) {
      const batch = db.batch();
      const chunk = solutionSnap.docs.slice(i, i + 500);
      for (const doc of chunk) {
        const data = doc.data();
        const updates: Record<string, unknown> = {};
        if (data.adoption_score_2026 !== undefined && data.score_2026 === undefined) {
          updates.score_2026 = data.adoption_score_2026;
          updates.adoption_score_2026 = FieldValue.delete();
        }
        if (data.adoption_score_2035 !== undefined && data.score_2035 === undefined) {
          updates.score_2035 = data.adoption_score_2035;
          updates.adoption_score_2035 = FieldValue.delete();
        }
        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
          normalizedScores++;
        }
      }
      await batch.commit();
    }
    results.normalizedScores = normalizedScores;
    logger.info(`Step 1 done: ${normalizedScores} solution nodes normalized`);

    // Step 2: Add missing fields to all nodes
    logger.info("Step 2: Adding missing fields to nodes...");
    const allNodesSnap = await db.collection("nodes").get();
    let updatedNodes = 0;
    for (let i = 0; i < allNodesSnap.docs.length; i += 500) {
      const batch = db.batch();
      const chunk = allNodesSnap.docs.slice(i, i + 500);
      for (const doc of chunk) {
        const data = doc.data();
        const updates: Record<string, unknown> = {};
        if (!data.principles) updates.principles = [];
        if (!data.created_by) {
          // Original R01-R10, S01-S10 were seeded
          if (/^[RS]\d{2}$/.test(doc.id)) {
            updates.created_by = "seed";
          }
        }
        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
          updatedNodes++;
        }
      }
      await batch.commit();
    }
    results.updatedNodes = updatedNodes;
    logger.info(`Step 2 done: ${updatedNodes} nodes updated with missing fields`);

    // Step 3: Fix changelog node_type
    logger.info("Step 3: Fixing changelog node_type...");
    const changelogsSnap = await db.collection("changelogs").where("node_type", "==", "").get();
    let fixedChangelogs = 0;
    for (let i = 0; i < changelogsSnap.docs.length; i += 500) {
      const batch = db.batch();
      const chunk = changelogsSnap.docs.slice(i, i + 500);
      for (const doc of chunk) {
        const data = doc.data();
        const nodeId = data.node_id as string;
        if (nodeId) {
          const nodeSnap = await db.doc(`nodes/${nodeId}`).get();
          if (nodeSnap.exists) {
            batch.update(doc.ref, { node_type: nodeSnap.data()!.type ?? "" });
            fixedChangelogs++;
          }
        }
      }
      await batch.commit();
    }
    results.fixedChangelogs = fixedChangelogs;
    logger.info(`Step 3 done: ${fixedChangelogs} changelogs fixed`);

    // Step 4: Deduplicate edges
    logger.info("Step 4: Deduplicating edges...");
    const edgesSnap = await db.collection("edges").get();
    const edgeKeys = new Map<string, string>();
    let deletedEdges = 0;
    const deleteBatch = db.batch();
    let deleteBatchCount = 0;
    for (const doc of edgesSnap.docs) {
      const data = doc.data();
      const key = `${data.from_node}|${data.to_node}|${data.relationship}`;
      if (edgeKeys.has(key)) {
        deleteBatch.delete(doc.ref);
        deleteBatchCount++;
        deletedEdges++;
        if (deleteBatchCount >= 500) {
          await deleteBatch.commit();
          deleteBatchCount = 0;
        }
      } else {
        edgeKeys.set(key, doc.id);
      }
    }
    if (deleteBatchCount > 0) await deleteBatch.commit();
    results.deletedEdges = deletedEdges;
    logger.info(`Step 4 done: ${deletedEdges} duplicate edges deleted`);

    // Step 5: Add anti-recursion fields to existing signals
    logger.info("Step 5: Adding anti-recursion fields to signals...");
    const signalsSnap = await db.collection("signals").get();
    let updatedSignals = 0;
    for (let i = 0; i < signalsSnap.docs.length; i += 500) {
      const batch = db.batch();
      const chunk = signalsSnap.docs.slice(i, i + 500);
      for (const doc of chunk) {
        const data = doc.data();
        if (data.classification_version === undefined) {
          batch.update(doc.ref, {
            classification_version: 1,
            last_classified_by: "signal-classifier",
            last_classified_at: data.fetched_at ?? FieldValue.serverTimestamp(),
            discovery_locked: false,
            harm_status: data.harm_status ?? null,
            principles: data.principles ?? [],
          });
          updatedSignals++;
        }
      }
      await batch.commit();
    }
    results.updatedSignals = updatedSignals;
    logger.info(`Step 5 done: ${updatedSignals} signals updated with anti-recursion fields`);

    // Step 6: Assign sequential IDs to discovery nodes
    logger.info("Step 6: Assigning sequential IDs to discovery nodes...");
    const sequentialPattern = /^(R|S|M|SH|P)\d+$/;
    const discoveryNodes = allNodesSnap.docs.filter((d) => !sequentialPattern.test(d.id));
    let renamedNodes = 0;

    if (discoveryNodes.length > 0) {
      // Find max IDs for each type
      const maxIds: Record<string, number> = { R: 0, S: 0, M: 0, SH: 0, P: 0 };
      for (const doc of allNodesSnap.docs) {
        const match = doc.id.match(/^(R|S|M|SH|P)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          if (num > (maxIds[prefix] ?? 0)) maxIds[prefix] = num;
        }
      }

      for (const doc of discoveryNodes) {
        const data = doc.data();
        const nodeType = data.type as string;
        let prefix: string;
        if (nodeType === "risk") prefix = "R";
        else if (nodeType === "solution") prefix = "S";
        else if (nodeType === "milestone") prefix = "M";
        else if (nodeType === "stakeholder") prefix = "SH";
        else if (nodeType === "principle") prefix = "P";
        else continue;

        maxIds[prefix] = (maxIds[prefix] ?? 0) + 1;
        const newId = `${prefix}${String(maxIds[prefix]).padStart(2, "0")}`;
        const oldId = doc.id;

        // Create new doc with sequential ID
        const newData = { ...data, id: newId };
        await db.doc(`nodes/${newId}`).set(newData);

        // Update references in edges
        const edgesFrom = await db.collection("edges").where("from_node", "==", oldId).get();
        const edgesTo = await db.collection("edges").where("to_node", "==", oldId).get();
        for (const edgeDoc of edgesFrom.docs) {
          await edgeDoc.ref.update({ from_node: newId });
        }
        for (const edgeDoc of edgesTo.docs) {
          await edgeDoc.ref.update({ to_node: newId });
        }

        // Update references in signals
        const signalsRef = await db.collection("signals").where("related_node_ids", "array-contains", oldId).get();
        for (const sigDoc of signalsRef.docs) {
          const sigData = sigDoc.data();
          const updatedIds = (sigData.related_node_ids as string[]).map((id: string) => id === oldId ? newId : id);
          const updatedNodes = (sigData.related_nodes as Array<Record<string, unknown>>).map(
            (rn: Record<string, unknown>) => rn.node_id === oldId ? { ...rn, node_id: newId } : rn
          );
          await sigDoc.ref.update({ related_node_ids: updatedIds, related_nodes: updatedNodes });
        }

        // Update references in graph_proposals
        const proposalsSnap = await db.collection("graph_proposals").where("created_node_id", "==", oldId).get();
        for (const propDoc of proposalsSnap.docs) {
          await propDoc.ref.update({ created_node_id: newId });
        }

        // Delete old doc
        await db.doc(`nodes/${oldId}`).delete();
        renamedNodes++;
        logger.info(`Renamed node ${oldId} → ${newId}`);
      }
    }
    results.renamedNodes = renamedNodes;
    logger.info(`Step 6 done: ${renamedNodes} nodes renamed to sequential IDs`);

    res.json({ success: true, results });
  }
);
