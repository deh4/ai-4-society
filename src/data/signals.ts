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
    await updateDoc(ref, {
      ...edits,
      status: "edited",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },
};
