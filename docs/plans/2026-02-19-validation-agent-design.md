# Validation Agent — Design Document

**Date:** 2026-02-19
**Status:** Approved
**Agent ID:** `validation`
**Tier:** 2C (Quality Layer)
**Overseer Role:** Gap Engineer

---

## Goal

Build the Validation Agent — a daily scheduled Cloud Function that scans pending signals, risk updates, solution updates, and recent topics for structural errors, invalid references, and unreachable URLs. Critical failures are auto-rejected before admin review. Warnings are flagged on documents so admins see them during review. Results are summarized in a `validation_reports` collection for audit.

## Architecture

The Validation Agent is a purely structural validator — no Gemini/LLM calls. It runs daily at 06:00 UTC, before admins typically review the overnight Signal Scout output. It sweeps 4 collections in sequence, applies per-collection rule sets, and writes results back to each document (via a `validationIssues` field) plus a summary report.

## Approach

**Single scheduled function with shared rule modules** — One Cloud Function (`validationAgent`) orchestrates the full sweep. Validation rules live in separate TypeScript modules per collection (`signal-rules.ts`, `risk-update-rules.ts`, etc.), making them testable and reusable. A shared URL checker handles live HTTP HEAD requests with concurrency limits.

Alternatives considered and deferred:
- Per-collection functions — 4 separate functions means 4 schedules, 4 run summaries, more operational overhead
- Firestore triggers — higher cost (per-document invocation), harder to batch reference checks
- Inline pre-store checks — no independent audit trail, no ability to validate cross-collection references

---

## 1. System Flow Context

### Pipeline timing

```
Signal Scout    — every 6 hours  → writes signals (status: "pending")
Validation      — 06:00 UTC daily → scans pending items, auto-rejects/flags
[Admin review]  — manual          → approves/rejects pending items
Topic Tracker   — 08:00 UTC daily → reads approved signals
Risk Evaluation — 09:00 UTC daily → reads approved signals + recent topics
Solution Eval   — 10:00 UTC Mon   → reads approved signals + topics + approved risk_updates
Data Lifecycle  — 03:00 UTC daily → prunes old data
```

### Key data flow facts

- **Signals** start as `status: "pending"`. Admin must approve before downstream agents read them.
- **Risk updates** and **solution updates** start as `status: "pending"`. Admin approval applies changes to `risks/` and `solutions/` docs.
- **Topics** have no status field — they flow directly to downstream agents with no admin gate.
- The Validation Agent acts as a **pre-admin-review quality gate** for signals/risk_updates/solution_updates, and a **post-write audit** for topics.

---

## 2. Validation Rules

Each rule has a severity (`critical` or `warning`) and targets a specific field.

### Signals (`status: "pending"`)

| Rule ID | Severity | Field | Check |
|---|---|---|---|
| `url-format` | critical | `source_url` | Valid `https://` URL format |
| `url-reachable` | critical | `source_url` | HTTP HEAD returns 2xx/3xx within 5s |
| `risk-categories-valid` | critical | `risk_categories` | Every element is R01–R10 |
| `risk-categories-nonempty` | critical | `risk_categories` | Array length > 0 |
| `severity-hint-enum` | critical | `severity_hint` | Exactly "Critical", "Emerging", or "Horizon" |
| `confidence-range` | critical | `confidence_score` | In [0.0, 1.0] |
| `date-parseable` | warning | `published_date` | Valid ISO date string |
| `date-not-future` | warning | `published_date` | Not more than 1 day in the future |
| `date-not-stale` | warning | `published_date` | Not older than 180 days |
| `title-nonempty` | warning | `title` | Non-empty string |
| `summary-nonempty` | warning | `summary` | Non-empty string |

### Risk Updates (`status: "pending"`)

| Rule ID | Severity | Field | Check |
|---|---|---|---|
| `risk-id-valid` | critical | `riskId` | Matches R01–R10 |
| `scores-in-range` | critical | `proposedChanges.*` | `score_2026`, `score_2035`, `expert_severity`, `public_perception` all in [0, 100] |
| `velocity-enum` | critical | `proposedChanges.velocity` | "Critical", "High", "Medium", or "Low" |
| `delta-consistency` | critical | `scoreDelta` | Equals `abs(proposed.score_2026 - current.score_2026)` |
| `escalation-consistency` | critical | `requiresEscalation` | Equals `scoreDelta >= 5` |
| `signal-refs-exist` | warning | `newSignalEvidence[].signalId` | Each signalId exists in `signals/` collection |
| `reasoning-nonempty` | warning | `reasoning` | Non-empty string, min 20 chars |
| `confidence-range` | warning | `confidence` | In [0.0, 1.0] |
| `score-creep` | warning | `scoreDelta` | Flag if > 15 (suspicious single-run jump) |

### Solution Updates (`status: "pending"`)

| Rule ID | Severity | Field | Check |
|---|---|---|---|
| `parent-risk-valid` | critical | `parentRiskId` | Matches R01–R10 |
| `scores-in-range` | critical | `proposedChanges.*` | `adoption_score_2026`, `adoption_score_2035` in [0, 100] |
| `stage-enum` | critical | `proposedChanges.implementation_stage` | One of: Research, Policy Debate, Pilot Programs, Early Adoption, Scaling, Mainstream |
| `delta-consistency` | critical | `scoreDelta` | Equals `abs(proposed.adoption_score_2026 - current.adoption_score_2026)` |
| `stage-consistency` | critical | `stageChanged` | Equals `proposed.stage !== current.stage` |
| `escalation-consistency` | critical | `requiresEscalation` | Equals `scoreDelta >= 10 \|\| stageChanged` |
| `narrative-complete` | warning | `proposedChanges.timeline_narrative` | All 3 fields (near_term, mid_term, long_term) non-empty |
| `risk-update-refs-exist` | warning | `riskUpdateIds` | Each ID exists in `risk_updates/` with `status: "approved"` |
| `confidence-range` | warning | `confidence` | In [0.0, 1.0] |
| `stage-skip` | warning | `proposedChanges.implementation_stage` | Didn't skip more than 1 stage position from current |

### Topics (last 24h — flag only)

| Rule ID | Severity | Field | Check |
|---|---|---|---|
| `risk-categories-valid` | warning | `riskCategories` | All elements in R01–R10 |
| `velocity-enum` | warning | `velocity` | "rising", "stable", or "declining" |
| `signal-count-match` | warning | `signalCount` | Equals `signalIds.length` |
| `signal-refs-exist` | warning | `signalIds` | Each ID exists in `signals/` collection |
| `min-signals` | warning | `signalIds` | `length >= 2` |

---

## 3. Actions on Validation Results

**Per document:**

| Condition | Action |
|---|---|
| All rules pass | No changes to the document |
| Any critical failure | Set `status: "rejected"`, add `validationIssues` array, set `reviewedBy: "validation-agent"`, `reviewedAt: serverTimestamp()` |
| Warnings only | Add `validationIssues` array, keep `status: "pending"` (admin sees warnings during review) |
| Topics | Add `validationIssues` array only (no status field to change) |

### `validationIssues` field shape

```typescript
interface ValidationIssue {
  rule: string;              // e.g. "url-reachable"
  severity: "critical" | "warning";
  message: string;           // "source_url returned HTTP 404"
  field: string;             // "source_url"
}
```

This field is added directly to the validated document (signal, risk_update, solution_update, or topic).

---

## 4. Data Model

### `validation_reports/{auto-id}`

One document per run summarizing the full sweep:

```typescript
interface ValidationReport {
  runId: string;
  startedAt: Timestamp;
  completedAt: Timestamp;
  duration: number;               // milliseconds

  signals: {
    scanned: number;
    passed: number;
    rejected: number;             // critical failures → auto-rejected
    flagged: number;              // warnings only → flagged for admin
  };
  riskUpdates: {
    scanned: number;
    passed: number;
    rejected: number;
    flagged: number;
  };
  solutionUpdates: {
    scanned: number;
    passed: number;
    rejected: number;
    flagged: number;
  };
  topics: {
    scanned: number;
    flagged: number;              // topics can only be flagged, no status
  };

  urlChecks: {
    total: number;
    reachable: number;
    unreachable: number;
    timeouts: number;
  };

  createdAt: Timestamp;
  createdBy: "validation";
}
```

### Health & run tracking

Reuses the existing pattern:
- `agents/validation/health/latest` — rolling health doc
- `agents/validation/runs/{auto-id}` — per-run summary

Via existing `writeAgentRunSummary()`.

---

## 5. Cloud Function

### Function: `validationAgent`

**Schedule:** Daily at 06:00 UTC (`0 6 * * *`)
**Memory:** 256 MiB
**Timeout:** 300s
**Secrets:** None

### Pipeline steps

```
1. Read pending items
   ├─ Pending signals (status: "pending")
   ├─ Pending risk_updates (status: "pending")
   ├─ Pending solution_updates (status: "pending")
   ├─ Recent topics (last 24h)
   │
   ├─ All empty → log "nothing to validate", record empty run, exit
   │
2. Build reference sets (for referential integrity checks)
   ├─ All signal IDs (for risk_update + topic signal ref checks)
   ├─ Approved risk_update IDs (for solution_update ref checks)
   │
3. Validate signals (structural + live URL checks)
   │  Apply signal-rules, batch URL HEAD requests (concurrency: 10)
   │  Auto-reject critical failures, flag warnings
   │
4. Validate risk_updates (structural + referential integrity)
   │  Apply risk-update-rules, check signal refs against set from step 2
   │  Auto-reject critical failures, flag warnings
   │
5. Validate solution_updates (structural + referential integrity)
   │  Apply solution-update-rules, check risk_update refs
   │  Auto-reject critical failures, flag warnings
   │
6. Audit topics (structural + referential integrity)
   │  Apply topic-rules, check signal refs
   │  Flag issues only (no status change)
   │
7. Write validation_reports/{auto-id}
   │
8. Track health via writeAgentRunSummary()
```

---

## 6. URL Checker

Shared utility at `functions/src/validation/url-checker.ts`:

- HTTP HEAD request with 5-second timeout
- Custom `User-Agent: AI4Society-Validator/1.0`
- Accept 2xx and 3xx (redirects) as valid
- 4xx, 5xx, network errors, timeouts → invalid
- Concurrency limit of 10 parallel requests
- Per-run URL cache (same URL in multiple signals checked only once)

---

## 7. Admin UI Integration

No new tab — enhance existing admin tabs to surface validation results:

- **Signal Review tab:** show validation issue badges (yellow for warnings, red for rejected) next to signals that have `validationIssues`. Expand detail panel to show the issues.
- **Risk Updates tab:** same pattern — show validation issue indicators on items with `validationIssues`.
- **Solution Updates tab:** same pattern.
- Auto-rejected items appear in the "rejected" filter with `reviewedBy: "validation-agent"`.

### Observatory AgentDetail

Add a **"Validation Reports"** tab when viewing the `validation` agent:
- Shows recent reports with scanned/passed/rejected/flagged counts per collection
- URL check stats (total/reachable/unreachable/timeouts)
- Filter by date range

---

## 8. Firestore Rules

```
// Validation reports: admin read, no client write
match /validation_reports/{reportId} {
    allow read: if isAdmin();
    allow write: if false;
}
```

No new composite indexes needed — `validation_reports` is only queried by `createdAt` desc (auto-indexed).

---

## 9. Data Lifecycle

Add `validation_reports` cleanup to the existing `dataLifecycle` function:
- Delete validation_reports older than 30 days

---

## 10. Agent Registry

Update seed script:
```typescript
'validation': {
    status: 'active',
    deployedAt: FieldValue.serverTimestamp(),
    functionName: 'validationAgent',
    schedule: '0 6 * * *',
    // ... rest unchanged
}
```

---

## 11. Files to Create/Modify

**Create:**
- `functions/src/validation/types.ts` — ValidationIssue interface, rule result types
- `functions/src/validation/signal-rules.ts` — Signal validation rules
- `functions/src/validation/risk-update-rules.ts` — Risk update validation rules
- `functions/src/validation/solution-update-rules.ts` — Solution update validation rules
- `functions/src/validation/topic-rules.ts` — Topic validation rules
- `functions/src/validation/url-checker.ts` — HTTP HEAD checker with concurrency
- `src/components/observatory/ValidationReportsTab.tsx` — Observatory tab for validation agent

**Modify:**
- `functions/src/index.ts` — Add `validationAgent` scheduled function
- `functions/src/data-lifecycle.ts` — Add validation_reports cleanup
- `firestore.rules` — Add validation_reports rule
- `src/pages/Admin.tsx` — Show validation issue badges on signals
- `src/components/admin/RiskUpdatesTab.tsx` — Show validation issue badges
- `src/components/admin/SolutionUpdatesTab.tsx` — Show validation issue badges
- `src/components/observatory/AgentDetail.tsx` — Add Validation Reports tab
- `src/scripts/seed-agents.ts` — Update validation status to active

---

## 12. Cost Estimate

- No LLM calls — zero Gemini cost
- HTTP HEAD requests: ~50-100 per run (pending signals), negligible egress
- Firestore reads: ~200-500 per run (pending docs + reference lookups)
- Firestore writes: ~50-100 per run (updating validated docs + report)
- **Total: effectively free** (well within Cloud Functions free tier)
