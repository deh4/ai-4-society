import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface TriageSignalInput {
  id: string;
  title: string;
  risk_categories: string[];
  severity_hint: string;
}

export interface TriageTopicInput {
  id: string;
  name: string;
  riskCategories: string[];
  velocity: string;
  signalCount: number;
}

export interface TriageRiskInput {
  id: string;
  name: string;
  score_2026: number;
  velocity: string;
}

export interface TriageResult {
  riskId: string;
  reason: string;
  relevantSignalIds: string[];
  relevantTopicIds: string[];
}

export interface TriageOutput {
  flaggedRisks: TriageResult[];
  tokenUsage: { input: number; output: number };
}

const SYSTEM_PROMPT = `You are a triage analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

You will receive:
1. A list of recently approved signals (news articles classified by AI risk category)
2. A list of recently identified topics (clustered signal themes with velocity data)
3. A list of the 10 tracked AI risks with their current scores and velocity

Your task: Identify which risks have meaningful new evidence that warrants a score re-evaluation.

A risk should be flagged if:
- It has 2+ new signals directly related to it
- A rising topic is strongly associated with it
- High-severity signals (Critical or Emerging) target it
- Signals suggest a velocity change (e.g., stable risk suddenly has urgent signals)

Do NOT flag a risk if:
- It has 0-1 loosely related signals
- Only low-confidence or tangential evidence exists
- The signals merely confirm the existing score without new information

For each flagged risk, provide:
- "riskId": The risk ID (e.g., "R01")
- "reason": Brief explanation of why this risk needs re-evaluation (1-2 sentences)
- "relevantSignalIds": Array of signal IDs that are relevant to this risk
- "relevantTopicIds": Array of topic IDs that are relevant to this risk

Output a JSON array. If no risks need updating, output an empty array [].
Only output valid JSON. No markdown fences. No explanation.`;

export async function triageRisks(
  signals: TriageSignalInput[],
  topics: TriageTopicInput[],
  risks: TriageRiskInput[],
  geminiApiKey: string
): Promise<TriageOutput> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const signalList = signals
    .map((s) => `[${s.id}] "${s.title}" (Risk: ${s.risk_categories.join(", ")}, Severity: ${s.severity_hint})`)
    .join("\n");

  const topicList = topics
    .map((t) => `[${t.id}] "${t.name}" (Risk: ${t.riskCategories.join(", ")}, Velocity: ${t.velocity}, ${t.signalCount} signals)`)
    .join("\n");

  const riskList = risks
    .map((r) => `[${r.id}] "${r.name}" (Score 2026: ${r.score_2026}, Velocity: ${r.velocity})`)
    .join("\n");

  const prompt = `Triage these inputs to identify which risks need score re-evaluation:

SIGNALS (${signals.length}):
${signalList}

TOPICS (${topics.length}):
${topicList}

CURRENT RISKS (${risks.length}):
${riskList}`;

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
    const tokenUsage = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };

    const text = result.response.text();
    const raw: unknown[] = JSON.parse(text);

    // Validate structure
    const validRiskIds = new Set(risks.map((r) => r.id));
    const validSignalIds = new Set(signals.map((s) => s.id));
    const validTopicIds = new Set(topics.map((t) => t.id));

    const flaggedRisks = raw
      .filter(
        (t): t is Record<string, unknown> =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).riskId === "string" &&
          validRiskIds.has((t as Record<string, unknown>).riskId as string) &&
          typeof (t as Record<string, unknown>).reason === "string" &&
          Array.isArray((t as Record<string, unknown>).relevantSignalIds)
      )
      .map((t) => ({
        riskId: t.riskId as string,
        reason: t.reason as string,
        relevantSignalIds: (t.relevantSignalIds as string[]).filter((id) => validSignalIds.has(id)),
        relevantTopicIds: Array.isArray(t.relevantTopicIds)
          ? (t.relevantTopicIds as string[]).filter((id) => validTopicIds.has(id))
          : [],
      }))
      .filter((t) => t.relevantSignalIds.length > 0);

    logger.info(`Triage: flagged ${flaggedRisks.length} risks out of ${risks.length}`);

    return { flaggedRisks, tokenUsage };
  } catch (err) {
    logger.error("Gemini triage failed:", err);
    throw err;
  }
}
