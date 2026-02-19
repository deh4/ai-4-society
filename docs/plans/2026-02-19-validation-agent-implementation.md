# Validation Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a daily scheduled Cloud Function that validates pending signals, risk updates, solution updates, and recent topics — auto-rejecting critical failures and flagging warnings for admin review.

**Architecture:** Single scheduled function (`validationAgent`) at 06:00 UTC sweeps 4 collections with per-collection rule modules. Shared URL checker does live HTTP HEAD requests. Results recorded per-document (`validationIssues` field) and per-run (`validation_reports` collection). No LLM calls — pure structural validation.

**Tech Stack:** Firebase Cloud Functions v2 (onSchedule), firebase-admin Firestore, native `fetch()` for HTTP HEAD checks, TypeScript

**Design doc:** `docs/plans/2026-02-19-validation-agent-design.md`

---

### Task 1: Firestore Rules

**Files:**
- Modify: `firestore.rules:61-65` (add validation_reports rule after solution_updates)

**Step 1: Add validation_reports rule**

Add this block after line 65 (after the solution_updates rule closing brace):

```
    // Validation reports: admin read, server write only
    match /validation_reports/{reportId} {
        allow read: if isAdmin();
        allow write: if false;
    }
```

**Step 2: Verify rules compile**

Run: `firebase deploy --only firestore:rules --project ai-4-society --dry-run` or check that `firebase emulators:start` accepts the rules.

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(validation): add firestore rules for validation_reports"
```

---

### Task 2: Shared types and URL checker

**Files:**
- Create: `functions/src/validation/types.ts`
- Create: `functions/src/validation/url-checker.ts`

**Step 1: Create types module**

Create `functions/src/validation/types.ts`:

```typescript
export interface ValidationIssue {
  rule: string;
  severity: "critical" | "warning";
  message: string;
  field: string;
}

export interface ValidationResult {
  docId: string;
  collection: string;
  issues: ValidationIssue[];
  hasCritical: boolean;
}

export interface CollectionStats {
  scanned: number;
  passed: number;
  rejected: number;
  flagged: number;
}

export interface TopicStats {
  scanned: number;
  flagged: number;
}

export interface UrlCheckStats {
  total: number;
  reachable: number;
  unreachable: number;
  timeouts: number;
}
```

**Step 2: Create URL checker**

Create `functions/src/validation/url-checker.ts`:

```typescript
import { logger } from "firebase-functions/v2";

const TIMEOUT_MS = 5_000;
const MAX_CONCURRENCY = 10;

interface UrlCheckResult {
  url: string;
  reachable: boolean;
  status?: number;
  error?: string;
}

async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "AI4Society-Validator/1.0" },
      redirect: "follow",
    });

    clearTimeout(timeout);
    const reachable = res.status >= 200 && res.status < 400;
    return { url, reachable, status: res.status };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      url,
      reachable: false,
      error: isTimeout ? "timeout" : (err instanceof Error ? err.message : "unknown"),
    };
  }
}

export async function checkUrls(urls: string[]): Promise<{
  results: Map<string, UrlCheckResult>;
  stats: { total: number; reachable: number; unreachable: number; timeouts: number };
}> {
  const unique = [...new Set(urls)];
  const results = new Map<string, UrlCheckResult>();
  const stats = { total: unique.length, reachable: 0, unreachable: 0, timeouts: 0 };

  // Process in batches of MAX_CONCURRENCY
  for (let i = 0; i < unique.length; i += MAX_CONCURRENCY) {
    const batch = unique.slice(i, i + MAX_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkUrl));
    for (const result of batchResults) {
      results.set(result.url, result);
      if (result.reachable) {
        stats.reachable++;
      } else if (result.error === "timeout") {
        stats.timeouts++;
      } else {
        stats.unreachable++;
      }
    }
  }

  logger.info(`URL checks: ${stats.reachable}/${stats.total} reachable, ${stats.unreachable} unreachable, ${stats.timeouts} timeouts`);
  return { results, stats };
}
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/validation/types.ts functions/src/validation/url-checker.ts
git commit -m "feat(validation): add shared types and URL checker"
```

---

### Task 3: Signal validation rules

**Files:**
- Create: `functions/src/validation/signal-rules.ts`

**Step 1: Create signal rules module**

Create `functions/src/validation/signal-rules.ts`:

```typescript
import type { ValidationIssue } from "./types.js";
import type { UrlCheckResult } from "./url-checker.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_SEVERITY = new Set(["Critical", "Emerging", "Horizon"]);

export function validateSignal(
  data: Record<string, unknown>,
  urlResult?: UrlCheckResult
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Critical: URL format
  const url = data.source_url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    issues.push({ rule: "url-format", severity: "critical", message: "source_url is not a valid https:// URL", field: "source_url" });
  }

  // Critical: URL reachable (if checked)
  if (urlResult && !urlResult.reachable) {
    const detail = urlResult.error === "timeout"
      ? "timed out after 5s"
      : `returned HTTP ${urlResult.status ?? urlResult.error}`;
    issues.push({ rule: "url-reachable", severity: "critical", message: `source_url ${detail}`, field: "source_url" });
  }

  // Critical: risk_categories valid
  const cats = data.risk_categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    issues.push({ rule: "risk-categories-nonempty", severity: "critical", message: "risk_categories is empty or missing", field: "risk_categories" });
  } else {
    for (const cat of cats) {
      if (!VALID_RISK_IDS.has(cat as string)) {
        issues.push({ rule: "risk-categories-valid", severity: "critical", message: `Invalid risk category: ${cat}`, field: "risk_categories" });
        break;
      }
    }
  }

  // Critical: severity_hint enum
  if (!VALID_SEVERITY.has(data.severity_hint as string)) {
    issues.push({ rule: "severity-hint-enum", severity: "critical", message: `Invalid severity_hint: ${data.severity_hint}`, field: "severity_hint" });
  }

  // Critical: confidence_score range
  const conf = data.confidence_score;
  if (typeof conf !== "number" || conf < 0 || conf > 1) {
    issues.push({ rule: "confidence-range", severity: "critical", message: `confidence_score out of range: ${conf}`, field: "confidence_score" });
  }

  // Warning: date checks
  const dateStr = data.published_date;
  if (typeof dateStr === "string") {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      issues.push({ rule: "date-parseable", severity: "warning", message: "published_date is not a valid date", field: "published_date" });
    } else {
      const now = Date.now();
      if (parsed.getTime() > now + 86_400_000) {
        issues.push({ rule: "date-not-future", severity: "warning", message: "published_date is in the future", field: "published_date" });
      }
      if (parsed.getTime() < now - 180 * 86_400_000) {
        issues.push({ rule: "date-not-stale", severity: "warning", message: "published_date is older than 180 days", field: "published_date" });
      }
    }
  }

  // Warning: title and summary nonempty
  if (!data.title || typeof data.title !== "string" || (data.title as string).trim() === "") {
    issues.push({ rule: "title-nonempty", severity: "warning", message: "title is empty", field: "title" });
  }
  if (!data.summary || typeof data.summary !== "string" || (data.summary as string).trim() === "") {
    issues.push({ rule: "summary-nonempty", severity: "warning", message: "summary is empty", field: "summary" });
  }

  return issues;
}
```

**Step 2: Verify build**

Run: `cd functions && npm run build`

**Step 3: Commit**

```bash
git add functions/src/validation/signal-rules.ts
git commit -m "feat(validation): add signal validation rules"
```

---

### Task 4: Risk update and solution update validation rules

**Files:**
- Create: `functions/src/validation/risk-update-rules.ts`
- Create: `functions/src/validation/solution-update-rules.ts`

**Step 1: Create risk update rules**

Create `functions/src/validation/risk-update-rules.ts`:

```typescript
import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_VELOCITY = new Set(["Critical", "High", "Medium", "Low"]);

export function validateRiskUpdate(
  data: Record<string, unknown>,
  signalIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const proposed = data.proposedChanges as Record<string, unknown> | undefined;
  const current = data.currentValues as Record<string, unknown> | undefined;

  // Critical: riskId valid
  if (!VALID_RISK_IDS.has(data.riskId as string)) {
    issues.push({ rule: "risk-id-valid", severity: "critical", message: `Invalid riskId: ${data.riskId}`, field: "riskId" });
  }

  // Critical: scores in range
  if (proposed) {
    for (const field of ["score_2026", "score_2035", "expert_severity", "public_perception"]) {
      const val = proposed[field];
      if (typeof val === "number" && (val < 0 || val > 100)) {
        issues.push({ rule: "scores-in-range", severity: "critical", message: `${field} out of range [0,100]: ${val}`, field: `proposedChanges.${field}` });
      }
    }
  }

  // Critical: velocity enum
  if (proposed && !VALID_VELOCITY.has(proposed.velocity as string)) {
    issues.push({ rule: "velocity-enum", severity: "critical", message: `Invalid velocity: ${proposed?.velocity}`, field: "proposedChanges.velocity" });
  }

  // Critical: delta consistency
  if (proposed && current && typeof data.scoreDelta === "number") {
    const expected = Math.abs((proposed.score_2026 as number) - (current.score_2026 as number));
    if (Math.abs(data.scoreDelta as number - expected) > 0.01) {
      issues.push({ rule: "delta-consistency", severity: "critical", message: `scoreDelta ${data.scoreDelta} != expected ${expected.toFixed(2)}`, field: "scoreDelta" });
    }
  }

  // Critical: escalation consistency
  if (typeof data.scoreDelta === "number" && typeof data.requiresEscalation === "boolean") {
    const expected = (data.scoreDelta as number) >= 5;
    if (data.requiresEscalation !== expected) {
      issues.push({ rule: "escalation-consistency", severity: "critical", message: `requiresEscalation is ${data.requiresEscalation}, expected ${expected}`, field: "requiresEscalation" });
    }
  }

  // Warning: signal refs exist
  const evidence = data.newSignalEvidence;
  if (Array.isArray(evidence)) {
    for (const e of evidence) {
      const entry = e as Record<string, unknown>;
      if (entry.signalId && !signalIds.has(entry.signalId as string)) {
        issues.push({ rule: "signal-refs-exist", severity: "warning", message: `Signal ${entry.signalId} not found`, field: "newSignalEvidence" });
      }
    }
  }

  // Warning: reasoning nonempty
  if (typeof data.reasoning !== "string" || (data.reasoning as string).length < 20) {
    issues.push({ rule: "reasoning-nonempty", severity: "warning", message: "reasoning is too short (< 20 chars)", field: "reasoning" });
  }

  // Warning: confidence range
  if (typeof data.confidence === "number" && (data.confidence < 0 || data.confidence > 1)) {
    issues.push({ rule: "confidence-range", severity: "warning", message: `confidence out of range: ${data.confidence}`, field: "confidence" });
  }

  // Warning: score creep
  if (typeof data.scoreDelta === "number" && data.scoreDelta > 15) {
    issues.push({ rule: "score-creep", severity: "warning", message: `Large score jump: ${data.scoreDelta}`, field: "scoreDelta" });
  }

  return issues;
}
```

**Step 2: Create solution update rules**

Create `functions/src/validation/solution-update-rules.ts`:

```typescript
import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_STAGES = ["Research", "Policy Debate", "Pilot Programs", "Early Adoption", "Scaling", "Mainstream"];

export function validateSolutionUpdate(
  data: Record<string, unknown>,
  approvedRiskUpdateIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const proposed = data.proposedChanges as Record<string, unknown> | undefined;
  const current = data.currentValues as Record<string, unknown> | undefined;

  // Critical: parentRiskId valid
  if (!VALID_RISK_IDS.has(data.parentRiskId as string)) {
    issues.push({ rule: "parent-risk-valid", severity: "critical", message: `Invalid parentRiskId: ${data.parentRiskId}`, field: "parentRiskId" });
  }

  // Critical: scores in range
  if (proposed) {
    for (const field of ["adoption_score_2026", "adoption_score_2035"]) {
      const val = proposed[field];
      if (typeof val === "number" && (val < 0 || val > 100)) {
        issues.push({ rule: "scores-in-range", severity: "critical", message: `${field} out of range [0,100]: ${val}`, field: `proposedChanges.${field}` });
      }
    }
  }

  // Critical: stage enum
  const stage = proposed?.implementation_stage as string | undefined;
  if (stage && !VALID_STAGES.includes(stage)) {
    issues.push({ rule: "stage-enum", severity: "critical", message: `Invalid implementation_stage: ${stage}`, field: "proposedChanges.implementation_stage" });
  }

  // Critical: delta consistency
  if (proposed && current && typeof data.scoreDelta === "number") {
    const expected = Math.abs((proposed.adoption_score_2026 as number) - (current.adoption_score_2026 as number));
    if (Math.abs(data.scoreDelta as number - expected) > 0.01) {
      issues.push({ rule: "delta-consistency", severity: "critical", message: `scoreDelta ${data.scoreDelta} != expected ${expected.toFixed(2)}`, field: "scoreDelta" });
    }
  }

  // Critical: stageChanged consistency
  if (proposed && current && typeof data.stageChanged === "boolean") {
    const expected = proposed.implementation_stage !== current.implementation_stage;
    if (data.stageChanged !== expected) {
      issues.push({ rule: "stage-consistency", severity: "critical", message: `stageChanged is ${data.stageChanged}, expected ${expected}`, field: "stageChanged" });
    }
  }

  // Critical: escalation consistency
  if (typeof data.scoreDelta === "number" && typeof data.stageChanged === "boolean" && typeof data.requiresEscalation === "boolean") {
    const expected = (data.scoreDelta as number) >= 10 || (data.stageChanged as boolean);
    if (data.requiresEscalation !== expected) {
      issues.push({ rule: "escalation-consistency", severity: "critical", message: `requiresEscalation is ${data.requiresEscalation}, expected ${expected}`, field: "requiresEscalation" });
    }
  }

  // Warning: narrative complete
  const narrative = proposed?.timeline_narrative as Record<string, unknown> | undefined;
  if (narrative) {
    for (const field of ["near_term", "mid_term", "long_term"]) {
      if (!narrative[field] || typeof narrative[field] !== "string" || (narrative[field] as string).trim() === "") {
        issues.push({ rule: "narrative-complete", severity: "warning", message: `timeline_narrative.${field} is empty`, field: `proposedChanges.timeline_narrative.${field}` });
      }
    }
  }

  // Warning: risk update refs exist
  const riskUpdateIds = data.riskUpdateIds;
  if (Array.isArray(riskUpdateIds)) {
    for (const id of riskUpdateIds) {
      if (!approvedRiskUpdateIds.has(id as string)) {
        issues.push({ rule: "risk-update-refs-exist", severity: "warning", message: `risk_update ${id} not found or not approved`, field: "riskUpdateIds" });
      }
    }
  }

  // Warning: confidence range
  if (typeof data.confidence === "number" && (data.confidence < 0 || data.confidence > 1)) {
    issues.push({ rule: "confidence-range", severity: "warning", message: `confidence out of range: ${data.confidence}`, field: "confidence" });
  }

  // Warning: stage skip
  if (stage && current?.implementation_stage) {
    const currentIdx = VALID_STAGES.indexOf(current.implementation_stage as string);
    const proposedIdx = VALID_STAGES.indexOf(stage);
    if (currentIdx >= 0 && proposedIdx >= 0 && Math.abs(proposedIdx - currentIdx) > 1) {
      issues.push({ rule: "stage-skip", severity: "warning", message: `Stage jumped from "${current.implementation_stage}" to "${stage}" (skipped ${Math.abs(proposedIdx - currentIdx) - 1} stages)`, field: "proposedChanges.implementation_stage" });
    }
  }

  return issues;
}
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/validation/risk-update-rules.ts functions/src/validation/solution-update-rules.ts
git commit -m "feat(validation): add risk update and solution update rules"
```

---

### Task 5: Topic validation rules

**Files:**
- Create: `functions/src/validation/topic-rules.ts`

**Step 1: Create topic rules**

Create `functions/src/validation/topic-rules.ts`:

```typescript
import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_VELOCITY = new Set(["rising", "stable", "declining"]);

export function validateTopic(
  data: Record<string, unknown>,
  signalIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Warning: riskCategories valid
  const cats = data.riskCategories;
  if (Array.isArray(cats)) {
    for (const cat of cats) {
      if (!VALID_RISK_IDS.has(cat as string)) {
        issues.push({ rule: "risk-categories-valid", severity: "warning", message: `Invalid risk category: ${cat}`, field: "riskCategories" });
        break;
      }
    }
  }

  // Warning: velocity enum
  if (!VALID_VELOCITY.has(data.velocity as string)) {
    issues.push({ rule: "velocity-enum", severity: "warning", message: `Invalid velocity: ${data.velocity}`, field: "velocity" });
  }

  // Warning: signalCount matches signalIds length
  const sids = data.signalIds;
  if (Array.isArray(sids) && typeof data.signalCount === "number") {
    if (data.signalCount !== sids.length) {
      issues.push({ rule: "signal-count-match", severity: "warning", message: `signalCount ${data.signalCount} != signalIds.length ${sids.length}`, field: "signalCount" });
    }
  }

  // Warning: signal refs exist
  if (Array.isArray(sids)) {
    for (const id of sids) {
      if (!signalIds.has(id as string)) {
        issues.push({ rule: "signal-refs-exist", severity: "warning", message: `Signal ${id} not found`, field: "signalIds" });
        break; // One warning is enough
      }
    }
  }

  // Warning: min signals
  if (Array.isArray(sids) && sids.length < 2) {
    issues.push({ rule: "min-signals", severity: "warning", message: `Only ${sids.length} signals (minimum 2)`, field: "signalIds" });
  }

  return issues;
}
```

**Step 2: Verify build**

Run: `cd functions && npm run build`

**Step 3: Commit**

```bash
git add functions/src/validation/topic-rules.ts
git commit -m "feat(validation): add topic validation rules"
```

---

### Task 6: Cloud Function pipeline

**Files:**
- Modify: `functions/src/index.ts:1-22` (add imports) and append after line 1074 (add validationAgent export)

**Step 1: Add imports to index.ts**

After line 22 (after the solution-evaluation imports), add:

```typescript
import { validateSignal } from "./validation/signal-rules.js";
import { validateRiskUpdate } from "./validation/risk-update-rules.js";
import { validateSolutionUpdate } from "./validation/solution-update-rules.js";
import { validateTopic } from "./validation/topic-rules.js";
import { checkUrls } from "./validation/url-checker.js";
import type { CollectionStats, TopicStats, UrlCheckStats } from "./validation/types.js";
```

**Step 2: Add validationAgent export**

Append after line 1074 (after the solutionEvaluation closing):

```typescript
// ─── Validation Agent Pipeline ──────────────────────────────────────────────

export const validationAgent = onSchedule(
  {
    schedule: "0 6 * * *",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    logger.info("Validation Agent: starting daily run");
    const runStartedAt = new Date();
    const db = getFirestore();
    let firestoreReads = 0;
    let firestoreWrites = 0;

    const signalStats: CollectionStats = { scanned: 0, passed: 0, rejected: 0, flagged: 0 };
    const riskUpdateStats: CollectionStats = { scanned: 0, passed: 0, rejected: 0, flagged: 0 };
    const solutionUpdateStats: CollectionStats = { scanned: 0, passed: 0, rejected: 0, flagged: 0 };
    const topicStats: TopicStats = { scanned: 0, flagged: 0 };
    let urlCheckStats: UrlCheckStats = { total: 0, reachable: 0, unreachable: 0, timeouts: 0 };

    try {
      // ── Step 1: Read all pending items ──────────────────────────────────

      const pendingSignalsSnap = await db.collection("signals")
        .where("status", "==", "pending")
        .get();
      firestoreReads++;

      const pendingRiskUpdatesSnap = await db.collection("risk_updates")
        .where("status", "==", "pending")
        .get();
      firestoreReads++;

      const pendingSolutionUpdatesSnap = await db.collection("solution_updates")
        .where("status", "==", "pending")
        .get();
      firestoreReads++;

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const recentTopicsSnap = await db.collection("topics")
        .where("createdAt", ">", oneDayAgo)
        .get();
      firestoreReads++;

      const totalPending = pendingSignalsSnap.size + pendingRiskUpdatesSnap.size
        + pendingSolutionUpdatesSnap.size + recentTopicsSnap.size;

      if (totalPending === 0) {
        logger.info("No pending items to validate. Ending run.");
        await writeAgentRunSummary({
          agentId: "validation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: 0, signalsStored: 0, geminiCalls: 0,
            tokensInput: 0, tokensOutput: 0,
            firestoreReads, firestoreWrites,
          },
          sourcesUsed: [],
        });
        return;
      }

      logger.info(`Found ${pendingSignalsSnap.size} signals, ${pendingRiskUpdatesSnap.size} risk updates, ${pendingSolutionUpdatesSnap.size} solution updates, ${recentTopicsSnap.size} topics to validate`);

      // ── Step 2: Build reference sets ────────────────────────────────────

      const allSignalIds = new Set<string>();
      const allSignalsSnap = await db.collection("signals").select().get();
      for (const d of allSignalsSnap.docs) allSignalIds.add(d.id);
      firestoreReads++;

      const approvedRiskUpdateIds = new Set<string>();
      const approvedRuSnap = await db.collection("risk_updates")
        .where("status", "==", "approved")
        .select()
        .get();
      for (const d of approvedRuSnap.docs) approvedRiskUpdateIds.add(d.id);
      firestoreReads++;

      // ── Step 3: Validate signals ────────────────────────────────────────

      // Collect URLs for batch checking
      const signalUrls = pendingSignalsSnap.docs
        .map((d) => d.data().source_url as string)
        .filter((url) => typeof url === "string" && url.startsWith("https://"));

      const { results: urlResults, stats: urlStats } = await checkUrls(signalUrls);
      urlCheckStats = urlStats;

      for (const docSnap of pendingSignalsSnap.docs) {
        signalStats.scanned++;
        const data = docSnap.data();
        const urlResult = urlResults.get(data.source_url as string);
        const issues = validateSignal(data as Record<string, unknown>, urlResult);

        if (issues.length === 0) {
          signalStats.passed++;
          continue;
        }

        const hasCritical = issues.some((i) => i.severity === "critical");
        const update: Record<string, unknown> = { validationIssues: issues };
        if (hasCritical) {
          update.status = "rejected";
          update.reviewedBy = "validation-agent";
          update.reviewedAt = FieldValue.serverTimestamp();
          signalStats.rejected++;
        } else {
          signalStats.flagged++;
        }

        await docSnap.ref.update(update);
        firestoreWrites++;
      }

      logger.info(`Signals: ${signalStats.scanned} scanned, ${signalStats.passed} passed, ${signalStats.rejected} rejected, ${signalStats.flagged} flagged`);

      // ── Step 4: Validate risk updates ───────────────────────────────────

      for (const docSnap of pendingRiskUpdatesSnap.docs) {
        riskUpdateStats.scanned++;
        const data = docSnap.data();
        const issues = validateRiskUpdate(data as Record<string, unknown>, allSignalIds);

        if (issues.length === 0) {
          riskUpdateStats.passed++;
          continue;
        }

        const hasCritical = issues.some((i) => i.severity === "critical");
        const update: Record<string, unknown> = { validationIssues: issues };
        if (hasCritical) {
          update.status = "rejected";
          update.reviewedBy = "validation-agent";
          update.reviewedAt = FieldValue.serverTimestamp();
          riskUpdateStats.rejected++;
        } else {
          riskUpdateStats.flagged++;
        }

        await docSnap.ref.update(update);
        firestoreWrites++;
      }

      logger.info(`Risk updates: ${riskUpdateStats.scanned} scanned, ${riskUpdateStats.passed} passed, ${riskUpdateStats.rejected} rejected, ${riskUpdateStats.flagged} flagged`);

      // ── Step 5: Validate solution updates ───────────────────────────────

      for (const docSnap of pendingSolutionUpdatesSnap.docs) {
        solutionUpdateStats.scanned++;
        const data = docSnap.data();
        const issues = validateSolutionUpdate(data as Record<string, unknown>, approvedRiskUpdateIds);

        if (issues.length === 0) {
          solutionUpdateStats.passed++;
          continue;
        }

        const hasCritical = issues.some((i) => i.severity === "critical");
        const update: Record<string, unknown> = { validationIssues: issues };
        if (hasCritical) {
          update.status = "rejected";
          update.reviewedBy = "validation-agent";
          update.reviewedAt = FieldValue.serverTimestamp();
          solutionUpdateStats.rejected++;
        } else {
          solutionUpdateStats.flagged++;
        }

        await docSnap.ref.update(update);
        firestoreWrites++;
      }

      logger.info(`Solution updates: ${solutionUpdateStats.scanned} scanned, ${solutionUpdateStats.passed} passed, ${solutionUpdateStats.rejected} rejected, ${solutionUpdateStats.flagged} flagged`);

      // ── Step 6: Audit topics ────────────────────────────────────────────

      for (const docSnap of recentTopicsSnap.docs) {
        topicStats.scanned++;
        const data = docSnap.data();
        const issues = validateTopic(data as Record<string, unknown>, allSignalIds);

        if (issues.length === 0) continue;

        topicStats.flagged++;
        await docSnap.ref.update({ validationIssues: issues });
        firestoreWrites++;
      }

      logger.info(`Topics: ${topicStats.scanned} scanned, ${topicStats.flagged} flagged`);

      // ── Step 7: Write validation report ─────────────────────────────────

      await db.collection("validation_reports").doc().set({
        runId: `val-${runStartedAt.getTime()}`,
        startedAt: runStartedAt,
        completedAt: FieldValue.serverTimestamp(),
        duration: Date.now() - runStartedAt.getTime(),
        signals: signalStats,
        riskUpdates: riskUpdateStats,
        solutionUpdates: solutionUpdateStats,
        topics: topicStats,
        urlChecks: urlCheckStats,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "validation",
      });
      firestoreWrites++;

      // ── Step 8: Track health ────────────────────────────────────────────

      const totalValidated = signalStats.scanned + riskUpdateStats.scanned
        + solutionUpdateStats.scanned + topicStats.scanned;
      const totalRejected = signalStats.rejected + riskUpdateStats.rejected
        + solutionUpdateStats.rejected;

      await writeAgentRunSummary({
        agentId: "validation",
        startedAt: runStartedAt,
        outcome: totalRejected > 0 ? "partial" : "success",
        error: null,
        metrics: {
          articlesFetched: totalValidated,
          signalsStored: totalRejected,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads,
          firestoreWrites,
        },
        sourcesUsed: [],
      });

      logger.info(`Validation complete: ${totalValidated} validated, ${totalRejected} rejected`);
    } catch (err) {
      logger.error("Validation Agent failed:", err);
      await writeAgentRunSummary({
        agentId: "validation",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0, signalsStored: 0, geminiCalls: 0,
          tokensInput: 0, tokensOutput: 0,
          firestoreReads, firestoreWrites,
        },
        sourcesUsed: [],
      });
    }
  }
);
```

Note: `FieldValue` is already imported at line 6 via `getFirestore`. Actually check — it may need to be added. The existing index.ts imports `getFirestore` from `firebase-admin/firestore`. Check if `FieldValue` is used elsewhere in index.ts. If not, add it to the import:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(validation): add validationAgent scheduled function"
```

---

### Task 7: Data lifecycle cleanup

**Files:**
- Modify: `functions/src/data-lifecycle.ts:13-21` (add to LifecycleStats interface) and append before `return stats` at line 195

**Step 1: Add validationReportsDeleted to LifecycleStats**

At `data-lifecycle.ts:13-21`, add `validationReportsDeleted: number` to the interface:

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
}
```

Also add `validationReportsDeleted: 0` to the stats initialization at line 35.

**Step 2: Add validation_reports cleanup**

Before `return stats;` at line 195, add:

```typescript
  // 8. Delete old validation reports (>30 days)
  const validationReportCutoff = daysAgo(30);
  const validationReportsQuery = db
    .collection("validation_reports")
    .where("createdAt", "<", validationReportCutoff)
    .limit(BATCH_SIZE);

  let validationReportsSnap = await validationReportsQuery.get();
  while (!validationReportsSnap.empty) {
    const batch = db.batch();
    for (const reportDoc of validationReportsSnap.docs) {
      batch.delete(reportDoc.ref);
      stats.validationReportsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${validationReportsSnap.size} old validation reports`);

    if (validationReportsSnap.size < BATCH_SIZE) break;
    validationReportsSnap = await validationReportsQuery.get();
  }
```

**Step 3: Verify build**

Run: `cd functions && npm run build`

**Step 4: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat(validation): add validation_reports cleanup to data lifecycle"
```

---

### Task 8: Admin UI — validation issue badges

**Files:**
- Modify: `src/pages/Admin.tsx:12-26` (add validationIssues to Signal interface) and signal list items at lines 210-219

**Step 1: Add validationIssues to Signal interface**

In `Admin.tsx`, add to the `Signal` interface (after line 25):

```typescript
    validationIssues?: Array<{ rule: string; severity: string; message: string; field: string }>;
```

**Step 2: Add validation badge to signal list items**

In the signal list item (around lines 211-219), after the confidence badge, add:

```tsx
{signal.validationIssues && signal.validationIssues.length > 0 && (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
        signal.validationIssues.some((i) => i.severity === 'critical')
            ? 'bg-red-400/10 text-red-400'
            : 'bg-yellow-400/10 text-yellow-400'
    }`}>
        {signal.validationIssues.length} issue{signal.validationIssues.length > 1 ? 's' : ''}
    </span>
)}
```

**Step 3: Add validation issues to detail panel**

In the detail panel (after the classification section), add a validation issues section that shows when the selected signal has issues:

```tsx
{selected.validationIssues && selected.validationIssues.length > 0 && (
    <div className="bg-red-400/5 border border-red-400/20 rounded p-4 mb-6">
        <h3 className="text-xs uppercase tracking-widest text-red-400 mb-2">Validation Issues</h3>
        <div className="space-y-1">
            {selected.validationIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`text-[9px] px-1 py-0.5 rounded mt-0.5 ${
                        issue.severity === 'critical' ? 'bg-red-400/10 text-red-400' : 'bg-yellow-400/10 text-yellow-400'
                    }`}>
                        {issue.severity}
                    </span>
                    <span className="text-gray-300">{issue.message}</span>
                    <span className="text-gray-600 text-xs">({issue.field})</span>
                </div>
            ))}
        </div>
    </div>
)}
```

**Step 4: Add similar badges to RiskUpdatesTab and SolutionUpdatesTab**

Apply the same pattern to both `src/components/admin/RiskUpdatesTab.tsx` and `src/components/admin/SolutionUpdatesTab.tsx`:
- Add `validationIssues` to the TypeScript interface
- Add issue count badge in the list view
- Add issues section in the detail panel

**Step 5: Verify build**

Run: `npm run build` (from project root)

**Step 6: Commit**

```bash
git add src/pages/Admin.tsx src/components/admin/RiskUpdatesTab.tsx src/components/admin/SolutionUpdatesTab.tsx
git commit -m "feat(validation): show validation issue badges in admin UI"
```

---

### Task 9: Observatory — Validation Reports tab

**Files:**
- Create: `src/components/observatory/ValidationReportsTab.tsx`
- Modify: `src/components/observatory/AgentDetail.tsx:5-7` (add import), lines 134-140 (add tab), line 177 (add render)

**Step 1: Create ValidationReportsTab component**

Create `src/components/observatory/ValidationReportsTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ValidationReport {
    id: string;
    runId: string;
    duration: number;
    signals: { scanned: number; passed: number; rejected: number; flagged: number };
    riskUpdates: { scanned: number; passed: number; rejected: number; flagged: number };
    solutionUpdates: { scanned: number; passed: number; rejected: number; flagged: number };
    topics: { scanned: number; flagged: number };
    urlChecks: { total: number; reachable: number; unreachable: number; timeouts: number };
    createdAt: { seconds: number } | null;
}

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

function StatRow({ label, stats }: { label: string; stats: { scanned: number; passed: number; rejected: number; flagged: number } }) {
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-32 text-gray-400">{label}</span>
            <span className="text-gray-300">{stats.scanned} scanned</span>
            <span className="text-green-400">{stats.passed} passed</span>
            {stats.rejected > 0 && <span className="text-red-400">{stats.rejected} rejected</span>}
            {stats.flagged > 0 && <span className="text-yellow-400">{stats.flagged} flagged</span>}
        </div>
    );
}

export default function ValidationReportsTab() {
    const [reports, setReports] = useState<ValidationReport[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'validation_reports'),
            orderBy('createdAt', 'desc'),
            limit(20)
        );
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setReports(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ValidationReport[]);
            },
            (error) => {
                console.error('Validation reports query error:', error);
            }
        );
        return unsubscribe;
    }, []);

    if (reports.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No validation reports yet</div>;
    }

    return (
        <div className="space-y-4">
            {reports.map((report) => (
                <div key={report.id} className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">Run: {report.runId}</span>
                        {report.createdAt && (
                            <span className="text-[10px] text-gray-500">{formatTime(report.createdAt.seconds)}</span>
                        )}
                        <span className="text-[10px] text-gray-500">{report.duration}ms</span>
                    </div>

                    <StatRow label="Signals" stats={report.signals} />
                    <StatRow label="Risk Updates" stats={report.riskUpdates} />
                    <StatRow label="Solution Updates" stats={report.solutionUpdates} />
                    <div className="flex items-center gap-3 text-sm">
                        <span className="w-32 text-gray-400">Topics</span>
                        <span className="text-gray-300">{report.topics.scanned} scanned</span>
                        {report.topics.flagged > 0 && <span className="text-yellow-400">{report.topics.flagged} flagged</span>}
                    </div>

                    <div className="border-t border-white/10 pt-2 flex items-center gap-3 text-[10px] text-gray-500">
                        <span>URLs: {report.urlChecks.total} checked</span>
                        <span className="text-green-400">{report.urlChecks.reachable} reachable</span>
                        {report.urlChecks.unreachable > 0 && <span className="text-red-400">{report.urlChecks.unreachable} dead</span>}
                        {report.urlChecks.timeouts > 0 && <span className="text-yellow-400">{report.urlChecks.timeouts} timeouts</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}
```

**Step 2: Integrate into AgentDetail**

In `AgentDetail.tsx`:

1. Add import (after line 7):
```typescript
import ValidationReportsTab from './ValidationReportsTab';
```

2. Add tab definition for validation agent (modify lines 134-140):
```typescript
const tabs = agent.id === 'topic-tracker'
    ? (['health', 'topics', 'runs'] as const)
    : agent.id === 'risk-evaluation'
    ? (['health', 'risk-updates', 'runs'] as const)
    : agent.id === 'solution-evaluation'
    ? (['health', 'solution-updates', 'runs'] as const)
    : agent.id === 'validation'
    ? (['health', 'validation-reports', 'runs'] as const)
    : (['health', 'config', 'runs'] as const);
```

3. Add render (after line 177):
```tsx
{tab === 'validation-reports' && <ValidationReportsTab />}
```

**Step 3: Verify build**

Run: `npm run build` (from project root)

**Step 4: Commit**

```bash
git add src/components/observatory/ValidationReportsTab.tsx src/components/observatory/AgentDetail.tsx
git commit -m "feat(validation): add ValidationReportsTab to Observatory"
```

---

### Task 10: Agent registry update + deploy

**Files:**
- Modify: `src/scripts/seed-agents.ts:67-76` (update validation agent entry)

**Step 1: Update seed script**

Change the validation agent entry from `status: 'not_deployed'` to:

```typescript
'validation': {
    name: 'Validation',
    description: 'Ensures data quality and consistency across the observatory. Fact-checks URLs, validates source credibility, and flags stale or conflicting data.',
    tier: '2C',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'validationAgent',
    schedule: '0 6 * * *',
    overseerRole: 'Gap Engineer',
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
git commit -m "feat(validation): update agent registry to active and deploy"
```
