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
}

export interface EvalTopicInput {
  id: string;
  name: string;
  description: string;
  riskCategories: string[];
  velocity: string;
  signalCount: number;
}

export interface EvalRiskUpdateInput {
  id: string;
  riskId: string;
  riskName: string;
  scoreDelta: number;
  velocity: string;
  reasoning: string;
}

export interface EvalSolutionInput {
  id: string;
  solution_title: string;
  solution_type: string;
  parent_risk_id: string;
  adoption_score_2026: number;
  adoption_score_2035: number;
  implementation_stage: string;
  key_players: string[];
  barriers: string[];
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
}

export interface EvalParentRiskInput {
  id: string;
  risk_name: string;
  score_2026: number;
  velocity: string;
}

export interface SolutionEvaluation {
  adoption_score_2026: number;
  adoption_score_2035: number;
  implementation_stage: string;
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  newKeyPlayers: string[];
  newBarriers: string[];
  reasoning: string;
  confidence: number;
}

export interface EvalOutput {
  evaluation: SolutionEvaluation;
  tokenUsage: { input: number; output: number };
}

const VALID_STAGES = new Set([
  "Research",
  "Policy Debate",
  "Pilot Programs",
  "Early Adoption",
  "Scaling",
  "Mainstream",
]);

const SYSTEM_PROMPT = `You are a solution analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

You are evaluating a single AI solution based on new evidence (signals, topics, and risk updates for the parent risk). Your task is to propose updated adoption scores, implementation stage, timeline narrative, and identify new key players or barriers.

Adoption score scale: 0-100 (0 = no adoption, 100 = fully mainstream)
Valid implementation stages (in order): Research, Policy Debate, Pilot Programs, Early Adoption, Scaling, Mainstream

Rules:
- Scores should change incrementally. A single week's evidence rarely justifies a change of more than 10 points.
- Implementation stage should only change when there is strong, concrete evidence (e.g., a major pilot becoming general availability).
- If no strong evidence supports a change, keep scores and stage close to current values.
- For newKeyPlayers: only include genuinely new organizations/entities not already in key_players. Return empty array if none.
- For newBarriers: only include genuinely new barriers not already in barriers. Return empty array if none.
- For timeline_narrative: update the text to reflect new evidence. Keep the same style and structure but incorporate new developments. If no meaningful changes, return the current text unchanged.
- Provide clear reasoning for any changes.
- Confidence should reflect how certain you are about the proposed changes (0.0 to 1.0).

Output a single JSON object with these exact fields:
{
  "adoption_score_2026": <number 0-100>,
  "adoption_score_2035": <number 0-100>,
  "implementation_stage": "<valid stage>",
  "timeline_narrative": { "near_term": "<text>", "mid_term": "<text>", "long_term": "<text>" },
  "newKeyPlayers": ["<string>", ...],
  "newBarriers": ["<string>", ...],
  "reasoning": "<explanation>",
  "confidence": <0-1>
}

Only output valid JSON. No markdown fences. No explanation outside the JSON.`;

export async function evaluateSolution(
  solution: EvalSolutionInput,
  parentRisk: EvalParentRiskInput,
  signals: EvalSignalInput[],
  topics: EvalTopicInput[],
  riskUpdates: EvalRiskUpdateInput[],
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

  const riskUpdateList = riskUpdates
    .map(
      (r) =>
        `[${r.id}] Risk ${r.riskId} "${r.riskName}" (Score delta: ${r.scoreDelta >= 0 ? "+" : ""}${r.scoreDelta.toFixed(1)}, Velocity: ${r.velocity})\nReasoning: ${r.reasoning}`
    )
    .join("\n\n");

  const prompt = `Evaluate this solution based on new evidence:

SOLUTION: [${solution.id}] "${solution.solution_title}"
Type: ${solution.solution_type}
Parent Risk: [${solution.parent_risk_id}] "${parentRisk.risk_name}" (Score: ${parentRisk.score_2026}, Velocity: ${parentRisk.velocity})
Current adoption_score_2026: ${solution.adoption_score_2026}
Current adoption_score_2035: ${solution.adoption_score_2035}
Current implementation_stage: ${solution.implementation_stage}
Current key_players: ${solution.key_players.join(", ")}
Current barriers: ${solution.barriers.join(", ")}
Current timeline_narrative:
  Near-term: ${solution.timeline_narrative.near_term}
  Mid-term: ${solution.timeline_narrative.mid_term}
  Long-term: ${solution.timeline_narrative.long_term}

NEW SIGNALS (${signals.length}):
${signalList || "(none)"}

RELATED TOPICS (${topics.length}):
${topicList || "(none)"}

PARENT RISK UPDATES (${riskUpdates.length}):
${riskUpdateList || "(none)"}

Propose updated adoption scores, implementation stage, timeline narrative, and identify any new key players or barriers.`;

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
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).adoption_score_2026 !== "number" ||
      typeof (raw as Record<string, unknown>).adoption_score_2035 !== "number" ||
      typeof (raw as Record<string, unknown>).reasoning !== "string" ||
      typeof (raw as Record<string, unknown>).confidence !== "number"
    ) {
      throw new Error(`Invalid evaluation response structure for ${solution.id}`);
    }

    const r = raw as Record<string, unknown>;

    // Clamp scores to 0-100
    const clamp = (v: number) => Math.max(0, Math.min(100, v));

    // Validate implementation stage
    const proposedStage = typeof r.implementation_stage === "string" && VALID_STAGES.has(r.implementation_stage)
      ? r.implementation_stage
      : solution.implementation_stage;

    // Validate timeline narrative
    const rawNarrative = r.timeline_narrative as Record<string, unknown> | undefined;
    const timelineNarrative = {
      near_term: typeof rawNarrative?.near_term === "string" ? rawNarrative.near_term : solution.timeline_narrative.near_term,
      mid_term: typeof rawNarrative?.mid_term === "string" ? rawNarrative.mid_term : solution.timeline_narrative.mid_term,
      long_term: typeof rawNarrative?.long_term === "string" ? rawNarrative.long_term : solution.timeline_narrative.long_term,
    };

    // Filter new key players (must be strings, must not already exist)
    const existingPlayers = new Set(solution.key_players.map((p) => p.toLowerCase()));
    const newKeyPlayers = Array.isArray(r.newKeyPlayers)
      ? (r.newKeyPlayers as unknown[])
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .filter((p) => !existingPlayers.has(p.toLowerCase()))
      : [];

    // Filter new barriers (must be strings, must not already exist)
    const existingBarriers = new Set(solution.barriers.map((b) => b.toLowerCase()));
    const newBarriers = Array.isArray(r.newBarriers)
      ? (r.newBarriers as unknown[])
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .filter((b) => !existingBarriers.has(b.toLowerCase()))
      : [];

    const evaluation: SolutionEvaluation = {
      adoption_score_2026: clamp(r.adoption_score_2026 as number),
      adoption_score_2035: clamp(r.adoption_score_2035 as number),
      implementation_stage: proposedStage,
      timeline_narrative: timelineNarrative,
      newKeyPlayers,
      newBarriers,
      reasoning: r.reasoning as string,
      confidence: Math.max(0, Math.min(1, r.confidence as number)),
    };

    logger.info(
      `Evaluated ${solution.id}: adoption ${solution.adoption_score_2026} → ${evaluation.adoption_score_2026}, stage ${solution.implementation_stage} → ${evaluation.implementation_stage}`
    );

    return { evaluation, tokenUsage };
  } catch (err) {
    logger.error(`Gemini evaluation failed for ${solution.id}:`, err);
    throw err;
  }
}
