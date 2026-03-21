import { useState } from "react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../store/AuthContext";

export function useSignalActions() {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);

  /** Approve, reject, edit, or reset a single signal */
  const handleSignalAction = async (
    id: string,
    status: "approved" | "rejected" | "edited" | "pending",
    adminNotes: string,
  ) => {
    if (status === "rejected" && !adminNotes.trim()) {
      alert("Please add a note explaining why this signal is rejected.");
      return false;
    }
    setUpdating(true);
    try {
      await updateDoc(doc(db, "signals", id), {
        status,
        admin_notes: adminNotes || null,
        reviewed_at: serverTimestamp(),
        reviewed_by: user?.uid ?? null,
      });
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid), {
          totalReviews: increment(1),
        }).catch(() => {});
      }
      return true;
    } finally {
      setUpdating(false);
    }
  };

  /** Bulk approve or reject signals */
  const handleBulkSignalAction = async (
    ids: Set<string>,
    status: "approved" | "rejected",
    adminNotes: string,
  ) => {
    if (ids.size === 0) return false;
    if (status === "rejected" && !adminNotes.trim()) {
      alert("Select items and add notes before bulk rejecting.");
      return false;
    }
    setUpdating(true);
    try {
      const batch = writeBatch(db);
      for (const id of ids) {
        batch.update(doc(db, "signals", id), {
          status,
          admin_notes: adminNotes || null,
          reviewed_at: serverTimestamp(),
          reviewed_by: user?.uid ?? null,
        });
      }
      await batch.commit();
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid), {
          totalReviews: increment(ids.size),
        }).catch(() => {});
      }
      return true;
    } finally {
      setUpdating(false);
    }
  };

  return { handleSignalAction, handleBulkSignalAction, updating };
}
