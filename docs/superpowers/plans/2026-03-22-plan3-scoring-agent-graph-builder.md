# Scoring Agent & Graph Builder Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Validator Agent to Scoring Agent, change to monthly schedule, split across multiple function invocations for parallelism, fix the changelog `node_type` bug, and add automatic principle edge inference to the Graph Builder.

**Architecture:** The scoring agent becomes a coordinator function that fans out per-node assessments to individual Cloud Function invocations (max 5 nodes per invocation) to avoid timeout. The graph builder is extended to infer principle↔node edges from accumulated signal principle tags.

**Tech Stack:** TypeScript, Firebase Cloud Functions (Node.js 22), Gemini 2.5 Pro

**Spec:** `docs/superpowers/specs/2026-03-22-pipeline-architecture-v3-design.md` (Sections 4.6, 8.2, 8.3)

**Depends on:** Plan 1 (Data Migration), Plan 2 (Agent Pipeline — for principles on signals)

---

## File Structure

### Files to Modify

| File | Changes |
|------|---------|
| `functions/src/agents/validator/index.ts` (133 lines) | Rename to scoring agent, monthly schedule, fan-out coordinator |
| `functions/src/agents/validator/assessor.ts` (182 lines) | Fix `node_type` in proposals, update field names to V3, add no-signal relevance evaluation |
| `functions/src/agents/validator/store.ts` (63 lines) | Fix `node_type` bug (empty string → correct type) |
| `functions/src/agents/graph-builder/index.ts` (144 lines) | Add principle edge inference from signal tags |
| `functions/src/shared/firestore.ts` (97 lines) | Add helper for querying signals by principle tags |
| `functions/src/index.ts` | Update exports: rename validator → scoring, add per-batch callable |

### Files to Create

| File | Responsibility |
|------|---------------|
| `functions/src/agents/scoring/index.ts` | Monthly coordinator — fans out node batches |
| `functions/src/agents/scoring/batch-worker.ts` | Processes a batch of 5 nodes (callable) |

---

## Task 1: Create scoring agent coordinator (fan-out pattern)

**Files:**
- Create: `functions/src/agents/scoring/index.ts`
- Create: `functions/src/agents/scoring/batch-worker.ts`

- [ ] **Step 1: Create scoring/index.ts — monthly coordinator**

```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";

/**
 * Monthly scoring coordinator. Loads all risk/solution nodes,
 * splits into batches of 5, and dispatches each batch to a
 * separate Cloud Function invocation to avoid timeout.
 */
export const scheduledScoring = onSchedule(
  {
    schedule: "0 9 1 * *",  // 1st of month, 09:00 UTC
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const nodesSnap = await db.collection("nodes")
      .where("type", "in", ["risk", "solution"])
      .get();

    const nodeIds = nodesSnap.docs.map(d => d.id);
    const BATCH_SIZE = 5;
    const batches: string[][] = [];

    for (let i = 0; i < nodeIds.length; i += BATCH_SIZE) {
      batches.push(nodeIds.slice(i, i + BATCH_SIZE));
    }

    // Fan out to batch workers via Cloud Tasks
    const queue = getFunctions().taskQueue("scoringBatchWorker");
    for (const batch of batches) {
      await queue.enqueue({ nodeIds: batch });
    }

    console.log(`Scoring coordinator dispatched ${batches.length} batches for ${nodeIds.length} nodes`);
  }
);

// Manual trigger
export const triggerScoring = onCall(
  { memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    // Same logic as scheduled, call directly
    // ... (extract shared function)
  }
);
```

- [ ] **Step 2: Create scoring/batch-worker.ts**

```typescript
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { assessNode } from "./assessor.js";
import { storeValidationProposal } from "./store.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Processes a batch of up to 5 nodes for scoring.
 * Each node gets its own Gemini assessment.
 */
export const scoringBatchWorker = onTaskDispatched(
  {
    memory: "512MiB",
    timeoutSeconds: 300,
    secrets: [geminiApiKey],
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 3 },
  },
  async (req) => {
    const { nodeIds } = req.data as { nodeIds: string[] };
    const db = getFirestore();
    const apiKey = geminiApiKey.value();

    // Load signals from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const signalsSnap = await db.collection("signals")
      .where("status", "in", ["pending", "approved", "edited"])
      .where("fetched_at", ">", thirtyDaysAgo)
      .get();

    const allSignals = signalsSnap.docs;

    for (const nodeId of nodeIds) {
      const nodeDoc = await db.collection("nodes").doc(nodeId).get();
      if (!nodeDoc.exists) continue;

      const nodeData = nodeDoc.data()!;
      const nodeType = nodeData.type as string;

      // Find signals related to this node
      const relevantSignals = allSignals.filter(s =>
        (s.data().related_node_ids || []).includes(nodeId)
      );

      const assessment = await assessNode(
        nodeId, nodeType, nodeData, relevantSignals, apiKey
      );

      if (assessment && assessment.has_changes && assessment.confidence >= 0.6) {
        await storeValidationProposal(
          nodeId,
          nodeData.name,
          nodeType,  // Fixed: was empty string
          assessment,
          relevantSignals.map(s => s.id)
        );
      }
    }
  }
);
```

- [ ] **Step 3: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/agents/scoring/
git commit -m "feat: add scoring agent with fan-out batch worker pattern"
```

---

## Task 2: Move and update assessor for V3

**Files:**
- Copy: `functions/src/agents/validator/assessor.ts` → `functions/src/agents/scoring/assessor.ts`
- Copy: `functions/src/agents/validator/store.ts` → `functions/src/agents/scoring/store.ts`

- [ ] **Step 1: Copy assessor.ts and store.ts to scoring directory**

```bash
cp functions/src/agents/validator/assessor.ts functions/src/agents/scoring/assessor.ts
cp functions/src/agents/validator/store.ts functions/src/agents/scoring/store.ts
```

- [ ] **Step 2: Fix field names in assessor.ts**

In `functions/src/agents/scoring/assessor.ts`:
- Replace `adoption_score_2026` → `score_2026`
- Replace `adoption_score_2035` → `score_2035`

- [ ] **Step 3: Add no-signal relevance evaluation**

In the assessor system prompt, add:

```
If no new signals reference this node in the last 30 days, evaluate:
- Is the risk/solution still relevant? (consider if underlying conditions have changed)
- Should velocity be downgraded to reflect reduced media/research attention?
- Propose has_changes: true with reasoning if a downgrade is warranted.
- If the node is still relevant despite no new signals, return has_changes: false
  with overall_reasoning explaining why it remains important.
```

- [ ] **Step 4: Fix node_type in store.ts**

In `functions/src/agents/scoring/store.ts`, ensure `node_type` is correctly set:

```typescript
// Before (bug):
// node_type: "",
// After (fix):
node_type: nodeType,  // "risk" | "solution"
```

- [ ] **Step 5: Update created_by field**

Change `created_by: "validator-agent"` to `created_by: "scoring-agent"` in store.ts.

- [ ] **Step 6: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add functions/src/agents/scoring/assessor.ts functions/src/agents/scoring/store.ts
git commit -m "feat: scoring assessor with V3 field names, no-signal evaluation, node_type fix"
```

---

## Task 3: Update exports in index.ts

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Read index.ts for current validator exports**

Find the current validator-related exports.

- [ ] **Step 2: Replace validator exports with scoring exports**

Remove:
```typescript
export { scheduledValidator, triggerValidator } from "./agents/validator/index.js";
```

Add:
```typescript
export { scheduledScoring, triggerScoring } from "./agents/scoring/index.js";
export { scoringBatchWorker } from "./agents/scoring/batch-worker.js";
```

- [ ] **Step 3: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "refactor: replace validator agent exports with scoring agent"
```

---

## Task 4: Add principle edge inference to Graph Builder

**Files:**
- Modify: `functions/src/agents/graph-builder/index.ts`
- Modify: `functions/src/shared/firestore.ts`

- [ ] **Step 1: Read graph-builder/index.ts**

Understand where the snapshot is built and where to add principle edge inference.

- [ ] **Step 2: Add principle signal counting to shared/firestore.ts**

Add a helper function:

```typescript
/**
 * For each node, count how many approved signals tag each principle.
 * Returns a map: nodeId → { principleId → count }
 */
export async function getPrincipleSignalCounts(): Promise<Map<string, Map<string, number>>> {
  const db = getFirestore();
  const signalsSnap = await db.collection("signals")
    .where("status", "in", ["approved", "edited"])
    .get();

  const counts = new Map<string, Map<string, number>>();

  for (const doc of signalsSnap.docs) {
    const data = doc.data();
    const principles = data.principles || [];
    const nodeIds = data.related_node_ids || [];

    for (const nodeId of nodeIds) {
      if (!counts.has(nodeId)) counts.set(nodeId, new Map());
      const nodeMap = counts.get(nodeId)!;
      for (const p of principles) {
        nodeMap.set(p, (nodeMap.get(p) || 0) + 1);
      }
    }
  }

  return counts;
}
```

- [ ] **Step 3: Add principle edge inference to graph builder**

After building the snapshot, add:

```typescript
// Infer principle edges from signal tags
const principleCounts = await getPrincipleSignalCounts();
const PRINCIPLE_EDGE_THRESHOLD = 10;
const edgeBatch = db.batch();
let newEdges = 0;

for (const [nodeId, principleMap] of principleCounts) {
  for (const [principleId, count] of principleMap) {
    if (count >= PRINCIPLE_EDGE_THRESHOLD) {
      const edgeId = `${principleId}-${nodeId}-governs`;
      const existingEdge = await db.collection("edges").doc(edgeId).get();
      if (!existingEdge.exists) {
        edgeBatch.set(db.collection("edges").doc(edgeId), {
          id: edgeId,
          from_node: principleId,
          from_type: "principle",
          to_node: nodeId,
          to_type: /* look up from nodes */,
          relationship: "governs",
          properties: { strength: Math.min(count / 20, 1.0) },
          created_by: "graph-builder",
          createdAt: FieldValue.serverTimestamp(),
        });
        newEdges++;
      }
    }
  }
}

if (newEdges > 0) {
  await edgeBatch.commit();
  console.log(`Inferred ${newEdges} new principle edges`);
}
```

Note: These `governs` edges are stored in `edges` but NOT included in `graph_snapshot` (per spec decision — principles are excluded from the visualization).

- [ ] **Step 4: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/agents/graph-builder/index.ts functions/src/shared/firestore.ts
git commit -m "feat: graph builder infers principle edges from signal tags"
```

---

## Task 5: Update agent config in Firestore

**Files:**
- Modify: `functions/src/agents/graph-builder/index.ts` (agent config update section)

- [ ] **Step 1: Update agent metadata**

After deploying, update the `agents/validator-agent` doc in Firestore (or create `agents/scoring-agent`) with:
- `name: "Scoring Agent"`
- `schedule: "0 9 1 * *"` (monthly)
- `functionName: "scheduledScoring"`
- `status: "active"`

This can be done via the admin UI or a migration script. If via code, add to the graph builder's agent config update.

- [ ] **Step 2: Deploy and verify**

```bash
firebase use ai-4-society
firebase deploy --only functions
```

Verify the scoring agent appears correctly in the admin Agents section.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A functions/src/
git commit -m "chore: scoring agent deployment and config"
```
