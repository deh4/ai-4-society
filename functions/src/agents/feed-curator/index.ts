import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { generateEditorialImage } from "./generateImage.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getDb,
  FieldValue,
  writeFeedItems,
  deleteCollection,
} from "../../shared/firestore.js";
import { writeAgentRunSummary } from "../../usage-monitor.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const MAX_HOOKS = 15;
const HOOKS_PER_RUN = 5;

async function generateEditorialHooks(
  topItems: Array<{ id: string } & Record<string, unknown>>,
  apiKey: string,
) {
  const db = getDb();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let generated = 0;
  for (const item of topItems) {
    if (generated >= HOOKS_PER_RUN) break;

    const hookRef = db.collection("editorial_hooks").doc(item.id as string);
    const existing = await hookRef.get();
    if (existing.exists) continue; // Never overwrite existing hooks

    const prompt = `You are writing a one-sentence editorial hook for a general audience. Given this news signal about AI risks or solutions, explain what it means for ordinary people in plain, urgent language. No jargon. No hedging.

Signal: "${item.title as string}"
Source: ${item.source_name as string}

Respond with ONLY the one-sentence hook. No quotes, no prefix.`;

    try {
      const result = await model.generateContent(prompt);
      const hookText = result.response.text().trim();

      await hookRef.set({
        signal_id: item.id,
        signal_title: item.title,
        hook_text: hookText,
        status: "pending",
        related_node_ids: item.related_node_ids ?? [],
        impact_score: item.impact_score ?? 0,
        source_name: item.source_name ?? "",
        source_credibility: item.source_credibility ?? 0.5,
        published_date: item.published_date ?? "",
        image_url: item.image_url ?? null,
        generated_at: FieldValue.serverTimestamp(),
        reviewed_by: null,
        reviewed_at: null,
      });

      generated++;
      logger.info(`Editorial hook generated for: ${item.title}`);
    } catch (err) {
      logger.warn(`Failed to generate editorial hook for ${item.id}:`, err);
    }
  }

  return generated;
}

/**
 * Circular buffer cleanup: keep max 15 hooks total.
 * - Delete rejected hooks immediately
 * - If still over limit, delete oldest by generated_at (pending first, then approved)
 */
async function purgeOldHooks() {
  const db = getDb();
  const hooksSnap = await db
    .collection("editorial_hooks")
    .orderBy("generated_at", "desc")
    .get();

  const toDelete: string[] = [];

  // Phase 1: always delete rejected hooks
  const nonRejected: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  hooksSnap.docs.forEach((doc) => {
    if (doc.data().status === "rejected") {
      toDelete.push(doc.id);
    } else {
      nonRejected.push(doc);
    }
  });

  // Phase 2: if still over limit, trim oldest (pending before approved)
  if (nonRejected.length > MAX_HOOKS) {
    // Sort: approved first (keep), pending last (expendable), then by generated_at desc
    const sorted = [...nonRejected].sort((a, b) => {
      const aApproved = a.data().status === "approved" ? 0 : 1;
      const bApproved = b.data().status === "approved" ? 0 : 1;
      if (aApproved !== bApproved) return aApproved - bApproved;
      // Within same status, newest first
      const aTime = a.data().generated_at?.toMillis?.() ?? 0;
      const bTime = b.data().generated_at?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    // Keep first MAX_HOOKS, delete the rest
    for (let i = MAX_HOOKS; i < sorted.length; i++) {
      toDelete.push(sorted[i].id);
    }
  }

  // Execute deletes
  for (const id of toDelete) {
    await db.collection("editorial_hooks").doc(id).delete();
    logger.info(`Purged editorial hook: ${id}`);
  }

  return toDelete.length;
}

async function buildFeed(apiKey: string) {
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
      image_url: data.image_url ?? null,
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

  // Generate editorial hooks for top approved signals that don't have hooks yet
  const signals = topItems.filter((item) => item.type === "signal");
  let hooksGenerated = 0;
  if (signals.length > 0 && apiKey) {
    hooksGenerated = await generateEditorialHooks(signals, apiKey);
  }

  // Circular buffer: purge oldest hooks beyond MAX_HOOKS, rejected hooks immediately
  const hooksPurged = await purgeOldHooks();

  return { itemsWritten: topItems.length, hooksGenerated, hooksPurged };
}

// Scheduled: every 6 hours
export const scheduledFeedCurator = onSchedule(
  { schedule: "every 6 hours", memory: "256MiB", timeoutSeconds: 60, secrets: [geminiApiKey] },
  async () => {
    const startedAt = new Date();
    const db = getFirestore();
    const configSnap = await db.collection("agents").doc("feed-curator").collection("config").doc("current").get();
    if (configSnap.exists && configSnap.data()?.paused === true) {
      logger.info("Feed Curator is paused, skipping scheduled run");
      return;
    }
    try {
      const result = await buildFeed(geminiApiKey.value());
      await writeAgentRunSummary({
        agentId: "feed-curator",
        startedAt,
        outcome: "success",
        error: null,
        modelId: "none",
        memoryMiB: 256,
        metrics: {
          articlesFetched: 0,
          signalsStored: result.itemsWritten,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 2,
          firestoreWrites: result.itemsWritten,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Feed Curator failed:", msg);
      await writeAgentRunSummary({
        agentId: "feed-curator",
        startedAt,
        outcome: "error",
        error: msg,
        modelId: "none",
        memoryMiB: 256,
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
        sourcesUsed: [],
      });
      throw err;
    }
  }
);

// One-off backfill: generate images for existing approved hooks without images
export const backfillEditorialImages = onCall(
  { memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    const db = getDb();
    const snap = await db
      .collection("editorial_hooks")
      .where("status", "==", "approved")
      .get();

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.image_url) { skipped++; continue; }
      try {
        const url = await generateEditorialImage(
          doc.id,
          data.signal_title as string,
          data.hook_text as string,
        );
        if (url) { generated++; } else { failed++; }
      } catch (err) {
        logger.warn(`Backfill failed for ${doc.id}:`, err);
        failed++;
      }
    }
    logger.info(`Backfill complete: ${generated} generated, ${skipped} skipped, ${failed} failed`);
    return { generated, skipped, failed };
  }
);

// Manual trigger / async call from approval functions
export const triggerFeedCurator = onCall(
  { memory: "256MiB", timeoutSeconds: 60, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    return await buildFeed(geminiApiKey.value());
  }
);

// Triggered when an editorial hook is approved without an image
export const onEditorialHookApproved = onDocumentUpdated(
  {
    document: "editorial_hooks/{hookId}",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only trigger when status changes to "approved" and no image_url exists
    if (before.status !== "approved" && after.status === "approved" && !after.image_url) {
      logger.info(`Editorial hook ${event.params.hookId} approved without image, generating...`);
      await generateEditorialImage(
        event.params.hookId,
        after.signal_title as string,
        after.hook_text as string,
      );
    }
  }
);
