import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { User } from "../types/user";
import type { UserDataClient } from "./client";

export const userClient: UserDataClient = {
  async getUser(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() } as User;
  },

  async getUsers(): Promise<User[]> {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
  },

  async manageUser(
    uid: string,
    action: "grant_reviewer" | "revoke_reviewer" | "block" | "unblock" | "remove"
  ): Promise<void> {
    const ref = doc(db, "users", uid);
    switch (action) {
      case "grant_reviewer":
        await updateDoc(ref, {
          isReviewer: true,
          status: "active",
          approvedAt: serverTimestamp(),
        });
        break;
      case "revoke_reviewer":
        await updateDoc(ref, { isReviewer: false });
        break;
      case "block":
        await updateDoc(ref, { status: "blocked", isReviewer: false });
        break;
      case "unblock":
        await updateDoc(ref, { status: "active" });
        break;
      case "remove":
        await deleteDoc(ref);
        break;
    }
  },
};
