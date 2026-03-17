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
import type { GraphProposal } from "../types/proposal";
import type { ProposalDataClient, ProposalFilters } from "./client";

export const proposalClient: ProposalDataClient = {
  async getProposals(filters: ProposalFilters): Promise<GraphProposal[]> {
    const constraints = [];

    if (filters.proposalType) {
      constraints.push(where("proposal_type", "==", filters.proposalType));
    }
    if (filters.status) {
      constraints.push(where("status", "==", filters.status));
    }

    constraints.push(orderBy("created_at", "desc"));

    if (filters.limit) {
      constraints.push(firestoreLimit(filters.limit));
    }

    const q = query(collection(db, "graph_proposals"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GraphProposal));
  },

  async approveProposal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "graph_proposals", id);
    await updateDoc(ref, {
      status: "approved",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async rejectProposal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "graph_proposals", id);
    await updateDoc(ref, {
      status: "rejected",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },
};
