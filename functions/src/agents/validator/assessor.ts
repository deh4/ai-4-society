// functions/src/agents/validator/assessor.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface SignalInfo {
  id: string;
  title: string;
  summary: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
  signal_type: string; // "risk" | "solution" | "both"
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
  "score_2026", "score_2035", "velocity", "expert_severity",
  "summary", "deep_dive", "mitigation_strategies", "timeline_narrative",
];

const SOLUTION_FIELDS = [
  "adoption_score_2026", "adoption_score_2035", "implementation_stage",
  "key_players", "barriers", "summary", "deep_dive", "timeline_narrative",
];

function buildNodePrompt(
  nodeType: string,
  nodeData: Record<string, unknown>,
  signals: SignalInfo[],
): string {
  const signalText = signals.length > 0
    ? signals.map(
        (s) => `- [${s.id}] [${s.signal_type}] "${s.title}" (${s.source_name}, ${s.published_date}, ${s.severity_hint})\n  ${s.summary}`
      ).join("\n")
    : "No recent signals for this node.";

  if (nodeType === "risk") {
    return `CURRENT RISK NODE:
Name: ${nodeData.name as string}
Score 2026: ${nodeData.score_2026 ?? "N/A"} | Score 2035: ${nodeData.score_2035 ?? "N/A"}
Velocity: ${nodeData.velocity ?? "N/A"}
Expert Severity: ${nodeData.expert_severity ?? "N/A"}
Summary: ${nodeData.summary ?? ""}
Deep Dive: ${nodeData.deep_dive ?? ""}
Timeline: ${JSON.stringify(nodeData.timeline_narrative ?? {})}
Mitigation Strategies: ${JSON.stringify(nodeData.mitigation_strategies ?? [])}

RECENT SIGNALS (last 30 days):
${signalText}`;
  }

  if (nodeType === "solution") {
    return `CURRENT SOLUTION NODE:
Name: ${nodeData.name as string}
Type: ${nodeData.solution_type ?? "N/A"}
Adoption Score 2026: ${nodeData.adoption_score_2026 ?? "N/A"} | 2035: ${nodeData.adoption_score_2035 ?? "N/A"}
Implementation Stage: ${nodeData.implementation_stage ?? "N/A"}
Key Players: ${JSON.stringify(nodeData.key_players ?? [])}
Barriers: ${JSON.stringify(nodeData.barriers ?? [])}
Summary: ${nodeData.summary ?? ""}
Deep Dive: ${nodeData.deep_dive ?? ""}
Timeline: ${JSON.stringify(nodeData.timeline_narrative ?? {})}

RECENT SIGNALS (last 30 days):
${signalText}`;
  }

  // stakeholder and milestone — limited assessment
  return `CURRENT ${nodeType.toUpperCase()} NODE:
Name: ${nodeData.name as string}
Description: ${nodeData.description ?? ""}

RECENT SIGNALS (last 30 days):
${signalText}`;
}

async function runAssessment(
  nodeType: string,
  docText: string,
  allowedFields: string[],
  geminiApiKey: string,
): Promise<AssessmentResult & { _tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const systemPrompt = `You are a validator for the AI 4 Society Observatory. Your job is to assess whether a ${nodeType} node's attributes still accurately reflect reality given recent evidence.

Each signal is tagged with a type: [risk] = describes a harm or threat, [solution] = describes a countermeasure or mitigation, [both] = covers both a risk and a response. Use this context when weighing evidence:
- For RISK nodes: [risk] signals are direct evidence for severity/velocity changes. [solution] signals about this risk suggest mitigation is progressing — consider updating mitigation_strategies or moderating score increases. [both] signals inform both dimensions.
- For SOLUTION nodes: [solution] signals are direct evidence for adoption/stage changes. [risk] signals referencing this solution's domain suggest growing urgency — consider raising adoption projections. [both] signals inform both dimensions.

Proposable fields: ${allowedFields.join(", ")}

Rules:
- For scores (0–100): only propose changes if evidence clearly supports a shift; changes should be incremental (rarely >10 points)
- For velocity (risks): "Critical" | "High" | "Medium" | "Low"
- For implementation_stage (solutions): "Research" | "Policy Debate" | "Pilot" | "Early Adoption" | "Scaling" | "Mainstream" — advance at most one stage
- For array fields (key_players, barriers, mitigation_strategies): only propose additions, not removals
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

export async function assessNode(
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>,
  signals: SignalInfo[],
  geminiApiKey: string,
): Promise<{ result: AssessmentResult | null; tokenUsage: { input: number; output: number } }> {
  // Only assess risk and solution nodes — stakeholders and milestones
  // don't have scored fields worth validating automatically
  if (nodeType !== "risk" && nodeType !== "solution") {
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }

  const allowedFields = nodeType === "risk" ? RISK_FIELDS : SOLUTION_FIELDS;

  try {
    const docText = buildNodePrompt(nodeType, nodeData, signals);
    const assessment = await runAssessment(nodeType, docText, allowedFields, geminiApiKey);
    const { _tokenUsage: tokenUsage, ...result } = assessment;

    if (!result.has_changes || result.confidence < CONFIDENCE_THRESHOLD) {
      logger.info(`Validator: no changes needed for ${nodeType} ${nodeId} (confidence: ${result.confidence})`);
      return { result: null, tokenUsage };
    }
    return { result, tokenUsage };
  } catch (err) {
    logger.error(`Validator: failed to assess ${nodeType} ${nodeId}:`, err);
    return { result: null, tokenUsage: { input: 0, output: 0 } };
  }
}
