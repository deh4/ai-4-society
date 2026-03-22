// functions/src/migration/v3-populate-discovery-nodes.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

interface NodeFields {
  summary: string;
  deep_dive: string;
  score_2026: number;
  score_2035: number;
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  principles: string[];
  // risk-only
  velocity?: string;
  // solution-only
  implementation_stage?: string;
}

async function generateNodeFields(
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>,
  apiKey: string,
): Promise<NodeFields | null> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const name = (nodeData.name as string) ?? "";
  const description = (nodeData.description as string) ?? "";
  const keyThemes = (nodeData.key_themes as string[]) ?? [];
  const whyNovel = (nodeData.why_novel as string) ?? "";

  const isRisk = nodeType === "risk";
  const typeSpecificFields = isRisk
    ? `- "velocity": one of "Accelerating", "Steady", "Decelerating", or "Uncertain"`
    : `- "implementation_stage": one of "Concept", "Research", "Pilot", "Early Adoption", "Scaling", or "Mainstream"`;

  const systemPrompt = `You are an AI risk analyst for the AI 4 Society Observatory, an authoritative platform tracking AI risks and solutions.

Your task: given a ${nodeType} node's basic metadata, generate rich analytical content for all missing fields.

The observatory uses these ethical principles (P01-P10):
- P01: Transparency
- P02: Fairness & Non-Discrimination
- P03: Privacy & Data Protection
- P04: Safety & Security
- P05: Accountability
- P06: Human Oversight & Control
- P07: Beneficence & Non-Maleficence
- P08: Sustainability
- P09: Inclusivity & Access
- P10: Rule of Law & Governance

Respond with a single JSON object (no markdown, no explanation):
{
  "summary": "<2-3 sentence accessible summary of this ${nodeType}>",
  "deep_dive": "<3-4 paragraph in-depth analysis covering causes, mechanisms, implications, and trajectory>",
  "score_2026": <integer 0-100 representing ${isRisk ? "severity/likelihood" : "adoption likelihood"} by 2026>,
  "score_2035": <integer 0-100 representing ${isRisk ? "severity/likelihood" : "adoption likelihood"} by 2035>,
  ${typeSpecificFields},
  "timeline_narrative": {
    "near_term": "<1-2 sentences on developments in next 1-2 years>",
    "mid_term": "<1-2 sentences on developments in 3-5 years>",
    "long_term": "<1-2 sentences on developments in 5-10 years>"
  },
  "principles": [<array of relevant principle IDs from P01-P10, 2-5 most relevant>]
}`;

  const prompt = `NODE ID: ${nodeId}
TYPE: ${nodeType}
NAME: ${name}
DESCRIPTION: ${description}
KEY THEMES: ${keyThemes.join(", ")}
WHY NOVEL: ${whyNovel}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const usage = result.response.usageMetadata;
    logger.info(`v3PopulateDiscoveryNodes: node ${nodeId} — tokens in=${usage?.promptTokenCount ?? 0}, out=${usage?.candidatesTokenCount ?? 0}`);

    const parsed = JSON.parse(result.response.text()) as NodeFields;
    return parsed;
  } catch (err) {
    logger.error(`v3PopulateDiscoveryNodes: Gemini call failed for node ${nodeId}:`, err);
    return null;
  }
}

export const v3PopulateDiscoveryNodes = onRequest(
  {
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [geminiApiKey],
  },
  async (_req, res) => {
    const db = getFirestore();
    const apiKey = geminiApiKey.value();

    logger.info("v3PopulateDiscoveryNodes: querying discovery-created nodes with missing fields");

    // Query nodes created by discovery-agent
    const nodesSnap = await db
      .collection("nodes")
      .where("created_by", "==", "discovery-agent")
      .get();

    // Filter to only those missing one or more required fields
    const incomplete = nodesSnap.docs.filter((doc) => {
      const data = doc.data();
      return (
        data.summary === undefined ||
        data.deep_dive === undefined ||
        data.score_2026 === undefined
      );
    });

    logger.info(`v3PopulateDiscoveryNodes: ${nodesSnap.size} discovery nodes total, ${incomplete.length} incomplete`);

    const report = {
      total: nodesSnap.size,
      incomplete: incomplete.length,
      processed: 0,
      skipped: 0,
      errors: 0,
    };

    for (const doc of incomplete) {
      const nodeId = doc.id;
      const data = doc.data();
      const nodeType: string = (data.type as string) ?? "risk";

      logger.info(`v3PopulateDiscoveryNodes: processing node ${nodeId} (type: ${nodeType})`);

      const generated = await generateNodeFields(nodeId, nodeType, data, apiKey);

      if (!generated) {
        logger.warn(`v3PopulateDiscoveryNodes: skipping node ${nodeId} — Gemini returned null`);
        report.errors++;
        continue;
      }

      // Build the update payload
      const updates: Record<string, unknown> = {
        summary: generated.summary,
        deep_dive: generated.deep_dive,
        score_2026: generated.score_2026,
        score_2035: generated.score_2035,
        timeline_narrative: generated.timeline_narrative,
        principles: generated.principles,
        version: 1,
        lastUpdatedBy: "migration-v3",
      };

      if (nodeType === "risk" && generated.velocity !== undefined) {
        updates.velocity = generated.velocity;
      }
      if (nodeType === "solution" && generated.implementation_stage !== undefined) {
        updates.implementation_stage = generated.implementation_stage;
      }

      try {
        await db.collection("nodes").doc(nodeId).update(updates);
        report.processed++;
        logger.info(`v3PopulateDiscoveryNodes: updated node ${nodeId}`);
      } catch (err) {
        logger.error(`v3PopulateDiscoveryNodes: failed to write node ${nodeId}:`, err);
        report.errors++;
      }
    }

    logger.info("v3PopulateDiscoveryNodes complete", report);
    res.status(200).json({ success: true, ...report });
  }
);
