import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const v3BackfillHarmStatus = onRequest(
  { memory: "512MiB", timeoutSeconds: 540, secrets: [geminiApiKey] },
  async (_req, res) => {
    const db = getFirestore();

    // Find approved/edited signals without harm_status
    const signalsSnap = await db.collection("signals")
      .where("status", "in", ["approved", "edited"])
      .get();

    const needsBackfill = signalsSnap.docs.filter((doc) => {
      const data = doc.data();
      return data.harm_status === null || data.harm_status === undefined;
    });

    if (needsBackfill.length === 0) {
      res.json({ success: true, backfilled: 0, message: "No signals need harm_status backfill" });
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let backfilled = 0;
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    const BATCH_SIZE = 25;

    for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
      const batch = needsBackfill.slice(i, i + BATCH_SIZE);

      const signalList = batch.map((doc, idx) => {
        const data = doc.data();
        return `[${idx}] "${data.title}" — ${data.summary}`;
      }).join("\n\n");

      const prompt = `For each signal, determine harm_status:
- "incident": Describes an AI-related harm that HAS ALREADY OCCURRED (past tense, specific victims/damages)
- "hazard": Describes a PLAUSIBLE FUTURE harm or near-miss (warnings, "could lead to", vulnerability)
- null: Solution-focused or no specific harm described

Signals:
${signalList}

Respond with JSON array: [{ "index": 0, "harm_status": "incident" | "hazard" | null }]
Output valid JSON array only. No markdown.`;

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const usage = result.response.usageMetadata;
        totalTokensInput += usage?.promptTokenCount ?? 0;
        totalTokensOutput += usage?.candidatesTokenCount ?? 0;

        const assessments: Array<{ index: number; harm_status: "incident" | "hazard" | null }> =
          JSON.parse(result.response.text());

        const writeBatch = db.batch();
        for (const assessment of assessments) {
          const doc = batch[assessment.index];
          if (!doc) continue;

          const validStatuses = new Set(["incident", "hazard"]);
          const harmStatus = assessment.harm_status && validStatuses.has(assessment.harm_status)
            ? assessment.harm_status
            : null;

          writeBatch.update(doc.ref, { harm_status: harmStatus });
          backfilled++;
        }
        await writeBatch.commit();

        logger.info(`Backfilled batch ${Math.floor(i / BATCH_SIZE) + 1}: ${assessments.length} signals`);
      } catch (err) {
        logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
      }
    }

    logger.info(`Backfill complete: ${backfilled}/${needsBackfill.length} signals. Tokens: ${totalTokensInput}/${totalTokensOutput}`);
    res.json({ success: true, backfilled, total: needsBackfill.length, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput });
  }
);
