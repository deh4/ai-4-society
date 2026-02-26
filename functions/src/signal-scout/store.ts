import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClassifiedSignal } from "./classifier.js";

export async function storeSignals(signals: ClassifiedSignal[]): Promise<number> {
  const db = getFirestore();
  const collection = db.collection("signals");

  // Get existing URLs for dedup
  const existingSnapshot = await collection.select("source_url").get();
  const existingUrls = new Set(
    existingSnapshot.docs.map((doc) => doc.data().source_url as string)
  );

  const newSignals = signals.filter((s) => !existingUrls.has(s.source_url));

  if (newSignals.length === 0) {
    logger.info("No new signals to store (all duplicates).");
    return 0;
  }

  // Write in batches of 500 (Firestore limit)
  const BATCH_LIMIT = 500;
  let stored = 0;

  for (let i = 0; i < newSignals.length; i += BATCH_LIMIT) {
    const chunk = newSignals.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const signal of chunk) {
      const ref = collection.doc();
      batch.set(ref, {
        title: signal.title,
        summary: signal.summary,
        source_url: signal.source_url,
        source_name: signal.source_name,
        published_date: signal.published_date,
        signal_type: signal.signal_type,       // NEW
        risk_categories: signal.risk_categories,
        solution_ids: signal.solution_ids,     // NEW
        severity_hint: signal.severity_hint,
        affected_groups: signal.affected_groups,
        confidence_score: signal.confidence_score,
        status: "pending",
        fetched_at: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    stored += chunk.length;
  }

  logger.info(`Stored ${stored} new signals.`);
  return stored;
}
