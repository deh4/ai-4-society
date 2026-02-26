# Risk Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Risk Evaluation agent — a daily two-stage Cloud Function that triages which risks have new evidence, evaluates score/velocity changes per risk, and writes proposed updates to a `risk_updates` staging collection for admin review.

**Architecture:** Two-stage Gemini pipeline: Stage 1 (triage) identifies which of the 10 risks have meaningful new signals/topics. Stage 2 (per-risk evaluation) produces proposed score, velocity, and evidence changes for each flagged risk. Proposed updates go to `risk_updates/` where admins approve/reject before changes reach the public `risks/` collection. Admin UI tab added to the Admin page for review workflow.

**Tech Stack:** Firebase Cloud Functions v2, Gemini 2.0 Flash (`@google/generative-ai`), Firestore, React 19, TypeScript

---

## Task 1: Firestore Rules + Indexes

**Files:**
- Modify: `firestore.rules:5-8` (add admin write to risks)
- Modify: `firestore.rules:48` (add risk_updates rule)
- Modify: `firestore.indexes.json` (add risk_updates index)

**Step 1: Update risks security rule to allow admin writes**

In `firestore.rules`, change the risks block (lines 5-8) from:

```
    match /risks/{riskId} {
      allow read: if true;
      allow write: if false;
    }
```

to:

```
    match /risks/{riskId} {
      allow read: if true;
      allow write: if isAdmin();
    }
```

**Step 2: Add risk_updates security rule**

In `firestore.rules`, add this block after the `topics` rule (after line 53):

```
    // Risk updates: admin read + write (approve/reject staging collection)
    match /risk_updates/{updateId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
```

**Step 3: Add risk_updates composite index**

In `firestore.indexes.json`, add to the `indexes` array:

```json
{
  "collectionGroup": "risk_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Step 4: Deploy rules and create index**

Run: `firebase deploy --only firestore:rules --project ai-4-society 2>&1 | tail -5`
Expected: `Deploy complete!`

Then create the composite index:
Run: `gcloud firestore indexes composite create --project=ai-4-society --collection-group=risk_updates --field-config=field-path=status,order=ascending --field-config=field-path=createdAt,order=descending`
Expected: `Create request issued`

**Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(risk-evaluation): add Firestore rules and indexes for risk_updates"
```

---

## Task 2: Risk Evaluation Triage (Stage 1 Gemini)

**Files:**
- Create: `functions/src/risk-evaluation/triage.ts`

**Step 1: Create the triage module**

Create `functions/src/risk-evaluation/triage.ts`:

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
```

**Step 2: Commit**

```bash
git add functions/src/risk-evaluation/triage.ts
git commit -m "feat(risk-evaluation): add Stage 1 Gemini triage module"
```

---

## Task 3: Risk Evaluation Evaluator (Stage 2 Gemini)

**Files:**
- Create: `functions/src/risk-evaluation/evaluator.ts`

**Step 1: Create the evaluator module**

Create `functions/src/risk-evaluation/evaluator.ts`:

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
```

**Step 2: Commit**

```bash
git add functions/src/risk-evaluation/evaluator.ts
git commit -m "feat(risk-evaluation): add Stage 2 per-risk Gemini evaluation module"
```

---

## Task 4: Risk Update Store (Firestore Writer)

**Files:**
- Create: `functions/src/risk-evaluation/store.ts`

**Step 1: Create the store module**

Create `functions/src/risk-evaluation/store.ts`:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { RiskEvaluation } from "./evaluator.js";
import type { EvalRiskInput } from "./evaluator.js";

export interface RiskUpdateInput {
  risk: EvalRiskInput;
  evaluation: RiskEvaluation;
  topicIds: string[];
  signalCount: number;
}

export async function storeRiskUpdates(
  updates: RiskUpdateInput[],
  runId: string
): Promise<number> {
  if (updates.length === 0) {
    logger.info("No risk updates to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const update of updates) {
    const ref = db.collection("risk_updates").doc();
    const scoreDelta = Math.abs(update.evaluation.score_2026 - update.risk.score_2026);

    batch.set(ref, {
      riskId: update.risk.id,
      riskName: update.risk.risk_name,
      status: "pending",
      proposedChanges: {
        score_2026: update.evaluation.score_2026,
        score_2035: update.evaluation.score_2035,
        velocity: update.evaluation.velocity,
        expert_severity: update.evaluation.expert_severity,
        public_perception: update.evaluation.public_perception,
      },
      newSignalEvidence: update.evaluation.newSignalEvidence,
      currentValues: {
        score_2026: update.risk.score_2026,
        score_2035: update.risk.score_2035,
        velocity: update.risk.velocity,
        expert_severity: update.risk.expert_severity,
        public_perception: update.risk.public_perception,
      },
      reasoning: update.evaluation.reasoning,
      confidence: update.evaluation.confidence,
      topicIds: update.topicIds,
      signalCount: update.signalCount,
      scoreDelta,
      requiresEscalation: scoreDelta >= 5,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "risk-evaluation",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${updates.length} risk updates.`);
  return updates.length;
}
```

**Step 2: Commit**

```bash
git add functions/src/risk-evaluation/store.ts
git commit -m "feat(risk-evaluation): add risk update store module for Firestore writes"
```

---

## Task 5: riskEvaluation Cloud Function (Main Pipeline)

**Files:**
- Modify: `functions/src/index.ts` (add `riskEvaluation` export)

**Step 1: Add imports**

In `functions/src/index.ts`, add after line 14 (the topic-tracker imports):

```typescript
import { triageRisks } from "./risk-evaluation/triage.js";
import { evaluateRisk } from "./risk-evaluation/evaluator.js";
import { storeRiskUpdates } from "./risk-evaluation/store.js";
import type { EvalSignalInput, EvalTopicInput, EvalRiskInput } from "./risk-evaluation/evaluator.js";
```

**Step 2: Add the riskEvaluation function**

Add this new export after the `topicTracker` function (after the closing of `topicTracker`):

```typescript
// ─── Risk Evaluation Pipeline ───────────────────────────────────────────────

export const riskEvaluation = onSchedule(
  {
    schedule: "0 9 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Risk Evaluation: starting daily run");
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
        source_url: (d.data().source_url as string) ?? "",
      }));

      logger.info(`Read ${signals.length} approved signals from last 7 days`);

      if (signals.length < 3) {
        logger.info("Fewer than 3 signals — insufficient data for risk evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
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

      // Step 2: Read latest topics (last 24h)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const topicsSnap = await db
        .collection("topics")
        .where("createdAt", ">", oneDayAgo)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const topics = topicsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        description: (d.data().description as string) ?? "",
        riskCategories: (d.data().riskCategories as string[]) ?? [],
        velocity: (d.data().velocity as string) ?? "stable",
        signalCount: (d.data().signalCount as number) ?? 0,
      }));

      logger.info(`Read ${topics.length} topics from last 24h`);

      // Step 3: Read current risk documents
      const risksSnap = await db.collection("risks").get();
      const risks = risksSnap.docs.map((d) => ({
        id: d.id,
        risk_name: (d.data().risk_name as string) ?? d.id,
        score_2026: (d.data().score_2026 as number) ?? 50,
        score_2035: (d.data().score_2035 as number) ?? 50,
        velocity: (d.data().velocity as string) ?? "Medium",
        expert_severity: (d.data().expert_severity as number) ?? 50,
        public_perception: (d.data().public_perception as number) ?? 50,
        signalEvidenceCount: Array.isArray(d.data().signal_evidence) ? (d.data().signal_evidence as unknown[]).length : 0,
      }));

      logger.info(`Read ${risks.length} current risk documents`);

      // Step 4: Stage 1 — Triage
      const triageInput = signals.map((s) => ({
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

      const triageRiskInput = risks.map((r) => ({
        id: r.id,
        name: r.risk_name,
        score_2026: r.score_2026,
        velocity: r.velocity,
      }));

      const { flaggedRisks, tokenUsage: triageTokens } = await triageRisks(
        triageInput,
        triageTopics,
        triageRiskInput,
        geminiApiKey.value()
      );

      totalTokensInput += triageTokens.input;
      totalTokensOutput += triageTokens.output;
      geminiCalls++;

      if (flaggedRisks.length === 0) {
        logger.info("No risks flagged for re-evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      logger.info(`Stage 1: flagged ${flaggedRisks.length} risks: ${flaggedRisks.map((r) => r.riskId).join(", ")}`);

      // Step 5: Stage 2 — Per-risk evaluation
      const signalMap = new Map(signals.map((s) => [s.id, s]));
      const topicMap = new Map(topics.map((t) => [t.id, t]));
      const riskMap = new Map(risks.map((r) => [r.id, r]));

      const updates: Array<{
        risk: EvalRiskInput;
        evaluation: Awaited<ReturnType<typeof evaluateRisk>>["evaluation"];
        topicIds: string[];
        signalCount: number;
      }> = [];

      for (const flagged of flaggedRisks) {
        const risk = riskMap.get(flagged.riskId);
        if (!risk) continue;

        const relevantSignals: EvalSignalInput[] = flagged.relevantSignalIds
          .map((id) => signalMap.get(id))
          .filter((s): s is EvalSignalInput => s !== undefined);

        const relevantTopics: EvalTopicInput[] = flagged.relevantTopicIds
          .map((id) => topicMap.get(id))
          .filter((t): t is EvalTopicInput => t !== undefined);

        if (relevantSignals.length === 0) {
          logger.info(`Skipping ${flagged.riskId}: no valid signals after filtering`);
          continue;
        }

        try {
          const { evaluation, tokenUsage: evalTokens } = await evaluateRisk(
            risk,
            relevantSignals,
            relevantTopics,
            geminiApiKey.value()
          );

          totalTokensInput += evalTokens.input;
          totalTokensOutput += evalTokens.output;
          geminiCalls++;

          updates.push({
            risk,
            evaluation,
            topicIds: flagged.relevantTopicIds,
            signalCount: relevantSignals.length,
          });
        } catch (err) {
          logger.error(`Failed to evaluate ${flagged.riskId}, skipping:`, err);
        }
      }

      if (updates.length === 0) {
        logger.info("All per-risk evaluations failed or produced no results. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
          startedAt: runStartedAt,
          outcome: "partial",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 6: Store risk updates
      const runRef = db.collection("agents").doc("risk-evaluation").collection("runs").doc();
      const stored = await storeRiskUpdates(updates, runRef.id);

      logger.info(`Risk Evaluation complete. Stored ${stored} risk updates from ${signals.length} signals.`);

      // Step 7: Track health
      await writeAgentRunSummary({
        agentId: "risk-evaluation",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 1 + 1 + 1,
          firestoreWrites: stored + 1,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      logger.error("Risk Evaluation pipeline error:", err);
      await writeAgentRunSummary({
        agentId: "risk-evaluation",
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
git commit -m "feat(risk-evaluation): add riskEvaluation scheduled Cloud Function"
```

---

## Task 6: Data Lifecycle — Risk Update Cleanup

**Files:**
- Modify: `functions/src/data-lifecycle.ts`

**Step 1: Add riskUpdatesDeleted to LifecycleStats**

In `functions/src/data-lifecycle.ts`, add `riskUpdatesDeleted: number;` to the `LifecycleStats` interface (line 13-19):

```typescript
interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  topicsDeleted: number;
  riskUpdatesDeleted: number;
}
```

**Step 2: Update initial stats**

Update the initial stats object (line 33) to include:

```typescript
const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0, topicsDeleted: 0, riskUpdatesDeleted: 0 };
```

**Step 3: Add cleanup block**

Add this block after the topics cleanup (after line 149, before `return stats;`):

```typescript
  // 6. Delete old risk updates (>30 days — ephemeral staging artifacts)
  const riskUpdateCutoff = daysAgo(30);
  const riskUpdatesQuery = db
    .collection("risk_updates")
    .where("createdAt", "<", riskUpdateCutoff)
    .limit(BATCH_SIZE);

  let riskUpdatesSnap = await riskUpdatesQuery.get();
  while (!riskUpdatesSnap.empty) {
    const batch = db.batch();
    for (const updateDoc of riskUpdatesSnap.docs) {
      batch.delete(updateDoc.ref);
      stats.riskUpdatesDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${riskUpdatesSnap.size} old risk updates`);

    if (riskUpdatesSnap.size < BATCH_SIZE) break;
    riskUpdatesSnap = await riskUpdatesQuery.get();
  }
```

**Step 4: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 5: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat(risk-evaluation): add 30-day risk_updates cleanup to data lifecycle"
```

---

## Task 7: Admin UI — Risk Updates Tab

**Files:**
- Create: `src/components/admin/RiskUpdatesTab.tsx`
- Modify: `src/pages/Admin.tsx` (add tab + import)

**Step 1: Create RiskUpdatesTab component**

Create `src/components/admin/RiskUpdatesTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch, serverTimestamp, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';
import { arrayUnion } from 'firebase/firestore';

type UpdateStatus = 'pending' | 'approved' | 'rejected';

interface RiskUpdate {
    id: string;
    riskId: string;
    riskName: string;
    status: UpdateStatus;
    proposedChanges: {
        score_2026: number;
        score_2035: number;
        velocity: string;
        expert_severity: number;
        public_perception: number;
    };
    currentValues: {
        score_2026: number;
        score_2035: number;
        velocity: string;
        expert_severity: number;
        public_perception: number;
    };
    newSignalEvidence: Array<{
        signalId: string;
        date: string;
        headline: string;
        source: string;
        url?: string;
    }>;
    reasoning: string;
    confidence: number;
    topicIds: string[];
    signalCount: number;
    scoreDelta: number;
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

export default function RiskUpdatesTab() {
    const { user } = useAuth();
    const [updates, setUpdates] = useState<RiskUpdate[]>([]);
    const [filter, setFilter] = useState<UpdateStatus | 'all'>('pending');
    const [selected, setSelected] = useState<RiskUpdate | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
        if (filter !== 'all') {
            constraints.unshift(where('status', '==', filter));
        }
        const q = query(collection(db, 'risk_updates'), ...constraints);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as RiskUpdate[];
                setUpdates(docs);
            },
            (error) => {
                console.error('Risk updates query error:', error);
                if (filter !== 'all') setFilter('all');
            }
        );
        return unsubscribe;
    }, [filter]);

    const handleApprove = async (update: RiskUpdate) => {
        if (!user) return;
        setProcessing(true);
        try {
            const batch = writeBatch(db);

            // Update the risk_updates doc
            batch.update(doc(db, 'risk_updates', update.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                adminNotes: adminNotes || null,
            });

            // Apply changes to the actual risk doc
            const riskRef = doc(db, 'risks', update.riskId);
            const riskUpdateData: Record<string, unknown> = {
                score_2026: update.proposedChanges.score_2026,
                score_2035: update.proposedChanges.score_2035,
                velocity: update.proposedChanges.velocity,
                expert_severity: update.proposedChanges.expert_severity,
                public_perception: update.proposedChanges.public_perception,
            };

            // Append new signal evidence
            if (update.newSignalEvidence.length > 0) {
                const evidenceEntries = update.newSignalEvidence.map((e) => ({
                    date: e.date,
                    headline: e.headline,
                    source: e.source,
                    url: e.url ?? '',
                    isNew: true,
                }));
                riskUpdateData.signal_evidence = arrayUnion(...evidenceEntries);
            }

            batch.update(riskRef, riskUpdateData);

            await batch.commit();
            setSelected(null);
            setAdminNotes('');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (update: RiskUpdate) => {
        if (!user || !adminNotes.trim()) {
            alert('Please add a note explaining why this update is rejected.');
            return;
        }
        setProcessing(true);
        try {
            const { updateDoc: updateDocument } = await import('firebase/firestore');
            await updateDocument(doc(db, 'risk_updates', update.id), {
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
                                <span className="text-sm font-medium">{update.riskId}</span>
                                <span className="text-xs text-gray-400 truncate">{update.riskName}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[update.status]}`}>
                                    {update.status}
                                </span>
                                <span className={`text-[10px] font-mono ${update.scoreDelta >= 5 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {update.scoreDelta >= 0 ? '+' : ''}{update.scoreDelta.toFixed(1)}
                                </span>
                                {update.requiresEscalation && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESCALATION</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {updates.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">
                            No {filter === 'all' ? '' : filter} risk updates
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detail Panel */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-bold mb-1">{selected.riskId}: {selected.riskName}</h2>
                        <div className="flex items-center gap-2 mb-4">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[selected.status]}`}>
                                {selected.status}
                            </span>
                            {selected.requiresEscalation && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
                                    REQUIRES ESCALATION (score change &ge; 5)
                                </span>
                            )}
                            {selected.createdAt && (
                                <span className="text-[10px] text-gray-500">{timeAgo(selected.createdAt.seconds)}</span>
                            )}
                        </div>

                        {/* Score Diff */}
                        <div className="bg-white/5 rounded p-4 mb-4 space-y-3">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Proposed Changes</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {(['score_2026', 'score_2035', 'velocity', 'expert_severity', 'public_perception'] as const).map((field) => {
                                    const current = selected.currentValues[field];
                                    const proposed = selected.proposedChanges[field];
                                    const changed = current !== proposed;
                                    return (
                                        <div key={field}>
                                            <div className="text-[10px] text-gray-500">{field.replace(/_/g, ' ')}</div>
                                            <div className={`text-sm font-bold ${changed ? 'text-cyan-400' : 'text-gray-400'}`}>
                                                {String(current)} {changed ? `→ ${String(proposed)}` : '(no change)'}
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

                        {/* Reasoning */}
                        <div className="bg-white/5 rounded p-4 mb-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Reasoning</h3>
                            <p className="text-sm text-gray-300 leading-relaxed">{selected.reasoning}</p>
                        </div>

                        {/* Signal Evidence */}
                        {selected.newSignalEvidence.length > 0 && (
                            <div className="bg-white/5 rounded p-4 mb-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                                    New Signal Evidence ({selected.newSignalEvidence.length})
                                </h3>
                                <div className="space-y-2">
                                    {selected.newSignalEvidence.map((e) => (
                                        <div key={e.signalId} className="text-sm">
                                            <span className="text-gray-300">{e.headline}</span>
                                            <div className="text-[10px] text-gray-500">
                                                {e.source} · {e.date}
                                                {e.url && (
                                                    <> · <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Source</a></>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

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
                        Select a risk update to review
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add Risk Updates tab to Admin page**

In `src/pages/Admin.tsx`, add the import at the top (after line 6):

```typescript
import RiskUpdatesTab from '../components/admin/RiskUpdatesTab';
```

Add a state for the active admin tab (after line 53, the `updating` state):

```typescript
const [adminTab, setAdminTab] = useState<'signals' | 'risk-updates'>('signals');
```

Replace the static tabs section (lines 129-142) with dynamic tabs:

```tsx
            {/* Tabs */}
            <div className="flex gap-6 px-6 border-b border-white/10">
                <button
                    onClick={() => setAdminTab('signals')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'signals' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Signal Review
                    <span className="ml-2 text-[10px] text-gray-500">{signals.length}</span>
                </button>
                <button
                    onClick={() => setAdminTab('risk-updates')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'risk-updates' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Risk Updates
                </button>
                <button
                    onClick={() => navigate('/observatory')}
                    className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300"
                >
                    Observatory
                </button>
            </div>
```

Wrap the existing signal review content (lines 144-319, the `<div className="flex h-[calc(100vh-57px)]">` block) in a conditional:

```tsx
            {adminTab === 'signals' && (
                <div className="flex h-[calc(100vh-105px)]">
                    {/* ... existing signal review content unchanged ... */}
                </div>
            )}

            {adminTab === 'risk-updates' && (
                <div className="h-[calc(100vh-105px)]">
                    <RiskUpdatesTab />
                </div>
            )}
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/admin/RiskUpdatesTab.tsx src/pages/Admin.tsx
git commit -m "feat(risk-evaluation): add Risk Updates review tab to Admin page"
```

---

## Task 8: Observatory UI — RiskUpdatesTab in AgentDetail

**Files:**
- Create: `src/components/observatory/RiskUpdatesTab.tsx`
- Modify: `src/components/observatory/AgentDetail.tsx`

**Step 1: Create Observatory RiskUpdatesTab component**

Create `src/components/observatory/RiskUpdatesTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface RiskUpdate {
    id: string;
    riskId: string;
    riskName: string;
    status: 'pending' | 'approved' | 'rejected';
    proposedChanges: { score_2026: number; velocity: string };
    currentValues: { score_2026: number; velocity: string };
    reasoning: string;
    confidence: number;
    signalCount: number;
    scoreDelta: number;
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

export default function ObservatoryRiskUpdatesTab() {
    const [updates, setUpdates] = useState<RiskUpdate[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        const q = query(
            collection(db, 'risk_updates'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as RiskUpdate[];
            setUpdates(docs);
        });
        return unsubscribe;
    }, []);

    const filtered = statusFilter === 'all'
        ? updates
        : updates.filter((u) => u.status === statusFilter);

    if (updates.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No risk updates generated yet</div>;
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
                                    <span className="text-sm font-medium">{update.riskId}: {update.riskName}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                    {update.requiresEscalation && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESC</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <span>
                                        score: {update.currentValues.score_2026} → {update.proposedChanges.score_2026}
                                        ({update.scoreDelta >= 0 ? '+' : ''}{update.scoreDelta.toFixed(1)})
                                    </span>
                                    <span>·</span>
                                    <span>{update.signalCount} signals</span>
                                    <span>·</span>
                                    <span>{Math.round(update.confidence * 100)}% confidence</span>
                                    {update.createdAt && (
                                        <>
                                            <span>·</span>
                                            <span>{formatTime(update.createdAt.seconds)}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                    <div className="text-sm text-gray-300">{update.reasoning}</div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No {statusFilter} risk updates
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add RiskUpdatesTab to AgentDetail**

In `src/components/observatory/AgentDetail.tsx`, add the import (after the TopicsTab import):

```typescript
import ObservatoryRiskUpdatesTab from './RiskUpdatesTab';
```

Change the tab state type (line 95) to include 'risk-updates':

```typescript
const [tab, setTab] = useState<'health' | 'config' | 'runs' | 'topics' | 'risk-updates'>('health');
```

Update the tabs definition (lines 132-134) to handle risk-evaluation agent:

```typescript
    const tabs = agent.id === 'topic-tracker'
        ? (['health', 'topics', 'runs'] as const)
        : agent.id === 'risk-evaluation'
        ? (['health', 'risk-updates', 'runs'] as const)
        : (['health', 'config', 'runs'] as const);
```

Add RiskUpdatesTab rendering (after the TopicsTab line):

```tsx
                {tab === 'risk-updates' && <ObservatoryRiskUpdatesTab />}
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/observatory/RiskUpdatesTab.tsx src/components/observatory/AgentDetail.tsx
git commit -m "feat(risk-evaluation): add Risk Updates tab to Observatory AgentDetail"
```

---

## Task 9: Update Agent Registry + Deploy

**Files:**
- Modify: `src/scripts/seed-agents.ts`

**Step 1: Update risk-evaluation in seed script**

In `src/scripts/seed-agents.ts`, change the `risk-evaluation` entry:

```typescript
'risk-evaluation': {
    name: 'Risk Evaluation',
    description: 'Assesses and updates risk metrics from incoming signals. Recalculates severity scores, velocity, and timeline projections based on new evidence.',
    tier: '2B',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'riskEvaluation',
    schedule: '0 9 * * *',
    overseerRole: 'Severity Steward',
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

**Step 6: Create composite index for risk_updates**

Run: `gcloud firestore indexes composite create --project=ai-4-society --collection-group=risk_updates --field-config=field-path=status,order=ascending --field-config=field-path=createdAt,order=descending`
Expected: `Create request issued`

**Step 7: Run seed script**

Run: `npx tsx src/scripts/seed-agents.ts 2>&1`
Expected: `Agent registry seeding complete!`

**Step 8: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat(risk-evaluation): update agent registry and deploy"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Firestore rules + indexes | `firestore.rules`, `firestore.indexes.json` |
| 2 | Triage module (Stage 1 Gemini) | `functions/src/risk-evaluation/triage.ts` (create) |
| 3 | Evaluator module (Stage 2 Gemini) | `functions/src/risk-evaluation/evaluator.ts` (create) |
| 4 | Risk update store | `functions/src/risk-evaluation/store.ts` (create) |
| 5 | Cloud Function (main pipeline) | `functions/src/index.ts` (modify) |
| 6 | Data lifecycle (30-day cleanup) | `functions/src/data-lifecycle.ts` (modify) |
| 7 | Admin Risk Updates tab | `src/components/admin/RiskUpdatesTab.tsx` (create), `src/pages/Admin.tsx` (modify) |
| 8 | Observatory Risk Updates tab | `src/components/observatory/RiskUpdatesTab.tsx` (create), `src/components/observatory/AgentDetail.tsx` (modify) |
| 9 | Agent registry update + deploy | `src/scripts/seed-agents.ts` (modify), deploy all |
