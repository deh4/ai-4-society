// functions/src/migration/v3-backfill-harm-status.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const BATCH_SIZE = 25;

const SYSTEM_PROMPT = `For each signal, determine harm_status:
- "incident": Describes an AI-related harm that HAS ALREADY OCCURRED (past tense, specific victims/damages)
- "hazard": Describes a PLAUSIBLE FUTURE harm or near-miss (warnings, "could lead to", vulnerability)
- null: Solution-focused or no specific harm described

Return a JSON array of objects: [{ "id": "signal_id", "harm_status": "incident" | "hazard" | null }]`;

interface HarmClassification {
  id: string;
  harm_status: "incident" | "hazard" | null;
}

export const v3BackfillHarmStatus = onRequest(
  {
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [geminiApiKey],
  },
  async (_req, res) => {
    const db = getFirestore();
    const apiKey = geminiApiKey.value();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    logger.info("v3BackfillHarmStatus: querying approved/edited signals missing harm_status");

    // Query all approved or edited signals
    const [approvedSnap, editedSnap] = await Promise.all([
      db.collection("signals").where("status", "==", "approved").get(),
      db.collection("signals").where("status", "==", "edited").get(),
    ]);

    // Merge and filter to those missing harm_status
    const allDocs = [...approvedSnap.docs, ...editedSnap.docs];
    const needsBackfill = allDocs.filter((doc) => {
      const data = doc.data();
      return data.harm_status === undefined || data.harm_status === null;
    });

    logger.info(
      `v3BackfillHarmStatus: ${allDocs.length} approved/edited signals total, ` +
      `${needsBackfill.length} missing harm_status`
    );

    const report = {
      total: allDocs.length,
      needsBackfill: needsBackfill.length,
      processed: 0,
      updated: 0,
      errors: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
      const batch = needsBackfill.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(needsBackfill.length / BATCH_SIZE);

      logger.info(`v3BackfillHarmStatus: processing batch ${batchNum}/${totalBatches} (${batch.length} signals)`);

      // Build prompt with signal id, title, and summary
      const signalList = batch
        .map((doc) => {
          const data = doc.data();
          const title = (data.title as string) ?? "(no title)";
          const summary = (data.summary as string) ?? "(no summary)";
          return `ID: ${doc.id}\nTitle: ${title}\nSummary: ${summary}`;
        })
        .join("\n\n");

      const prompt = `Classify the harm_status for each of these signals:\n\n${signalList}`;

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const usage = result.response.usageMetadata;
        const inputTokens = usage?.promptTokenCount ?? 0;
        const outputTokens = usage?.candidatesTokenCount ?? 0;
        report.totalInputTokens += inputTokens;
        report.totalOutputTokens += outputTokens;

        logger.info(
          `v3BackfillHarmStatus: batch ${batchNum} tokens — in=${inputTokens}, out=${outputTokens}`
        );

        const parsed: HarmClassification[] = JSON.parse(result.response.text());

        // Build a map for quick lookup
        const classificationMap = new Map<string, "incident" | "hazard" | null>();
        for (const item of parsed) {
          classificationMap.set(item.id, item.harm_status);
        }

        // Update each signal in the batch
        const firestoreBatch = db.batch();
        let batchUpdateCount = 0;

        for (const doc of batch) {
          const classification = classificationMap.get(doc.id);
          if (classification !== undefined) {
            firestoreBatch.update(doc.ref, { harm_status: classification });
            batchUpdateCount++;
          } else {
            logger.warn(`v3BackfillHarmStatus: no classification returned for signal ${doc.id}`);
          }
        }

        await firestoreBatch.commit();
        report.processed += batch.length;
        report.updated += batchUpdateCount;

        logger.info(
          `v3BackfillHarmStatus: batch ${batchNum} done — ${batchUpdateCount}/${batch.length} signals updated`
        );
      } catch (err) {
        logger.error(`v3BackfillHarmStatus: batch ${batchNum} failed:`, err);
        report.errors += batch.length;
      }
    }

    logger.info("v3BackfillHarmStatus complete", report);
    res.status(200).json({ success: true, ...report });
  }
);
