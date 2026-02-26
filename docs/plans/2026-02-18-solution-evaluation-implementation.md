# Solution Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Solution Evaluation agent — a weekly two-stage Cloud Function that triages which solutions have new evidence from signals, topics, and risk updates, evaluates adoption score / stage / narrative changes per solution, and writes proposed updates to a `solution_updates` staging collection for admin review.

**Architecture:** Two-stage Gemini pipeline: Stage 1 (triage) identifies which of the 10 solutions have meaningful new signals/topics/risk updates. Stage 2 (per-solution evaluation) produces proposed adoption scores, implementation stage, timeline narrative, new key players/barriers for each flagged solution. Proposed updates go to `solution_updates/` where admins approve/reject before changes reach the public `solutions/` collection.

**Tech Stack:** Firebase Cloud Functions v2, Gemini 2.0 Flash (`@google/generative-ai`), Firestore, React 19, TypeScript

---

## Task 1: Firestore Rules + Indexes

**Files:**
- Modify: `firestore.rules:9-12` (add admin write to solutions)
- Modify: `firestore.rules:59` (add solution_updates rule after risk_updates)
- Modify: `firestore.indexes.json` (add solution_updates index)

**Step 1: Update solutions security rule to allow admin writes**

In `firestore.rules`, change the solutions block (lines 9-12) from:

```
    match /solutions/{solutionId} {
      allow read: if true;
      allow write: if false;
    }
```

to:

```
    match /solutions/{solutionId} {
      allow read: if true;
      allow write: if isAdmin();
    }
```

**Step 2: Add solution_updates security rule**

In `firestore.rules`, add this block after the `risk_updates` rule (after line 59):

```
    // Solution updates: admin read + write (approve/reject staging collection)
    match /solution_updates/{updateId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
```

**Step 3: Add solution_updates composite index**

In `firestore.indexes.json`, add to the `indexes` array (after the risk_updates index):

```json
{
  "collectionGroup": "solution_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Step 4: Validate rules**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx firebase-tools deploy --only firestore:rules --project ai-4-society 2>&1 | tail -5`
Expected: `Deploy complete!`

**Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(solution-evaluation): add Firestore rules and indexes for solution_updates"
```

---

## Task 2: Solution Evaluation Triage (Stage 1 Gemini)

**Files:**
- Create: `functions/src/solution-evaluation/triage.ts`

**Step 1: Create the triage module**

Create `functions/src/solution-evaluation/triage.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add functions/src/solution-evaluation/triage.ts
git commit -m "feat(solution-evaluation): add Stage 1 Gemini triage module"
```

---

## Task 3: Solution Evaluation Evaluator (Stage 2 Gemini)

**Files:**
- Create: `functions/src/solution-evaluation/evaluator.ts`

**Step 1: Create the evaluator module**

Create `functions/src/solution-evaluation/evaluator.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add functions/src/solution-evaluation/evaluator.ts
git commit -m "feat(solution-evaluation): add Stage 2 per-solution Gemini evaluation module"
```

---

## Task 4: Solution Update Store (Firestore Writer)

**Files:**
- Create: `functions/src/solution-evaluation/store.ts`

**Step 1: Create the store module**

Create `functions/src/solution-evaluation/store.ts`:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { SolutionEvaluation, EvalSolutionInput } from "./evaluator.js";

export interface SolutionUpdateInput {
  solution: EvalSolutionInput;
  evaluation: SolutionEvaluation;
  topicIds: string[];
  riskUpdateIds: string[];
  signalCount: number;
}

export async function storeSolutionUpdates(
  updates: SolutionUpdateInput[],
  runId: string
): Promise<number> {
  if (updates.length === 0) {
    logger.info("No solution updates to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const update of updates) {
    const ref = db.collection("solution_updates").doc();
    const scoreDelta = Math.abs(
      update.evaluation.adoption_score_2026 - update.solution.adoption_score_2026
    );
    const stageChanged =
      update.evaluation.implementation_stage !== update.solution.implementation_stage;

    batch.set(ref, {
      solutionId: update.solution.id,
      solutionTitle: update.solution.solution_title,
      parentRiskId: update.solution.parent_risk_id,
      status: "pending",
      proposedChanges: {
        adoption_score_2026: update.evaluation.adoption_score_2026,
        adoption_score_2035: update.evaluation.adoption_score_2035,
        implementation_stage: update.evaluation.implementation_stage,
        timeline_narrative: update.evaluation.timeline_narrative,
      },
      newKeyPlayers: update.evaluation.newKeyPlayers,
      newBarriers: update.evaluation.newBarriers,
      currentValues: {
        adoption_score_2026: update.solution.adoption_score_2026,
        adoption_score_2035: update.solution.adoption_score_2035,
        implementation_stage: update.solution.implementation_stage,
        key_players: update.solution.key_players,
        barriers: update.solution.barriers,
        timeline_narrative: update.solution.timeline_narrative,
      },
      reasoning: update.evaluation.reasoning,
      confidence: update.evaluation.confidence,
      topicIds: update.topicIds,
      signalCount: update.signalCount,
      riskUpdateIds: update.riskUpdateIds,
      scoreDelta,
      stageChanged,
      requiresEscalation: scoreDelta >= 10 || stageChanged,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "solution-evaluation",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${updates.length} solution updates.`);
  return updates.length;
}
```

**Step 2: Commit**

```bash
git add functions/src/solution-evaluation/store.ts
git commit -m "feat(solution-evaluation): add solution update store module for Firestore writes"
```

---

## Task 5: solutionEvaluation Cloud Function (Main Pipeline)

**Files:**
- Modify: `functions/src/index.ts` (add imports at line 18 and `solutionEvaluation` export after the riskEvaluation function at line 736)

**Step 1: Add imports**

In `functions/src/index.ts`, add after line 18 (the `EvalRiskInput` type import):

```typescript
import { triageSolutions } from "./solution-evaluation/triage.js";
import { evaluateSolution } from "./solution-evaluation/evaluator.js";
import { storeSolutionUpdates } from "./solution-evaluation/store.js";
import type { EvalSolutionInput } from "./solution-evaluation/evaluator.js";
```

**Step 2: Add the solutionEvaluation function**

Add this new export after the `riskEvaluation` function (after line 736):

```typescript
// ─── Solution Evaluation Pipeline ──────────────────────────────────────────

export const solutionEvaluation = onSchedule(
  {
    schedule: "0 10 * * 1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Solution Evaluation: starting weekly run");
    const runStartedAt = new Date();
    const db = getFirestore();
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let geminiCalls = 0;

    try {
      // Step 1: Read approved signals from last 7 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: d.data().title as string,
        summary: d.data().summary as string,
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      logger.info(`Read ${signals.length} approved signals from last 7 days`);

      if (signals.length < 3) {
        logger.info("Fewer than 3 signals — insufficient data for solution evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "solution-evaluation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read latest topics (last 7 days)
      const topicsSnap = await db
        .collection("topics")
        .where("createdAt", ">", cutoff)
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();

      const topics = topicsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        description: (d.data().description as string) ?? "",
        riskCategories: (d.data().riskCategories as string[]) ?? [],
        velocity: (d.data().velocity as string) ?? "stable",
        signalCount: (d.data().signalCount as number) ?? 0,
      }));

      logger.info(`Read ${topics.length} topics from last 7 days`);

      // Step 3: Read approved risk updates from last 7 days
      const riskUpdatesSnap = await db
        .collection("risk_updates")
        .where("status", "==", "approved")
        .where("createdAt", ">", cutoff)
        .orderBy("createdAt", "desc")
        .get();

      const riskUpdates = riskUpdatesSnap.docs.map((d) => ({
        id: d.id,
        riskId: (d.data().riskId as string) ?? "",
        riskName: (d.data().riskName as string) ?? "",
        scoreDelta: (d.data().scoreDelta as number) ?? 0,
        velocity: (d.data().proposedChanges as Record<string, unknown>)?.velocity as string ?? "Medium",
        reasoning: (d.data().reasoning as string) ?? "",
      }));

      logger.info(`Read ${riskUpdates.length} approved risk updates from last 7 days`);

      // Step 4: Read current solution documents
      const solutionsSnap = await db.collection("solutions").get();
      const solutions = solutionsSnap.docs.map((d) => {
        const data = d.data();
        const narrative = (data.timeline_narrative ?? {}) as Record<string, string>;
        return {
          id: d.id,
          solution_title: (data.solution_title as string) ?? d.id,
          solution_type: (data.solution_type as string) ?? "",
          parent_risk_id: (data.parent_risk_id as string) ?? "",
          adoption_score_2026: (data.adoption_score_2026 as number) ?? 0,
          adoption_score_2035: (data.adoption_score_2035 as number) ?? 0,
          implementation_stage: (data.implementation_stage as string) ?? "Research",
          key_players: (data.key_players as string[]) ?? [],
          barriers: (data.barriers as string[]) ?? [],
          timeline_narrative: {
            near_term: narrative.near_term ?? "",
            mid_term: narrative.mid_term ?? "",
            long_term: narrative.long_term ?? "",
          },
        };
      });

      logger.info(`Read ${solutions.length} current solution documents`);

      // Step 5: Read current risk documents (for parent risk context in Stage 2)
      const risksSnap = await db.collection("risks").get();
      const riskMap = new Map(
        risksSnap.docs.map((d) => [
          d.id,
          {
            id: d.id,
            risk_name: (d.data().risk_name as string) ?? d.id,
            score_2026: (d.data().score_2026 as number) ?? 50,
            velocity: (d.data().velocity as string) ?? "Medium",
          },
        ])
      );

      // Step 6: Stage 1 — Triage
      const triageSignals = signals.map((s) => ({
        id: s.id,
        title: s.title,
        risk_categories: s.risk_categories,
        severity_hint: s.severity_hint,
      }));

      const triageTopics = topics.map((t) => ({
        id: t.id,
        name: t.name,
        riskCategories: t.riskCategories,
        velocity: t.velocity,
        signalCount: t.signalCount,
      }));

      const triageRiskUpdates = riskUpdates.map((r) => ({
        id: r.id,
        riskId: r.riskId,
        riskName: r.riskName,
        scoreDelta: r.scoreDelta,
        velocity: r.velocity,
      }));

      const triageSolutionInput = solutions.map((s) => ({
        id: s.id,
        title: s.solution_title,
        parentRiskId: s.parent_risk_id,
        adoption_score_2026: s.adoption_score_2026,
        implementation_stage: s.implementation_stage,
      }));

      const { flaggedSolutions, tokenUsage: triageTokens } = await triageSolutions(
        triageSignals,
        triageTopics,
        triageRiskUpdates,
        triageSolutionInput,
        geminiApiKey.value()
      );

      totalTokensInput += triageTokens.input;
      totalTokensOutput += triageTokens.output;
      geminiCalls++;

      if (flaggedSolutions.length === 0) {
        logger.info("No solutions flagged for re-evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "solution-evaluation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      logger.info(`Stage 1: flagged ${flaggedSolutions.length} solutions: ${flaggedSolutions.map((s) => s.solutionId).join(", ")}`);

      // Step 7: Stage 2 — Per-solution evaluation
      const signalMap = new Map(signals.map((s) => [s.id, s]));
      const topicMap = new Map(topics.map((t) => [t.id, t]));
      const riskUpdateMap = new Map(riskUpdates.map((r) => [r.id, r]));
      const solutionMap = new Map(solutions.map((s) => [s.id, s]));

      const updates: Array<{
        solution: EvalSolutionInput;
        evaluation: Awaited<ReturnType<typeof evaluateSolution>>["evaluation"];
        topicIds: string[];
        riskUpdateIds: string[];
        signalCount: number;
      }> = [];

      for (const flagged of flaggedSolutions) {
        const solution = solutionMap.get(flagged.solutionId);
        if (!solution) continue;

        const parentRisk = riskMap.get(solution.parent_risk_id);
        if (!parentRisk) {
          logger.warn(`No parent risk found for ${flagged.solutionId} (parent: ${solution.parent_risk_id})`);
          continue;
        }

        const relevantSignals = flagged.relevantSignalIds
          .map((id) => signalMap.get(id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);

        const relevantTopics = flagged.relevantTopicIds
          .map((id) => topicMap.get(id))
          .filter((t): t is NonNullable<typeof t> => t !== undefined);

        const relevantRiskUpdates = flagged.relevantRiskUpdateIds
          .map((id) => riskUpdateMap.get(id))
          .filter((r): r is NonNullable<typeof r> => r !== undefined);

        try {
          const { evaluation, tokenUsage: evalTokens } = await evaluateSolution(
            solution,
            parentRisk,
            relevantSignals,
            relevantTopics,
            relevantRiskUpdates,
            geminiApiKey.value()
          );

          totalTokensInput += evalTokens.input;
          totalTokensOutput += evalTokens.output;
          geminiCalls++;

          updates.push({
            solution,
            evaluation,
            topicIds: flagged.relevantTopicIds,
            riskUpdateIds: flagged.relevantRiskUpdateIds,
            signalCount: relevantSignals.length,
          });
        } catch (err) {
          logger.error(`Failed to evaluate ${flagged.solutionId}, skipping:`, err);
        }
      }

      if (updates.length === 0) {
        logger.info("All per-solution evaluations failed or produced no results. Ending run.");
        await writeAgentRunSummary({
          agentId: "solution-evaluation",
          startedAt: runStartedAt,
          outcome: "partial",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 8: Store solution updates
      const runRef = db.collection("agents").doc("solution-evaluation").collection("runs").doc();
      const stored = await storeSolutionUpdates(updates, runRef.id);

      logger.info(`Solution Evaluation complete. Stored ${stored} solution updates from ${signals.length} signals.`);

      // Step 9: Track health
      await writeAgentRunSummary({
        agentId: "solution-evaluation",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 1 + 1 + 1 + 1 + 1,
          firestoreWrites: stored + 1,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      logger.error("Solution Evaluation pipeline error:", err);
      await writeAgentRunSummary({
        agentId: "solution-evaluation",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(solution-evaluation): add solutionEvaluation scheduled Cloud Function"
```

---

## Task 6: Data Lifecycle — Solution Update Cleanup

**Files:**
- Modify: `functions/src/data-lifecycle.ts`

**Step 1: Add solutionUpdatesDeleted to LifecycleStats**

In `functions/src/data-lifecycle.ts`, update the `LifecycleStats` interface (lines 13-20) to add the new field:

```typescript
interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  topicsDeleted: number;
  riskUpdatesDeleted: number;
  solutionUpdatesDeleted: number;
}
```

**Step 2: Update initial stats**

Update the initial stats object (line 34) to include:

```typescript
const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0, topicsDeleted: 0, riskUpdatesDeleted: 0, solutionUpdatesDeleted: 0 };
```

**Step 3: Add cleanup block**

Add this block after the risk_updates cleanup (after line 171, before `return stats;`):

```typescript
  // 7. Delete old solution updates (>30 days — ephemeral staging artifacts)
  const solutionUpdateCutoff = daysAgo(30);
  const solutionUpdatesQuery = db
    .collection("solution_updates")
    .where("createdAt", "<", solutionUpdateCutoff)
    .limit(BATCH_SIZE);

  let solutionUpdatesSnap = await solutionUpdatesQuery.get();
  while (!solutionUpdatesSnap.empty) {
    const batch = db.batch();
    for (const updateDoc of solutionUpdatesSnap.docs) {
      batch.delete(updateDoc.ref);
      stats.solutionUpdatesDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${solutionUpdatesSnap.size} old solution updates`);

    if (solutionUpdatesSnap.size < BATCH_SIZE) break;
    solutionUpdatesSnap = await solutionUpdatesQuery.get();
  }
```

**Step 4: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 5: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat(solution-evaluation): add 30-day solution_updates cleanup to data lifecycle"
```

---

## Task 7: Admin UI — Solution Updates Tab

**Files:**
- Create: `src/components/admin/SolutionUpdatesTab.tsx`
- Modify: `src/pages/Admin.tsx` (add tab + import)

**Step 1: Create SolutionUpdatesTab component**

Create `src/components/admin/SolutionUpdatesTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch, serverTimestamp, arrayUnion, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type UpdateStatus = 'pending' | 'approved' | 'rejected';

interface SolutionUpdate {
    id: string;
    solutionId: string;
    solutionTitle: string;
    parentRiskId: string;
    status: UpdateStatus;
    proposedChanges: {
        adoption_score_2026: number;
        adoption_score_2035: number;
        implementation_stage: string;
        timeline_narrative: { near_term: string; mid_term: string; long_term: string };
    };
    newKeyPlayers: string[];
    newBarriers: string[];
    currentValues: {
        adoption_score_2026: number;
        adoption_score_2035: number;
        implementation_stage: string;
        key_players: string[];
        barriers: string[];
        timeline_narrative: { near_term: string; mid_term: string; long_term: string };
    };
    reasoning: string;
    confidence: number;
    scoreDelta: number;
    stageChanged: boolean;
    requiresEscalation: boolean;
    createdAt: { seconds: number } | null;
    reviewedAt?: { seconds: number } | null;
    adminNotes?: string;
}

const STATUS_COLORS: Record<UpdateStatus, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10',
    approved: 'text-green-400 bg-green-400/10',
    rejected: 'text-red-400 bg-red-400/10',
};

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function SolutionUpdatesTab() {
    const { user } = useAuth();
    const [updates, setUpdates] = useState<SolutionUpdate[]>([]);
    const [filter, setFilter] = useState<UpdateStatus | 'all'>('pending');
    const [selected, setSelected] = useState<SolutionUpdate | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
        if (filter !== 'all') {
            constraints.unshift(where('status', '==', filter));
        }
        const q = query(collection(db, 'solution_updates'), ...constraints);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as SolutionUpdate[];
                setUpdates(docs);
            },
            (error) => {
                console.error('Solution updates query error:', error);
                if (filter !== 'all') setFilter('all');
            }
        );
        return unsubscribe;
    }, [filter]);

    const handleApprove = async (update: SolutionUpdate) => {
        if (!user) return;
        setProcessing(true);
        try {
            const batch = writeBatch(db);

            // Update the solution_updates doc
            batch.update(doc(db, 'solution_updates', update.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                adminNotes: adminNotes || null,
            });

            // Apply changes to the actual solution doc
            const solutionRef = doc(db, 'solutions', update.solutionId);
            const solutionUpdateData: Record<string, unknown> = {
                adoption_score_2026: update.proposedChanges.adoption_score_2026,
                adoption_score_2035: update.proposedChanges.adoption_score_2035,
                implementation_stage: update.proposedChanges.implementation_stage,
                timeline_narrative: update.proposedChanges.timeline_narrative,
            };

            // Append new key players
            if (update.newKeyPlayers.length > 0) {
                solutionUpdateData.key_players = arrayUnion(...update.newKeyPlayers);
            }

            // Append new barriers
            if (update.newBarriers.length > 0) {
                solutionUpdateData.barriers = arrayUnion(...update.newBarriers);
            }

            batch.update(solutionRef, solutionUpdateData);

            await batch.commit();
            setSelected(null);
            setAdminNotes('');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (update: SolutionUpdate) => {
        if (!user || !adminNotes.trim()) {
            alert('Please add a note explaining why this update is rejected.');
            return;
        }
        setProcessing(true);
        try {
            const { updateDoc: updateDocument } = await import('firebase/firestore');
            await updateDocument(doc(db, 'solution_updates', update.id), {
                status: 'rejected',
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                adminNotes,
            });
            setSelected(null);
            setAdminNotes('');
        } finally {
            setProcessing(false);
        }
    };

    const pendingCount = updates.filter((u) => u.status === 'pending').length;

    return (
        <div className="flex h-full">
            {/* Left: Filter + List */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                                filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                            }`}
                        >
                            {f}{f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {updates.map((update) => (
                        <div
                            key={update.id}
                            onClick={() => { setSelected(update); setAdminNotes(update.adminNotes ?? ''); }}
                            className={`p-3 rounded cursor-pointer transition-all ${
                                selected?.id === update.id
                                    ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                    : 'hover:bg-white/5'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{update.solutionId}</span>
                                <span className="text-xs text-gray-400 truncate">{update.solutionTitle}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[update.status]}`}>
                                    {update.status}
                                </span>
                                <span className={`text-[10px] font-mono ${update.scoreDelta >= 10 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {update.scoreDelta >= 0 ? '+' : ''}{update.scoreDelta.toFixed(1)}
                                </span>
                                {update.stageChanged && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-400/10 text-purple-400">STAGE</span>
                                )}
                                {update.requiresEscalation && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESC</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {updates.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">
                            No {filter === 'all' ? '' : filter} solution updates
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detail Panel */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-bold mb-1">{selected.solutionId}: {selected.solutionTitle}</h2>
                        <div className="flex items-center gap-2 mb-4">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[selected.status]}`}>
                                {selected.status}
                            </span>
                            <span className="text-[10px] text-gray-500">Parent: {selected.parentRiskId}</span>
                            {selected.requiresEscalation && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
                                    REQUIRES ESCALATION
                                </span>
                            )}
                            {selected.createdAt && (
                                <span className="text-[10px] text-gray-500">{timeAgo(selected.createdAt.seconds)}</span>
                            )}
                        </div>

                        {/* Score & Stage Diff */}
                        <div className="bg-white/5 rounded p-4 mb-4 space-y-3">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Proposed Changes</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {(['adoption_score_2026', 'adoption_score_2035', 'implementation_stage'] as const).map((field) => {
                                    const current = selected.currentValues[field];
                                    const proposed = selected.proposedChanges[field];
                                    const changed = current !== proposed;
                                    return (
                                        <div key={field}>
                                            <div className="text-[10px] text-gray-500">{field.replace(/_/g, ' ')}</div>
                                            <div className={`text-sm font-bold ${changed ? 'text-cyan-400' : 'text-gray-400'}`}>
                                                {String(current)} {changed ? `\u2192 ${String(proposed)}` : '(no change)'}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div>
                                    <div className="text-[10px] text-gray-500">confidence</div>
                                    <div className="text-sm font-bold">{Math.round(selected.confidence * 100)}%</div>
                                </div>
                            </div>
                        </div>

                        {/* New Key Players */}
                        {selected.newKeyPlayers.length > 0 && (
                            <div className="bg-white/5 rounded p-4 mb-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                                    New Key Players (+{selected.newKeyPlayers.length})
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {selected.newKeyPlayers.map((p) => (
                                        <span key={p} className="text-xs px-2 py-0.5 rounded bg-green-400/10 text-green-400">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* New Barriers */}
                        {selected.newBarriers.length > 0 && (
                            <div className="bg-white/5 rounded p-4 mb-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                                    New Barriers (+{selected.newBarriers.length})
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {selected.newBarriers.map((b) => (
                                        <span key={b} className="text-xs px-2 py-0.5 rounded bg-orange-400/10 text-orange-400">{b}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Timeline Narrative Diff */}
                        <div className="bg-white/5 rounded p-4 mb-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Timeline Narrative</h3>
                            {(['near_term', 'mid_term', 'long_term'] as const).map((period) => {
                                const current = selected.currentValues.timeline_narrative[period];
                                const proposed = selected.proposedChanges.timeline_narrative[period];
                                const changed = current !== proposed;
                                return (
                                    <div key={period} className="mb-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] text-gray-500 uppercase">{period.replace('_', ' ')}</span>
                                            {changed && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-400/10 text-cyan-400">UPDATED</span>}
                                        </div>
                                        <p className={`text-sm leading-relaxed ${changed ? 'text-gray-200' : 'text-gray-400'}`}>
                                            {proposed}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Reasoning */}
                        <div className="bg-white/5 rounded p-4 mb-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Reasoning</h3>
                            <p className="text-sm text-gray-300 leading-relaxed">{selected.reasoning}</p>
                        </div>

                        {/* Admin Notes */}
                        <div className="mb-4">
                            <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                            <textarea
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                placeholder="Add context or reason for rejection..."
                                className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-cyan-400/50"
                            />
                        </div>

                        {/* Actions */}
                        {selected.status === 'pending' && (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleApprove(selected)}
                                    disabled={processing}
                                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Approve &amp; Apply
                                </button>
                                <button
                                    onClick={() => handleReject(selected)}
                                    disabled={processing}
                                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        )}

                        {selected.status !== 'pending' && (
                            <div className="flex items-center gap-3">
                                <span className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[selected.status]}`}>
                                    {selected.status}
                                </span>
                                {selected.reviewedAt && (
                                    <span className="text-[10px] text-gray-500">
                                        Reviewed {timeAgo(selected.reviewedAt.seconds)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Select a solution update to review
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add Solution Updates tab to Admin page**

In `src/pages/Admin.tsx`, add the import after line 7 (the RiskUpdatesTab import):

```typescript
import SolutionUpdatesTab from '../components/admin/SolutionUpdatesTab';
```

Update the `adminTab` state type (line 55) to include 'solution-updates':

```typescript
const [adminTab, setAdminTab] = useState<'signals' | 'risk-updates' | 'solution-updates'>('signals');
```

Add a new tab button in the tabs section (after line 148, before the Observatory button):

```tsx
                <button
                    onClick={() => setAdminTab('solution-updates')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'solution-updates' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Solution Updates
                </button>
```

Add the solution updates content after the risk-updates block (after line 161):

```tsx
            {adminTab === 'solution-updates' && (
                <div className="h-[calc(100vh-105px)]">
                    <SolutionUpdatesTab />
                </div>
            )}
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/admin/SolutionUpdatesTab.tsx src/pages/Admin.tsx
git commit -m "feat(solution-evaluation): add Solution Updates review tab to Admin page"
```

---

## Task 8: Observatory UI — SolutionUpdatesTab in AgentDetail

**Files:**
- Create: `src/components/observatory/SolutionUpdatesTab.tsx`
- Modify: `src/components/observatory/AgentDetail.tsx`

**Step 1: Create Observatory SolutionUpdatesTab component**

Create `src/components/observatory/SolutionUpdatesTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface SolutionUpdate {
    id: string;
    solutionId: string;
    solutionTitle: string;
    parentRiskId: string;
    status: 'pending' | 'approved' | 'rejected';
    proposedChanges: {
        adoption_score_2026: number;
        implementation_stage: string;
    };
    currentValues: {
        adoption_score_2026: number;
        implementation_stage: string;
    };
    newKeyPlayers: string[];
    newBarriers: string[];
    reasoning: string;
    confidence: number;
    scoreDelta: number;
    stageChanged: boolean;
    requiresEscalation: boolean;
    createdAt: { seconds: number } | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10' },
    approved: { label: 'Approved', color: 'text-green-400 bg-green-400/10' },
    rejected: { label: 'Rejected', color: 'text-red-400 bg-red-400/10' },
};

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

export default function ObservatorySolutionUpdatesTab() {
    const [updates, setUpdates] = useState<SolutionUpdate[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        const q = query(
            collection(db, 'solution_updates'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as SolutionUpdate[];
            setUpdates(docs);
        });
        return unsubscribe;
    }, []);

    const filtered = statusFilter === 'all'
        ? updates
        : updates.filter((u) => u.status === statusFilter);

    if (updates.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No solution updates generated yet</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-1">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                            statusFilter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {filtered.map((update) => {
                    const isExpanded = expandedId === update.id;
                    const badge = STATUS_BADGE[update.status] ?? STATUS_BADGE.pending;

                    return (
                        <div key={update.id}>
                            <div
                                onClick={() => setExpandedId(isExpanded ? null : update.id)}
                                className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/10"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{update.solutionId}: {update.solutionTitle}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                    {update.stageChanged && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-purple-400/10 text-purple-400">STAGE</span>
                                    )}
                                    {update.requiresEscalation && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESC</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <span>
                                        adoption: {update.currentValues.adoption_score_2026} \u2192 {update.proposedChanges.adoption_score_2026}
                                        ({update.scoreDelta >= 0 ? '+' : ''}{update.scoreDelta.toFixed(1)})
                                    </span>
                                    <span>\u00B7</span>
                                    <span>stage: {update.currentValues.implementation_stage} \u2192 {update.proposedChanges.implementation_stage}</span>
                                    <span>\u00B7</span>
                                    <span>{Math.round(update.confidence * 100)}% confidence</span>
                                    {update.createdAt && (
                                        <>
                                            <span>\u00B7</span>
                                            <span>{formatTime(update.createdAt.seconds)}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                    <div className="text-sm text-gray-300">{update.reasoning}</div>
                                    {update.newKeyPlayers.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            <span className="text-[10px] text-gray-500 mr-1">New players:</span>
                                            {update.newKeyPlayers.map((p) => (
                                                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400">{p}</span>
                                            ))}
                                        </div>
                                    )}
                                    {update.newBarriers.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            <span className="text-[10px] text-gray-500 mr-1">New barriers:</span>
                                            {update.newBarriers.map((b) => (
                                                <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400">{b}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No {statusFilter} solution updates
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add SolutionUpdatesTab to AgentDetail**

In `src/components/observatory/AgentDetail.tsx`, add the import after line 6 (the RiskUpdatesTab import):

```typescript
import ObservatorySolutionUpdatesTab from './SolutionUpdatesTab';
```

Update the tab state type (line 96) to include 'solution-updates':

```typescript
const [tab, setTab] = useState<'health' | 'config' | 'runs' | 'topics' | 'risk-updates' | 'solution-updates'>('health');
```

Update the tabs definition (lines 133-137) to handle solution-evaluation agent:

```typescript
    const tabs = agent.id === 'topic-tracker'
        ? (['health', 'topics', 'runs'] as const)
        : agent.id === 'risk-evaluation'
        ? (['health', 'risk-updates', 'runs'] as const)
        : agent.id === 'solution-evaluation'
        ? (['health', 'solution-updates', 'runs'] as const)
        : (['health', 'config', 'runs'] as const);
```

Add SolutionUpdatesTab rendering after line 173 (the risk-updates line):

```tsx
                {tab === 'solution-updates' && <ObservatorySolutionUpdatesTab />}
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/observatory/SolutionUpdatesTab.tsx src/components/observatory/AgentDetail.tsx
git commit -m "feat(solution-evaluation): add Solution Updates tab to Observatory AgentDetail"
```

---

## Task 9: Update Agent Registry + Deploy

**Files:**
- Modify: `src/scripts/seed-agents.ts`

**Step 1: Update solution-evaluation in seed script**

In `src/scripts/seed-agents.ts`, change the `solution-evaluation` entry (lines 57-66) from:

```typescript
    'solution-evaluation': {
        name: 'Solution Evaluation',
        description: 'Tracks solution development and adoption progress. Updates adoption scores, implementation stages, and identifies new mitigation approaches.',
        tier: '2B',
        status: 'not_deployed',
        deployedAt: null,
        functionName: null,
        schedule: null,
        overseerRole: 'Greenlight Gardener',
    },
```

to:

```typescript
    'solution-evaluation': {
        name: 'Solution Evaluation',
        description: 'Tracks solution development and adoption progress. Updates adoption scores, implementation stages, and identifies new mitigation approaches.',
        tier: '2B',
        status: 'active',
        deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
        functionName: 'solutionEvaluation',
        schedule: '0 10 * * 1',
        overseerRole: 'Greenlight Gardener',
    },
```

**Step 2: Build functions**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 3: Build frontend**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Check active Firebase project**

Run: `firebase use`
Expected: `ai-4-society`

**Step 5: Deploy everything**

Run: `firebase deploy --only functions,hosting,firestore --project ai-4-society 2>&1 | tail -10`
Expected: `Deploy complete!`

**Step 6: Create composite index for solution_updates**

Run: `gcloud firestore indexes composite create --project=ai-4-society --collection-group=solution_updates --field-config=field-path=status,order=ascending --field-config=field-path=createdAt,order=descending`
Expected: `Create request issued`

**Step 7: Run seed script**

Run: `npx tsx src/scripts/seed-agents.ts 2>&1`
Expected: `Agent registry seeding complete!`

**Step 8: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat(solution-evaluation): update agent registry to active and deploy"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Firestore rules + indexes | `firestore.rules`, `firestore.indexes.json` |
| 2 | Triage module (Stage 1 Gemini) | `functions/src/solution-evaluation/triage.ts` (create) |
| 3 | Evaluator module (Stage 2 Gemini) | `functions/src/solution-evaluation/evaluator.ts` (create) |
| 4 | Solution update store | `functions/src/solution-evaluation/store.ts` (create) |
| 5 | Cloud Function (main pipeline) | `functions/src/index.ts` (modify) |
| 6 | Data lifecycle (30-day cleanup) | `functions/src/data-lifecycle.ts` (modify) |
| 7 | Admin Solution Updates tab | `src/components/admin/SolutionUpdatesTab.tsx` (create), `src/pages/Admin.tsx` (modify) |
| 8 | Observatory Solution Updates tab | `src/components/observatory/SolutionUpdatesTab.tsx` (create), `src/components/observatory/AgentDetail.tsx` (modify) |
| 9 | Agent registry update + deploy | `src/scripts/seed-agents.ts` (modify), deploy all |
