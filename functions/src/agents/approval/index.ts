// functions/src/agents/approval/index.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getAllNodes, getAllEdges, writeGraphSnapshot } from "../../shared/firestore.js";

export const approveGraphProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    const uid = request.auth.uid;

    // Check admin/reviewer role
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new HttpsError("permission-denied", "No user profile found");
    const userData = userSnap.data()!;
    const roles = (userData.roles as string[]) ?? [];
    const hasReviewerRole = roles.some(r => r === "lead" || r === "reviewer");
    if (!hasReviewerRole) {
      throw new HttpsError("permission-denied", "Requires lead or reviewer role");
    }

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const action = (request.data.action as string) ?? "approve";
    if (action !== "approve" && action !== "reject") {
      throw new HttpsError("invalid-argument", "action must be 'approve' or 'reject'");
    }

    const proposalRef = db.collection("graph_proposals").doc(proposalId);

    const result = await db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);
      if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");

      const proposal = proposalSnap.data()!;
      if (proposal.status !== "pending") {
        throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status as string}`);
      }

      // Rejection path
      if (action === "reject") {
        tx.update(proposalRef, {
          status: "rejected",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          rejection_reason: (request.data.reason as string) ?? "",
        });
        return { success: true, action: "rejected" };
      }

      // Approval path — handle each proposal type
      const proposalType = proposal.proposal_type as string;

      if (proposalType === "new_node") {
        const nodeData = proposal.node_data as Record<string, unknown>;
        const nodeRef = db.collection("nodes").doc(); // auto-ID for new nodes
        tx.set(nodeRef, {
          ...nodeData,
          id: nodeRef.id,
          createdAt: FieldValue.serverTimestamp(),
          created_by: proposal.created_by ?? "discovery-agent",
          approved_by: uid,
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          created_node_id: nodeRef.id,
        });

        logger.info(`Approved new_node: ${nodeData.name as string} → ${nodeRef.id}`);
        return { success: true, action: "approved", nodeId: nodeRef.id };
      }

      if (proposalType === "new_edge") {
        const edgeData = proposal.edge_data as Record<string, unknown>;
        const fromNode = edgeData.from_node as string;
        const toNode = edgeData.to_node as string;
        const relationship = edgeData.relationship as string;
        const edgeId = `${fromNode}-${toNode}-${relationship}`;
        const edgeRef = db.doc(`edges/${edgeId}`);

        // Look up node types for from_type and to_type (required by Edge schema)
        const fromSnap = await tx.get(db.doc(`nodes/${fromNode}`));
        const toSnap = await tx.get(db.doc(`nodes/${toNode}`));
        if (!fromSnap.exists || !toSnap.exists) {
          throw new HttpsError("failed-precondition", "Referenced nodes no longer exist");
        }

        tx.set(edgeRef, {
          id: edgeId,
          from_node: fromNode,
          from_type: fromSnap.data()!.type ?? "",
          to_node: toNode,
          to_type: toSnap.data()!.type ?? "",
          relationship,
          properties: { reasoning: edgeData.reasoning ?? "" },
          created_by: proposal.created_by ?? "discovery-agent",
          approved_by: uid,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
          created_edge_id: edgeId,
        });

        logger.info(`Approved new_edge: ${edgeId}`);
        return { success: true, action: "approved", edgeId };
      }

      if (proposalType === "update_node") {
        const updateData = proposal.update_data as Record<string, unknown>;
        const nodeId = updateData.node_id as string;
        const proposedChanges = updateData.proposed_changes as Record<string, { proposed_value: unknown }>;

        const nodeRef = db.doc(`nodes/${nodeId}`);
        const nodeSnap = await tx.get(nodeRef);
        if (!nodeSnap.exists) throw new HttpsError("not-found", `Node ${nodeId} not found`);

        const currentDoc = nodeSnap.data()!;
        const updates: Record<string, unknown> = {};
        const changeLog: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

        for (const [field, change] of Object.entries(proposedChanges)) {
          updates[field] = change.proposed_value;
          changeLog.push({
            field,
            old_value: currentDoc[field] ?? null,
            new_value: change.proposed_value,
          });
        }

        const currentVersion = (currentDoc.version as number) ?? 0;
        updates.version = currentVersion + 1;
        updates.lastUpdated = FieldValue.serverTimestamp();
        updates.lastUpdatedBy = uid;

        tx.update(nodeRef, updates);

        // Write changelog
        const changelogRef = db.collection("changelogs").doc();
        tx.set(changelogRef, {
          node_id: nodeId,
          node_name: updateData.node_name ?? "",
          node_type: updateData.node_type ?? "",
          version: currentVersion + 1,
          changes: changeLog,
          proposal_id: proposalId,
          reviewed_by: uid,
          reviewed_at: FieldValue.serverTimestamp(),
          overall_reasoning: updateData.overall_reasoning ?? "",
          confidence: proposal.confidence ?? 0,
          created_at: FieldValue.serverTimestamp(),
          created_by: proposal.created_by ?? "validator-agent",
        });

        tx.update(proposalRef, {
          status: "approved",
          reviewed_at: FieldValue.serverTimestamp(),
          reviewed_by: uid,
        });

        // Increment reviewer's totalReviews counter
        const reviewerRef = db.collection("users").doc(uid);
        const reviewerSnap = await tx.get(reviewerRef);
        if (reviewerSnap.exists) {
          tx.update(reviewerRef, { totalReviews: FieldValue.increment(1) });
        }

        logger.info(`Approved update_node: ${nodeId}, ${changeLog.length} changes applied`);
        return { success: true, action: "approved", changesApplied: changeLog.length };
      }

      throw new HttpsError("invalid-argument", `Unknown proposal_type: ${proposalType}`);
    });

    // Post-approval: trigger Graph Builder rebuild (fire-and-forget, outside transaction)
    if (result.action === "approved") {
      try {
        const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);
        const snapshotNodes = nodes.map((n) => {
          const node: Record<string, unknown> = { id: n.id, type: n.type, name: n.name };
          if (n.velocity) node.velocity = n.velocity;
          if (n.implementation_stage) node.implementation_stage = n.implementation_stage;
          if (n.significance) node.significance = n.significance;
          if (n.score_2026 !== undefined) node.score_2026 = n.score_2026;
          return node;
        });
        const snapshotEdges = edges.map((e) => ({
          from: e.from_node, to: e.to_node, relationship: e.relationship,
        }));
        await writeGraphSnapshot({
          nodes: snapshotNodes, edges: snapshotEdges,
          nodeCount: snapshotNodes.length, edgeCount: snapshotEdges.length,
        });
        logger.info("Post-approval: graph snapshot rebuilt");
      } catch (err) {
        logger.warn("Post-approval graph rebuild failed (non-fatal):", err);
      }
    }

    return result;
  }
);

export const rejectGraphProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const db = getFirestore();
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!userSnap.exists) throw new HttpsError("permission-denied", "No user profile found");
    const userData = userSnap.data()!;
    const roles = (userData.roles as string[]) ?? [];
    const hasReviewerRole = roles.some(r => r === "lead" || r === "reviewer");
    if (!hasReviewerRole) {
      throw new HttpsError("permission-denied", "Requires lead or reviewer role");
    }

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const proposalRef = db.collection("graph_proposals").doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");
    if (proposalSnap.data()!.status !== "pending") {
      throw new HttpsError("failed-precondition", "Proposal is not pending");
    }

    await proposalRef.update({
      status: "rejected",
      reviewed_at: FieldValue.serverTimestamp(),
      reviewed_by: request.auth.uid,
      rejection_reason: (request.data.reason as string) ?? "",
    });

    return { success: true };
  }
);
