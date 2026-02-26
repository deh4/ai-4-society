# Simplified Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 8-agent pipeline with 4 agents (Signal Scout, Discovery Agent, Validator Agent, Data Lifecycle), adding typed signal classification and two new human-review collections.

**Architecture:** Signal Scout gains `signal_type` and `solution_ids` classification. Two new weekly agents write to `discovery_proposals` and `validation_proposals`. Retired agents (Topic Tracker, Risk/Solution Evaluation, Validation, Consolidation) are removed. Admin UI gains Risk Signals, Solution Signals, Discovery, and Validation tabs.

**Tech Stack:** Firebase Cloud Functions v2 (Node.js/TypeScript), Firestore, Gemini 2.0 Flash (Signal Scout), Gemini 2.5 Pro (Discovery + Validator), React 19, TypeScript, Tailwind.

**Design doc:** `docs/plans/2026-02-22-simplified-agent-architecture-design.md`

**Verification commands (no test framework — use these throughout):**
- Functions TypeScript: `cd functions && npx tsc --noEmit`
- Functions build: `cd functions && npm run build`
- Frontend TypeScript + lint: `npm run build && npm run lint`

---

## Phase 1: Signal Scout — Add typed classification

### Task 1: Update ClassifiedSignal type and classifier prompt

**Files:**
- Modify: `functions/src/signal-scout/classifier.ts`

**Context:** Currently classifies articles to `risk_categories: string[]` (R01–R10) only. We add `signal_type`, `solution_ids`, and extend the Gemini prompt with the solution taxonomy.

**Step 1: Update `ClassifiedSignal` interface and add solution taxonomy constant**

In `functions/src/signal-scout/classifier.ts`, replace the `ClassifiedSignal` interface and add `SOLUTION_TAXONOMY` after `RISK_TAXONOMY`:

```typescript
export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both";
  risk_categories: string[];
  solution_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
}
```

Add after `RISK_TAXONOMY` constant:

```typescript
const SOLUTION_TAXONOMY = `
Solution taxonomy for classification:
- S01: Algorithmic Auditing & Fairness Certification Standards (addresses R01)
- S02: Privacy-Preserving AI: Federated Learning & On-Device Processing (addresses R02)
- S03: Digital Content Provenance (C2PA) Standards (addresses R03)
- S04: Universal Basic Services & AI-Era Workforce Transition Programs (addresses R04)
- S05: International AI Arms Control Treaties (addresses R05)
- S06: Open-Source AI & Antitrust Enforcement (addresses R06)
- S07: Green AI Standards & Carbon-Aware Computing (addresses R07)
- S08: Human Autonomy Frameworks & Digital Wellbeing Laws (addresses R08)
- S09: Democratic AI Oversight & Surveillance Moratoriums (addresses R09)
- S10: Synthetic Data Standards & Data Commons (addresses R10)
`;
```

**Step 2: Update SYSTEM_PROMPT to include solution taxonomy and new fields**

Replace the existing `SYSTEM_PROMPT` constant:

```typescript
const SYSTEM_PROMPT = `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

${SOLUTION_TAXONOMY}

For each article provided, determine:
1. Is this article about a societal risk OR a solution/countermeasure related to AI's impact?
2. If yes, classify it.

signal_type rules:
- "risk": article is primarily about a risk, harm, or negative trend (maps to R-codes)
- "solution": article is primarily about a countermeasure, policy, or mitigation gaining traction (maps to S-codes)
- "both": article covers both a risk and a response/solution to it

Respond with a JSON array. For irrelevant articles, include them with "relevant": false.
For relevant articles, provide:
{
  "index": <number>,
  "relevant": true,
  "signal_type": "risk" | "solution" | "both",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "risk_categories": ["R01", ...],
  "solution_ids": ["S03", ...],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

Rules:
- risk_categories must be empty [] if signal_type is "solution"
- solution_ids must be empty [] if signal_type is "risk"
- Both arrays must be non-empty if signal_type is "both"
- Only include R/S codes you are confident about

For irrelevant articles:
{ "index": <number>, "relevant": false }

Only output valid JSON. No markdown fences. No explanation.`;
```

**Step 3: Update the parsed response type and result-building block**

In the `classifyArticles` function, replace the `parsed` type annotation:

```typescript
const parsed: Array<{
  index: number;
  relevant: boolean;
  signal_type?: "risk" | "solution" | "both";
  summary?: string;
  risk_categories?: string[];
  solution_ids?: string[];
  severity_hint?: "Critical" | "Emerging" | "Horizon";
  affected_groups?: string[];
  confidence_score?: number;
}> = JSON.parse(text);
```

Replace the `results.push(...)` block:

```typescript
const signalType = item.signal_type ?? "risk";
const riskCats = item.risk_categories ?? [];
const solutionIds = item.solution_ids ?? [];

// Inline validation: drop signals with invalid taxonomy codes
const validRisks = ["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"];
const validSolutions = ["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10"];

if ((signalType === "risk" || signalType === "both") && riskCats.length === 0) {
  logger.info(`Dropping signal with no risk_categories: ${batch[item.index]?.title}`);
  continue;
}
if ((signalType === "solution" || signalType === "both") && solutionIds.length === 0) {
  logger.info(`Dropping signal with no solution_ids: ${batch[item.index]?.title}`);
  continue;
}
if (riskCats.some((c) => !validRisks.includes(c))) {
  logger.info(`Dropping signal with invalid risk code: ${batch[item.index]?.title}`);
  continue;
}
if (solutionIds.some((s) => !validSolutions.includes(s))) {
  logger.info(`Dropping signal with invalid solution code: ${batch[item.index]?.title}`);
  continue;
}

results.push({
  title: article.title,
  summary: item.summary ?? "",
  source_url: article.url,
  source_name: article.source_name,
  published_date: article.published_date,
  signal_type: signalType,
  risk_categories: riskCats,
  solution_ids: solutionIds,
  severity_hint: item.severity_hint ?? "Emerging",
  affected_groups: item.affected_groups ?? [],
  confidence_score: confidence,
});
```

**Step 4: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add functions/src/signal-scout/classifier.ts
git commit -m "feat(signal-scout): add signal_type and solution_ids classification"
```

---

### Task 2: Update signal store to write new fields

**Files:**
- Modify: `functions/src/signal-scout/store.ts`

**Step 1: Add new fields to the batch.set call**

In `functions/src/signal-scout/store.ts`, in the `batch.set(ref, {...})` block, add the two new fields after `risk_categories`:

```typescript
batch.set(ref, {
  title: signal.title,
  summary: signal.summary,
  source_url: signal.source_url,
  source_name: signal.source_name,
  published_date: signal.published_date,
  signal_type: signal.signal_type,       // NEW
  risk_categories: signal.risk_categories,
  solution_ids: signal.solution_ids,     // NEW
  severity_hint: signal.severity_hint,
  affected_groups: signal.affected_groups,
  confidence_score: signal.confidence_score,
  status: "pending",
  fetched_at: FieldValue.serverTimestamp(),
});
```

**Step 2: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add functions/src/signal-scout/store.ts
git commit -m "feat(signal-scout): write signal_type and solution_ids to Firestore"
```

---

## Phase 2: Discovery Agent

### Task 3: Create Discovery Agent analyzer module

**Files:**
- Create: `functions/src/discovery-agent/analyzer.ts`

**Context:** Single Gemini 2.5 Pro call per weekly run. Receives all approved signals from the last 30 days plus the full registry. Returns 0–N proposals for genuinely novel topics.

**Step 1: Create the file**

```typescript
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
```

**Step 2: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add functions/src/discovery-agent/analyzer.ts
git commit -m "feat(discovery-agent): add Gemini 2.5 Pro analyzer module"
```

---

### Task 4: Create Discovery Agent store module

**Files:**
- Create: `functions/src/discovery-agent/store.ts`

**Step 1: Create the file**

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { DiscoveryProposal } from "./analyzer.js";

export async function storeDiscoveryProposals(proposals: DiscoveryProposal[]): Promise<number> {
  if (proposals.length === 0) return 0;

  const db = getFirestore();
  const col = db.collection("discovery_proposals");
  let stored = 0;

  for (const proposal of proposals) {
    const doc: Record<string, unknown> = {
      type: proposal.type,
      proposed_name: proposal.proposed_name,
      description: proposal.description,
      why_novel: proposal.why_novel,
      key_themes: proposal.key_themes,
      supporting_signal_ids: proposal.supporting_signal_ids,
      signal_count: proposal.supporting_signal_ids.length,
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
      created_by: "discovery-agent",
    };

    if (proposal.suggested_parent_risk_id) {
      doc.suggested_parent_risk_id = proposal.suggested_parent_risk_id;
    }

    await col.add(doc);
    stored++;
  }

  logger.info(`Discovery: stored ${stored} proposals`);
  return stored;
}
```

**Step 2: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add functions/src/discovery-agent/store.ts
git commit -m "feat(discovery-agent): add Firestore store module"
```

---

### Task 5: Wire Discovery Agent into index.ts

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Add imports at the top of `functions/src/index.ts`** (after existing imports):

```typescript
import { analyzeSignals } from "./discovery-agent/analyzer.js";
import { storeDiscoveryProposals } from "./discovery-agent/store.js";
```

**Step 2: Add the `discoveryAgent` export** (after the existing `dataLifecycle` export):

```typescript
// ─── Discovery Agent Pipeline ────────────────────────────────────────────────

export const discoveryAgent = onSchedule(
  {
    schedule: "0 10 * * 0",  // Weekly, Sunday 10:00 UTC
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Discovery Agent: starting weekly run");
    const runStartedAt = new Date();
    const db = getFirestore();

    try {
      // Step 1: Read approved signals from last 30 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        signal_type: (d.data().signal_type as string) ?? "risk",
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        solution_ids: (d.data().solution_ids as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      logger.info(`Discovery: ${signals.length} approved signals in last 30 days`);

      if (signals.length < 5) {
        logger.info("Discovery: insufficient signals (<5), skipping Gemini call");
        await writeAgentRunSummary({
          agentId: "discovery-agent",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: { articlesFetched: signals.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 1, firestoreWrites: 0 },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read current registry (name + description only)
      const [risksSnap, solutionsSnap] = await Promise.all([
        db.collection("risks").get(),
        db.collection("solutions").get(),
      ]);

      const risks = risksSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().risk_name as string) ?? d.id,
        description: (d.data().summary as string) ?? "",
      }));

      const solutions = solutionsSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().solution_title as string) ?? d.id,
        description: (d.data().summary as string) ?? "",
      }));

      // Step 3: Analyze with Gemini 2.5 Pro
      const { proposals, tokenUsage } = await analyzeSignals(
        signals, risks, solutions, geminiApiKey.value()
      );

      // Step 4: Store proposals
      const stored = await storeDiscoveryProposals(proposals);

      await writeAgentRunSummary({
        agentId: "discovery-agent",
        startedAt: runStartedAt,
        outcome: stored > 0 ? "success" : "empty",
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls: 1,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 3,
          firestoreWrites: stored,
        },
        sourcesUsed: [],
      });

      logger.info(`Discovery Agent complete: ${stored} proposals stored`);
    } catch (err) {
      logger.error("Discovery Agent failed:", err);
      await writeAgentRunSummary({
        agentId: "discovery-agent",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
        sourcesUsed: [],
      });
    }
  }
);
```

**Step 3: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add functions/src/index.ts functions/src/discovery-agent/
git commit -m "feat(discovery-agent): wire weekly scheduled function into index.ts"
```

---

## Phase 3: Validator Agent

### Task 6: Create Validator Agent assessor module

**Files:**
- Create: `functions/src/validator-agent/assessor.ts`

**Context:** Called once per document (risk or solution). Returns structured `proposed_changes` or null if no updates needed. Only creates a proposal if confidence ≥ 0.6.

**Step 1: Create the file**

```typescript
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
): Promise<AssessmentResult> {
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

  // Attach token counts to result object for aggregation in caller
  (parsed as AssessmentResult & { _tokenUsage?: { input: number; output: number } })._tokenUsage = {
    input: usage?.promptTokenCount ?? 0,
    output: usage?.candidatesTokenCount ?? 0,
  };

  return parsed;
}

export async function assessRisk(
  riskId: string,
  riskDoc: Record<string, unknown>,
  signals: ApprovedSignal[],
  geminiApiKey: string
): Promise<{ result: AssessmentResult | null; tokenUsage: { input: number; output: number } }> {
  try {
    const docText = buildRiskPrompt(riskDoc, signals);
    const result = await runAssessment("risk", docText, RISK_FIELDS, geminiApiKey);
    const tokenUsage = (result as AssessmentResult & { _tokenUsage?: { input: number; output: number } })._tokenUsage ?? { input: 0, output: 0 };

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
    const result = await runAssessment("solution", docText, SOLUTION_FIELDS, geminiApiKey);
    const tokenUsage = (result as AssessmentResult & { _tokenUsage?: { input: number; output: number } })._tokenUsage ?? { input: 0, output: 0 };

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
```

**Step 2: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add functions/src/validator-agent/assessor.ts
git commit -m "feat(validator-agent): add Gemini 2.5 Pro per-document assessor"
```

---

### Task 7: Create Validator Agent store module

**Files:**
- Create: `functions/src/validator-agent/store.ts`

**Step 1: Create the file**

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { AssessmentResult } from "./assessor.js";

export async function storeValidationProposal(
  documentType: "risk" | "solution",
  documentId: string,
  documentName: string,
  assessment: AssessmentResult,
  supportingSignalIds: string[]
): Promise<void> {
  const db = getFirestore();

  await db.collection("validation_proposals").add({
    document_type: documentType,
    document_id: documentId,
    document_name: documentName,
    proposed_changes: assessment.proposed_changes,
    overall_reasoning: assessment.overall_reasoning,
    confidence: assessment.confidence,
    supporting_signal_ids: supportingSignalIds,
    status: "pending",
    created_at: FieldValue.serverTimestamp(),
    created_by: "validator-agent",
  });

  logger.info(`Validator: stored proposal for ${documentType} ${documentId}`);
}
```

**Step 2: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add functions/src/validator-agent/store.ts
git commit -m "feat(validator-agent): add Firestore store module"
```

---

### Task 8: Wire Validator Agent into index.ts

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Add imports** after the discovery-agent imports:

```typescript
import { assessRisk, assessSolution } from "./validator-agent/assessor.js";
import { storeValidationProposal } from "./validator-agent/store.js";
```

**Step 2: Add `validatorAgent` export** after the `discoveryAgent` export:

```typescript
// ─── Validator Agent Pipeline ────────────────────────────────────────────────

export const validatorAgent = onSchedule(
  {
    schedule: "0 9 * * 1",  // Weekly, Monday 09:00 UTC
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Validator Agent: starting weekly run");
    const runStartedAt = new Date();
    const db = getFirestore();
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let geminiCalls = 0;
    let proposalsStored = 0;

    try {
      // Step 1: Read all risks and solutions
      const [risksSnap, solutionsSnap] = await Promise.all([
        db.collection("risks").get(),
        db.collection("solutions").get(),
      ]);

      // Step 2: Read approved signals from last 30 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .get();

      const allSignals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        solution_ids: (d.data().solution_ids as string[]) ?? [],
      }));

      logger.info(`Validator: ${risksSnap.size} risks, ${solutionsSnap.size} solutions, ${allSignals.length} signals`);

      // Step 3: Build risk map for parent-risk lookups
      const riskMap = new Map(risksSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));

      // Step 4: Assess each risk
      for (const riskDoc of risksSnap.docs) {
        const riskId = riskDoc.id;
        const relevantSignals = allSignals.filter((s) => s.risk_categories.includes(riskId));

        const { result, tokenUsage } = await assessRisk(
          riskId,
          riskDoc.data() as Record<string, unknown>,
          relevantSignals,
          geminiApiKey.value()
        );

        totalTokensInput += tokenUsage.input;
        totalTokensOutput += tokenUsage.output;
        geminiCalls++;

        if (result) {
          const docName = (riskDoc.data().risk_name as string) ?? riskId;
          await storeValidationProposal("risk", riskId, docName, result, relevantSignals.map((s) => s.id));
          proposalsStored++;
        }
      }

      // Step 5: Assess each solution
      for (const solutionDoc of solutionsSnap.docs) {
        const solutionId = solutionDoc.id;
        const parentRiskId = solutionDoc.data().parent_risk_id as string | undefined;
        const parentRisk = parentRiskId ? (riskMap.get(parentRiskId) ?? null) : null;
        const relevantSignals = allSignals.filter((s) => s.solution_ids.includes(solutionId));

        const { result, tokenUsage } = await assessSolution(
          solutionId,
          solutionDoc.data() as Record<string, unknown>,
          parentRisk,
          relevantSignals,
          geminiApiKey.value()
        );

        totalTokensInput += tokenUsage.input;
        totalTokensOutput += tokenUsage.output;
        geminiCalls++;

        if (result) {
          const docName = (solutionDoc.data().solution_title as string) ?? solutionId;
          await storeValidationProposal("solution", solutionId, docName, result, relevantSignals.map((s) => s.id));
          proposalsStored++;
        }
      }

      await writeAgentRunSummary({
        agentId: "validator-agent",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        metrics: {
          articlesFetched: allSignals.length,
          signalsStored: proposalsStored,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 3,
          firestoreWrites: proposalsStored,
        },
        sourcesUsed: [],
      });

      logger.info(`Validator Agent complete: ${proposalsStored} proposals from ${geminiCalls} Gemini calls`);
    } catch (err) {
      logger.error("Validator Agent failed:", err);
      await writeAgentRunSummary({
        agentId: "validator-agent",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, firestoreReads: 0, firestoreWrites: 0 },
        sourcesUsed: [],
      });
    }
  }
);
```

**Step 3: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add functions/src/index.ts functions/src/validator-agent/
git commit -m "feat(validator-agent): wire weekly scheduled function into index.ts"
```

---

## Phase 4: Approval Callable Function

### Task 9: Add applyValidationProposal callable function

**Files:**
- Modify: `functions/src/index.ts`

**Context:** Runs server-side on admin approval. Atomically writes proposed changes to `risks` or `solutions`, writes a `changelogs` entry, and marks the proposal approved. This keeps `changelogs` write rule as server-only.

**Step 1: Add import** at the top of `functions/src/index.ts`:

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
```

**Step 2: Add the callable function** at the end of `index.ts`:

```typescript
// ─── Callable: Apply Validation Proposal ────────────────────────────────────

export const applyValidationProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    // Auth check
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const db = getFirestore();
    const proposalRef = db.collection("validation_proposals").doc(proposalId);

    return db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);
      if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");

      const proposal = proposalSnap.data()!;
      if (proposal.status !== "pending") {
        throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status as string}`);
      }

      const docType = proposal.document_type as "risk" | "solution";
      const docId = proposal.document_id as string;
      const proposedChanges = proposal.proposed_changes as Record<string, { proposed_value: unknown }>;

      // Build update object from proposed changes
      const updates: Record<string, unknown> = {};
      const changeLog: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

      const docRef = db.collection(docType === "risk" ? "risks" : "solutions").doc(docId);
      const docSnap = await tx.get(docRef);
      if (!docSnap.exists) throw new HttpsError("not-found", `${docType} ${docId} not found`);

      const currentDoc = docSnap.data()!;

      for (const [field, change] of Object.entries(proposedChanges)) {
        updates[field] = change.proposed_value;
        changeLog.push({
          field,
          old_value: currentDoc[field] ?? null,
          new_value: change.proposed_value,
        });
      }

      const currentVersion = (currentDoc.version as number) ?? 0;
      updates.version = currentVersion + 1;
      updates.lastUpdated = FieldValue.serverTimestamp();
      updates.lastUpdatedBy = request.auth.uid;

      // Write updated document
      tx.update(docRef, updates);

      // Write changelog entry
      const changelogRef = db.collection("changelogs").doc();
      tx.set(changelogRef, {
        document_type: docType,
        document_id: docId,
        document_name: proposal.document_name,
        version: currentVersion + 1,
        changes: changeLog,
        proposal_id: proposalId,
        reviewed_by: request.auth.uid,
        reviewed_at: FieldValue.serverTimestamp(),
        overall_reasoning: proposal.overall_reasoning,
        confidence: proposal.confidence,
        created_at: FieldValue.serverTimestamp(),
        created_by: "validator-agent",
      });

      // Mark proposal approved
      tx.update(proposalRef, {
        status: "approved",
        reviewed_at: FieldValue.serverTimestamp(),
        reviewed_by: request.auth.uid,
      });

      return { success: true, changesApplied: changeLog.length };
    });
  }
);
```

**Step 3: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: add applyValidationProposal callable function with atomic changelog write"
```

---

## Phase 5: Remove retired agents

### Task 10: Remove retired agent exports from index.ts

**Files:**
- Modify: `functions/src/index.ts`
- Delete: `functions/src/topic-tracker/` (entire directory)
- Delete: `functions/src/risk-evaluation/` (entire directory)
- Delete: `functions/src/solution-evaluation/` (entire directory)
- Delete: `functions/src/validation/` (entire directory)
- Delete: `functions/src/consolidation/` (entire directory)

**Step 1: Remove imports for retired agents** from the top of `functions/src/index.ts`. Delete these import lines:

```typescript
// DELETE these imports:
import { clusterSignals } from "./topic-tracker/clusterer.js";
import { storeTopics } from "./topic-tracker/store.js";
import { triageRisks } from "./risk-evaluation/triage.js";
import { evaluateRisk } from "./risk-evaluation/evaluator.js";
import { storeRiskUpdates } from "./risk-evaluation/store.js";
import type { EvalRiskInput } from "./risk-evaluation/evaluator.js";
import { triageSolutions } from "./solution-evaluation/triage.js";
import { evaluateSolution } from "./solution-evaluation/evaluator.js";
import { storeSolutionUpdates } from "./solution-evaluation/store.js";
import type { EvalSolutionInput } from "./solution-evaluation/evaluator.js";
import { validateSignal } from "./validation/signal-rules.js";
import { validateRiskUpdate } from "./validation/risk-update-rules.js";
import { validateSolutionUpdate } from "./validation/solution-update-rules.js";
import { validateTopic } from "./validation/topic-rules.js";
import { checkUrls } from "./validation/url-checker.js";
import type { CollectionStats, TopicStats, UrlCheckStats } from "./validation/types.js";
import { processChangelogs } from "./consolidation/changelog.js";
import { processNarratives } from "./consolidation/narrative.js";
```

**Step 2: Remove the retired function exports** from `functions/src/index.ts`. Delete the entire bodies of: `topicTracker`, `riskEvaluation`, `solutionEvaluation`, `validationAgent`, `consolidationChangelog`, `consolidationNarrative`.

**Step 3: Delete retired source directories**

```bash
rm -rf functions/src/topic-tracker
rm -rf functions/src/risk-evaluation
rm -rf functions/src/solution-evaluation
rm -rf functions/src/validation
rm -rf functions/src/consolidation
```

**Step 4: Verify TypeScript — expect no errors**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add functions/src/index.ts
git rm -r functions/src/topic-tracker functions/src/risk-evaluation functions/src/solution-evaluation functions/src/validation functions/src/consolidation
git commit -m "chore: remove retired topic-tracker, risk-eval, solution-eval, validation, consolidation agents"
```

---

### Task 11: Update Data Lifecycle cleanup rules

**Files:**
- Modify: `functions/src/data-lifecycle.ts`

**Step 1: Remove cleanup blocks for retired collections**

In `functions/src/data-lifecycle.ts`, delete any blocks that clean up: `topics`, `risk_updates`, `solution_updates`, `validation_reports`.

**Step 2: Add cleanup for new collections**

Add two new cleanup sections (before the final return/log statement):

```typescript
// ── discovery_proposals: delete rejected after 90 days ──────────────────────
const discoveryRejectedCutoff = new Date();
discoveryRejectedCutoff.setDate(discoveryRejectedCutoff.getDate() - 90);

const rejectedDiscoverySnap = await db.collection("discovery_proposals")
  .where("status", "==", "rejected")
  .where("created_at", "<", discoveryRejectedCutoff)
  .limit(200)
  .get();

if (rejectedDiscoverySnap.size > 0) {
  const batch = db.batch();
  rejectedDiscoverySnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  logger.info(`Data lifecycle: deleted ${rejectedDiscoverySnap.size} old rejected discovery proposals`);
}

// ── validation_proposals: delete after 30 days ──────────────────────────────
const validationProposalCutoff = new Date();
validationProposalCutoff.setDate(validationProposalCutoff.getDate() - 30);

const oldValidationSnap = await db.collection("validation_proposals")
  .where("created_at", "<", validationProposalCutoff)
  .limit(200)
  .get();

if (oldValidationSnap.size > 0) {
  const batch = db.batch();
  oldValidationSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  logger.info(`Data lifecycle: deleted ${oldValidationSnap.size} old validation proposals`);
}
```

**Step 3: Verify TypeScript**

```bash
cd functions && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Full functions build**

```bash
cd functions && npm run build
```
Expected: builds cleanly to `functions/lib/`.

**Step 5: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "chore(data-lifecycle): replace retired collection rules with discovery/validation proposal cleanup"
```

---

## Phase 6: Firestore config

### Task 12: Update Firestore rules and indexes

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Step 1: Add rules for new collections** in `firestore.rules`, inside the `match /databases/{database}/documents` block:

```
// Discovery proposals: admin read + write; server creates them
match /discovery_proposals/{docId} {
  allow read: if isAdmin();
  allow write: if isAdmin();
}

// Validation proposals: admin read + write; server creates them
match /validation_proposals/{docId} {
  allow read: if isAdmin();
  allow write: if isAdmin();
}
```

**Step 2: Add composite indexes** in `firestore.indexes.json`, inside the `"indexes"` array:

```json
{
  "collectionGroup": "discovery_proposals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "validation_proposals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "document_type", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "validation_proposals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
}
```

**Step 3: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "chore(firestore): add rules and indexes for discovery/validation proposals"
```

---

## Phase 7: Admin UI

### Task 13: Split Signal Review into Risk Signals + Solution Signals tabs

**Files:**
- Modify: `src/pages/Admin.tsx`

**Step 1: Update the `Signal` interface** to include the new fields:

```typescript
interface Signal {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type?: "risk" | "solution" | "both";  // NEW
  risk_categories: string[];
  solution_ids?: string[];                       // NEW
  severity_hint: 'Critical' | 'Emerging' | 'Horizon';
  affected_groups: string[];
  confidence_score: number;
  status: SignalStatus;
  admin_notes?: string;
  fetched_at: { seconds: number } | null;
  validationIssues?: Array<{ rule: string; severity: string; message: string; field: string }>;
}
```

**Step 2: Update the `adminTab` state type** and add a `signalTypeFilter` state:

```typescript
const [adminTab, setAdminTab] = useState<'risk-signals' | 'solution-signals' | 'risk-updates' | 'solution-updates'>('risk-signals');
```

**Step 3: Update the Firestore query** in the `useEffect` to filter by `signal_type`. Replace the existing `useEffect` signal query constraints with:

```typescript
const constraints: QueryConstraint[] = [orderBy('fetched_at', 'desc')];
if (filter !== 'all') {
    constraints.unshift(where('status', '==', filter));
}
// Filter by signal type based on active tab
if (adminTab === 'risk-signals') {
    constraints.unshift(where('signal_type', 'in', ['risk', 'both']));
} else if (adminTab === 'solution-signals') {
    constraints.unshift(where('signal_type', 'in', ['solution', 'both']));
}
```

Also add `adminTab` to the `useEffect` dependency array: `}, [filter, adminTab]);`

**Step 4: Replace the tab buttons** for `'signals'` with two separate tabs:

```tsx
<button
    onClick={() => setAdminTab('risk-signals')}
    className={`py-3 text-sm transition-colors border-b-2 ${adminTab === 'risk-signals' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
>
    Risk Signals
    <span className="ml-2 text-[10px] text-gray-500">{adminTab === 'risk-signals' ? signals.length : ''}</span>
</button>
<button
    onClick={() => setAdminTab('solution-signals')}
    className={`py-3 text-sm transition-colors border-b-2 ${adminTab === 'solution-signals' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
>
    Solution Signals
    <span className="ml-2 text-[10px] text-gray-500">{adminTab === 'solution-signals' ? signals.length : ''}</span>
</button>
```

**Step 5: In the signal list panel**, add a `signal_type` badge below the status badge:

```tsx
{signal.signal_type === 'both' && (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400">
        +{adminTab === 'risk-signals'
            ? (signal.solution_ids ?? []).join(', ')
            : (signal.risk_categories ?? []).join(', ')}
    </span>
)}
```

**Step 6: In the signal detail panel**, update the "Risk Categories" section to show the correct labels based on active tab. For Solution Signals tab, show `solution_ids` prominently and `risk_categories` as secondary.

**Step 7: Update the condition** that shows the signal panel:

```tsx
{(adminTab === 'risk-signals' || adminTab === 'solution-signals') && (
    <div className="flex h-[calc(100vh-105px)]">
        {/* existing signal list + detail panel */}
    </div>
)}
```

**Step 8: Build and lint**

```bash
npm run build && npm run lint
```
Expected: no TypeScript errors, no lint warnings.

**Step 9: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat(admin): split Signal Review into Risk Signals and Solution Signals tabs"
```

---

### Task 14: Create Discovery tab component

**Files:**
- Create: `src/components/admin/DiscoveryTab.tsx`

**Context:** Left panel lists `discovery_proposals`. Right panel shows the skeleton + a form for the admin to complete the full narrative before approving. On approve, client writes the new `risks` or `solutions` document directly.

**Step 1: Create the file**

```tsx
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface DiscoveryProposal {
    id: string;
    type: 'new_risk' | 'new_solution';
    proposed_name: string;
    description: string;
    why_novel: string;
    key_themes: string[];
    supporting_signal_ids: string[];
    signal_count: number;
    suggested_parent_risk_id?: string;
    status: ProposalStatus;
    created_at: { seconds: number } | null;
    admin_notes?: string;
}

const RISK_IDS = ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10'];
const SOLUTION_STAGES = ['Research','Policy Debate','Pilot Programs','Early Adoption','Scaling','Mainstream'];

export default function DiscoveryTab() {
    const { user } = useAuth();
    const [proposals, setProposals] = useState<DiscoveryProposal[]>([]);
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<DiscoveryProposal | null>(null);
    const [saving, setSaving] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');
    const [newDocId, setNewDocId] = useState('');
    const [parentRiskId, setParentRiskId] = useState('');

    // Narrative form state (shared for both new_risk and new_solution)
    const [narrativeName, setNarrativeName] = useState('');
    const [narrativeSummary, setNarrativeSummary] = useState('');

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')];
        if (filter !== 'all') constraints.unshift(where('status', '==', filter));
        const q = query(collection(db, 'discovery_proposals'), ...constraints);
        return onSnapshot(q, (snap) => {
            setProposals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DiscoveryProposal[]);
        });
    }, [filter]);

    const selectProposal = (p: DiscoveryProposal) => {
        setSelected(p);
        setAdminNotes(p.admin_notes ?? '');
        setNarrativeName(p.proposed_name);
        setNarrativeSummary(p.description);
        setNewDocId('');
        setParentRiskId(p.suggested_parent_risk_id ?? '');
    };

    const canApprove = newDocId.trim() !== '' &&
        narrativeName.trim() !== '' &&
        narrativeSummary.trim() !== '' &&
        (selected?.type === 'new_risk' || parentRiskId !== '');

    const handleApprove = async () => {
        if (!selected || !user) return;
        setSaving(true);
        try {
            const colName = selected.type === 'new_risk' ? 'risks' : 'solutions';
            const baseDoc: Record<string, unknown> = {
                [selected.type === 'new_risk' ? 'risk_name' : 'solution_title']: narrativeName,
                summary: narrativeSummary,
                version: 1,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdFromProposal: selected.id,
            };
            if (selected.type === 'new_solution') baseDoc.parent_risk_id = parentRiskId;

            await addDoc(collection(db, colName), { ...baseDoc, id: newDocId.trim() });

            await updateDoc(doc(db, 'discovery_proposals', selected.id), {
                status: 'approved',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes || null,
                linked_document_id: newDocId.trim(),
                new_document_id: newDocId.trim(),
            });
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

    const handleReject = async () => {
        if (!selected || !user) return;
        if (!adminNotes.trim()) { alert('Add a rejection note before rejecting.'); return; }
        setSaving(true);
        try {
            await updateDoc(doc(db, 'discovery_proposals', selected.id), {
                status: 'rejected',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes,
            });
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-105px)]">
            {/* Left: proposal list */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {proposals.map((p) => (
                        <div key={p.id} onClick={() => selectProposal(p)}
                            className={`p-3 rounded cursor-pointer transition-all ${selected?.id === p.id ? 'bg-cyan-950/50 border-l-2 border-cyan-400' : 'hover:bg-white/5'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${p.type === 'new_risk' ? 'bg-red-400/15 text-red-400' : 'bg-green-400/15 text-green-400'}`}>
                                    {p.type === 'new_risk' ? 'NEW RISK' : 'NEW SOLUTION'}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' : p.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                    {p.status}
                                </span>
                            </div>
                            <div className="text-sm font-medium line-clamp-2">{p.proposed_name}</div>
                            <div className="text-[9px] text-gray-500 mt-1">{p.signal_count} signals</div>
                        </div>
                    ))}
                    {proposals.length === 0 && <div className="text-center text-gray-500 text-sm py-8">No {filter === 'all' ? '' : filter} proposals</div>}
                </div>
            </div>

            {/* Right: detail + narrative form */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl space-y-6">
                        <div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold mr-2 ${selected.type === 'new_risk' ? 'bg-red-400/15 text-red-400' : 'bg-green-400/15 text-green-400'}`}>
                                {selected.type === 'new_risk' ? 'NEW RISK' : 'NEW SOLUTION'}
                            </span>
                            <h2 className="text-xl font-bold mt-2">{selected.proposed_name}</h2>
                        </div>

                        <div className="bg-white/5 rounded p-4 space-y-3">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400">Gemini Skeleton</h3>
                            <div><span className="text-[10px] text-gray-500">Description</span><p className="text-sm text-gray-300 mt-1">{selected.description}</p></div>
                            <div><span className="text-[10px] text-gray-500">Why Novel</span><p className="text-sm text-gray-300 mt-1">{selected.why_novel}</p></div>
                            <div>
                                <span className="text-[10px] text-gray-500">Key Themes</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {selected.key_themes.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300">{t}</span>)}
                                </div>
                            </div>
                            <div><span className="text-[10px] text-gray-500">Supporting Signals</span><p className="text-sm text-gray-400 mt-1">{selected.signal_count} signals · IDs: {selected.supporting_signal_ids.slice(0, 3).join(', ')}{selected.supporting_signal_ids.length > 3 ? ` +${selected.supporting_signal_ids.length - 3} more` : ''}</p></div>
                        </div>

                        {selected.status === 'pending' && (
                            <div className="bg-white/5 rounded p-4 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400">Complete Narrative</h3>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Document ID *</label>
                                    <input value={newDocId} onChange={(e) => setNewDocId(e.target.value)}
                                        placeholder={selected.type === 'new_risk' ? 'e.g. R11' : 'e.g. S11'}
                                        className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50" />
                                </div>
                                {selected.type === 'new_solution' && (
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Parent Risk *</label>
                                        <select value={parentRiskId} onChange={(e) => setParentRiskId(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-cyan-400/50">
                                            <option value="">Select parent risk…</option>
                                            {RISK_IDS.map((r) => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Name *</label>
                                    <input value={narrativeName} onChange={(e) => setNarrativeName(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-cyan-400/50" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Summary *</label>
                                    <textarea value={narrativeSummary} onChange={(e) => setNarrativeSummary(e.target.value)} rows={4}
                                        className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                                </div>
                                <p className="text-[10px] text-gray-500">Complete the remaining fields directly in Firestore after creation, or extend this form as the registry grows.</p>
                            </div>
                        )}

                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Admin Notes {selected.status === 'pending' ? '(required for rejection)' : ''}</label>
                            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                        </div>

                        {selected.status === 'pending' && (
                            <div className="flex gap-3">
                                <button onClick={handleApprove} disabled={saving || !canApprove}
                                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    Approve & Create
                                </button>
                                <button onClick={handleReject} disabled={saving}
                                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    Reject
                                </button>
                            </div>
                        )}
                        {selected.status !== 'pending' && (
                            <span className={`text-sm px-3 py-1 rounded ${selected.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                {selected.status}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a proposal to review</div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add the unused `SOLUTION_STAGES` usage or remove it**

Note: `SOLUTION_STAGES` is defined but not used in the component above (it's available for future extension). Since `noUnusedLocals: true` is enabled in the frontend tsconfig, either use it or remove the declaration. Remove it if not rendering a stage dropdown.

**Step 3: Build and lint**

```bash
npm run build && npm run lint
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/admin/DiscoveryTab.tsx
git commit -m "feat(admin): add Discovery tab for reviewing new risk/solution proposals"
```

---

### Task 15: Create Validation tab component

**Files:**
- Create: `src/components/admin/ValidationTab.tsx`

**Step 1: Create the file**

```tsx
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, where, type QueryConstraint } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface ProposedChange {
    current_value: unknown;
    proposed_value: unknown;
    reasoning: string;
}

interface ValidationProposal {
    id: string;
    document_type: 'risk' | 'solution';
    document_id: string;
    document_name: string;
    proposed_changes: Record<string, ProposedChange>;
    overall_reasoning: string;
    confidence: number;
    supporting_signal_ids: string[];
    status: ProposalStatus;
    created_at: { seconds: number } | null;
    admin_notes?: string;
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

export default function ValidationTab() {
    const { user } = useAuth();
    const [proposals, setProposals] = useState<ValidationProposal[]>([]);
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<ValidationProposal | null>(null);
    const [editedChanges, setEditedChanges] = useState<Record<string, unknown>>({});
    const [adminNotes, setAdminNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')];
        if (filter !== 'all') constraints.unshift(where('status', '==', filter));
        const q = query(collection(db, 'validation_proposals'), ...constraints);
        return onSnapshot(q, (snap) => {
            setProposals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ValidationProposal[]);
        });
    }, [filter]);

    const selectProposal = (p: ValidationProposal) => {
        setSelected(p);
        setAdminNotes(p.admin_notes ?? '');
        setError(null);
        // Pre-fill edited values from proposed values
        const initial: Record<string, unknown> = {};
        Object.entries(p.proposed_changes).forEach(([field, change]) => {
            initial[field] = change.proposed_value;
        });
        setEditedChanges(initial);
    };

    const handleApprove = async () => {
        if (!selected || !user) return;
        setSaving(true);
        setError(null);
        try {
            // Merge edited values back into proposed_changes
            const updatedChanges: Record<string, ProposedChange> = {};
            Object.entries(selected.proposed_changes).forEach(([field, change]) => {
                updatedChanges[field] = {
                    ...change,
                    proposed_value: editedChanges[field] ?? change.proposed_value,
                };
            });

            // Write edited values to proposal doc before calling function
            await updateDoc(doc(db, 'validation_proposals', selected.id), {
                proposed_changes: updatedChanges,
                admin_notes: adminNotes || null,
            });

            const functions = getFunctions();
            const applyProposal = httpsCallable(functions, 'applyValidationProposal');
            await applyProposal({ proposalId: selected.id });
            setSelected(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Approval failed');
        } finally {
            setSaving(false);
        }
    };

    const handleReject = async () => {
        if (!selected || !user) return;
        if (!adminNotes.trim()) { alert('Add a rejection note.'); return; }
        setSaving(true);
        try {
            await updateDoc(doc(db, 'validation_proposals', selected.id), {
                status: 'rejected',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes,
            });
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

    const changeCount = selected ? Object.keys(selected.proposed_changes).length : 0;

    return (
        <div className="flex h-[calc(100vh-105px)]">
            {/* Left: proposal list */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {proposals.map((p) => (
                        <div key={p.id} onClick={() => selectProposal(p)}
                            className={`p-3 rounded cursor-pointer transition-all ${selected?.id === p.id ? 'bg-cyan-950/50 border-l-2 border-cyan-400' : 'hover:bg-white/5'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${p.document_type === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>
                                    {p.document_type.toUpperCase()}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' : p.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                    {p.status}
                                </span>
                            </div>
                            <div className="text-sm font-medium line-clamp-1">{p.document_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-gray-500">{Object.keys(p.proposed_changes).length} changes</span>
                                <span className="text-[9px] text-gray-500">·</span>
                                <span className="text-[9px] text-gray-500">{Math.round(p.confidence * 100)}% confidence</span>
                            </div>
                        </div>
                    ))}
                    {proposals.length === 0 && <div className="text-center text-gray-500 text-sm py-8">No {filter === 'all' ? '' : filter} proposals</div>}
                </div>
            </div>

            {/* Right: detail + editable changes */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl space-y-6">
                        <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${selected.document_type === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>
                                {selected.document_type.toUpperCase()}
                            </span>
                            <h2 className="text-xl font-bold">{selected.document_name}</h2>
                            <span className="text-sm text-gray-500">{Math.round(selected.confidence * 100)}% confidence</span>
                        </div>

                        <div className="bg-white/5 rounded p-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Overall Reasoning</h3>
                            <p className="text-sm text-gray-300">{selected.overall_reasoning}</p>
                            <p className="text-[10px] text-gray-500 mt-2">{selected.supporting_signal_ids.length} supporting signals</p>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400">{changeCount} Proposed Change{changeCount !== 1 ? 's' : ''}</h3>
                            {Object.entries(selected.proposed_changes).map(([field, change]) => (
                                <div key={field} className="bg-white/5 rounded p-4 space-y-2">
                                    <div className="text-xs font-mono text-cyan-400">{field}</div>
                                    <div className="flex gap-4 text-sm">
                                        <div className="flex-1">
                                            <div className="text-[10px] text-gray-500 mb-1">Current</div>
                                            <div className="text-gray-400 bg-white/5 rounded p-2 text-xs font-mono whitespace-pre-wrap">
                                                {formatValue(change.current_value)}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[10px] text-gray-500 mb-1">Proposed (editable)</div>
                                            <textarea
                                                value={typeof editedChanges[field] === 'object'
                                                    ? JSON.stringify(editedChanges[field], null, 2)
                                                    : String(editedChanges[field] ?? '')}
                                                onChange={(e) => {
                                                    try {
                                                        setEditedChanges((prev) => ({ ...prev, [field]: JSON.parse(e.target.value) }));
                                                    } catch {
                                                        setEditedChanges((prev) => ({ ...prev, [field]: e.target.value }));
                                                    }
                                                }}
                                                rows={3}
                                                disabled={selected.status !== 'pending'}
                                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs font-mono text-white resize-none focus:outline-none focus:border-cyan-400/50 disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500">{change.reasoning}</p>
                                </div>
                            ))}
                        </div>

                        {error && <div className="text-red-400 text-sm bg-red-400/10 rounded p-3">{error}</div>}

                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                        </div>

                        {selected.status === 'pending' && (
                            <div className="flex gap-3">
                                <button onClick={handleApprove} disabled={saving}
                                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    {saving ? 'Applying…' : 'Approve & Apply'}
                                </button>
                                <button onClick={handleReject} disabled={saving}
                                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    Reject
                                </button>
                            </div>
                        )}
                        {selected.status !== 'pending' && (
                            <span className={`text-sm px-3 py-1 rounded ${selected.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                {selected.status}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a proposal to review</div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Build and lint**

```bash
npm run build && npm run lint
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/admin/ValidationTab.tsx
git commit -m "feat(admin): add Validation tab with inline editing and callable function approval"
```

---

### Task 16: Wire new tabs into Admin.tsx

**Files:**
- Modify: `src/pages/Admin.tsx`

**Step 1: Add imports** at the top of `Admin.tsx`:

```typescript
import DiscoveryTab from '../components/admin/DiscoveryTab';
import ValidationTab from '../components/admin/ValidationTab';
```

**Step 2: Update `adminTab` state type** to include the new tabs:

```typescript
const [adminTab, setAdminTab] = useState<'risk-signals' | 'solution-signals' | 'discovery' | 'validation'>('risk-signals');
```

**Step 3: Add Discovery and Validation tab buttons** in the tab bar after the Solution Signals button:

```tsx
<button
    onClick={() => setAdminTab('discovery')}
    className={`py-3 text-sm transition-colors border-b-2 ${adminTab === 'discovery' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
>
    Discovery
</button>
<button
    onClick={() => setAdminTab('validation')}
    className={`py-3 text-sm transition-colors border-b-2 ${adminTab === 'validation' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
>
    Validation
</button>
```

**Step 4: Remove the old Risk Updates and Solution Updates tab buttons** (they no longer exist).

**Step 5: Add render conditions** for the new tabs (after the solution-signals panel block):

```tsx
{adminTab === 'discovery' && (
    <div className="h-[calc(100vh-105px)]">
        <DiscoveryTab />
    </div>
)}

{adminTab === 'validation' && (
    <div className="h-[calc(100vh-105px)]">
        <ValidationTab />
    </div>
)}
```

**Step 6: Remove the old RiskUpdatesTab and SolutionUpdatesTab render blocks** (and their imports at the top of Admin.tsx).

**Step 7: Build and lint**

```bash
npm run build && npm run lint
```
Expected: no errors.

**Step 8: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat(admin): wire Discovery and Validation tabs, remove retired Risk/Solution Updates tabs"
```

---

## Phase 8: Observatory + Seeds

### Task 17: Update Observatory page

**Files:**
- Modify: `src/pages/Observatory.tsx`

**Step 1: Remove the `TopicsCard` import and usage**

Delete: `import TopicsCard from '../components/observatory/TopicsCard';`

Delete the `<TopicsCard />` JSX line from the Observatory render.

**Step 2: Build and lint**

```bash
npm run build && npm run lint
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/pages/Observatory.tsx
git commit -m "feat(observatory): remove retired TopicsCard component"
```

---

### Task 18: Update agent registry seed

**Files:**
- Modify: `src/scripts/seed-agents.ts`

**Step 1: Remove retired agent entries** from the `agents` object. Delete entries for: `topic-tracker`, `risk-evaluation`, `solution-evaluation`, `validation`, `consolidation`.

**Step 2: Add new agent entries**:

```typescript
'discovery-agent': {
    name: 'Discovery Agent',
    description: 'Analyzes 30 days of approved signals to identify patterns suggesting genuinely new risk or solution topics not covered by the existing registry.',
    tier: '2A',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'discoveryAgent',
    schedule: '0 10 * * 0',
    overseerRole: 'Causality Cartographer',
},
'validator-agent': {
    name: 'Validator Agent',
    description: 'Weekly full sweep of all risks and solutions. Assesses whether current attributes still reflect reality and proposes specific updated values based on recent signal evidence.',
    tier: '2B',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'validatorAgent',
    schedule: '0 9 * * 1',
    overseerRole: 'Severity Steward',
},
```

**Step 3: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "chore(seeds): update agent registry — add discovery-agent and validator-agent, remove retired agents"
```

---

## Phase 9: Data migration

### Task 19: Migrate existing signals to add typed fields

**Files:**
- Create: `src/scripts/migrate-signal-types.ts`

**Context:** All existing signals in Firestore have `risk_categories` but no `signal_type` or `solution_ids`. This script adds the missing fields so the Admin UI queries work correctly.

**Step 1: Create the migration script**

```typescript
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault()
});

const db = getFirestore();

async function migrateSignalTypes() {
    const snap = await db.collection('signals').get();
    const BATCH_SIZE = 400;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const chunk = snap.docs.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const d of chunk) {
            const data = d.data();
            // Skip if already migrated
            if (data.signal_type !== undefined) { skipped++; continue; }

            batch.update(d.ref, {
                signal_type: 'risk',   // all existing signals are risk evidence
                solution_ids: [],
            });
            updated++;
        }

        await batch.commit();
        console.log(`Progress: ${i + chunk.length}/${snap.docs.length} processed`);
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} already migrated`);
}

migrateSignalTypes().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

**Step 2: Run against production** (after confirming `firebase use` shows correct project):

```bash
firebase use
# Confirm: ai-4-society

gcloud auth application-default login
npx tsx src/scripts/migrate-signal-types.ts
```

Expected output:
```
Progress: 400/N processed
...
Migration complete: N updated, 0 already migrated
```

**Step 3: Commit**

```bash
git add src/scripts/migrate-signal-types.ts
git commit -m "chore(migration): add script to backfill signal_type and solution_ids on existing signals"
```

---

### Task 20: Final build verification

**Step 1: Full functions build**

```bash
cd functions && npm run build
```
Expected: builds to `functions/lib/` with no errors.

**Step 2: Full frontend build**

```bash
npm run build && npm run lint
```
Expected: no TypeScript errors, no lint warnings.

**Step 3: Deploy functions**

```bash
firebase use  # confirm correct project
firebase deploy --only functions
```
Expected: deploys `signalScout`, `discoveryAgent`, `validatorAgent`, `dataLifecycle`, `usageReport`, `pipelineHealth`, `applyValidationProposal`. Retired functions are automatically removed.

**Step 4: Deploy Firestore rules and indexes**

```bash
firebase deploy --only firestore
```

**Step 5: Run agent registry seed**

```bash
gcloud auth application-default login
npx tsx src/scripts/seed-agents.ts
```

**Step 6: Final commit**

```bash
git add .
git commit -m "chore: final build verification and deployment notes"
```
