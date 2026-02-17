import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClusteredTopic } from "./clusterer.js";

export async function storeTopics(
  topics: ClusteredTopic[],
  signalDates: Map<string, FirebaseFirestore.Timestamp>,
  runId: string
): Promise<number> {
  if (topics.length === 0) {
    logger.info("No topics to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const topic of topics) {
    const ref = db.collection("topics").doc();

    // Find earliest signal date for firstSeenAt
    let earliestTimestamp: FirebaseFirestore.Timestamp | null = null;
    for (const signalId of topic.signalIds) {
      const ts = signalDates.get(signalId);
      if (ts && (!earliestTimestamp || ts.toMillis() < earliestTimestamp.toMillis())) {
        earliestTimestamp = ts;
      }
    }

    batch.set(ref, {
      name: topic.name,
      description: topic.description,
      riskCategories: topic.riskCategories,
      velocity: topic.velocity,
      signalCount: topic.signalIds.length,
      signalIds: topic.signalIds,
      firstSeenAt: earliestTimestamp ?? FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "topic-tracker",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${topics.length} topics.`);
  return topics.length;
}
