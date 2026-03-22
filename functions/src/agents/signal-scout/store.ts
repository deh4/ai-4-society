import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClassifiedSignal } from "./classifier.js";

const BATCH_LIMIT = 500;

function computeImpactScore(
  sourceCredibility: number,
  confidenceScore: number,
  publishedDate: string,
): number {
  const pubMs = new Date(publishedDate).getTime();
  const daysSincePublished = Math.max(0, (Date.now() - pubMs) / (1000 * 60 * 60 * 24));
  const recencyDecay = Math.max(0.1, 1 - daysSincePublished / 30);
  return sourceCredibility * confidenceScore * recencyDecay;
}

export async function storeSignals(
  signals: ClassifiedSignal[],
  sourceCredibilityMap: Map<string, number>,
): Promise<number> {
  const db = getFirestore();
  const collection = db.collection("signals");

  const existingSnap = await collection.select("source_url").get();
  const existingUrls = new Set(
    existingSnap.docs.map((doc) => doc.data().source_url as string)
  );
  const newSignals = signals.filter((s) => !existingUrls.has(s.source_url));

  if (newSignals.length === 0) {
    logger.info("No new signals to store (all duplicates).");
    return 0;
  }

  let stored = 0;
  for (let i = 0; i < newSignals.length; i += BATCH_LIMIT) {
    const chunk = newSignals.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const signal of chunk) {
      const sourceCredibility = sourceCredibilityMap.get(signal.source_name) ?? 0.5;
      const impactScore = computeImpactScore(
        sourceCredibility,
        signal.confidence_score,
        signal.published_date,
      );

      const ref = collection.doc();
      const doc: Record<string, unknown> = {
        title: signal.title,
        summary: signal.summary,
        source_url: signal.source_url,
        source_name: signal.source_name,
        published_date: signal.published_date,
        signal_type: signal.signal_type,
        related_nodes: signal.related_nodes,
        related_node_ids: signal.related_node_ids,
        severity_hint: signal.severity_hint,
        affected_groups: signal.affected_groups,
        confidence_score: signal.confidence_score,
        source_credibility: sourceCredibility,
        impact_score: impactScore,
        status: "pending",
        fetched_at: FieldValue.serverTimestamp(),
      };

      // V3 fields: harm_status, principles, anti-recursion
      doc.harm_status = signal.harm_status ?? null;
      doc.principles = signal.principles ?? [];
      doc.classification_version = 1;
      doc.last_classified_by = "signal-classifier";
      doc.last_classified_at = FieldValue.serverTimestamp();
      doc.discovery_locked = false;

      if (signal.proposed_topic) {
        doc.proposed_topic = signal.proposed_topic;
      }

      batch.set(ref, doc);
    }

    await batch.commit();
    stored += chunk.length;
  }

  logger.info(`Stored ${stored} new signals.`);
  return stored;
}
