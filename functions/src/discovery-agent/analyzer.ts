import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface RegistryItem {
  id: string;
  name: string;
  description: string;
}

export interface ApprovedSignal {
  id: string;
  title: string;
  summary: string;
  signal_type: string;
  risk_categories: string[];
  solution_ids: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface DiscoveryProposal {
  type: "new_risk" | "new_solution";
  proposed_name: string;
  description: string;
  why_novel: string;
  key_themes: string[];
  supporting_signal_ids: string[];
  suggested_parent_risk_id?: string;
}

export interface DiscoveryResult {
  proposals: DiscoveryProposal[];
  tokenUsage: { input: number; output: number };
}

const MIN_SUPPORTING_SIGNALS = 3;

export async function analyzeSignals(
  signals: ApprovedSignal[],
  risks: RegistryItem[],
  solutions: RegistryItem[],
  geminiApiKey: string
): Promise<DiscoveryResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const registryText = [
    "EXISTING RISKS:",
    ...risks.map((r) => `- ${r.id}: ${r.name} — ${r.description}`),
    "",
    "EXISTING SOLUTIONS:",
    ...solutions.map((s) => `- ${s.id}: ${s.name} — ${s.description}`),
  ].join("\n");

  const signalText = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
        `Type: ${s.signal_type} | Risk: ${s.risk_categories.join(",")} | Solution: ${s.solution_ids.join(",")}\n` +
        `Summary: ${s.summary}`
    )
    .join("\n\n");

  const systemPrompt = `You are a discovery analyst for the AI 4 Society Observatory.

Your task: given a body of approved signals and the existing risk/solution registry, identify patterns that suggest a genuinely NEW topic not covered by any existing entry.

Rules for a valid proposal:
- The topic must NOT be a sub-variant or reframing of an existing entry
- It must be supported by at least ${MIN_SUPPORTING_SIGNALS} signals from the list
- It must represent a distinct societal risk or countermeasure
- Do NOT propose if the topic clearly maps to an existing R or S code

For new_solution proposals, suggest the most relevant existing risk as suggested_parent_risk_id (or omit if unclear).

Respond with a JSON array of proposals (can be empty []):
{
  "type": "new_risk" | "new_solution",
  "proposed_name": "<concise name>",
  "description": "<2-3 sentence description of the topic>",
  "why_novel": "<1-2 sentences explaining why this is not covered by existing entries>",
  "key_themes": ["<theme1>", "<theme2>"],
  "supporting_signal_ids": ["<id1>", "<id2>", ...],
  "suggested_parent_risk_id": "<R01-R10 or omit>"
}

Only output valid JSON array. No markdown. No explanation outside the JSON.`;

  const prompt = `${registryText}\n\nAPPROVED SIGNALS (last 30 days):\n\n${signalText}`;

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
    const tokenUsage = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };

    const parsed: DiscoveryProposal[] = JSON.parse(result.response.text());

    // Filter: minimum supporting signals
    const validSignalIds = new Set(signals.map((s) => s.id));
    const filtered = parsed.filter((p) => {
      const validRefs = p.supporting_signal_ids.filter((id) => validSignalIds.has(id));
      if (validRefs.length < MIN_SUPPORTING_SIGNALS) {
        logger.info(`Discovery: dropping "${p.proposed_name}" — only ${validRefs.length} valid signal refs`);
        return false;
      }
      p.supporting_signal_ids = validRefs; // keep only valid refs
      return true;
    });

    logger.info(`Discovery: ${parsed.length} proposals from Gemini, ${filtered.length} passed signal threshold`);
    return { proposals: filtered, tokenUsage };
  } catch (err) {
    logger.error("Discovery Agent Gemini call failed:", err);
    return { proposals: [], tokenUsage: { input: 0, output: 0 } };
  }
}
