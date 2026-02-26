# Solution Evaluation Agent — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Agent ID:** `solution-evaluation`
**Tier:** 2B (Analysis Layer)
**Overseer Role:** Adoption Steward

---

## Goal

Build the Solution Evaluation agent — a weekly Cloud Function that analyzes recently approved signals, topics, and risk updates, evaluates their impact on the 10 tracked AI solutions (S01-S10), and proposes adoption score / implementation stage / narrative updates to a `solution_updates` staging collection for admin review before they reach the public dashboard.

## Architecture

Solution Evaluation is a two-stage batch processor. It runs weekly (Mondays, 1 hour after Risk Evaluation's daily window), reads approved signals, topics, approved risk updates, and current solution/risk data, then uses Gemini 2.0 Flash in a triage-then-evaluate pattern. Stage 1 identifies which solutions have meaningful new evidence. Stage 2 produces detailed proposed updates for each flagged solution. Proposed updates are written to a `solution_updates` staging collection where admins review and approve/reject them before they reach the `solutions` collection.

## Approach

**Two-Stage Gemini Pipeline** — Stage 1 (triage) sends a compact summary of all signals, topics, risk updates, and solution names to identify which solutions need updates. Stage 2 sends the full solution document + parent risk + relevant signals/topics/risk updates to produce proposed changes per flagged solution.

Alternatives considered and deferred:
- Single-stage batch call — context dilution, lower quality for individual solution analysis
- Per-solution calls without triage — wastes calls on solutions with no new evidence
- Direct writes to solutions collection — unsafe without admin review gate

---

## 1. Data Model

### New collection: `solution_updates/{auto-id}`

```typescript
interface SolutionUpdateDoc {
  solutionId: string;              // "S01"
  solutionTitle: string;           // For admin display
  parentRiskId: string;            // "R01"
  status: 'pending' | 'approved' | 'rejected';

  // Proposed score/stage/narrative changes
  proposedChanges: {
    adoption_score_2026: number;   // 0-100
    adoption_score_2035: number;   // 0-100
    implementation_stage: string;  // e.g. "Early Adoption"
    timeline_narrative: {
      near_term: string;
      mid_term: string;
      long_term: string;
    };
  };

  // Additions (appended on approval, not replacements)
  newKeyPlayers: string[];
  newBarriers: string[];

  // Current values (for diff display in admin UI)
  currentValues: {
    adoption_score_2026: number;
    adoption_score_2035: number;
    implementation_stage: string;
    key_players: string[];
    barriers: string[];
    timeline_narrative: {
      near_term: string;
      mid_term: string;
      long_term: string;
    };
  };

  // Analysis metadata
  reasoning: string;               // Why scores/stage changed
  confidence: number;              // 0-1
  topicIds: string[];              // Which topics informed this update
  signalCount: number;             // How many signals were analyzed
  riskUpdateIds: string[];         // Approved risk_updates that informed this
  scoreDelta: number;              // abs(new - old) for adoption_score_2026
  stageChanged: boolean;           // true if implementation_stage changed
  requiresEscalation: boolean;     // true if scoreDelta >= 10 or stageChanged

  // Lifecycle
  createdAt: Timestamp;
  createdBy: 'solution-evaluation';
  runId: string;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  adminNotes?: string;
}
```

### Health & run tracking (existing pattern)

Reuses the same schema as other agents:

- `agents/solution-evaluation/health/latest` — rolling health doc
- `agents/solution-evaluation/runs/{auto-id}` — per-run summary

The existing `writeAgentRunSummary()` function handles both.

### Firestore indexes

```json
{
  "collectionGroup": "solution_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Security rules

```
// Solution updates: admin read + write (approve/reject from UI)
match /solution_updates/{updateId} {
  allow read: if isAdmin();
  allow write: if isAdmin();
}

// Solutions: public read, admin write (to apply approved updates)
match /solutions/{solutionId} {
  allow read: if true;
  allow write: if isAdmin();
}
```

---

## 2. Cloud Function

### Function: `solutionEvaluation`

**Schedule:** Weekly, Mondays (`0 10 * * 1` — 10:00 UTC)
**Memory:** 512 MiB
**Timeout:** 300s
**Secrets:** `GEMINI_API_KEY`

### Pipeline steps

```
1. Read inputs
   ├─ Approved signals (last 7 days)
   ├─ Latest topics (last 7 days)
   ├─ Approved risk_updates (last 7 days)
   ├─ Current solution documents (S01-S10)
   ├─ Current risk documents (for parent risk context)
   │
   ├─ < 3 approved signals → log "insufficient data", record empty run, exit
   │
2. Stage 1: Triage (single Gemini call)
   │  Input: signal summaries + topic summaries + risk update summaries + solution IDs/titles
   │  Output: which solutions have meaningful new evidence + relevant signal/topic/riskUpdate IDs
   │
   ├─ No solutions flagged → log "no updates needed", record empty run, exit
   │
3. Stage 2: Per-solution evaluation (one Gemini call per flagged solution)
   │  Input: full solution doc + parent risk doc + relevant signals + topics + risk updates
   │  Output: proposed scores, stage, timeline narrative, new players/barriers, reasoning
   │
4. Write solution_updates to staging collection
   │
5. Track health via writeAgentRunSummary()
```

### Stage 1: Triage

Single call to `gemini-2.0-flash` with structured JSON output.

**System prompt includes:**
- The 10 solution definitions (S01-S10) with current adoption scores, implementation stages, and parent risk IDs
- Instructions to identify which solutions have meaningful new evidence from signals, topics, or risk updates
- Instructions to return relevant signal IDs, topic IDs, and risk update IDs per flagged solution

**User prompt includes:**
- Array of signal summaries: `{ id, title, risk_categories, severity_hint }`
- Array of topic summaries: `{ id, name, riskCategories, velocity, signalCount }`
- Array of risk update summaries: `{ id, riskId, riskName, scoreDelta, velocity }`

**Expected output:**
```json
[
  {
    "solutionId": "S01",
    "reason": "2 new signals about algorithmic auditing adoption + EU pilot results",
    "relevantSignalIds": ["abc123", "def456"],
    "relevantTopicIds": ["topic1"],
    "relevantRiskUpdateIds": ["ru001"]
  }
]
```

### Stage 2: Per-solution evaluation

One call per flagged solution. Sends the full context for deep analysis.

**System prompt includes:**
- Instructions to assess whether adoption evidence has changed
- Instructions to propose updated scores on the 0-100 scale
- Instructions to evaluate if the implementation stage should shift
- Instructions to identify new key players or barriers from recent signals
- Instructions to refresh timeline narrative if evidence warrants it
- Valid implementation stages: Research, Policy Debate, Pilot Programs, Early Adoption, Scaling, Mainstream

**User prompt includes:**
- Full current solution document (title, type, scores, stage, key_players, barriers, timeline_narrative)
- Parent risk document (name, scores, velocity, for context)
- Relevant signals (full title, summary, severity, source, date)
- Relevant topics (name, description, velocity)
- Relevant risk updates (proposed changes, reasoning)

**Expected output:**
```json
{
  "adoption_score_2026": 30,
  "adoption_score_2035": 72,
  "implementation_stage": "Early Adoption",
  "timeline_narrative": {
    "near_term": "By 2026, ...",
    "mid_term": "By 2030, ...",
    "long_term": "By 2035, ..."
  },
  "newKeyPlayers": ["Mastercard AI Audit Program"],
  "newBarriers": [],
  "reasoning": "Score increased due to EU pilot program results and Mastercard announcement...",
  "confidence": 0.82
}
```

### Step 4: Store solution_updates

Batch write to `solution_updates/` collection. Each doc gets:
- `currentValues` captured from the solution doc before changes
- `scoreDelta` computed as `abs(proposedChanges.adoption_score_2026 - currentValues.adoption_score_2026)`
- `stageChanged` computed by comparing proposed vs current implementation_stage
- `requiresEscalation` set to `true` if `scoreDelta >= 10` or `stageChanged`
- `createdAt` as server timestamp
- `createdBy: "solution-evaluation"`
- `runId` referencing the current run

### Step 5: Track health

Call `writeAgentRunSummary()` with:
```typescript
{
  agentId: "solution-evaluation",
  startedAt: runStartedAt,
  outcome: "success" | "empty" | "error",
  error: null | errorMessage,
  metrics: {
    articlesFetched: signals.length,     // signals read
    signalsStored: updatesWritten,       // solution_updates produced
    geminiCalls: 1 + flaggedSolutions,   // triage + per-solution
    tokensInput,
    tokensOutput,
    firestoreReads: signalReads + topicReads + riskUpdateReads + solutionReads + riskReads,
    firestoreWrites: updatesWritten,
  },
  sourcesUsed: [],
}
```

### Cost estimate

- Triage: ~2.5K input + ~500 output = ~$0.0004/call
- Per-solution eval: ~4K input + ~2K output x ~3 solutions = ~$0.003
- **Total: ~$0.004/week, ~$0.016/month**

---

## 3. Admin UI — Solution Updates Review

### Admin page tab

Add a **"Solution Updates"** tab to the Admin page (alongside Signal Review, Risk Updates, and Observatory):

```
┌──────────────────────────────────────────────────────┐
│  PENDING SOLUTION UPDATES                            │
│                                                      │
│  S01: Algorithmic Auditing              Δ +5         │
│    adoption: 25 → 30 · stage: Pilot → Early Adoption │
│    + 1 new player · confidence 0.82                  │
│    🔴 ESCALATION (stage changed)                     │
│                                                      │
│  S05: International AI Treaty           Δ +3         │
│    adoption: 15 → 18 · stage: Negotiation            │
│    + 2 new barriers · confidence 0.75                │
│                                                      │
│  [Approve] [Reject] [Admin Notes]                    │
└──────────────────────────────────────────────────────┘
```

**Detail view showing:**
- Current vs proposed adoption scores with visual diff
- Implementation stage change (highlighted if changed)
- Timeline narrative diff (current vs proposed text)
- New key players and barriers as additions (green highlights)
- Score delta with escalation badge if >= 10 or stage changed
- Gemini reasoning text
- Linked signals, topics, and risk updates
- Admin notes field
- Approve/Reject buttons

### Applying approved updates

When admin clicks "Approve" (atomic batch):
1. `solution_updates/{id}` → `status: 'approved'`, `reviewedAt`, `reviewedBy`, `adminNotes`
2. `solutions/{solutionId}` → apply `proposedChanges` fields + append `newKeyPlayers` to `key_players` + append `newBarriers` to `barriers`

When admin clicks "Reject":
- `solution_updates/{id}` → `status: 'rejected'`, `reviewedAt`, `reviewedBy`, `adminNotes`
- No changes to `solutions/{solutionId}`

### Observatory AgentDetail tab

Add a **"Solution Updates"** tab to AgentDetail when viewing the `solution-evaluation` agent (same pattern as RiskUpdatesTab for risk-evaluation):
- Shows recent solution updates from all runs
- Each shows: solution title, score delta, stage change, status badge
- Expandable to see reasoning, new players/barriers, signal evidence
- Filter by status (all/pending/approved/rejected)

---

## 4. Data Lifecycle

Add solution_updates cleanup to the existing `dataLifecycle` function:
- Delete solution_updates older than 30 days (ephemeral staging artifacts)

---

## 5. Agent Registry Update

Update the seed script to set `solution-evaluation` status to `active` after deployment:

```typescript
'solution-evaluation': {
    status: 'active',
    deployedAt: FieldValue.serverTimestamp(),
    functionName: 'solutionEvaluation',
    schedule: '0 10 * * 1',
    // ... rest unchanged
}
```

---

## 6. Files to Create/Modify

**Create:**
- `functions/src/solution-evaluation/triage.ts` — Stage 1 Gemini triage prompt + response parsing
- `functions/src/solution-evaluation/evaluator.ts` — Stage 2 per-solution Gemini evaluation
- `functions/src/solution-evaluation/store.ts` — Write solution_updates to Firestore
- `src/components/admin/SolutionUpdatesTab.tsx` — Admin review UI with approve/reject
- `src/components/observatory/SolutionUpdatesTab.tsx` — Observatory tab for solution-evaluation agent

**Modify:**
- `functions/src/index.ts` — Add `solutionEvaluation` scheduled function
- `functions/src/data-lifecycle.ts` — Add solution_updates cleanup (>30 days)
- `firestore.rules` — Add solution_updates rules + admin write on solutions
- `firestore.indexes.json` — Add solution_updates composite index
- `src/pages/Admin.tsx` — Add "Solution Updates" tab
- `src/components/observatory/AgentDetail.tsx` — Add Solution Updates tab for solution-evaluation agent
- `src/scripts/seed-agents.ts` — Update solution-evaluation status to active
