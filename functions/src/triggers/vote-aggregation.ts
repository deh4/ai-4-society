import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

export const onVoteWritten = onDocumentWritten(
  "nodes/{nodeId}/votes/{userId}",
  async (event) => {
    const nodeId = event.params.nodeId;
    const summaryRef = db.doc(`node_summaries/${nodeId}`);

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    await db.runTransaction(async (tx) => {
      const summarySnap = await tx.get(summaryRef);
      if (!summarySnap.exists) return; // no summary yet, Graph Builder will create it

      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!before && after) {
        // New vote
        if (after.value === 1) updates.vote_up = FieldValue.increment(1);
        else updates.vote_down = FieldValue.increment(1);
      } else if (before && after) {
        // Changed vote
        if (before.value !== after.value) {
          if (before.value === 1) {
            updates.vote_up = FieldValue.increment(-1);
            updates.vote_down = FieldValue.increment(1);
          } else {
            updates.vote_down = FieldValue.increment(-1);
            updates.vote_up = FieldValue.increment(1);
          }
        }
      } else if (before && !after) {
        // Deleted vote
        if (before.value === 1) updates.vote_up = FieldValue.increment(-1);
        else updates.vote_down = FieldValue.increment(-1);
      }

      tx.update(summaryRef, updates);
    });
  }
);
