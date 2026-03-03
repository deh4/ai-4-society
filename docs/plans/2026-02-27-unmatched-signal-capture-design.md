# Unmatched Signal Capture — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Problem

Signal Scout silently drops articles that are relevant to AI societal impact but don't map to the existing R01-R10 / S01-S10 taxonomy. This means genuinely novel risks and solutions are lost at ingestion time. The Discovery Agent, which is supposed to find novel topics, only sees approved signals that are already linked to existing categories — so it rarely proposes anything new.

## Solution

Capture "unmatched" signals — articles Gemini deems relevant but can't classify into existing taxonomy codes — and feed them to the Discovery Agent for clustering into new risk/solution proposals.

## Design

### 1. Signal Scout — Unmatched Signal Capture

**File:** `functions/src/signal-scout/classifier.ts`

- Extend `ClassifiedSignal` interface: add `"unmatched"` to `signal_type` union, add optional `proposed_topic: string` field.
- Extend the Gemini system prompt with a new instruction: if an article describes a genuine AI-related societal risk or solution that does NOT fit any existing R/S code, use `signal_type: "unmatched"` and provide a short `proposed_topic` label. `risk_categories` and `solution_ids` must be empty `[]` for unmatched signals.
- Modify validation logic (lines 167-182): add a new branch for `signal_type === "unmatched"` — skip taxonomy code checks, require non-empty `proposed_topic`, keep confidence >= 0.8 threshold.

**File:** `functions/src/signal-scout/store.ts`

- Store the `proposed_topic` field alongside existing signal fields.

### 2. Discovery Agent — Query Unmatched Signals

**File:** `functions/src/index.ts` (discoveryAgent function)

- Add a second Firestore query: `signal_type === "unmatched"` from last 30 days, any status (pending, approved, edited).
- Lower the minimum trigger: run Gemini analysis if 3+ unmatched signals OR 5+ classified signals exist.

**File:** `functions/src/discovery-agent/analyzer.ts`

- Accept unmatched signals as a separate parameter.
- Add a distinct section in the Gemini prompt: "UNMATCHED SIGNALS (potential novel topics)" with their `proposed_topic` labels.
- Keep the existing 3-signal minimum clustering threshold for proposals.

### 3. Admin UI — Emerging Signals Tab

**File:** `src/pages/Admin.tsx`

- Add `'emerging-signals'` tab between `'solution-signals'` and `'discovery'`.
- Amber accent (`border-amber-400`) to visually distinguish from cyan signal tabs.
- Filter signals where `signal_type === "unmatched"` (client-side, same pattern as risk/solution filtering).
- Show `proposed_topic` as an amber badge instead of R/S code badges.
- Same approve/reject/edit actions as regular signals.
- Pending count badge on the tab.

**File:** `src/lib/roles.ts`

- Add `'emerging-signals'` to `ROLE_TAB_ACCESS` with `['signal-reviewer', 'lead']`.

### 4. Firestore Rules & Data Lifecycle

No changes needed. Unmatched signals live in the existing `signals` collection with the same RBAC and cleanup rules.

## Files Touched

| File | Change |
|------|--------|
| `functions/src/signal-scout/classifier.ts` | Add unmatched signal_type, proposed_topic field, validation branch |
| `functions/src/signal-scout/store.ts` | Store proposed_topic field |
| `functions/src/index.ts` | Second query for unmatched signals, lower trigger threshold |
| `functions/src/discovery-agent/analyzer.ts` | Accept unmatched signals, separate prompt section |
| `src/pages/Admin.tsx` | Emerging signals tab with amber styling |
| `src/lib/roles.ts` | Tab access for emerging-signals |

## Thresholds

| Gate | Threshold |
|------|-----------|
| Signal Scout: confidence for unmatched signals | >= 0.8 |
| Discovery Agent: minimum unmatched signals to trigger | 3 |
| Discovery Agent: minimum classified signals to trigger | 5 (unchanged) |
| Discovery Agent: minimum supporting signals per proposal | 3 (unchanged) |
