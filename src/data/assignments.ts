import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

/** Assign a reviewable item to a specific user */
export async function assignItem(
  collectionName: string,
  docId: string,
  assigneeUid: string,
  assignerUid: string,
): Promise<void> {
  await updateDoc(doc(db, collectionName, docId), {
    assigned_to: assigneeUid,
    assigned_by: assignerUid,
    assigned_at: serverTimestamp(),
  });
}

/** Remove assignment from a reviewable item */
export async function unassignItem(
  collectionName: string,
  docId: string,
): Promise<void> {
  await updateDoc(doc(db, collectionName, docId), {
    assigned_to: null,
    assigned_by: null,
    assigned_at: null,
  });
}
