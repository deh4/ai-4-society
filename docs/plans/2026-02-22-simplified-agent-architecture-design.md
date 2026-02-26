# Simplified Agent Architecture Design

**Date:** 2026-02-22
**Status:** Approved
**Replaces:** signal-scout-mvp, agent-observatory, risk-evaluation, topic-tracker, solution-evaluation, consolidation-agent, validation-agent designs

---

## Overview

Collapse the existing 8-agent pipeline into 4 agents. The original architecture was designed for a team with continuous human oversight across multiple approval queues. In practice the cascading dependencies between agents caused silent empty runs throughout the pipeline. This redesign simplifies to a flat, human-gated flow that works reliably for a solo operator.

**Before:** 8 scheduled functions, 5 staging collections, 2 human gates with 5 reviewer roles, cascading schedule dependencies.

**After:** 4 scheduled functions, 2 new collections (replacing 4 staging collections), 3 human gates — each on its own Admin tab.

---

## Architecture

```
Signal Scout (every 6h)
    → signals (pending, typed as risk / solution / both)
         ↓
   [Human: Risk Signals tab]    [Human: Solution Signals tab]
         ↓                               ↓
              approved signals (30-day window)
                   ↓                ↓
          Discovery Agent      Validator Agent
            (weekly Sun)         (weekly Mon)
                ↓                    ↓
      discovery_proposals    validation_proposals
                ↓                    ↓
     [Human: Discovery tab]  [Human: Validation tab]
                ↓                    ↓
     new risks / solutions    updated risks / solutions
                                      ↓
                               changelogs (via callable fn)

Data Lifecycle (daily 03:00)
    → cleanup for all collections
```

---

## Data Model

### `signals` collection — modified

Two new fields added. Existing `risk_categories` field name kept unchanged (used in 12+ frontend/function references).

```
signal_type:    "risk" | "solution" | "both"   // NEW
risk_categories: string[]                       // UNCHANGED (values: R01–R10)
solution_ids:   string[]                        // NEW (values: S01–S10)
```

Signals of type `"both"` appear in both Risk Signals and Solution Signals review tabs.

### `discovery_proposals` collection — new

One document per candidate new topic surfaced by the Discovery Agent.

```typescript
{
  type:                    "new_risk" | "new_solution"
  proposed_name:           string
  description:             string           // 2–3 sentence skeleton from Gemini
  why_novel:               string           // why not covered by existing registry
  key_themes:              string[]
  supporting_signal_ids:   string[]         // minimum 3 required to surface
  signal_count:            number
  suggested_parent_risk_id?: string         // for new_solution proposals
  status:                  "pending" | "approved" | "rejected"
  created_at:              Timestamp
  created_by:              "discovery-agent"
  reviewed_at?:            Timestamp
  reviewed_by?:            string           // admin UID
  admin_notes?:            string
  // set after approval:
  linked_document_id?:     string           // e.g. "R11" or "S11"
  parent_risk_id?:         string           // confirmed by admin for new_solution
  new_document_id?:        string           // admin-assigned ID before approving
}
```

### `validation_proposals` collection — new

One document per risk or solution assessed as needing attribute updates.

```typescript
{
  document_type:          "risk" | "solution"
  document_id:            string            // R01–R10 or S01–S10
  document_name:          string
  proposed_changes: {
    [field: string]: {
      current_value:   unknown
      proposed_value:  unknown              // admin-editable before approving
      reasoning:       string
    }
  }
  overall_reasoning:      string
  confidence:             number            // 0–1; only stored if >= 0.6
  supporting_signal_ids:  string[]
  status:                 "pending" | "approved" | "rejected"
  created_at:             Timestamp
  created_by:             "validator-agent"
  reviewed_at?:           Timestamp
  reviewed_by?:           string
  admin_notes?:           string
}
```

**Proposable fields by document type:**

| Risks | Solutions |
|---|---|
| `score_2026`, `score_2035` | `adoption_score_2026`, `adoption_score_2035` |
| `velocity` | `implementation_stage` |
| `expert_severity`, `public_perception` | `key_players` (additions only) |
| `who_affected` (additions only) | `barriers` (additions only) |
| `summary`, `deep_dive` | `summary`, `deep_dive` |
| `mitigation_strategies` (additions only) | `timeline_narrative` |
| `timeline_narrative` | |

### Collections removed

| Collection | Replaced by |
|---|---|
| `topics` | Discovery Agent reads raw signals directly |
| `risk_updates` | `validation_proposals` |
| `solution_updates` | `validation_proposals` |
| `validation_reports` | Agent health tracking (existing pattern) |

### Collections unchanged

`risks`, `solutions`, `changelogs`, `admins`, `agents/*/health`, `agents/*/runs`, `_pipeline_health`, `_usage`, `_archive`

### Firestore rules change

`changelogs` currently has `allow write: if false` (server-only). A new callable Cloud Function `applyValidationProposal` handles approval atomically server-side — no rule change needed. Client continues to write `risks` and `solutions` directly (already allowed for `isAdmin()`).

---

## Agent Designs

### Agent 1: Signal Scout (modified)

**Schedule:** Every 6 hours — unchanged.

**Change:** Gemini classifier prompt extended to include solution taxonomy (S01–S10). For each article, Gemini returns two additional fields: `signal_type` and `solution_ids`. Inline validation tightened: `risk_categories` validated against R01–R10 if type is `"risk"` or `"both"`; `solution_ids` validated against S01–S10 if type is `"solution"` or `"both"`. Invalid signals dropped before storage. URL reachability checks removed (humans review signals directly).

**Model:** `gemini-2.0-flash`

### Agent 2: Discovery Agent (new)

**Schedule:** Weekly, Sunday at 10:00 UTC.

**Steps:**
1. Read `signals` where `status in ["approved", "edited"]` and `fetched_at > 30 days ago`
2. Read all `risks` (name + description only)
3. Read all `solutions` (name + description + `parent_risk_id`)
4. Single Gemini call: existing registry + all signals → identify clusters suggesting genuinely novel topics not covered by existing entries
5. Filter: drop proposals with fewer than 3 `supporting_signal_ids`
6. Store remaining proposals to `discovery_proposals` as `status: "pending"`
7. Write agent health summary

**Minimum data threshold:** Fewer than 5 approved signals in the 30-day window → skip Gemini call, log `"insufficient_data"`.

**Failure handling:** Malformed Gemini response or zero proposals → outcome `"empty"`. Full exception → outcome `"error"`.

**Model:** `gemini-2.5-pro` — required for long-context signal batches (up to 300 signals in one prompt) and strong novelty-vs-variant reasoning to minimise false positives.

### Agent 3: Validator Agent (new)

**Schedule:** Weekly, Monday at 09:00 UTC.

**Steps:**
1. Read all 10 `risks` documents (full)
2. Read all 10 `solutions` documents (full)
3. Read `signals` where `status in ["approved", "edited"]` and `fetched_at > 30 days ago`
4. Build signal maps: `riskSignals[riskId]` filtered by `risk_categories`; `solutionSignals[solutionId]` filtered by `solution_ids`
5. Per-risk loop (10 Gemini calls): full risk doc + relevant signals → structured `proposed_changes` or explicit `"no_change"`
6. Per-solution loop (10 Gemini calls): full solution doc + parent risk doc + relevant signals → same
7. Store proposals where changes are proposed AND `confidence >= 0.6` to `validation_proposals`
8. Write agent health summary

**Per-document failure handling:** Individual call failures are caught; loop continues. Run outcome is `"partial"` if any calls fail, `"success"` if all complete.

**Model:** `gemini-2.5-pro` — nuanced attribute drift judgment (velocity, scores, narrative accuracy) benefits from strongest available reasoning; 20 calls/week makes cost delta negligible.

### Agent 4: Data Lifecycle (minimally changed)

**Schedule:** Daily at 03:00 UTC — unchanged.

**Rule changes only:**

| Collection | Change |
|---|---|
| `topics` | Remove 30-day cleanup rule (collection gone) |
| `risk_updates` | Remove 30-day cleanup rule (collection gone) |
| `solution_updates` | Remove 30-day cleanup rule (collection gone) |
| `validation_reports` | Remove 30-day cleanup rule (collection gone) |
| `discovery_proposals` | Add: delete rejected after 90 days; keep approved indefinitely |
| `validation_proposals` | Add: delete after 30 days |

All other rules unchanged (signals archival 90d, agent runs 90d, changelogs 180d).

---

## Admin UI

### Tab structure

| Tab | Queries | Purpose |
|---|---|---|
| Risk Signals | `signals` where `signal_type in ["risk", "both"]` | Review and approve risk evidence |
| Solution Signals | `signals` where `signal_type in ["solution", "both"]` | Review and approve solution evidence |
| Discovery | `discovery_proposals` | Complete skeleton and approve new risks/solutions |
| Validation | `validation_proposals` | Edit and approve proposed attribute changes |

### Risk Signals tab

Identical interaction to the current Signal Review. Additions: risk category badges; for `"both"` signals a secondary `+S03` badge indicating it also appears in Solution Signals.

### Solution Signals tab

Same layout. Shows `solution_ids` badges prominently. For `"both"` signals shows `risk_categories` as secondary context.

### Discovery tab

Two-panel layout. Right panel is a structured form pre-filled with Gemini's skeleton. Admin completes the full narrative before approval is enabled.

Fields shown in right panel: proposed name (editable), type, why_novel (read-only), key themes (read-only chips), supporting signals (expandable), document ID input (auto-suggests next free ID), parent risk dropdown (for `new_solution` only), full narrative form (all fields for new risk or solution pre-filled from skeleton), admin notes.

On **Approve:** client writes complete document to `risks/{id}` or `solutions/{id}`, marks proposal `status: "approved"` and sets `linked_document_id`. No changelog needed (creation, not edit).

### Validation tab

Two-panel layout. Right panel shows proposed changes with inline editing.

Each proposed change displays: field name, current value, proposed value (editable input), reasoning (read-only). Admin can modify any proposed value before approving.

On **Approve:** calls `applyValidationProposal(proposalId)` Cloud Function, which atomically writes the edited proposed values to `risks/{id}` or `solutions/{id}`, writes a `changelogs` entry, and marks proposal `approved`.

On **Reject:** client sets `status: "rejected"` directly.

### Observatory page

Remove Topics card. Agent grid updated to 4 agents: Signal Scout, Discovery Agent, Validator Agent, Data Lifecycle. Seed script updated to remove stale registry entries.

---

## Gemini Model Summary

| Agent | Model | Calls/week | Justification |
|---|---|---|---|
| Signal Scout | `gemini-2.0-flash` | ~140 | High volume structured classification; solution taxonomy disambiguation needs Flash accuracy over Lite |
| Discovery Agent | `gemini-2.5-pro` | 1 | Long context (up to 300 signals), strongest reasoning for novelty vs. variant detection |
| Validator Agent | `gemini-2.5-pro` | 20 | Best available judgment for attribute drift and narrative accuracy; cost delta ~$0.60/month |

**Estimated total cost: ~$1.10/month.**

---

## Callable Cloud Function: `applyValidationProposal`

Handles atomic approval of validation proposals server-side.

**Input:** `{ proposalId: string }`

**Steps:**
1. Read `validation_proposals/{proposalId}` — verify status is `"pending"`
2. Read current `risks/{id}` or `solutions/{id}` document
3. In a Firestore transaction:
   - Write proposed values to `risks/{id}` or `solutions/{id}`
   - Increment `version` field
   - Write `changelogs` entry: `{ documentType, documentId, version, changes, proposalId, reviewedBy, reasoning, confidence, createdAt }`
   - Set `validation_proposals/{proposalId}.status = "approved"`, set `reviewed_at` and `reviewed_by`
4. Return success

**Auth:** Requires `isAdmin()` check on the callable function.

---

## Migration Notes

1. **Existing signals:** Add `signal_type` and `solution_ids` fields via a one-time migration script. Existing signals (which only have `risk_categories`) get `signal_type: "risk"` and `solution_ids: []`.
2. **Agent registry:** Seed script updated — add `discovery-agent` and `validator-agent`; remove `topic-tracker`, `risk-evaluation`, `solution-evaluation`, `validation`, `consolidation`.
3. **Existing staging collections:** `topics`, `risk_updates`, `solution_updates`, `validation_reports` can be deleted after confirming no pending items require action.
4. **Firestore indexes:** New composite indexes needed for `discovery_proposals` (status + created_at) and `validation_proposals` (status + document_type + created_at).
