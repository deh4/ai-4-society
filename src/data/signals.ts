import {
  doc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Signal } from "../types/signal";
import type { SignalDataClient, SignalFilters } from "./client";

export const signalClient: SignalDataClient = {
  async getSignals(filters: SignalFilters): Promise<Signal[]> {
    const constraints = [];

    if (filters.status) {
      constraints.push(where("status", "==", filters.status));
    }
    if (filters.signalType) {
      constraints.push(where("signal_type", "==", filters.signalType));
    }
    if (filters.nodeId) {
      constraints.push(where("related_node_ids", "array-contains", filters.nodeId));
    }

    const sortField = filters.orderBy === "impact_score" ? "impact_score" : "fetched_at";
    constraints.push(orderBy(sortField, "desc"));

    if (filters.limit) {
      constraints.push(firestoreLimit(filters.limit));
    }

    const q = query(collection(db, "signals"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Signal));
  },

  async approveSignal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    await updateDoc(ref, {
      status: "approved",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async rejectSignal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    await updateDoc(ref, {
      status: "rejected",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async editSignal(id: string, edits: Partial<Signal>, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    // Only allow safe-to-edit fields to prevent overwriting id, status, fetched_at, etc.
    const { title, summary, source_name, signal_type, related_nodes, related_node_ids } = edits;
    const safeEdits: Record<string, unknown> = {};
    if (title !== undefined) safeEdits.title = title;
    if (summary !== undefined) safeEdits.summary = summary;
    if (source_name !== undefined) safeEdits.source_name = source_name;
    if (signal_type !== undefined) safeEdits.signal_type = signal_type;
    if (related_nodes !== undefined) safeEdits.related_nodes = related_nodes;
    if (related_node_ids !== undefined) safeEdits.related_node_ids = related_node_ids;
    await updateDoc(ref, {
      ...safeEdits,
      status: "edited",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },
};
