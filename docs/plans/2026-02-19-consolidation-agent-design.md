# Consolidation Agent — Design

**Agent ID:** `consolidation`
**Tier:** 2C (Quality Layer)
**Overseer Role:** Forecast Scribe
**Date:** 2026-02-19

---

## Goal

Build two Cloud Functions that provide changelog/versioning and narrative refresh for risk and solution documents. The Consolidation Agent bridges the gap between admin-approved updates and a full audit trail with living narrative content.

## Architecture

Two separate Cloud Functions with independent schedules:

| Function | Schedule | Memory | Secrets | Purpose |
|---|---|---|---|---|
| `consolidationChangelog` | `0 12 * * *` (daily noon UTC) | 256 MiB | None | Changelog + version tracking |
| `consolidationNarrative` | `0 14 * * 2` (Tuesdays 14:00 UTC) | 512 MiB | `GEMINI_API_KEY` | Incremental narrative refresh |

### Pipeline Position

```
Signal Scout (6h) → Validation (06:00) → [Admin Gate 1] → Topic Tracker (08:00)
→ Risk Eval (09:00) → Solution Eval (Mon 10:00) → [Admin Gate 2]
→ Consolidation Changelog (12:00) → Consolidation Narrative (Tue 14:00)
→ Data Lifecycle (03:00)
```

### Design Rationale

- **Two functions instead of one:** Changelog is cheap (no Gemini), runs daily, must be reliable. Narrative refresh is expensive (Gemini calls), runs weekly, can fail without blocking changelogs.
- **Daily changelog at 12:00 UTC:** After typical admin morning review window, captures all approvals from past 24h.
- **Weekly narrative on Tuesdays 14:00 UTC:** After Monday's Solution Evaluation + admin reviews, gives a full week of accumulated changes.

---

## Function A: consolidationChangelog

### Pipeline

1. **Read approved updates since last run**
   - `risk_updates` where `status == 'approved'` AND `consolidated != true`
   - `solution_updates` where `status == 'approved'` AND `consolidated != true`

2. **For each approved update:**
   - Extract `currentValues` → `proposedChanges` diff (use the update doc's own values)
   - Read current `version` from target `risks/{id}` or `solutions/{id}` doc
   - Compute `newVersion = (currentVersion || 0) + 1`

3. **Atomic batch per update:**
   - Write `changelogs/{auto-id}` document
   - Update target doc: increment `version`, set `metadata.lastUpdated`, `metadata.lastUpdatedBy`, `metadata.lastChangelogId`
   - Mark update doc: `consolidated: true`

4. **Write run summary** via `writeAgentRunSummary()`

### changelogs/{auto-id} Data Model

```typescript
interface ChangelogDoc {
  documentType: 'risk' | 'solution';
  documentId: string;              // "R01" or "S01"
  version: number;                 // matches the new version on the doc
  changes: Array<{
    field: string;                 // "score_2026"
    oldValue: unknown;             // from currentValues
    newValue: unknown;             // from proposedChanges
  }>;
  updateId: string;                // the risk_update/solution_update doc ID
  reviewedBy: string;              // admin UID who approved
  reviewedAt: Timestamp;           // when admin approved
  createdBy: string;               // "risk-evaluation" or "solution-evaluation"
  reasoning: string;               // from the update doc
  confidence: number;              // from the update doc
  createdAt: Timestamp;            // serverTimestamp (when changelog was written)
}
```

### Fields Added to risks/{id} and solutions/{id}

```typescript
{
  version: number;                     // starts at 1, incremented each changelog
  metadata: {
    lastUpdated: Timestamp;
    lastUpdatedBy: string;             // "consolidation"
    lastChangelogId: string;           // auto-id of the changelog entry
  }
}
```

### Diff Extraction Logic

For risk updates, diff these fields:
- `score_2026`, `score_2035`, `velocity`, `expert_severity`, `public_perception`

For solution updates, diff these fields:
- `adoption_score_2026`, `adoption_score_2035`, `implementation_stage`, `timeline_narrative`

Only include fields where `proposedChanges[field] !== currentValues[field]`.

---

## Function B: consolidationNarrative

### Pipeline

1. **Read changelogs created in the last 7 days**, grouped by `documentId`
2. **Filter to significant changes:**
   - Any score change >= 5 points
   - 3+ new signal evidence items added
   - Stage change (for solutions)
3. **For each qualifying risk:**
   - Read current `risks/{id}` doc (summary, deep_dive, who_affected, signal_evidence)
   - Read recent approved signals (last 7 days) for context
   - Call Gemini: send current narrative + recent changes → ask for incremental revision
   - Write revised `summary`, `deep_dive`, `who_affected` back to `risks/{id}`
4. **For each qualifying solution:**
   - Read current `solutions/{id}` doc (summary, deep_dive)
   - Call Gemini: send current narrative + recent changes → ask for incremental revision
   - Write revised `summary`, `deep_dive` back to `solutions/{id}`
5. **Write run summary** via `writeAgentRunSummary()`

### Gemini Prompt (Risk)

```
You are updating the narrative for an AI risk tracked by the AI 4 Society Observatory.

RISK: {risk_name} ({risk_id})

CURRENT NARRATIVE:
Summary: {current_summary}
Deep Dive: {current_deep_dive}
Who Affected: {current_who_affected}

RECENT CHANGES (last 7 days):
{changelog_entries_formatted}

NEW SIGNAL EVIDENCE:
{recent_signals_formatted}

INSTRUCTIONS:
- Revise the summary, deep_dive, and who_affected to incorporate these changes
- Keep the existing tone, structure, and length
- Only modify sentences directly affected by the new data
- Do NOT remove existing content unless it's contradicted by new evidence
- Preserve all markdown formatting

Return JSON:
{
  "summary": "...",
  "deep_dive": "...",
  "who_affected": ["..."]
}
```

### Gemini Prompt (Solution)

Same pattern but for `summary` and `deep_dive` only, with solution-specific context (adoption scores, implementation stage, key players, barriers).

### Significance Thresholds

| Condition | Threshold | Rationale |
|---|---|---|
| Score delta | >= 5 points | Small score changes don't warrant narrative update |
| New signal evidence | >= 3 items | Enough new data to meaningfully change the narrative |
| Stage change | any | Stage transitions are significant milestones |

---

## Firestore Rules

Add `changelogs` collection: admin read, server write only.

```
match /changelogs/{changelogId} {
    allow read: if isAdmin();
    allow write: if false;
}
```

---

## Data Lifecycle

Add `changelogs` cleanup: delete entries older than 180 days (longer retention since they're audit/history records).

---

## Observatory UI

Add a `changelogs` tab to the AgentDetail component for the consolidation agent, showing recent changelog entries with:
- Document type + ID
- Version number
- Changed fields (old → new)
- Reasoning
- Reviewer + timestamp

---

## Agent Registry

```typescript
'consolidation': {
    name: 'Consolidation',
    description: 'Aggregates approved updates, writes changelogs with version tracking, and refreshes risk/solution narratives using Gemini.',
    tier: '2C',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp(),
    functionName: 'consolidationChangelog,consolidationNarrative',
    schedule: '0 12 * * * / 0 14 * * 2',
    overseerRole: 'Forecast Scribe',
}
```

---

## Cost Estimate

- **Changelog function:** ~6-20 Firestore reads/writes per run. No Gemini. Negligible cost.
- **Narrative function:** 0-3 Gemini calls per week (only for significantly changed docs). ~$0.01-0.05/week.
- **Firestore storage:** Changelogs are small docs (~1KB each). 180-day retention keeps storage minimal.

---

## Files to Create/Modify

### New files:
- `functions/src/consolidation/changelog.ts` — diff extraction + changelog writing
- `functions/src/consolidation/narrative.ts` — Gemini narrative refresh
- `functions/src/consolidation/types.ts` — shared types
- `src/components/observatory/ChangelogsTab.tsx` — Observatory UI

### Modified files:
- `functions/src/index.ts` — add both exports
- `functions/src/data-lifecycle.ts` — add changelogs cleanup
- `firestore.rules` — add changelogs rule
- `src/components/observatory/AgentDetail.tsx` — add changelogs tab
- `src/scripts/seed-agents.ts` — update registry
