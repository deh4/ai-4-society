import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface EvalSignalInput {
  id: string;
  title: string;
  summary: string;
  risk_categories: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
  source_url?: string;
}

export interface EvalTopicInput {
  id: string;
  name: string;
  description: string;
  riskCategories: string[];
  velocity: string;
  signalCount: number;
}

export interface EvalRiskInput {
  id: string;
  risk_name: string;
  score_2026: number;
  score_2035: number;
  velocity: string;
  expert_severity: number;
  public_perception: number;
  signalEvidenceCount: number;
}

export interface RiskEvaluation {
  score_2026: number;
  score_2035: number;
  velocity: "Critical" | "High" | "Medium" | "Low";
  expert_severity: number;
  public_perception: number;
  reasoning: string;
  confidence: number;
  newSignalEvidence: Array<{
    signalId: string;
    date: string;
    headline: string;
    source: string;
    url?: string;
  }>;
}

export interface EvalOutput {
  evaluation: RiskEvaluation;
  tokenUsage: { input: number; output: number };
}

const SYSTEM_PROMPT = `You are a risk analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

You are evaluating a single AI risk based on new evidence (signals and topics). Your task is to propose updated scores and velocity.

Scoring methodology (weighted factors):
- Signal frequency (20%): How many new signals relate to this risk
- Signal severity (30%): The severity level of incoming signals (Critical > Emerging > Horizon)
- Expert consensus (25%): Based on the type and authority of sources reporting
- Public awareness gap (15%): Gap between expert_severity and public_perception — larger gaps are more dangerous
- Trend velocity (10%): Whether the topic velocity is rising, stable, or declining

Score scale: 0-100 for score_2026, score_2035, expert_severity, public_perception
Velocity options: "Critical" (imminent, high-impact), "High" (fast-moving), "Medium" (moderate pace), "Low" (slow-developing)

Rules:
- Scores should change incrementally. A single day's evidence rarely justifies a change of more than 5 points.
- If no strong evidence supports a change, keep scores close to current values.
- Provide clear reasoning for any score changes.
- Confidence should reflect how certain you are about the proposed changes (0.0 to 1.0).
- For newSignalEvidence, include only signals that directly support this risk's evaluation.

Output a single JSON object (not an array). Only output valid JSON. No markdown fences.`;

export async function evaluateRisk(
  risk: EvalRiskInput,
  signals: EvalSignalInput[],
  topics: EvalTopicInput[],
  geminiApiKey: string
): Promise<EvalOutput> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const signalList = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\nSeverity: ${s.severity_hint} | Risk: ${s.risk_categories.join(", ")}\nSummary: ${s.summary}`
    )
    .join("\n\n");

  const topicList = topics
    .map(
      (t) =>
        `[${t.id}] "${t.name}" (Velocity: ${t.velocity}, ${t.signalCount} signals)\n${t.description}`
    )
    .join("\n\n");

  const prompt = `Evaluate this risk based on new evidence:

RISK: [${risk.id}] "${risk.risk_name}"
Current scores: score_2026=${risk.score_2026}, score_2035=${risk.score_2035}
Current velocity: ${risk.velocity}
Current expert_severity: ${risk.expert_severity}, public_perception: ${risk.public_perception}
Existing signal evidence count: ${risk.signalEvidenceCount}

NEW SIGNALS (${signals.length}):
${signalList}

RELATED TOPICS (${topics.length}):
${topicList}

Propose updated scores, velocity, and list which signals should be added as evidence.`;

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
    const raw: unknown = JSON.parse(text);

    // Validate structure
    const VALID_VELOCITIES = new Set(["Critical", "High", "Medium", "Low"]);
    const validSignalIds = new Set(signals.map((s) => s.id));

    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).score_2026 !== "number" ||
      typeof (raw as Record<string, unknown>).score_2035 !== "number" ||
      !VALID_VELOCITIES.has(String((raw as Record<string, unknown>).velocity)) ||
      typeof (raw as Record<string, unknown>).reasoning !== "string" ||
      typeof (raw as Record<string, unknown>).confidence !== "number"
    ) {
      throw new Error(`Invalid evaluation response structure for ${risk.id}`);
    }

    const r = raw as Record<string, unknown>;

    // Validate and filter signal evidence
    const rawEvidence = Array.isArray(r.newSignalEvidence) ? (r.newSignalEvidence as Record<string, unknown>[]) : [];
    const validEvidence = rawEvidence
      .filter(
        (e) =>
          typeof e.signalId === "string" &&
          validSignalIds.has(e.signalId) &&
          typeof e.headline === "string"
      )
      .map((e) => ({
        signalId: e.signalId as string,
        date: typeof e.date === "string" ? e.date : new Date().toISOString().slice(0, 10),
        headline: e.headline as string,
        source: typeof e.source === "string" ? e.source : "",
        ...(typeof e.url === "string" ? { url: e.url } : {}),
      }));

    // Clamp scores to 0-100
    const clamp = (v: number) => Math.max(0, Math.min(100, v));

    const evaluation: RiskEvaluation = {
      score_2026: clamp(r.score_2026 as number),
      score_2035: clamp(r.score_2035 as number),
      velocity: r.velocity as "Critical" | "High" | "Medium" | "Low",
      expert_severity: clamp(typeof r.expert_severity === "number" ? r.expert_severity : risk.expert_severity),
      public_perception: clamp(typeof r.public_perception === "number" ? r.public_perception : risk.public_perception),
      reasoning: r.reasoning as string,
      confidence: Math.max(0, Math.min(1, r.confidence as number)),
      newSignalEvidence: validEvidence,
    };

    logger.info(`Evaluated ${risk.id}: score ${risk.score_2026} → ${evaluation.score_2026}, velocity ${risk.velocity} → ${evaluation.velocity}`);

    return { evaluation, tokenUsage };
  } catch (err) {
    logger.error(`Gemini evaluation failed for ${risk.id}:`, err);
    throw err;
  }
}
