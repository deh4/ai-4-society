import { onCall } from "firebase-functions/v2/https";
import {
  getAllNodes,
  getAllEdges,
  writeGraphSnapshot,
  writeNodeSummary,
  getSignalsForNode,
  db,
  FieldValue,
} from "../../shared/firestore.js";

interface SnapshotNode {
  id: string;
  type: string;
  name: string;
  velocity?: string;
  implementation_stage?: string;
  significance?: string;
  score_2026?: number;
}

export const buildGraph = onCall(
  { memory: "512MiB", timeoutSeconds: 120 },
  async () => {
    // Debounce: check if a build ran in the last 30 seconds
    const lockRef = db.doc("_internal/graph_builder_lock");
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) {
      const lastRun = lockSnap.data()?.lastRunAt?.toDate?.();
      if (lastRun && Date.now() - lastRun.getTime() < 30_000) {
        return { success: true, debounced: true };
      }
    }
    await lockRef.set({ lastRunAt: FieldValue.serverTimestamp() });

    const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);

    // Build minimal snapshot for visualization
    const snapshotNodes: SnapshotNode[] = nodes.map((n) => {
      const node: SnapshotNode = {
        id: n.id as string,
        type: n.type as string,
        name: n.name as string,
      };
      if (n.velocity) node.velocity = n.velocity as string;
      if (n.implementation_stage) node.implementation_stage = n.implementation_stage as string;
      if (n.significance) node.significance = n.significance as string;
      if (n.score_2026 !== undefined) node.score_2026 = n.score_2026 as number;
      return node;
    });

    const snapshotEdges = edges.map((e) => ({
      from: e.from_node as string,
      to: e.to_node as string,
      relationship: e.relationship as string,
      ...(e.properties ? { properties: e.properties } : {}),
    }));

    await writeGraphSnapshot({
      nodes: snapshotNodes,
      edges: snapshotEdges,
      nodeCount: snapshotNodes.length,
      edgeCount: snapshotEdges.length,
    });

    // Compute node summaries
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const node of nodes) {
      const nodeId = node.id as string;
      const signals = await getSignalsForNode(nodeId, "approved");

      const count7d = signals.filter((s: Record<string, unknown>) => {
        const fetchedAt = s.fetched_at as { toDate?: () => Date };
        return fetchedAt?.toDate && fetchedAt.toDate() >= sevenDaysAgo;
      }).length;

      const count30d = signals.filter((s: Record<string, unknown>) => {
        const fetchedAt = s.fetched_at as { toDate?: () => Date };
        return fetchedAt?.toDate && fetchedAt.toDate() >= thirtyDaysAgo;
      }).length;

      // Simple trending logic: compare 7d to previous 7d
      const previousCount = count30d - count7d;
      const avgPrevious = previousCount / 3; // rough weekly avg over remaining 23 days
      let trending: "rising" | "stable" | "declining" = "stable";
      if (count7d > avgPrevious * 1.5) trending = "rising";
      else if (count7d < avgPrevious * 0.5) trending = "declining";

      // Recompute vote totals from scratch (consistency check)
      const votesSnap = await db
        .collection("nodes")
        .doc(nodeId)
        .collection("votes")
        .get();
      let voteUp = 0;
      let voteDown = 0;
      votesSnap.forEach((v) => {
        const val = v.data().value;
        if (val === 1) voteUp++;
        else if (val === -1) voteDown++;
      });

      const summary: Record<string, unknown> = {
        node_id: nodeId,
        node_type: node.type as string,
        name: node.name as string,
        signal_count_7d: count7d,
        signal_count_30d: count30d,
        trending,
        vote_up: voteUp,
        vote_down: voteDown,
      };
      if (node.velocity) summary.velocity = node.velocity;
      await writeNodeSummary(nodeId, summary);
    }

    return {
      success: true,
      nodeCount: snapshotNodes.length,
      edgeCount: snapshotEdges.length,
    };
  }
);
