import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import type { Vote } from "../types/graph";
import type { VoteDataClient } from "./client";

export const voteClient: VoteDataClient = {
  async castVote(nodeId: string, value: 1 | -1): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Must be signed in to vote");
    const ref = doc(db, "nodes", nodeId, "votes", uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Update: preserve original createdAt
      await setDoc(ref, {
        userId: uid,
        value,
        createdAt: existing.data().createdAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create: set both timestamps
      await setDoc(ref, {
        userId: uid,
        value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  },

  async getUserVote(nodeId: string): Promise<Vote | null> {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const snap = await getDoc(doc(db, "nodes", nodeId, "votes", uid));
    if (!snap.exists()) return null;
    return snap.data() as Vote;
  },

  async getVoteCounts(nodeId: string): Promise<{ up: number; down: number }> {
    // Read from pre-computed node_summaries for efficiency
    const snap = await getDoc(doc(db, "node_summaries", nodeId));
    if (!snap.exists()) return { up: 0, down: 0 };
    const data = snap.data();
    return { up: data.vote_up ?? 0, down: data.vote_down ?? 0 };
  },
};
