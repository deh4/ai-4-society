import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  getDb,
  FieldValue,
  writeFeedItems,
  deleteCollection,
} from "../../shared/firestore.js";

async function buildFeed() {
  // Clear existing feed items
  await deleteCollection("feed_items");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get approved signals from last 30 days
  const signalsSnap = await getDb()
    .collection("signals")
    .where("status", "in", ["approved", "edited"])
    .where("fetched_at", ">=", thirtyDaysAgo)
    .orderBy("fetched_at", "desc")
    .get();

  const feedItems: Array<{ id: string } & Record<string, unknown>> = [];

  const now = Date.now();
  signalsSnap.forEach((d) => {
    const data = d.data();
    // Apply recency decay: signals lose impact over time
    const fetchedMs = data.fetched_at?.toDate?.()?.getTime() ?? now;
    const daysSinceFetch = (now - fetchedMs) / (1000 * 60 * 60 * 24);
    const recencyDecay = Math.max(0.1, 1 - daysSinceFetch / 30); // 1.0 at day 0, 0.1 at day 30
    const rankedScore = (data.impact_score ?? 0) * recencyDecay;

    feedItems.push({
      id: d.id,
      type: "signal",
      title: data.title,
      summary: data.summary,
      source_name: data.source_name,
      source_credibility: data.source_credibility ?? 0.5,
      impact_score: rankedScore,
      related_node_ids: data.related_node_ids ?? [],
      published_date: data.published_date,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Get milestone nodes (no date filter — include all milestones)
  const milestonesSnap = await getDb()
    .collection("nodes")
    .where("type", "==", "milestone")
    .get();

  milestonesSnap.forEach((d) => {
    const data = d.data();
    feedItems.push({
      id: `milestone-${d.id}`,
      type: "milestone",
      title: data.name,
      summary: data.description,
      impact_score: 1.0, // milestones always rank high
      related_node_ids: [],
      published_date: data.date,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Sort by impact_score descending
  feedItems.sort((a, b) => (b.impact_score as number) - (a.impact_score as number));

  // Write top 100 items
  const topItems = feedItems.slice(0, 100);
  if (topItems.length > 0) {
    await writeFeedItems(topItems);
  }

  return { itemsWritten: topItems.length };
}

// Scheduled: every 6 hours
export const scheduledFeedCurator = onSchedule(
  { schedule: "every 6 hours", memory: "256MiB", timeoutSeconds: 60 },
  async () => {
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("feed-curator").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Feed Curator is paused, skipping scheduled run");
      return;
    }
    await buildFeed();
  }
);

// Manual trigger / async call from approval functions
export const triggerFeedCurator = onCall(
  { memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    return await buildFeed();
  }
);
