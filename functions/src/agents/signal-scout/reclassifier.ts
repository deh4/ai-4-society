import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

/**
 * Reclassify pending signals against a newly approved node.
 * Anti-recursion safeguards:
 * - Only targets signals with status: "pending" AND classification_version == 1
 * - Sets classification_version: 2 and discovery_locked: true after reclassification
 * - Never sets classification_version > 2
 */
export async function reclassifyPendingSignals(
  newNodeId: string,
  newNodeData: { type: string; name: string; description: string },
  apiKey: string
): Promise<{ reclassified: number; unchanged: number }> {
  const db = getFirestore();

  // Layer 1: Only pending, never-reclassified signals
  const snapshot = await db.collection("signals")
    .where("status", "==", "pending")
    .where("classification_version", "==", 1)
    .get();

  if (snapshot.empty) return { reclassified: 0, unchanged: 0 };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let reclassified = 0;
  let unchanged = 0;

  // Batch signals for efficiency (25 per call)
  const signals = snapshot.docs;
  const batches: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  for (let i = 0; i < signals.length; i += 25) {
    batches.push(signals.slice(i, i + 25));
  }

  for (const batch of batches) {
    const prompt = buildReclassificationPrompt(newNodeId, newNodeData, batch);

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      const assessments: Array<{ index: number; remap: boolean; relevance: number }> = JSON.parse(result.response.text());

      const writeBatch = db.batch();

      for (const assessment of assessments) {
        const signal = batch[assessment.index];
        if (!signal) continue;

        const updateData: Record<string, unknown> = {
          // Layer 2: Cap at version 2
          classification_version: 2,
          last_classified_by: `reclassifier-${newNodeId}`,
          last_classified_at: FieldValue.serverTimestamp(),
          // Layer 1: Lock from future discovery
          discovery_locked: true,
        };

        if (assessment.remap && assessment.relevance >= 0.7) {
          // Update related_nodes to include the new node
          updateData.related_node_ids = [...(signal.data().related_node_ids || []), newNodeId];
          updateData.related_nodes = [
            ...(signal.data().related_nodes || []),
            { node_id: newNodeId, node_type: newNodeData.type, relevance: assessment.relevance },
          ];
          // If was unmatched, upgrade to matched
          if (signal.data().signal_type === "unmatched") {
            updateData.signal_type = newNodeData.type === "risk" ? "risk" : "solution";
            updateData.proposed_topic = FieldValue.delete();
          }
          reclassified++;
        } else {
          unchanged++;
        }

        writeBatch.update(signal.ref, updateData);
      }

      await writeBatch.commit();
    } catch (err) {
      logger.error(`Reclassifier batch failed for node ${newNodeId}:`, err);
      // Still lock signals to prevent re-processing
      const writeBatch = db.batch();
      for (const signal of batch) {
        writeBatch.update(signal.ref, {
          classification_version: 2,
          last_classified_by: `reclassifier-${newNodeId}-error`,
          last_classified_at: FieldValue.serverTimestamp(),
          discovery_locked: true,
        });
        unchanged++;
      }
      await writeBatch.commit();
    }
  }

  logger.info(`Reclassifier for ${newNodeId}: ${reclassified} remapped, ${unchanged} unchanged`);
  return { reclassified, unchanged };
}

function buildReclassificationPrompt(
  nodeId: string,
  nodeData: { type: string; name: string; description: string },
  signals: FirebaseFirestore.QueryDocumentSnapshot[]
): string {
  return `A new ${nodeData.type} node was just added to the AI 4 Society Observatory:

ID: ${nodeId}
Name: ${nodeData.name}
Description: ${nodeData.description}

For each signal below, determine if this new node is a relevant match.
Respond with a JSON array:
[{ "index": 0, "remap": true/false, "relevance": 0.0-1.0 }]

Only set remap: true if relevance >= 0.7.

Signals:
${signals.map((s, i) => `[${i}] "${s.data().title}" — ${s.data().summary}`).join("\n\n")}

Output valid JSON array only. No markdown.`;
}
