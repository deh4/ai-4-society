import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const v3PopulateDiscoveryNodes = onRequest(
  { memory: "512MiB", timeoutSeconds: 540, secrets: [geminiApiKey] },
  async (_req, res) => {
    const db = getFirestore();

    // Find discovery-created nodes with missing fields
    const nodesSnap = await db.collection("nodes")
      .where("created_by", "==", "discovery-agent")
      .get();

    const incompleteNodes = nodesSnap.docs.filter((doc) => {
      const data = doc.data();
      return !data.summary || !data.deep_dive || data.score_2026 === undefined;
    });

    if (incompleteNodes.length === 0) {
      res.json({ success: true, populated: 0, message: "No incomplete discovery nodes found" });
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    let populated = 0;
    let totalTokensInput = 0;
    let totalTokensOutput = 0;

    for (const doc of incompleteNodes) {
      const data = doc.data();
      const nodeType = data.type as string;

      // Find supporting signals from the proposal that created this node
      const proposalsSnap = await db.collection("graph_proposals")
        .where("created_node_id", "==", doc.id)
        .limit(1)
        .get();
      const supportingSignalIds = proposalsSnap.empty
        ? []
        : (proposalsSnap.docs[0].data().supporting_signal_ids as string[]) ?? [];

      let signalContext = "";
      if (supportingSignalIds.length > 0) {
        const signalDocs = await Promise.all(
          supportingSignalIds.slice(0, 10).map((id) => db.doc(`signals/${id}`).get())
        );
        signalContext = signalDocs
          .filter((s) => s.exists)
          .map((s) => `- "${s.data()!.title}": ${s.data()!.summary}`)
          .join("\n");
      }

      const prompt = `Generate complete node data for this ${nodeType} in the AI 4 Society Observatory.

Node: ${data.name}
Description: ${data.description ?? ""}
Key Themes: ${JSON.stringify(data.key_themes ?? [])}
Why Novel: ${data.why_novel ?? ""}

Supporting Signals:
${signalContext || "No supporting signals available."}

Generate JSON with these fields:
{
  "summary": "<2-3 sentence public-facing summary>",
  "deep_dive": "<3-4 paragraphs of detailed analysis>",
  "score_2026": <0-100, current severity/adoption score>,
  "score_2035": <0-100, projected 2035 score>,
  ${nodeType === "risk" ? '"velocity": "Critical" | "High" | "Medium" | "Low",' : '"implementation_stage": "Research" | "Policy Debate" | "Pilot" | "Early Adoption" | "Scaling" | "Mainstream",'}
  "principles": ["P01", ...],
  "timeline_narrative": {
    "near_term": "<1-2 sentences, 2026-2030>",
    "mid_term": "<1-2 sentences, 2030-2040>",
    "long_term": "<1-2 sentences, 2040-2050>"
  }
}

PRINCIPLES to choose from (1-3 most relevant):
P01: Accountability, P02: Fairness, P03: Transparency, P04: Safety, P05: Privacy,
P06: Human Oversight, P07: Sustainability, P08: Wellbeing, P09: Democracy, P10: International Cooperation

Output valid JSON only. No markdown.`;

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const usage = result.response.usageMetadata;
        totalTokensInput += usage?.promptTokenCount ?? 0;
        totalTokensOutput += usage?.candidatesTokenCount ?? 0;

        const generated = JSON.parse(result.response.text());

        await doc.ref.update({
          summary: generated.summary ?? data.summary ?? "",
          deep_dive: generated.deep_dive ?? data.deep_dive ?? "",
          score_2026: generated.score_2026 ?? 50,
          score_2035: generated.score_2035 ?? 50,
          ...(nodeType === "risk"
            ? { velocity: generated.velocity ?? "Medium" }
            : { implementation_stage: generated.implementation_stage ?? "Research" }),
          principles: generated.principles ?? [],
          timeline_narrative: generated.timeline_narrative ?? { near_term: "", mid_term: "", long_term: "" },
          version: 1,
          lastUpdatedBy: "migration-v3",
        });

        populated++;
        logger.info(`Populated ${doc.id} (${data.name})`);
      } catch (err) {
        logger.error(`Failed to populate ${doc.id}:`, err);
      }
    }

    logger.info(`Migration complete: ${populated}/${incompleteNodes.length} nodes populated. Tokens: ${totalTokensInput}/${totalTokensOutput}`);
    res.json({ success: true, populated, total: incompleteNodes.length, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput });
  }
);
