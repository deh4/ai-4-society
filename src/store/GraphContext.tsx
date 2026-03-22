import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GraphSnapshot, NodeSummary, FeedItem, PrincipleNode } from "../types/graph";
import { subscribeEditorialHooks } from "../data/editorial";
import type { EditorialHook } from "../types/editorial";

interface GraphContextType {
  snapshot: GraphSnapshot | null;
  summaries: NodeSummary[];
  feedItems: FeedItem[];
  editorialHooks: EditorialHook[];
  principleNodes: PrincipleNode[];
  loading: boolean;
  error: string | null;
}

const GraphContext = createContext<GraphContextType | undefined>(undefined);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [summaries, setSummaries] = useState<NodeSummary[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [editorialHooks, setEditorialHooks] = useState<EditorialHook[]>([]);
  const [principleNodes, setPrincipleNodes] = useState<PrincipleNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "graph_snapshot", "current"),
      (snap) => {
        if (snap.exists()) {
          const newData = snap.data() as GraphSnapshot;
          // Avoid creating a new snapshot reference (and restarting the force
          // simulation) when the graph topology hasn't actually changed.
          setSnapshot((prev) => {
            if (
              prev &&
              prev.nodeCount === newData.nodeCount &&
              prev.edgeCount === newData.edgeCount
            ) {
              return prev;
            }
            return newData;
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error("GraphContext: snapshot error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "node_summaries"),
      orderBy("signal_count_7d", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setSummaries(
          snap.docs.map((d) => ({ ...d.data() } as NodeSummary))
        );
      },
      (err) => {
        console.error("GraphContext: summaries error:", err);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "feed_items"),
      orderBy("impact_score", "desc"),
      firestoreLimit(30)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setFeedItems(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              // Ensure required fields exist with defaults
              related_node_ids: data.related_node_ids ?? [],
            } as FeedItem;
          })
        );
      },
      (err) => {
        console.error("GraphContext: feed error:", err);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsub = subscribeEditorialHooks("approved", setEditorialHooks);
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "nodes"),
      where("type", "==", "principle")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPrincipleNodes(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as PrincipleNode))
        );
      },
      (err) => {
        console.error("GraphContext: principleNodes error:", err);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <GraphContext.Provider
      value={{ snapshot, summaries, feedItems, editorialHooks, principleNodes, loading, error }}
    >
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph() {
  const context = useContext(GraphContext);
  if (context === undefined) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return context;
}
