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

export interface TriageRiskUpdateInput {
  id: string;
  riskId: string;
  riskName: string;
  scoreDelta: number;
  velocity: string;
}

export interface TriageSolutionInput {
  id: string;
  title: string;
  parentRiskId: string;
  adoption_score_2026: number;
  implementation_stage: string;
}

export interface TriageResult {
  solutionId: string;
  reason: string;
  relevantSignalIds: string[];
  relevantTopicIds: string[];
  relevantRiskUpdateIds: string[];
}

export interface TriageOutput {
  flaggedSolutions: TriageResult[];
  tokenUsage: { input: number; output: number };
}

const SYSTEM_PROMPT = `You are a triage analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

You will receive:
1. A list of recently approved signals (news articles classified by AI risk category)
2. A list of recently identified topics (clustered signal themes with velocity data)
3. A list of recent risk updates (approved changes to risk scores/velocity)
4. A list of the 10 tracked AI solutions with their parent risk IDs, current adoption scores, and implementation stages

Your task: Identify which solutions have meaningful new evidence that warrants an adoption re-evaluation.

A solution should be flagged if:
- Its parent risk has a recent risk update (score or velocity changed)
- 2+ new signals relate to its domain (e.g., adoption news, new players, regulatory developments)
- A rising topic is strongly associated with its parent risk or solution domain
- Signals suggest adoption progress or new barriers (e.g., pilot program results, funding announcements)

Do NOT flag a solution if:
- It has 0-1 loosely related signals
- Only low-confidence or tangential evidence exists
- The signals merely confirm the existing adoption state without new information

For each flagged solution, provide:
- "solutionId": The solution ID (e.g., "S01")
- "reason": Brief explanation of why this solution needs re-evaluation (1-2 sentences)
- "relevantSignalIds": Array of signal IDs relevant to this solution
- "relevantTopicIds": Array of topic IDs relevant to this solution
- "relevantRiskUpdateIds": Array of risk update IDs relevant to this solution

Output a JSON array. If no solutions need updating, output an empty array [].
Only output valid JSON. No markdown fences. No explanation.`;

export async function triageSolutions(
  signals: TriageSignalInput[],
  topics: TriageTopicInput[],
  riskUpdates: TriageRiskUpdateInput[],
  solutions: TriageSolutionInput[],
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

  const riskUpdateList = riskUpdates
    .map((r) => `[${r.id}] Risk ${r.riskId} "${r.riskName}" (Score delta: ${r.scoreDelta >= 0 ? "+" : ""}${r.scoreDelta.toFixed(1)}, Velocity: ${r.velocity})`)
    .join("\n");

  const solutionList = solutions
    .map((s) => `[${s.id}] "${s.title}" (Parent risk: ${s.parentRiskId}, Adoption 2026: ${s.adoption_score_2026}, Stage: ${s.implementation_stage})`)
    .join("\n");

  const prompt = `Triage these inputs to identify which solutions need adoption re-evaluation:

SIGNALS (${signals.length}):
${signalList}

TOPICS (${topics.length}):
${topicList}

RECENT RISK UPDATES (${riskUpdates.length}):
${riskUpdateList}

CURRENT SOLUTIONS (${solutions.length}):
${solutionList}`;

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
    const validSolutionIds = new Set(solutions.map((s) => s.id));
    const validSignalIds = new Set(signals.map((s) => s.id));
    const validTopicIds = new Set(topics.map((t) => t.id));
    const validRiskUpdateIds = new Set(riskUpdates.map((r) => r.id));

    const flaggedSolutions = raw
      .filter(
        (t): t is Record<string, unknown> =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).solutionId === "string" &&
          validSolutionIds.has((t as Record<string, unknown>).solutionId as string) &&
          typeof (t as Record<string, unknown>).reason === "string"
      )
      .map((t) => ({
        solutionId: t.solutionId as string,
        reason: t.reason as string,
        relevantSignalIds: Array.isArray(t.relevantSignalIds)
          ? (t.relevantSignalIds as string[]).filter((id) => validSignalIds.has(id))
          : [],
        relevantTopicIds: Array.isArray(t.relevantTopicIds)
          ? (t.relevantTopicIds as string[]).filter((id) => validTopicIds.has(id))
          : [],
        relevantRiskUpdateIds: Array.isArray(t.relevantRiskUpdateIds)
          ? (t.relevantRiskUpdateIds as string[]).filter((id) => validRiskUpdateIds.has(id))
          : [],
      }));

    logger.info(`Triage: flagged ${flaggedSolutions.length} solutions out of ${solutions.length}`);

    return { flaggedSolutions, tokenUsage };
  } catch (err) {
    logger.error("Gemini solution triage failed:", err);
    throw err;
  }
}
