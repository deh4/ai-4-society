import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface ApprovedSignal {
  id: string;
  title: string;
  summary: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface ProposedChange {
  current_value: unknown;
  proposed_value: unknown;
  reasoning: string;
}

export interface AssessmentResult {
  proposed_changes: Record<string, ProposedChange>;
  overall_reasoning: string;
  confidence: number;
  has_changes: boolean;
}

const CONFIDENCE_THRESHOLD = 0.6;

const RISK_FIELDS = [
  "score_2026", "score_2035", "velocity", "expert_severity", "public_perception",
  "who_affected", "summary", "deep_dive", "mitigation_strategies", "timeline_narrative",
];

const SOLUTION_FIELDS = [
  "adoption_score_2026", "adoption_score_2035", "implementation_stage",
  "key_players", "barriers", "summary", "deep_dive", "timeline_narrative",
];

function buildRiskPrompt(doc: Record<string, unknown>, signals: ApprovedSignal[]): string {
  const signalText = signals.length > 0
    ? signals.map((s) => `- [${s.id}] "${s.title}" (${s.source_name}, ${s.published_date}, ${s.severity_hint})\n  ${s.summary}`).join("\n")
    : "No recent signals for this risk.";

  return `CURRENT RISK DOCUMENT:
Name: ${doc.risk_name as string}
Score 2026: ${doc.score_2026 as number} | Score 2035: ${doc.score_2035 as number}
Velocity: ${doc.velocity as string}
Expert Severity: ${doc.expert_severity as number} | Public Perception: ${doc.public_perception as number}
Who Affected: ${JSON.stringify(doc.who_affected)}
Summary: ${doc.summary as string}
Deep Dive: ${doc.deep_dive as string}
Timeline: ${JSON.stringify(doc.timeline_narrative)}
Mitigation Strategies: ${JSON.stringify(doc.mitigation_strategies)}

RECENT SIGNALS (last 30 days):
${signalText}`;
}

function buildSolutionPrompt(
  doc: Record<string, unknown>,
  parentRisk: Record<string, unknown> | null,
  signals: ApprovedSignal[]
): string {
  const signalText = signals.length > 0
    ? signals.map((s) => `- [${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n  ${s.summary}`).join("\n")
    : "No recent signals for this solution.";

  const parentText = parentRisk
    ? `Parent Risk (${parentRisk.risk_name as string}): Score ${parentRisk.score_2026 as number}, Velocity ${parentRisk.velocity as string}`
    : "Parent risk not found.";

  return `CURRENT SOLUTION DOCUMENT:
Title: ${doc.solution_title as string}
Type: ${doc.solution_type as string}
Adoption Score 2026: ${doc.adoption_score_2026 as number} | 2035: ${doc.adoption_score_2035 as number}
Implementation Stage: ${doc.implementation_stage as string}
Key Players: ${JSON.stringify(doc.key_players)}
Barriers: ${JSON.stringify(doc.barriers)}
Summary: ${doc.summary as string}
Deep Dive: ${doc.deep_dive as string}
Timeline: ${JSON.stringify(doc.timeline_narrative)}

${parentText}

RECENT SIGNALS (last 30 days):
${signalText}`;
}

async function runAssessment(
  docType: "risk" | "solution",
  docText: string,
  allowedFields: string[],
  geminiApiKey: string
): Promise<AssessmentResult & { _tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const systemPrompt = `You are a validator for the AI 4 Society Observatory. Your job is to assess whether a ${docType} document's attributes still accurately reflect reality given recent evidence.

Proposable fields: ${allowedFields.join(", ")}

Rules:
- For scores (0–100): only propose changes if evidence clearly supports a shift; changes should be incremental (rarely >10 points)
- For velocity (risks): "Critical" | "High" | "Medium" | "Low"
- For implementation_stage (solutions): "Research" | "Policy Debate" | "Pilot Programs" | "Early Adoption" | "Scaling" | "Mainstream" — advance at most one stage
- For array fields (who_affected, key_players, barriers, mitigation_strategies): only propose additions, not removals
- For text fields (summary, deep_dive, timeline_narrative): only propose if content is meaningfully outdated
- If nothing needs to change, return has_changes: false

Respond with JSON:
{
  "has_changes": true | false,
  "confidence": <0.0–1.0>,
  "overall_reasoning": "<brief explanation>",
  "proposed_changes": {
    "<field>": {
      "current_value": <current value>,
      "proposed_value": <proposed value>,
      "reasoning": "<why this field should change>"
    }
  }
}

Only output valid JSON. No markdown. No explanation outside JSON.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: docText }] }],
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const usage = result.response.usageMetadata;
  const parsed = JSON.parse(result.response.text()) as AssessmentResult;

  return {
    ...parsed,
    _tokenUsage: {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    },
  };
}

export async function assessRisk(
  riskId: string,
  riskDoc: Record<string, unknown>,
  signals: ApprovedSignal[],
  geminiApiKey: string
): Promise<{ result: AssessmentResult | null; tokenUsage: { input: number; output: number } }> {
  try {
    const docText = buildRiskPrompt(riskDoc, signals);
    const assessment = await runAssessment("risk", docText, RISK_FIELDS, geminiApiKey);
    const { _tokenUsage: tokenUsage, ...result } = assessment;

    if (!result.has_changes || result.confidence < CONFIDENCE_THRESHOLD) {
      logger.info(`Validator: no changes needed for risk ${riskId} (confidence: ${result.confidence})`);
      return { result: null, tokenUsage };
    }
    return { result, tokenUsage };
  } catch (err) {
    logger.error(`Validator: failed to assess risk ${riskId}:`, err);
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }
}

export async function assessSolution(
  solutionId: string,
  solutionDoc: Record<string, unknown>,
  parentRisk: Record<string, unknown> | null,
  signals: ApprovedSignal[],
  geminiApiKey: string
): Promise<{ result: AssessmentResult | null; tokenUsage: { input: number; output: number } }> {
  try {
    const docText = buildSolutionPrompt(solutionDoc, parentRisk, signals);
    const assessment = await runAssessment("solution", docText, SOLUTION_FIELDS, geminiApiKey);
    const { _tokenUsage: tokenUsage, ...result } = assessment;

    if (!result.has_changes || result.confidence < CONFIDENCE_THRESHOLD) {
      logger.info(`Validator: no changes needed for solution ${solutionId} (confidence: ${result.confidence})`);
      return { result: null, tokenUsage };
    }
    return { result, tokenUsage };
  } catch (err) {
    logger.error(`Validator: failed to assess solution ${solutionId}:`, err);
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }
}
