import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface SignalInput {
  id: string;
  title: string;
  summary: string;
  risk_categories: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface PreviousTopic {
  name: string;
  riskCategories: string[];
  velocity: string;
  signalCount: number;
}

export interface ClusteredTopic {
  name: string;
  description: string;
  riskCategories: string[];
  velocity: "rising" | "stable" | "declining";
  signalIds: string[];
}

export interface ClusteringResult {
  topics: ClusteredTopic[];
  tokenUsage: { input: number; output: number };
}

const RISK_TAXONOMY = `
Risk categories:
- R01: Systemic Algorithmic Discrimination
- R02: Privacy Erosion via Agentic AI
- R03: AI-Amplified Disinformation
- R04: Mass Labor Displacement
- R05: Autonomous Weapons & Conflict Escalation
- R06: AI Power Concentration & Oligopoly
- R07: Environmental Cost of AI
- R08: Loss of Human Agency & Cognitive Atrophy
- R09: AI-Enabled Mass Surveillance
- R10: Model Collapse & Data Scarcity
`;

const SYSTEM_PROMPT = `You are a topic analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

You will receive a list of recently approved signals (news articles classified by risk category) and optionally a list of topics identified in the previous analysis run.

Your task:
1. Group related signals into named topics (2-10 topics). A topic is a coherent theme or trend, e.g. "EU AI Act Enforcement Ramp-Up" or "Deepfake Election Interference Wave".
2. Each topic must have:
   - "name": A concise, descriptive name (3-8 words)
   - "description": 2-3 sentences explaining what this topic represents and why it matters
   - "riskCategories": Array of risk category IDs this topic relates to (e.g. ["R01", "R09"])
   - "velocity": Compare with previous topics if provided. "rising" if the topic is growing (more signals, higher severity), "stable" if similar, "declining" if fewer signals. If no previous topics exist, infer from signal dates and severity.
   - "signalIds": Array of signal IDs that belong to this topic
3. A signal can belong to multiple topics if relevant.
4. Signals that don't fit any coherent cluster should be omitted (not every signal needs a topic).
5. Only create a topic if it has at least 2 signals.

Only output valid JSON array. No markdown fences. No explanation.`;

export async function clusterSignals(
  signals: SignalInput[],
  previousTopics: PreviousTopic[],
  geminiApiKey: string
): Promise<ClusteringResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const signalList = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\nRisk: ${s.risk_categories.join(", ")} | Severity: ${s.severity_hint}\nSummary: ${s.summary}`
    )
    .join("\n\n");

  let prompt = `Cluster these ${signals.length} signals into topics:\n\n${signalList}`;

  if (previousTopics.length > 0) {
    const prevList = previousTopics
      .map(
        (t) =>
          `- "${t.name}" (${t.riskCategories.join(", ")}, velocity: ${t.velocity}, ${t.signalCount} signals)`
      )
      .join("\n");
    prompt += `\n\nPrevious topics for velocity comparison:\n${prevList}`;
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: SYSTEM_PROMPT,
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

    const text = result.response.text();
    const raw: unknown[] = JSON.parse(text);

    // Validate structure: filter malformed entries and invalid signalIds
    const validSignalIds = new Set(signals.map((s) => s.id));
    const VALID_VELOCITIES = new Set(["rising", "stable", "declining"]);

    const validTopics = raw
      .filter(
        (t): t is Record<string, unknown> =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).name === "string" &&
          typeof (t as Record<string, unknown>).description === "string" &&
          Array.isArray((t as Record<string, unknown>).riskCategories) &&
          Array.isArray((t as Record<string, unknown>).signalIds) &&
          VALID_VELOCITIES.has(String((t as Record<string, unknown>).velocity))
      )
      .map((t) => ({
        name: t.name as string,
        description: t.description as string,
        riskCategories: t.riskCategories as string[],
        velocity: t.velocity as "rising" | "stable" | "declining",
        signalIds: (t.signalIds as string[]).filter((id) => validSignalIds.has(id)),
      }))
      .filter((t) => t.signalIds.length >= 2);

    logger.info(`Clustered ${signals.length} signals into ${validTopics.length} topics`);

    return { topics: validTopics, tokenUsage };
  } catch (err) {
    logger.error("Gemini clustering failed:", err);
    throw err;
  }
}
