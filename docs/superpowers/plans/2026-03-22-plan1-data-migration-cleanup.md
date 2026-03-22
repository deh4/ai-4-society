# Data Migration & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up legacy data model artifacts, establish single source of truth in `nodes`/`edges`/`graph_proposals`, and prepare the data layer for V3 pipeline features.

**Architecture:** This plan removes 10 legacy Firestore collections, normalizes field names across the codebase, deduplicates graph nodes/edges, and updates the graph snapshot builder to exclude stakeholder/principle nodes. All frontend code is migrated from reading legacy collections to reading `nodes`/`edges` exclusively.

**Tech Stack:** TypeScript, Firebase/Firestore, Cloud Functions (Node.js 22)

**Spec:** `docs/superpowers/specs/2026-03-22-pipeline-architecture-v3-design.md`

**Depends on:** Nothing (this is the foundation plan)

**Blocks:** Plan 2 (Agent Pipeline Refactor), Plan 3 (Scoring Agent), Plan 4 (Frontend Updates)

---

## File Structure

### Files to Modify

| File | Responsibility | Changes |
|------|---------------|---------|
| `src/types/graph.ts` | V2 graph type definitions | Rename `adoption_score_*` → `score_*` on SolutionNode, add `principles` field, add `"principle"` to NodeType, add `PrincipleNode` interface, update `GraphNode` union, add `approved_by` to Edge, add `principles` to GraphSnapshot node type |
| `src/types/taxonomy.ts` | Legacy type definitions | Remove deprecated Legacy* interfaces |
| `src/store/RiskContext.tsx` | Frontend data store | Remove legacy `risks`/`solutions`/`milestones` reads, remove `risk_name`/`solution_title`/`parent_risk_id` fields |
| `src/components/dashboard/RiskDetailPanel.tsx` | Risk detail display | Replace `risk_name` → `name`, remove `connected_to` usage |
| `src/components/dashboard/RiskOverview.tsx` | Risk list | Replace `risk_name` → `name` |
| `src/components/dashboard/RiskCard.tsx` | Risk card | Replace `risk_name` → `name` |
| `src/components/dashboard/SolutionDetailPanel.tsx` | Solution detail display | Replace `solution_title` → `name` |
| `src/components/dashboard/PerceptionGap.tsx` | Score visualization | Replace `adoption_score_2026/2035` → `score_2026/2035` |
| `src/components/observatory/SolutionUpdatesTab.tsx` | Solution updates | Replace `adoption_score_2026/2035` → `score_2026/2035` |
| `functions/src/agents/validator/assessor.ts` | Validator assessment | Replace `adoption_score_2026/2035` → `score_2026/2035` |
| `functions/src/agents/graph-builder/index.ts` | Graph snapshot builder | Filter out stakeholder/principle nodes from snapshot |
| `functions/src/shared/firestore.ts` | Shared Firestore helpers | Add `getGraphNodes()` that filters by type |
| `functions/src/agents/data-lifecycle/index.ts` | Data cleanup agent | Remove legacy collection cleanup code |
| `firestore.rules` | Security rules | Remove rules for legacy collections |

### Files to Create

| File | Responsibility |
|------|---------------|
| `functions/src/migration/v3-cleanup.ts` | One-time migration: dedup nodes, dedup edges, assign sequential IDs, normalize fields, backfill missing data |
| `functions/src/migration/v3-populate-discovery-nodes.ts` | One-time Gemini 2.5 Pro pass to populate missing fields on discovery nodes |
| `functions/src/migration/v3-backfill-harm-status.ts` | One-time Gemini 2.5 Flash pass to classify historical signals with harm_status |
| `functions/src/migration/seed-principles.ts` | Seed P01-P10 principle nodes |

### Files to Delete (after migration)

| File | Reason |
|------|--------|
| `src/scripts/seed.ts` | Seeds legacy v1 collections |
| `src/scripts/seed-prod.ts` | Seeds legacy v1 collections |
| `src/scripts/seed-v2-graph.ts` | V1→V2 migration, no longer needed |
| `src/scripts/seed-admin.ts` | Seeds legacy admins collection |
| `src/scripts/seed-milestones-prod.ts` | Seeds legacy milestones collection |
| `src/scripts/seed-lead-user.ts` | Migrates admins → users, completed |
| `functions/src/migration/v1-to-v2.ts` | V1→V2 migration, completed |
| `functions/src/data-lifecycle.ts` | V1 data lifecycle, replaced by agents/data-lifecycle |
| `functions/src/discovery-agent/` | V1 discovery agent directory |
| `functions/src/validator-agent/` | V1 validator agent directory |

---

## Task 1: Normalize type definitions

**Files:**
- Modify: `src/types/graph.ts`
- Modify: `src/types/taxonomy.ts`

- [ ] **Step 1: Update SolutionNode in graph.ts — rename score fields and add principles**

In `src/types/graph.ts`, find the SolutionNode interface. Rename:
- `adoption_score_2026` → `score_2026`
- `adoption_score_2035` → `score_2035`

Add `principles: string[]` to both RiskNode and SolutionNode.

Add `"principle"` to the NodeType union type.

- [ ] **Step 1b: Add PrincipleNode interface and update GraphNode union**

In `src/types/graph.ts`, add:

```typescript
interface PrincipleNode {
  id: string;
  type: "principle";
  name: string;
  summary: string;
  oecd_reference: string;
  createdAt: Timestamp;
}
```

Update the `GraphNode` union to include `PrincipleNode`:
```typescript
export type GraphNode = RiskNode | SolutionNode | StakeholderNode | MilestoneNode | PrincipleNode;
```

- [ ] **Step 1c: Add approved_by to Edge interface**

In `src/types/graph.ts`, add `approved_by?: string` to the Edge interface. Also add `"governs"` to the relationship union type if it uses a union (if it's `string`, no change needed).

- [ ] **Step 1d: Add principles to GraphSnapshot node type**

In `src/types/graph.ts`, find the GraphSnapshot interface's node array type. Add `principles?: string[]` to the node object type. Also update the `type` field to exclude `"stakeholder"` and `"principle"` (snapshot only contains `"risk" | "solution" | "milestone"`).

- [ ] **Step 2: Remove deprecated Legacy interfaces from taxonomy.ts**

In `src/types/taxonomy.ts`, remove the `LegacyRisk`, `LegacySolution`, `LegacyMilestone`, and `LegacySignalEvidence` interfaces (lines ~487-550). These are marked `@deprecated` and are no longer needed.

- [ ] **Step 3: Build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds (or reveals downstream files that need updating — fix those in subsequent tasks)

- [ ] **Step 4: Commit**

```bash
git add src/types/graph.ts src/types/taxonomy.ts
git commit -m "refactor: normalize SolutionNode scores, add principles field, remove legacy types"
```

---

## Task 2: Migrate RiskContext store from legacy collections to nodes/edges

**Files:**
- Modify: `src/store/RiskContext.tsx`

- [ ] **Step 1: Read the current RiskContext.tsx file**

Read `src/store/RiskContext.tsx` to understand the current Risk and Solution interfaces and how they fetch from Firestore.

- [ ] **Step 2: Replace legacy collection reads with nodes collection**

The store currently reads from `risks`, `solutions`, and `milestones` collections (lines ~93, ~100, ~107). **Decision: keep RiskContext but read from `nodes` collection instead of legacy collections.** The dashboard components need full node data (deep_dive, timeline_narrative, etc.) that the graph snapshot doesn't carry, so we cannot remove RiskContext entirely.

Replace:
- `collection("risks")` → `collection("nodes").where("type", "==", "risk")`
- `collection("solutions")` → `collection("nodes").where("type", "==", "solution")`
- `collection("milestones")` → `collection("nodes").where("type", "==", "milestone")`

Update the `Risk` and `Solution` interfaces:
- `Risk.risk_name` → use `name` (from nodes)
- `Solution.solution_title` → use `name` (from nodes)
- `Solution.parent_risk_id` → remove (use edges)
- `Solution.adoption_score_2026` → `score_2026`
- `Solution.adoption_score_2035` → `score_2035`

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Type errors in dashboard components that still reference old field names (fixed in Task 3)

- [ ] **Step 4: Commit**

```bash
git add src/store/RiskContext.tsx
git commit -m "refactor: migrate RiskContext from legacy collections to nodes"
```

---

## Task 3: Update dashboard components for normalized field names

**Files:**
- Modify: `src/components/dashboard/RiskDetailPanel.tsx`
- Modify: `src/components/dashboard/RiskOverview.tsx`
- Modify: `src/components/dashboard/RiskCard.tsx`
- Modify: `src/components/dashboard/SolutionDetailPanel.tsx`
- Modify: `src/components/dashboard/PerceptionGap.tsx`
- Modify: `src/components/dashboard/SignalCard.tsx`
- Modify: `src/components/observatory/SolutionUpdatesTab.tsx`

- [ ] **Step 1: Fix risk_name → name**

In `RiskDetailPanel.tsx` (line ~26), `RiskOverview.tsx` (line ~70), `RiskCard.tsx` (line ~53):
Replace all `risk.risk_name` with `risk.name`.

- [ ] **Step 2: Fix solution_title → name**

In `SolutionDetailPanel.tsx` (line ~12):
Replace `solution.solution_title` with `solution.name`.

- [ ] **Step 3: Fix adoption_score → score**

In `PerceptionGap.tsx` (lines ~47, 50, 56, 59):
Replace `adoption_score_2026` → `score_2026`, `adoption_score_2035` → `score_2035`.

In `SolutionUpdatesTab.tsx` (lines ~12, 16, 116):
Same replacements.

In `SignalCard.tsx` (line ~38):
Same replacement if applicable.

- [ ] **Step 4: Remove connected_to usage**

In `RiskDetailPanel.tsx` (lines ~118, 122):
Replace the `connected_to` array rendering with edge-based lookups from GraphContext. Show connected solutions/risks by querying edges where this node is a source or target.

- [ ] **Step 5: Build to verify all type errors resolved**

Run: `npm run build`
Expected: PASS — no type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/ src/components/observatory/SolutionUpdatesTab.tsx
git commit -m "refactor: update dashboard components to V3 field names"
```

---

## Task 4: Update Cloud Functions for normalized field names

**Files:**
- Modify: `functions/src/agents/validator/assessor.ts`

- [ ] **Step 1: Fix adoption_score references in validator assessor**

In `functions/src/agents/validator/assessor.ts` (lines ~36, 70):
Replace `adoption_score_2026` → `score_2026`, `adoption_score_2035` → `score_2035`.

Also ensure the assessor prompt references the correct field names.

- [ ] **Step 2: Build functions to verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/validator/assessor.ts
git commit -m "refactor: update validator assessor to V3 field names"
```

---

## Task 5: Update graph snapshot builder to exclude stakeholders/principles

**Files:**
- Modify: `functions/src/agents/graph-builder/index.ts`
- Modify: `functions/src/shared/firestore.ts`

- [ ] **Step 1: Read graph-builder/index.ts and shared/firestore.ts**

Understand how `getAllNodes()` and `getAllEdges()` are used to build the snapshot.

- [ ] **Step 2: Add getGraphVisibleNodes() helper**

In `functions/src/shared/firestore.ts`, add a new function:

```typescript
/** Get nodes for graph visualization (excludes stakeholders and principles). */
export async function getGraphVisibleNodes(): Promise<FirebaseFirestore.QuerySnapshot> {
  const db = getFirestore();
  return db.collection("nodes")
    .where("type", "in", ["risk", "solution", "milestone"])
    .get();
}
```

- [ ] **Step 3: Update graph builder to use filtered nodes**

In `functions/src/agents/graph-builder/index.ts`, change the snapshot builder to:
1. Use `getGraphVisibleNodes()` for the snapshot `nodes` array
2. Filter edges: only include edges where both `from` and `to` are in the visible node set
3. Still use `getAllNodes()` for computing `node_summaries` (those need all node types)

- [ ] **Step 4: Build functions to verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/agents/graph-builder/index.ts functions/src/shared/firestore.ts
git commit -m "feat: filter stakeholders/principles from graph snapshot"
```

---

## Task 6: Write V3 migration Cloud Function

**Files:**
- Create: `functions/src/migration/v3-cleanup.ts`
- Modify: `functions/src/index.ts` (export the function)

This is a one-time HTTP function that performs all data fixes.

- [ ] **Step 1: Create v3-cleanup.ts**

Create `functions/src/migration/v3-cleanup.ts` with an `onRequest` HTTP function that:

1. **Deduplicates nodes**: For each known duplicate pair, keep the one with more edges/signals, delete the other, update all references (edges, signals.related_node_ids, editorial_hooks.related_node_ids, graph_proposals)

2. **Assigns sequential IDs to discovery nodes**: Query all nodes with Firestore auto-generated IDs (not matching pattern `R\d+`, `S\d+`, `M\d+`, `SH\d+`, `P\d+`). For each:
   - Determine next available ID (e.g., if R10 exists, next risk is R11)
   - Create new doc with sequential ID, copy all fields
   - Update all references in edges, signals, editorial_hooks, graph_proposals, node_summaries, changelogs
   - Delete old doc

3. **Normalizes solution fields in nodes collection**: For all solution nodes:
   - If `adoption_score_2026` exists → copy to `score_2026`, delete `adoption_score_2026`
   - Same for `adoption_score_2035` → `score_2035`

4. **Adds missing fields to all nodes**:
   - `principles: []` (empty, will be populated later)
   - `created_by: "seed"` for R01-R10, S01-S10

5. **Fixes changelog node_type**: Query all changelogs where `node_type == ""`. Look up the node's type from `nodes` collection, backfill the correct value.

6. **Deduplicates edges**: Query all edges, find duplicates (same from+to+relationship), keep the first, delete the rest.

7. **Adds anti-recursion fields to existing signals**: For all signals:
   - `classification_version: 1`
   - `last_classified_by: "signal-classifier"`
   - `last_classified_at: fetched_at`
   - `discovery_locked: false`
   - `harm_status: null`
   - `principles: []`

Use batched writes (max 500 per batch) for all operations. Log progress for each step.

- [ ] **Step 2: Export from index.ts**

Add to `functions/src/index.ts`:
```typescript
export { v3Cleanup } from "./migration/v3-cleanup.js";
```

- [ ] **Step 3: Build functions**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/migration/v3-cleanup.ts functions/src/index.ts
git commit -m "feat: add V3 data migration function"
```

---

## Task 7: Seed principle nodes

**Files:**
- Create: `functions/src/migration/seed-principles.ts`
- Modify: `functions/src/index.ts` (export)

- [ ] **Step 1: Create seed-principles.ts**

Create `functions/src/migration/seed-principles.ts` with an `onRequest` HTTP function that:

1. Creates P01-P10 in the `nodes` collection:

```typescript
const PRINCIPLES = [
  { id: "P01", name: "Accountability", summary: "Responsible parties, liability, oversight mechanisms for AI systems", oecd_reference: "OECD 1.5" },
  { id: "P02", name: "Fairness & Non-discrimination", summary: "Bias prevention, equitable access, non-discriminatory AI outcomes", oecd_reference: "OECD 1.2(b)" },
  { id: "P03", name: "Transparency & Explainability", summary: "Interpretable AI decisions, disclosure of AI use, audit trails", oecd_reference: "OECD 1.3" },
  { id: "P04", name: "Safety & Robustness", summary: "Reliable AI systems, failure mode management, security against attacks", oecd_reference: "OECD 1.4" },
  { id: "P05", name: "Privacy & Data Governance", summary: "Data protection, consent, surveillance boundaries, data minimization", oecd_reference: "OECD 1.2(a)" },
  { id: "P06", name: "Human Oversight & Autonomy", summary: "Human-in-the-loop controls, meaningful human agency over AI decisions", oecd_reference: "OECD 1.4 + 1.5" },
  { id: "P07", name: "Sustainability & Environment", summary: "Environmental impact of AI compute, resource efficiency, climate considerations", oecd_reference: "OECD 1.1 (2024)" },
  { id: "P08", name: "Inclusive Growth & Wellbeing", summary: "Broad societal benefit, reduced inequality, mental health impacts", oecd_reference: "OECD 1.1" },
  { id: "P09", name: "Democracy & Rule of Law", summary: "Electoral integrity, free speech, information ecosystem health", oecd_reference: "OECD 2.2" },
  { id: "P10", name: "International Cooperation", summary: "Cross-border AI governance, standards harmonization, treaty frameworks", oecd_reference: "OECD 2.4" },
];
```

Each node: `{ id, type: "principle", name, summary, oecd_reference, createdAt: now }`

2. Creates initial `governs` edges between principles and existing risks/solutions based on semantic mapping (e.g., P01→R01 if R01 is about accountability). Use a hardcoded mapping for the initial 10 risks and 10 solutions.

- [ ] **Step 2: Export from index.ts**

Add to `functions/src/index.ts`:
```typescript
export { seedPrinciples } from "./migration/seed-principles.js";
```

- [ ] **Step 3: Build functions**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/migration/seed-principles.ts functions/src/index.ts
git commit -m "feat: add principle node seeding function (P01-P10)"
```

---

## Task 8: Populate missing fields on discovery-created nodes (Spec §6.3)

**Files:**
- Create: `functions/src/migration/v3-populate-discovery-nodes.ts`
- Modify: `functions/src/index.ts` (export)

Discovery-created nodes lack `summary`, `deep_dive`, `score_2026`, `score_2035`, `velocity` (risks), `implementation_stage` (solutions), `timeline_narrative`, and `principles`. This causes the carousel rendering inconsistency.

- [ ] **Step 1: Create v3-populate-discovery-nodes.ts**

Create `functions/src/migration/v3-populate-discovery-nodes.ts` with an `onRequest` HTTP function that:

1. Queries all nodes where `created_by == "discovery-agent"` AND (`summary` is missing OR `deep_dive` is missing OR `score_2026` is missing)
2. For each incomplete node, calls Gemini 2.5 Pro with:
   - The node's existing `name`, `description`, `key_themes`, `why_novel`
   - The node's supporting signals (from `graph_proposals` where `created_node_id == nodeId`)
   - Instructions to generate: `summary` (2-3 sentences), `deep_dive` (3-4 paragraphs), `score_2026` (0-100), `score_2035` (0-100), `velocity`/`implementation_stage`, `timeline_narrative` ({near_term, mid_term, long_term}), `principles` (array of P01-P10 IDs)
3. Writes the generated fields to the node, sets `version: 1`, `lastUpdatedBy: "migration-v3"`
4. Logs each node processed and token usage

Temperature: 0.2 for deterministic output. Estimated cost: ~$0.05-0.10 total.

- [ ] **Step 2: Export from index.ts**

Add to `functions/src/index.ts`:
```typescript
export { v3PopulateDiscoveryNodes } from "./migration/v3-populate-discovery-nodes.js";
```

- [ ] **Step 3: Build functions**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/migration/v3-populate-discovery-nodes.ts functions/src/index.ts
git commit -m "feat: add migration to populate missing fields on discovery nodes"
```

---

## Task 9: Backfill harm_status on historical signals (Spec Decision §8.4)

**Files:**
- Create: `functions/src/migration/v3-backfill-harm-status.ts`
- Modify: `functions/src/index.ts` (export)

Run Gemini 2.5 Flash on all historical approved/edited signals to assign proper `harm_status` values, enabling incident/hazard filtering in the UI from day one.

- [ ] **Step 1: Create v3-backfill-harm-status.ts**

Create `functions/src/migration/v3-backfill-harm-status.ts` with an `onRequest` HTTP function that:

1. Queries all signals where `status in ["approved", "edited"]` AND (`harm_status` is null OR missing)
2. Batches signals into groups of 25 (same batch size as signal classifier)
3. For each batch, calls Gemini 2.5 Flash with:
   - A simplified prompt asking only for `harm_status` classification per signal
   - System prompt:
     ```
     For each signal, determine harm_status:
     - "incident": Describes an AI-related harm that HAS ALREADY OCCURRED (past tense, specific victims/damages)
     - "hazard": Describes a PLAUSIBLE FUTURE harm or near-miss (warnings, "could lead to", vulnerability)
     - null: Solution-focused or no specific harm described
     ```
   - Each signal's title + summary
4. Updates each signal with the classified `harm_status`
5. Logs batch progress and token usage

Temperature: 0.1. Estimated cost: ~$0.05.

- [ ] **Step 2: Export from index.ts**

Add to `functions/src/index.ts`:
```typescript
export { v3BackfillHarmStatus } from "./migration/v3-backfill-harm-status.js";
```

- [ ] **Step 3: Build functions**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/migration/v3-backfill-harm-status.ts functions/src/index.ts
git commit -m "feat: add migration to backfill harm_status on historical signals"
```

---

## Task 10: Remove legacy collection reads from Cloud Functions

**Files:**
- Modify: `functions/src/index.ts` — remove exports of v1 functions
- Modify: `functions/src/agents/data-lifecycle/index.ts` — remove v1 collection cleanup
- Delete: `functions/src/data-lifecycle.ts` — v1 lifecycle
- Delete: `functions/src/discovery-agent/` — v1 discovery agent
- Delete: `functions/src/validator-agent/` — v1 validator agent
- Delete: `functions/src/migration/v1-to-v2.ts` — completed migration

- [ ] **Step 1: Read functions/src/index.ts to identify v1 exports**

Read the file to find all exports that reference legacy collections or v1 agent code.

- [ ] **Step 2: Remove v1 function exports from index.ts**

Remove exports for:
- Any function reading from `risks`, `solutions`, `milestones`, `discovery_proposals`, `validation_proposals`, `admins`, `risk_updates`, `topics`
- The v1-to-v2 migration function
- The v1 data-lifecycle function
- The v1 discovery-agent functions
- The v1 validator-agent functions

Keep all v2 agent exports (`signalScout`, `discoveryAgent`, `validatorAgent`, `feedCurator`, `graphBuilder`, `dataLifecycle`, `sitemap`, etc.)

- [ ] **Step 3: Remove v1 collection references from data-lifecycle agent**

In `functions/src/agents/data-lifecycle/index.ts` (lines ~151-158), remove the code that cleans up `discovery_proposals` and `validation_proposals` collections.

- [ ] **Step 4: Delete v1 files**

```bash
rm functions/src/data-lifecycle.ts
rm -r functions/src/discovery-agent/
rm -r functions/src/validator-agent/
rm functions/src/migration/v1-to-v2.ts
```

- [ ] **Step 5: Build functions to verify**

Run: `npm run functions:build`
Expected: PASS — no remaining references to deleted files

- [ ] **Step 6: Commit**

```bash
git add -A functions/src/
git commit -m "refactor: remove v1 agent code and legacy collection references"
```

---

## Task 11: Delete legacy seed scripts

**Files:**
- Delete: `src/scripts/seed.ts`
- Delete: `src/scripts/seed-prod.ts`
- Delete: `src/scripts/seed-v2-graph.ts`
- Delete: `src/scripts/seed-admin.ts`
- Delete: `src/scripts/seed-milestones-prod.ts`
- Delete: `src/scripts/seed-lead-user.ts`

- [ ] **Step 1: Verify no npm scripts reference these files**

Check `package.json` for any scripts that invoke these seed files. Remove those script entries if found.

- [ ] **Step 2: Delete seed scripts**

```bash
rm src/scripts/seed.ts src/scripts/seed-prod.ts src/scripts/seed-v2-graph.ts
rm src/scripts/seed-admin.ts src/scripts/seed-milestones-prod.ts src/scripts/seed-lead-user.ts
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A src/scripts/
git commit -m "chore: remove legacy v1 seed scripts"
```

---

## Task 12: Clean up Firestore security rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Read firestore.rules**

Read the full file to understand all rule blocks.

- [ ] **Step 2: Remove rules for legacy collections**

Remove rule blocks for:
- `admins` (lines ~89-97) — replaced by `users.roles`
- `risks` (lines ~101-104)
- `solutions` (lines ~106-109)
- `milestones` (lines ~111-114)
- `risk_updates` (lines ~146-149)
- `solution_updates` (lines ~151-154)
- `validation_reports` (lines ~156-159)
- `topics` (lines ~141-144)
- `discovery_proposals` (lines ~188-191)

Also remove any `isAdmin()` helper function that reads from the `admins` collection and replace with the `hasRole()` function that reads from `users/{userId}.roles`.

- [ ] **Step 3: Verify rules syntax**

Run: `firebase emulators:start --only firestore` to check rules parse correctly, then stop.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "refactor: remove security rules for legacy collections"
```

---

## Task 13: Run migration and verify

This task is executed manually, not by an agent.

- [ ] **Step 1: Deploy functions**

```bash
firebase use ai-4-society
firebase deploy --only functions
```

- [ ] **Step 2: Run V3 cleanup migration**

Invoke the HTTP function:
```bash
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/v3Cleanup
```

Review the logs for each step's success/failure counts.

- [ ] **Step 3: Populate missing fields on discovery nodes**

```bash
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/v3PopulateDiscoveryNodes
```

Review logs — each node should have summary, deep_dive, scores, velocity populated. Estimated cost: ~$0.05-0.10.

- [ ] **Step 4: Backfill harm_status on historical signals**

```bash
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/v3BackfillHarmStatus
```

Review logs — each approved signal should now have harm_status set to "incident", "hazard", or null. Estimated cost: ~$0.05.

- [ ] **Step 5: Run principle seeding**

```bash
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/seedPrinciples
```

- [ ] **Step 6: Trigger graph snapshot rebuild**

```bash
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/graphBuilder
```

- [ ] **Step 7: Verify graph snapshot**

Check `graph_snapshot/current` in Firestore console:
- No stakeholder or principle nodes in `nodes` array
- No duplicate edges
- All node IDs use sequential format (R01-R##, S01-S##)
- `nodeCount` should be ~40 (down from ~94)

- [ ] **Step 8: Verify frontend**

Run: `npm run dev`
Check:
- Observatory graph loads with fewer, cleaner nodes
- Risk detail pages show correct names (not `undefined`)
- Solution detail pages show correct scores
- Landing page carousel shows consistent metric cards (all 3 cards on every slide)

- [ ] **Step 9: Deploy security rules**

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 10: Push to main (triggers hosting deploy)**

```bash
git push origin main
```

- [ ] **Step 11: Delete legacy collection documents in Firestore console**

Manually delete all documents from: `risks`, `solutions`, `milestones`, `risk_updates`, `discovery_proposals`, `topics`, `admins`, `validation_reports`, `validator_proposals`

- [ ] **Step 12: Remove migration function exports and redeploy**

Remove the one-time migration exports from `functions/src/index.ts`:
- `v3Cleanup`, `v3PopulateDiscoveryNodes`, `v3BackfillHarmStatus`, `seedPrinciples`

```bash
firebase deploy --only functions
git add functions/src/index.ts
git commit -m "chore: remove one-time migration function exports"
```

- [ ] **Step 13: Commit migration completion marker**

```bash
git commit --allow-empty -m "chore: V3 data migration completed — legacy collections deleted"
```
