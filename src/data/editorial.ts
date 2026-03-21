import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp, type QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { EditorialHook } from "../types/editorial";

export function subscribeEditorialHooks(
  status: "pending" | "approved" | "rejected" | "all",
  callback: (hooks: EditorialHook[]) => void,
) {
  const constraints: QueryConstraint[] = [orderBy("impact_score", "desc")];
  if (status !== "all") {
    constraints.unshift(where("status", "==", status));
  }
  const q = query(collection(db, "editorial_hooks"), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EditorialHook)));
  });
}

export async function updateEditorialStatus(
  hookId: string,
  status: "approved" | "rejected",
  reviewerUid: string,
  hookText?: string,
) {
  const updates: Record<string, unknown> = {
    status,
    reviewed_by: reviewerUid,
    reviewed_at: serverTimestamp(),
  };
  if (hookText !== undefined) updates.hook_text = hookText;
  await updateDoc(doc(db, "editorial_hooks", hookId), updates);
}
