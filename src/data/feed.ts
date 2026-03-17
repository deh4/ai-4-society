import {
  getDocs,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { FeedItem } from "../types/graph";
import type { FeedDataClient } from "./client";

export const feedClient: FeedDataClient = {
  async getFeedItems(limit = 20): Promise<FeedItem[]> {
    const q = query(
      collection(db, "feed_items"),
      orderBy("impact_score", "desc"),
      firestoreLimit(limit)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem));
  },
};
