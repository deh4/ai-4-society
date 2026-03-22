# Agent Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple signal sourcing from classification, add harm_status and principle tagging to the classifier, implement anti-recursion safeguards, and update the discovery agent to produce full node skeletons with a 2-week/6-month window.

**Architecture:** Signal Scout is split into two logical stages: sourcing (fetch + filter) and classification (Gemini). The classifier prompt is extended with harm_status and principles dimensions. Discovery agent gets a longer sliding window, higher signal threshold, and must output complete node data. Anti-recursion is enforced via `discovery_locked` flag and `classification_version` cap.

**Tech Stack:** TypeScript, Firebase Cloud Functions (Node.js 22), Gemini 2.5 Flash/Pro

**Spec:** `docs/superpowers/specs/2026-03-22-pipeline-architecture-v3-design.md` (Sections 4.1–4.5)

**Depends on:** Plan 1 (Data Migration & Cleanup) — types, field names, and principle nodes must exist first

---

## File Structure

### Files to Modify

| File | Changes |
|------|---------|
| `functions/src/agents/signal-scout/classifier.ts` (245 lines) | Add `harm_status` and `principles[]` to classification prompt and output schema |
| `functions/src/agents/signal-scout/store.ts` (81 lines) | Store new fields: `harm_status`, `principles`, `classification_version`, `last_classified_by`, `last_classified_at`, `discovery_locked` |
| `functions/src/agents/signal-scout/index.ts` (234 lines) | Change schedule from 12h to 6h |
| `functions/src/agents/discovery/index.ts` (181 lines) | Change schedule to biweekly, window to 6 months, add `discovery_locked` filter |
| `functions/src/agents/discovery/analyzer.ts` (290 lines) | Raise min signals to 5/3, require full node skeleton in output |
| `functions/src/agents/discovery/store.ts` (116 lines) | Store full node data in proposals |
| `functions/src/agents/approval/index.ts` (324 lines) | On new_node approval: trigger reclassification of pending signals, use discovery skeleton data |
| `functions/src/index.ts` | Update schedule annotations |

### Files to Create

| File | Responsibility |
|------|---------------|
| `functions/src/agents/signal-scout/reclassifier.ts` | Reclassify pending signals against newly approved nodes |

---

## Task 1: Extend classifier with harm_status and principles

**Files:**
- Modify: `functions/src/agents/signal-scout/classifier.ts`

- [ ] **Step 1: Read classifier.ts**

Read `functions/src/agents/signal-scout/classifier.ts` to understand the current system prompt, user prompt format, and response schema.

- [ ] **Step 2: Add harm_status to the classifier system prompt**

In the system prompt (the string passed to Gemini), add after the signal_type rules:

```
Additionally, determine harm_status for each article:
- "incident": The article describes an AI-related harm that HAS ALREADY OCCURRED.
  Evidence: past tense, specific victims/damages, legal proceedings, documented failures.
- "hazard": The article describes a PLAUSIBLE FUTURE harm or near-miss.
  Evidence: warnings, risk assessments, "could lead to", vulnerability disclosures.
- null: The article is about a solution, policy, or does not describe a specific harm.
  Use null for solution-type signals unless they reference a specific past incident.
```

- [ ] **Step 3: Add principles to the classifier system prompt**

Add a PRINCIPLES section to the system prompt, after the node taxonomy:

```
PRINCIPLES (tag 1-3 most relevant per signal, use [] if none apply):
- P01: Accountability — responsible parties, liability, oversight gaps
- P02: Fairness — bias, discrimination, equitable access
- P03: Transparency — explainability, black-box, interpretability
- P04: Safety — robustness, reliability, failure modes
- P05: Privacy — surveillance, data collection, consent
- P06: Human Oversight — autonomy, human-in-the-loop, automation
- P07: Sustainability — environmental impact, energy, resources
- P08: Wellbeing — mental health, social impact, quality of life
- P09: Democracy — elections, free speech, information integrity
- P10: International Cooperation — cross-border, standards, treaties
```

- [ ] **Step 4: Update the JSON response schema**

Add to the expected JSON response per article:
```json
{
  "harm_status": "incident" | "hazard" | null,
  "principles": ["P01", "P03"]
}
```

Update the TypeScript `ClassifiedSignal` type to include these fields.

- [ ] **Step 5: Update post-processing validation**

In the validation logic after Gemini response parsing:
- `harm_status` must be one of `"incident"`, `"hazard"`, or `null`
- `principles` must be an array of valid P01-P10 IDs (filter out invalid ones, don't reject the signal)

- [ ] **Step 6: Build functions to verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add functions/src/agents/signal-scout/classifier.ts
git commit -m "feat: add harm_status and principles to signal classifier"
```

---

## Task 2: Update signal store with new fields

**Files:**
- Modify: `functions/src/agents/signal-scout/store.ts`

- [ ] **Step 1: Read store.ts**

Read `functions/src/agents/signal-scout/store.ts` to understand current field mapping.

- [ ] **Step 2: Add new fields to stored signals**

In the `storeSignals()` function, add these fields to each signal document:

```typescript
harm_status: signal.harm_status ?? null,
principles: signal.principles ?? [],
classification_version: 1,
last_classified_by: "signal-classifier",
last_classified_at: FieldValue.serverTimestamp(),
discovery_locked: false,
```

- [ ] **Step 3: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/agents/signal-scout/store.ts
git commit -m "feat: store harm_status, principles, and anti-recursion fields on signals"
```

---

## Task 3: Change Signal Scout schedule to 6h

**Files:**
- Modify: `functions/src/agents/signal-scout/index.ts`

- [ ] **Step 1: Read signal-scout/index.ts**

Find the schedule definition.

- [ ] **Step 2: Change schedule from 12h to 6h**

Update the `onSchedule` options from `"every 12 hours"` to `"every 6 hours"`.

- [ ] **Step 3: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/agents/signal-scout/index.ts
git commit -m "feat: increase Signal Scout frequency to every 6 hours"
```

---

## Task 4: Update Discovery Agent — schedule, window, thresholds

**Files:**
- Modify: `functions/src/agents/discovery/index.ts`
- Modify: `functions/src/agents/discovery/analyzer.ts`

- [ ] **Step 1: Read discovery/index.ts and analyzer.ts**

Understand the current schedule, signal query window, and minimum thresholds.

- [ ] **Step 2: Change schedule to biweekly**

In `discovery/index.ts`, change the cron schedule from `"0 10 * * 0"` (every Sunday) to `"0 10 1,15 * *"` (1st and 15th of each month at 10:00 UTC).

- [ ] **Step 3: Change signal query window to 6 months**

In `discovery/index.ts`, change the signal query lookback from 30 days to 180 days:
```typescript
const sixMonthsAgo = new Date();
sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
```

- [ ] **Step 4: Add discovery_locked filter**

In the signal queries in `discovery/index.ts`, add a filter to exclude locked signals:
```typescript
.where("discovery_locked", "==", false)
```

Note: Firestore compound queries may need an index. If so, add the index to `firestore.indexes.json`.

- [ ] **Step 5: Raise minimum signal thresholds in analyzer.ts**

In `analyzer.ts`, update:
- `MIN_SUPPORTING_SIGNALS` from 3 to 5 (for new nodes)
- Minimum for new edges from 2 to 3

- [ ] **Step 6: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add functions/src/agents/discovery/index.ts functions/src/agents/discovery/analyzer.ts
git commit -m "feat: discovery agent biweekly schedule, 6-month window, raised thresholds"
```

---

## Task 5: Require full node skeleton from Discovery Agent

**Files:**
- Modify: `functions/src/agents/discovery/analyzer.ts`
- Modify: `functions/src/agents/discovery/store.ts`

- [ ] **Step 1: Update analyzer.ts prompt to require full node skeleton**

In the system prompt for new_node proposals, change the expected JSON output to include all required fields:

```json
{
  "proposal_type": "new_node",
  "node_data": {
    "type": "risk" | "solution" | "stakeholder",
    "name": "<concise name>",
    "description": "<2-3 sentence description>",
    "why_novel": "<1-2 sentences>",
    "key_themes": ["theme1", "theme2"],
    "suggested_parent_risk_id": "<node ID or omit>",
    "summary": "<2-3 sentence public-facing summary>",
    "deep_dive": "<3-4 paragraphs of analysis>",
    "score_2026": <0-100>,
    "score_2035": <0-100>,
    "velocity": "Critical" | "High" | "Medium" | "Low",
    "principles": ["P01", "P03"],
    "timeline_narrative": {
      "near_term": "<1-2 sentences>",
      "mid_term": "<1-2 sentences>",
      "long_term": "<1-2 sentences>"
    }
  },
  "supporting_signal_ids": ["id1", "id2", ...],
  "confidence": 0.85
}
```

For solution nodes, replace `velocity` with `implementation_stage` and add `key_players`, `barriers`.

- [ ] **Step 2: Update store.ts to persist full skeleton**

In `store.ts`, ensure the full `node_data` object (including summary, deep_dive, scores, velocity, principles, timeline_narrative) is stored in the `graph_proposals` document.

- [ ] **Step 3: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add functions/src/agents/discovery/analyzer.ts functions/src/agents/discovery/store.ts
git commit -m "feat: discovery agent produces full node skeletons in proposals"
```

---

## Task 6: Update approval handler to use skeleton data and trigger reclassification

**Files:**
- Modify: `functions/src/agents/approval/index.ts`

- [ ] **Step 1: Read approval/index.ts**

Read the full file to understand the `new_node` approval flow, especially how node fields are constructed.

- [ ] **Step 2: Use discovery skeleton data for new nodes**

In the `new_node` approval handler, replace the current default-value logic with skeleton data from the proposal:

```typescript
// Instead of defaulting score to 50, use the discovery agent's assessment:
const nodeData = {
  ...proposal.node_data,  // summary, deep_dive, score_2026, score_2035, velocity, etc.
  id: assignedId,          // Sequential ID assigned by graph builder
  type: proposal.node_data.type,
  version: 1,
  lastUpdated: FieldValue.serverTimestamp(),
  lastUpdatedBy: userId,
  createdAt: FieldValue.serverTimestamp(),
  created_by: "discovery-agent",
};
```

Keep the existing fallback defaults for any missing fields (backward compatibility with old proposals that lack the skeleton).

- [ ] **Step 3: Trigger reclassification after new_node approval**

After the node is created and the graph snapshot is rebuilt, trigger the reclassifier:

```typescript
// After graph snapshot rebuild:
const { reclassifyPendingSignals } = await import("../signal-scout/reclassifier.js");
await reclassifyPendingSignals(assignedId, proposal.node_data, geminiApiKey);
```

- [ ] **Step 4: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/agents/approval/index.ts
git commit -m "feat: approval handler uses skeleton data, triggers reclassification"
```

---

## Task 7: Create signal reclassifier with anti-recursion safeguards

**Files:**
- Create: `functions/src/agents/signal-scout/reclassifier.ts`

- [ ] **Step 1: Create reclassifier.ts**

Create `functions/src/agents/signal-scout/reclassifier.ts`:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Reclassify pending signals against a newly approved node.
 * Anti-recursion safeguards:
 * - Only targets signals with status: "pending" AND classification_version == 1
 * - Sets classification_version: 2 and discovery_locked: true after reclassification
 * - Never sets classification_version > 2
 */
export async function reclassifyPendingSignals(
  newNodeId: string,
  newNodeData: { type: string; name: string; description: string },
  apiKey: string
): Promise<{ reclassified: number; unchanged: number }> {
  const db = getFirestore();

  // Layer 1: Only pending, never-reclassified signals
  const snapshot = await db.collection("signals")
    .where("status", "==", "pending")
    .where("classification_version", "==", 1)
    .get();

  if (snapshot.empty) return { reclassified: 0, unchanged: 0 };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let reclassified = 0;
  let unchanged = 0;

  // Batch signals for efficiency (25 per call)
  const signals = snapshot.docs;
  const batches = [];
  for (let i = 0; i < signals.length; i += 25) {
    batches.push(signals.slice(i, i + 25));
  }

  for (const batch of batches) {
    // Ask Gemini: "For each signal, is the new node a better match?"
    const prompt = buildReclassificationPrompt(newNodeId, newNodeData, batch);
    const result = await model.generateContent(prompt);
    const assessments = JSON.parse(result.response.text());

    const writeBatch = db.batch();

    for (const assessment of assessments) {
      const signal = batch[assessment.index];
      if (!signal) continue;

      const updateData: Record<string, unknown> = {
        // Layer 2: Cap at version 2
        classification_version: 2,
        last_classified_by: `reclassifier-${newNodeId}`,
        last_classified_at: FieldValue.serverTimestamp(),
        // Layer 1: Lock from future discovery
        discovery_locked: true,
      };

      if (assessment.remap) {
        // Update related_nodes to include the new node
        updateData.related_node_ids = [...(signal.data().related_node_ids || []), newNodeId];
        updateData.related_nodes = [
          ...(signal.data().related_nodes || []),
          { node_id: newNodeId, node_type: newNodeData.type, relevance: assessment.relevance },
        ];
        // If was unmatched, upgrade to matched
        if (signal.data().signal_type === "unmatched") {
          updateData.signal_type = newNodeData.type === "risk" ? "risk" : "solution";
          updateData.proposed_topic = FieldValue.delete();
        }
        reclassified++;
      } else {
        unchanged++;
      }

      writeBatch.update(signal.ref, updateData);
    }

    await writeBatch.commit();
  }

  return { reclassified, unchanged };
}

function buildReclassificationPrompt(
  nodeId: string,
  nodeData: { type: string; name: string; description: string },
  signals: FirebaseFirestore.QueryDocumentSnapshot[]
): string {
  return `A new ${nodeData.type} node was just added to the AI 4 Society Observatory:

ID: ${nodeId}
Name: ${nodeData.name}
Description: ${nodeData.description}

For each signal below, determine if this new node is a relevant match.
Respond with a JSON array:
[{ "index": 0, "remap": true/false, "relevance": 0.0-1.0 }]

Only set remap: true if relevance >= 0.7.

Signals:
${signals.map((s, i) => `[${i}] "${s.data().title}" — ${s.data().summary}`).join("\n\n")}

Output valid JSON array only. No markdown.`;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/signal-scout/reclassifier.ts
git commit -m "feat: add signal reclassifier with anti-recursion safeguards"
```

---

## Task 8: Add Firestore indexes for new queries

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Read firestore.indexes.json**

Check existing indexes.

- [ ] **Step 2: Add compound index for discovery_locked filter**

Add index for the discovery agent's signal query:
```json
{
  "collectionGroup": "signals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "discovery_locked", "order": "ASCENDING" },
    { "fieldPath": "fetched_at", "order": "DESCENDING" }
  ]
}
```

Add index for reclassifier query:
```json
{
  "collectionGroup": "signals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "classification_version", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat: add Firestore indexes for anti-recursion queries"
```

---

## Task 9: Integration test — deploy and verify pipeline

- [ ] **Step 1: Build all functions**

Run: `npm run functions:build`
Expected: PASS

- [ ] **Step 2: Deploy functions**

```bash
firebase use ai-4-society
firebase deploy --only functions
```

- [ ] **Step 3: Deploy Firestore indexes**

```bash
firebase deploy --only firestore:indexes
```

- [ ] **Step 4: Trigger a Signal Scout run**

```bash
# Via Firebase callable or curl
curl -X POST https://us-central1-ai-4-society.cloudfunctions.net/triggerSignalScout
```

Verify in Firestore that new signals have:
- `harm_status` field (incident/hazard/null)
- `principles` array (P01-P10 IDs)
- `classification_version: 1`
- `discovery_locked: false`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A functions/src/
git commit -m "fix: pipeline integration fixes after deploy"
```
