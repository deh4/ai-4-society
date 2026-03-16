import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GraphNode, Edge, GraphSnapshot, NodeSummary, NodeType } from "../types/graph";
import type { GraphDataClient } from "./client";

export const graphClient: GraphDataClient = {
  async getNode(id: string): Promise<GraphNode | null> {
    const snap = await getDoc(doc(db, "nodes", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as GraphNode;
  },

  async getEdges(nodeId: string, relationship?: string): Promise<Edge[]> {
    const fromQ = relationship
      ? query(
          collection(db, "edges"),
          where("from_node", "==", nodeId),
          where("relationship", "==", relationship)
        )
      : query(collection(db, "edges"), where("from_node", "==", nodeId));

    const toQ = relationship
      ? query(
          collection(db, "edges"),
          where("to_node", "==", nodeId),
          where("relationship", "==", relationship)
        )
      : query(collection(db, "edges"), where("to_node", "==", nodeId));

    const [fromSnap, toSnap] = await Promise.all([getDocs(fromQ), getDocs(toQ)]);
    const edges: Edge[] = [];
    fromSnap.forEach((d) => edges.push({ id: d.id, ...d.data() } as Edge));
    toSnap.forEach((d) => edges.push({ id: d.id, ...d.data() } as Edge));
    return edges;
  },

  async getGraphSnapshot(): Promise<GraphSnapshot | null> {
    const snap = await getDoc(doc(db, "graph_snapshot", "current"));
    if (!snap.exists()) return null;
    return snap.data() as GraphSnapshot;
  },

  async getNodeSummaries(filter?: { type?: NodeType }): Promise<NodeSummary[]> {
    let q;
    if (filter?.type) {
      q = query(
        collection(db, "node_summaries"),
        where("node_type", "==", filter.type),
        orderBy("signal_count_7d", "desc")
      );
    } else {
      q = query(collection(db, "node_summaries"));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data() } as NodeSummary));
  },
};
