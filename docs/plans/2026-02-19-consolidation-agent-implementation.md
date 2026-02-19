# Consolidation Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two Cloud Functions — `consolidationChangelog` (daily) for audit trail + versioning, and `consolidationNarrative` (weekly) for Gemini-powered narrative refresh of risk/solution documents.

**Architecture:** Two scheduled Cloud Functions in `functions/src/consolidation/`. The changelog function reads approved-but-unconsolidated `risk_updates` and `solution_updates`, writes `changelogs/` docs, and increments version counters on target risk/solution docs. The narrative function reads recent changelogs, identifies significantly changed docs, and uses Gemini to incrementally revise `summary`, `deep_dive`, and `who_affected` fields.

**Tech Stack:** Firebase Cloud Functions v2 (onSchedule), firebase-admin Firestore, Google Generative AI (Gemini 2.0 Flash), TypeScript

**Design doc:** `docs/plans/2026-02-19-consolidation-agent-design.md`

---

### Task 1: Firestore Rules

**Files:**
- Modify: `firestore.rules:67-71` (add changelogs rule after validation_reports)

**Step 1: Add changelogs rule**

Add this block after line 71 (after the validation_reports rule closing brace):

```
    // Changelogs: admin read, server write only (audit trail)
    match /changelogs/{changelogId} {
        allow read: if isAdmin();
        allow write: if false;
    }
```

**Step 2: Verify rules compile**

Run: `firebase deploy --only firestore:rules --project ai-4-society --dry-run` or build check.

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(consolidation): add firestore rules for changelogs collection"
```

---

### Task 2: Shared types

**Files:**
- Create: `functions/src/consolidation/types.ts`

**Step 1: Create types module**

Create `functions/src/consolidation/types.ts`:

```typescript
export interface ChangelogChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ChangelogDoc {
  documentType: "risk" | "solution";
  documentId: string;
  version: number;
  changes: ChangelogChange[];
  updateId: string;
  reviewedBy: string;
  reviewedAt: FirebaseFirestore.Timestamp;
  createdBy: string;
  reasoning: string;
  confidence: number;
  createdAt: FirebaseFirestore.FieldValue;
}

export interface ChangelogStats {
  riskChangelogsWritten: number;
  solutionChangelogsWritten: number;
  skippedNoChanges: number;
}

export interface NarrativeStats {
  risksRefreshed: number;
  solutionsRefreshed: number;
  skippedInsignificant: number;
  geminiCalls: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface NarrativeRiskResult {
  summary: string;
  deep_dive: string;
  who_affected: string[];
}

export interface NarrativeSolutionResult {
  summary: string;
  deep_dive: string;
}
```

**Step 2: Verify build**

Run: `cd functions && npm run build`

**Step 3: Commit**

```bash
git add functions/src/consolidation/types.ts
git commit -m "feat(consolidation): add shared types"
```

---

### Task 3: Changelog module

**Files:**
- Create: `functions/src/consolidation/changelog.ts`

**Step 1: Create changelog module**

Create `functions/src/consolidation/changelog.ts`:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ChangelogChange, ChangelogStats } from "./types.js";

const RISK_DIFF_FIELDS = ["score_2026", "score_2035", "velocity", "expert_severity", "public_perception"];
const SOLUTION_DIFF_FIELDS = ["adoption_score_2026", "adoption_score_2035", "implementation_stage", "timeline_narrative"];

function extractChanges(
  currentValues: Record<string, unknown>,
  proposedChanges: Record<string, unknown>,
  fields: string[]
): ChangelogChange[] {
  const changes: ChangelogChange[] = [];
  for (const field of fields) {
    const oldVal = currentValues[field];
    const newVal = proposedChanges[field];
    if (oldVal === undefined || newVal === undefined) continue;
    // Deep compare for objects (timeline_narrative)
    if (typeof oldVal === "object" && typeof newVal === "object") {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    } else if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

export async function processChangelogs(): Promise<ChangelogStats> {
  const db = getFirestore();
  const stats: ChangelogStats = { riskChangelogsWritten: 0, solutionChangelogsWritten: 0, skippedNoChanges: 0 };

  // Read approved-but-unconsolidated risk updates
  const riskUpdatesSnap = await db.collection("risk_updates")
    .where("status", "==", "approved")
    .where("consolidated", "!=", true)
    .get();

  // Read approved-but-unconsolidated solution updates
  const solutionUpdatesSnap = await db.collection("solution_updates")
    .where("status", "==", "approved")
    .where("consolidated", "!=", true)
    .get();

  logger.info(`Found ${riskUpdatesSnap.size} risk updates and ${solutionUpdatesSnap.size} solution updates to consolidate`);

  // Process risk updates
  for (const updateDoc of riskUpdatesSnap.docs) {
    const data = updateDoc.data();
    const currentValues = (data.currentValues ?? {}) as Record<string, unknown>;
    const proposedChanges = (data.proposedChanges ?? {}) as Record<string, unknown>;
    const changes = extractChanges(currentValues, proposedChanges, RISK_DIFF_FIELDS);

    if (changes.length === 0) {
      stats.skippedNoChanges++;
      // Still mark as consolidated
      await updateDoc.ref.update({ consolidated: true });
      continue;
    }

    // Read current version from risk doc
    const riskRef = db.collection("risks").doc(data.riskId as string);
    const riskSnap = await riskRef.get();
    const currentVersion = (riskSnap.exists ? (riskSnap.data()?.version as number) : 0) || 0;
    const newVersion = currentVersion + 1;

    // Atomic batch: changelog + version bump + mark consolidated
    const batch = db.batch();

    const changelogRef = db.collection("changelogs").doc();
    batch.set(changelogRef, {
      documentType: "risk",
      documentId: data.riskId,
      version: newVersion,
      changes,
      updateId: updateDoc.id,
      reviewedBy: data.reviewedBy ?? "unknown",
      reviewedAt: data.reviewedAt ?? null,
      createdBy: data.createdBy ?? "risk-evaluation",
      reasoning: data.reasoning ?? "",
      confidence: data.confidence ?? 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(riskRef, {
      version: newVersion,
      "metadata.lastUpdated": FieldValue.serverTimestamp(),
      "metadata.lastUpdatedBy": "consolidation",
      "metadata.lastChangelogId": changelogRef.id,
    });

    batch.update(updateDoc.ref, { consolidated: true });

    await batch.commit();
    stats.riskChangelogsWritten++;
    logger.info(`Changelog v${newVersion} for risk ${data.riskId}: ${changes.length} field(s) changed`);
  }

  // Process solution updates
  for (const updateDoc of solutionUpdatesSnap.docs) {
    const data = updateDoc.data();
    const currentValues = (data.currentValues ?? {}) as Record<string, unknown>;
    const proposedChanges = (data.proposedChanges ?? {}) as Record<string, unknown>;
    const changes = extractChanges(currentValues, proposedChanges, SOLUTION_DIFF_FIELDS);

    if (changes.length === 0) {
      stats.skippedNoChanges++;
      await updateDoc.ref.update({ consolidated: true });
      continue;
    }

    // Read current version from solution doc
    const solutionRef = db.collection("solutions").doc(data.solutionId as string);
    const solutionSnap = await solutionRef.get();
    const currentVersion = (solutionSnap.exists ? (solutionSnap.data()?.version as number) : 0) || 0;
    const newVersion = currentVersion + 1;

    // Atomic batch
    const batch = db.batch();

    const changelogRef = db.collection("changelogs").doc();
    batch.set(changelogRef, {
      documentType: "solution",
      documentId: data.solutionId,
      version: newVersion,
      changes,
      updateId: updateDoc.id,
      reviewedBy: data.reviewedBy ?? "unknown",
      reviewedAt: data.reviewedAt ?? null,
      createdBy: data.createdBy ?? "solution-evaluation",
      reasoning: data.reasoning ?? "",
      confidence: data.confidence ?? 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(solutionRef, {
      version: newVersion,
      "metadata.lastUpdated": FieldValue.serverTimestamp(),
      "metadata.lastUpdatedBy": "consolidation",
      "metadata.lastChangelogId": changelogRef.id,
    });

    batch.update(updateDoc.ref, { consolidated: true });

    await batch.commit();
    stats.solutionChangelogsWritten++;
    logger.info(`Changelog v${newVersion} for solution ${data.solutionId}: ${changes.length} field(s) changed`);
  }

  return stats;
}
```

**Step 2: Verify build**

Run: `cd functions && npm run build`

**Step 3: Commit**

```bash
git add functions/src/consolidation/changelog.ts
git commit -m "feat(consolidation): add changelog diff extraction and batch write module"
```

---

### Task 4: Narrative module

**Files:**
- Create: `functions/src/consolidation/narrative.ts`

**Step 1: Create narrative module**

Create `functions/src/consolidation/narrative.ts`:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { NarrativeStats, NarrativeRiskResult, NarrativeSolutionResult } from "./types.js";

const SIGNIFICANCE_SCORE_DELTA = 5;
const SIGNIFICANCE_SIGNAL_COUNT = 3;

interface ChangelogEntry {
  documentType: string;
  documentId: string;
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  reasoning: string;
}

function isSignificantRisk(changelogs: ChangelogEntry[], newSignalCount: number): boolean {
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      if (
        (change.field === "score_2026" || change.field === "score_2035") &&
        typeof change.oldValue === "number" &&
        typeof change.newValue === "number"
      ) {
        if (Math.abs(change.newValue - change.oldValue) >= SIGNIFICANCE_SCORE_DELTA) return true;
      }
    }
  }
  if (newSignalCount >= SIGNIFICANCE_SIGNAL_COUNT) return true;
  return false;
}

function isSignificantSolution(changelogs: ChangelogEntry[]): boolean {
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      if (change.field === "implementation_stage" && change.oldValue !== change.newValue) return true;
      if (
        (change.field === "adoption_score_2026" || change.field === "adoption_score_2035") &&
        typeof change.oldValue === "number" &&
        typeof change.newValue === "number"
      ) {
        if (Math.abs(change.newValue - change.oldValue) >= SIGNIFICANCE_SCORE_DELTA) return true;
      }
    }
  }
  return false;
}

function formatChangesForPrompt(changelogs: ChangelogEntry[]): string {
  const lines: string[] = [];
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      lines.push(`- ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
    }
    if (cl.reasoning) lines.push(`  Reasoning: ${cl.reasoning}`);
  }
  return lines.join("\n");
}

async function refreshRiskNarrative(
  riskId: string,
  riskData: Record<string, unknown>,
  changelogs: ChangelogEntry[],
  recentSignals: Array<{ headline: string; source: string; date: string }>,
  geminiApiKey: string
): Promise<{ result: NarrativeRiskResult; tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const changesFormatted = formatChangesForPrompt(changelogs);
  const signalsFormatted = recentSignals
    .map((s) => `- "${s.headline}" (${s.source}, ${s.date})`)
    .join("\n");

  const prompt = `You are updating the narrative for an AI risk tracked by the AI 4 Society Observatory.

RISK: ${riskData.risk_name} (${riskId})

CURRENT NARRATIVE:
Summary: ${riskData.summary ?? "(none)"}

Deep Dive: ${riskData.deep_dive ?? "(none)"}

Who Affected: ${JSON.stringify(riskData.who_affected ?? [])}

RECENT CHANGES (last 7 days):
${changesFormatted}

NEW SIGNAL EVIDENCE:
${signalsFormatted || "(none)"}

INSTRUCTIONS:
- Revise the summary, deep_dive, and who_affected to incorporate these changes
- Keep the existing tone, structure, and approximate length
- Only modify sentences directly affected by the new data
- Do NOT remove existing content unless it's contradicted by new evidence
- Preserve all markdown formatting
- who_affected should be an array of strings (stakeholder groups)

Return a single JSON object (no markdown fences):
{ "summary": "...", "deep_dive": "...", "who_affected": ["..."] }`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
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
  const parsed = JSON.parse(text) as NarrativeRiskResult;

  if (typeof parsed.summary !== "string" || typeof parsed.deep_dive !== "string" || !Array.isArray(parsed.who_affected)) {
    throw new Error(`Invalid narrative response for risk ${riskId}`);
  }

  return { result: parsed, tokenUsage };
}

async function refreshSolutionNarrative(
  solutionId: string,
  solutionData: Record<string, unknown>,
  changelogs: ChangelogEntry[],
  geminiApiKey: string
): Promise<{ result: NarrativeSolutionResult; tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const changesFormatted = formatChangesForPrompt(changelogs);

  const prompt = `You are updating the narrative for an AI solution tracked by the AI 4 Society Observatory.

SOLUTION: ${solutionData.solution_title} (${solutionId})
Parent Risk: ${solutionData.parent_risk_id}
Implementation Stage: ${solutionData.implementation_stage}
Adoption Score 2026: ${solutionData.adoption_score_2026}
Key Players: ${JSON.stringify(solutionData.key_players ?? [])}
Barriers: ${JSON.stringify(solutionData.barriers ?? [])}

CURRENT NARRATIVE:
Summary: ${solutionData.summary ?? "(none)"}

Deep Dive: ${solutionData.deep_dive ?? "(none)"}

RECENT CHANGES (last 7 days):
${changesFormatted}

INSTRUCTIONS:
- Revise the summary and deep_dive to incorporate these changes
- Keep the existing tone, structure, and approximate length
- Only modify sentences directly affected by the new data
- Do NOT remove existing content unless it's contradicted by new evidence
- Preserve all markdown formatting

Return a single JSON object (no markdown fences):
{ "summary": "...", "deep_dive": "..." }`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
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
  const parsed = JSON.parse(text) as NarrativeSolutionResult;

  if (typeof parsed.summary !== "string" || typeof parsed.deep_dive !== "string") {
    throw new Error(`Invalid narrative response for solution ${solutionId}`);
  }

  return { result: parsed, tokenUsage };
}

export async function processNarratives(geminiApiKey: string): Promise<NarrativeStats> {
  const db = getFirestore();
  const stats: NarrativeStats = {
    risksRefreshed: 0, solutionsRefreshed: 0,
    skippedInsignificant: 0, geminiCalls: 0,
    tokensInput: 0, tokensOutput: 0,
  };

  // Read changelogs from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const changelogsSnap = await db.collection("changelogs")
    .where("createdAt", ">", sevenDaysAgo)
    .get();

  if (changelogsSnap.empty) {
    logger.info("No recent changelogs. Skipping narrative refresh.");
    return stats;
  }

  // Group by documentId
  const riskChangelogs = new Map<string, ChangelogEntry[]>();
  const solutionChangelogs = new Map<string, ChangelogEntry[]>();

  for (const doc of changelogsSnap.docs) {
    const data = doc.data() as ChangelogEntry;
    if (data.documentType === "risk") {
      const existing = riskChangelogs.get(data.documentId) ?? [];
      existing.push(data);
      riskChangelogs.set(data.documentId, existing);
    } else if (data.documentType === "solution") {
      const existing = solutionChangelogs.get(data.documentId) ?? [];
      existing.push(data);
      solutionChangelogs.set(data.documentId, existing);
    }
  }

  // Process risks
  for (const [riskId, changelogs] of riskChangelogs) {
    // Count new signal evidence from the updates
    let newSignalCount = 0;
    for (const cl of changelogs) {
      // Check if the corresponding risk_update had signal evidence
      const updateSnap = await db.collection("risk_updates").doc(cl.updateId).get();
      if (updateSnap.exists) {
        const evidence = updateSnap.data()?.newSignalEvidence;
        if (Array.isArray(evidence)) newSignalCount += evidence.length;
      }
    }

    if (!isSignificantRisk(changelogs, newSignalCount)) {
      stats.skippedInsignificant++;
      logger.info(`Skipping narrative refresh for risk ${riskId} (not significant)`);
      continue;
    }

    const riskSnap = await db.collection("risks").doc(riskId).get();
    if (!riskSnap.exists) continue;
    const riskData = riskSnap.data() as Record<string, unknown>;

    // Get recent approved signals for this risk
    const recentSignals: Array<{ headline: string; source: string; date: string }> = [];
    const signalEvidence = riskData.signal_evidence;
    if (Array.isArray(signalEvidence)) {
      for (const e of signalEvidence) {
        const entry = e as Record<string, unknown>;
        if (entry.isNew === true) {
          recentSignals.push({
            headline: (entry.headline as string) ?? "",
            source: (entry.source as string) ?? "",
            date: (entry.date as string) ?? "",
          });
        }
      }
    }

    try {
      const { result, tokenUsage } = await refreshRiskNarrative(riskId, riskData, changelogs, recentSignals, geminiApiKey);
      stats.geminiCalls++;
      stats.tokensInput += tokenUsage.input;
      stats.tokensOutput += tokenUsage.output;

      await db.collection("risks").doc(riskId).update({
        summary: result.summary,
        deep_dive: result.deep_dive,
        who_affected: result.who_affected,
      });
      stats.risksRefreshed++;
      logger.info(`Refreshed narrative for risk ${riskId}`);
    } catch (err) {
      logger.error(`Narrative refresh failed for risk ${riskId}:`, err);
    }
  }

  // Process solutions
  for (const [solutionId, changelogs] of solutionChangelogs) {
    if (!isSignificantSolution(changelogs)) {
      stats.skippedInsignificant++;
      logger.info(`Skipping narrative refresh for solution ${solutionId} (not significant)`);
      continue;
    }

    const solutionSnap = await db.collection("solutions").doc(solutionId).get();
    if (!solutionSnap.exists) continue;
    const solutionData = solutionSnap.data() as Record<string, unknown>;

    try {
      const { result, tokenUsage } = await refreshSolutionNarrative(solutionId, solutionData, changelogs, geminiApiKey);
      stats.geminiCalls++;
      stats.tokensInput += tokenUsage.input;
      stats.tokensOutput += tokenUsage.output;

      await db.collection("solutions").doc(solutionId).update({
        summary: result.summary,
        deep_dive: result.deep_dive,
      });
      stats.solutionsRefreshed++;
      logger.info(`Refreshed narrative for solution ${solutionId}`);
    } catch (err) {
      logger.error(`Narrative refresh failed for solution ${solutionId}:`, err);
    }
  }

  return stats;
}
```

**Step 2: Verify build**

Run: `cd functions && npm run build`

**Step 3: Commit**

```bash
git add functions/src/consolidation/narrative.ts
git commit -m "feat(consolidation): add Gemini narrative refresh module"
```

---

### Task 5: Cloud Functions in index.ts

**Files:**
- Modify: `functions/src/index.ts:22-28` (add imports after validation imports)
- Modify: `functions/src/index.ts:1334` (append both function exports after validationAgent)

**Step 1: Add imports**

After line 28 (after the validation type import `import type { CollectionStats, TopicStats, UrlCheckStats } from "./validation/types.js";`), add:

```typescript
import { processChangelogs } from "./consolidation/changelog.js";
import { processNarratives } from "./consolidation/narrative.js";
```

**Step 2: Add consolidationChangelog export**

Append after line 1335 (after the validationAgent closing `);`):

```typescript

// ─── Consolidation Agent: Changelog Pipeline ────────────────────────────────

export const consolidationChangelog = onSchedule(
  {
    schedule: "0 12 * * *",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    logger.info("Consolidation Changelog: starting daily run");
    const runStartedAt = new Date();

    try {
      const stats = await processChangelogs();

      const totalWritten = stats.riskChangelogsWritten + stats.solutionChangelogsWritten;
      await writeAgentRunSummary({
        agentId: "consolidation",
        startedAt: runStartedAt,
        outcome: totalWritten > 0 ? "success" : "empty",
        error: null,
        metrics: {
          articlesFetched: totalWritten,
          signalsStored: stats.skippedNoChanges,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 0,
          firestoreWrites: totalWritten * 3, // changelog + version bump + consolidated flag
        },
        sourcesUsed: [],
      });

      logger.info(`Consolidation Changelog complete: ${stats.riskChangelogsWritten} risk + ${stats.solutionChangelogsWritten} solution changelogs, ${stats.skippedNoChanges} skipped`);
    } catch (err) {
      logger.error("Consolidation Changelog failed:", err);
      await writeAgentRunSummary({
        agentId: "consolidation",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0, signalsStored: 0, geminiCalls: 0,
          tokensInput: 0, tokensOutput: 0,
          firestoreReads: 0, firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);

// ─── Consolidation Agent: Narrative Pipeline ────────────────────────────────

export const consolidationNarrative = onSchedule(
  {
    schedule: "0 14 * * 2",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Consolidation Narrative: starting weekly run");
    const runStartedAt = new Date();

    try {
      const stats = await processNarratives(geminiApiKey.value());

      const totalRefreshed = stats.risksRefreshed + stats.solutionsRefreshed;
      await writeAgentRunSummary({
        agentId: "consolidation",
        startedAt: runStartedAt,
        outcome: totalRefreshed > 0 ? "success" : "empty",
        error: null,
        metrics: {
          articlesFetched: totalRefreshed,
          signalsStored: stats.skippedInsignificant,
          geminiCalls: stats.geminiCalls,
          tokensInput: stats.tokensInput,
          tokensOutput: stats.tokensOutput,
          firestoreReads: 0,
          firestoreWrites: totalRefreshed,
        },
        sourcesUsed: [],
      });

      logger.info(`Consolidation Narrative complete: ${stats.risksRefreshed} risks + ${stats.solutionsRefreshed} solutions refreshed, ${stats.skippedInsignificant} skipped`);
    } catch (err) {
      logger.error("Consolidation Narrative failed:", err);
      await writeAgentRunSummary({
        agentId: "consolidation",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0, signalsStored: 0, geminiCalls: 0,
          tokensInput: 0, tokensOutput: 0,
          firestoreReads: 0, firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(consolidation): add consolidationChangelog and consolidationNarrative Cloud Functions"
```

---

### Task 6: Data lifecycle cleanup

**Files:**
- Modify: `functions/src/data-lifecycle.ts:13-22` (add changelogsDeleted to LifecycleStats)
- Modify: `functions/src/data-lifecycle.ts:36` (add to stats init)
- Modify: `functions/src/data-lifecycle.ts:217` (add cleanup block before return)

**Step 1: Add changelogsDeleted to LifecycleStats**

At `data-lifecycle.ts:13-22`, add `changelogsDeleted: number` to the interface:

```typescript
interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  topicsDeleted: number;
  riskUpdatesDeleted: number;
  solutionUpdatesDeleted: number;
  validationReportsDeleted: number;
  changelogsDeleted: number;
}
```

Also add `changelogsDeleted: 0` to the stats initialization at line 36.

**Step 2: Add changelogs cleanup**

Before `return stats;` at line 217, add:

```typescript
  // 9. Delete old changelogs (>180 days — longer retention for audit trail)
  const changelogCutoff = daysAgo(180);
  const changelogsQuery = db
    .collection("changelogs")
    .where("createdAt", "<", changelogCutoff)
    .limit(BATCH_SIZE);

  let changelogsSnap = await changelogsQuery.get();
  while (!changelogsSnap.empty) {
    const batch = db.batch();
    for (const changelogDoc of changelogsSnap.docs) {
      batch.delete(changelogDoc.ref);
      stats.changelogsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${changelogsSnap.size} old changelogs`);

    if (changelogsSnap.size < BATCH_SIZE) break;
    changelogsSnap = await changelogsQuery.get();
  }
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat(consolidation): add changelogs cleanup to data lifecycle (180-day retention)"
```

---

### Task 7: Observatory UI — ChangelogsTab

**Files:**
- Create: `src/components/observatory/ChangelogsTab.tsx`
- Modify: `src/components/observatory/AgentDetail.tsx:8` (add import)
- Modify: `src/components/observatory/AgentDetail.tsx:98` (add to tab union type)
- Modify: `src/components/observatory/AgentDetail.tsx:141-143` (add tab condition)
- Modify: `src/components/observatory/AgentDetail.tsx:181` (add tab render)

**Step 1: Create ChangelogsTab component**

Create `src/components/observatory/ChangelogsTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ChangelogEntry {
    id: string;
    documentType: 'risk' | 'solution';
    documentId: string;
    version: number;
    changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    reasoning: string;
    confidence: number;
    reviewedBy: string;
    createdBy: string;
    createdAt: { seconds: number } | null;
}

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 80) + '…';
    return String(val);
}

export default function ChangelogsTab() {
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'changelogs'),
            orderBy('createdAt', 'desc'),
            limit(30)
        );
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChangelogEntry[]);
            },
            (error) => {
                console.error('Changelogs query error:', error);
            }
        );
        return unsubscribe;
    }, []);

    if (entries.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No changelogs yet</div>;
    }

    return (
        <div className="space-y-3">
            {entries.map((entry) => (
                <div key={entry.id} className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-2">
                    <div className="flex items-center gap-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${
                            entry.documentType === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'
                        }`}>
                            {entry.documentType}
                        </span>
                        <span className="text-sm font-medium">{entry.documentId}</span>
                        <span className="text-[10px] text-gray-500">v{entry.version}</span>
                        {entry.createdAt && (
                            <span className="text-[10px] text-gray-500">{formatTime(entry.createdAt.seconds)}</span>
                        )}
                    </div>

                    <div className="space-y-1">
                        {entry.changes.map((change, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400 w-40 shrink-0">{change.field}</span>
                                <span className="text-red-400/70">{formatValue(change.oldValue)}</span>
                                <span className="text-gray-600">→</span>
                                <span className="text-green-400/70">{formatValue(change.newValue)}</span>
                            </div>
                        ))}
                    </div>

                    {entry.reasoning && (
                        <div className="text-[11px] text-gray-500 border-t border-white/5 pt-2 line-clamp-2">
                            {entry.reasoning}
                        </div>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-gray-600">
                        <span>by {entry.createdBy}</span>
                        <span>confidence: {(entry.confidence * 100).toFixed(0)}%</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
```

**Step 2: Integrate into AgentDetail**

In `AgentDetail.tsx`:

1. Add import after line 8 (after ValidationReportsTab):
```typescript
import ChangelogsTab from './ChangelogsTab';
```

2. Update tab union type at line 98 — add `'changelogs'` to the union:
```typescript
const [tab, setTab] = useState<'health' | 'config' | 'runs' | 'topics' | 'risk-updates' | 'solution-updates' | 'validation-reports' | 'changelogs'>('health');
```

3. Add tab condition at lines 141-142 (before the default fallback, after validation):
```typescript
        : agent.id === 'consolidation'
        ? (['health', 'changelogs', 'runs'] as const)
```

4. Add tab render after line 181 (after validation-reports render):
```tsx
                {tab === 'changelogs' && <ChangelogsTab />}
```

**Step 3: Verify build**

Run: `npm run build` (from project root)

**Step 4: Commit**

```bash
git add src/components/observatory/ChangelogsTab.tsx src/components/observatory/AgentDetail.tsx
git commit -m "feat(consolidation): add ChangelogsTab to Observatory"
```

---

### Task 8: Firestore index for consolidated query

**Files:**
- Modify: `firestore.indexes.json` (add composite index for the `consolidated != true` query)

**Step 1: Check current indexes**

Read `firestore.indexes.json` to see the current structure.

**Step 2: Add composite indexes**

The `processChangelogs` function queries `risk_updates` and `solution_updates` with `where("status", "==", "approved").where("consolidated", "!=", true)`. Firestore requires composite indexes for multi-field queries. Add:

```json
{
  "collectionGroup": "risk_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "consolidated", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "solution_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "consolidated", "order": "ASCENDING" }
  ]
}
```

Also add an index for the changelogs `createdAt` query used by the narrative function:

```json
{
  "collectionGroup": "changelogs",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

**Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(consolidation): add Firestore indexes for consolidated queries"
```

---

### Task 9: Agent registry update + deploy

**Files:**
- Modify: `src/scripts/seed-agents.ts:77-86` (update consolidation entry)

**Step 1: Update seed script**

Change the consolidation agent entry from `status: 'not_deployed'` to:

```typescript
'consolidation': {
    name: 'Consolidation',
    description: 'Aggregates approved updates, writes changelogs with version tracking, and refreshes risk/solution narratives using Gemini.',
    tier: '2C',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'consolidationChangelog,consolidationNarrative',
    schedule: '0 12 * * * / 0 14 * * 2',
    overseerRole: 'Forecast Scribe',
},
```

**Step 2: Verify both builds**

Run: `npm run build` and `cd functions && npm run build`

**Step 3: Deploy**

```bash
firebase deploy --only functions,firestore,hosting --project ai-4-society
```

**Step 4: Run seed script**

```bash
npx tsx src/scripts/seed-agents.ts
```

**Step 5: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat(consolidation): update agent registry to active and deploy"
```
