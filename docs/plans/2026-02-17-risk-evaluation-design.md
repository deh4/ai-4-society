# Risk Evaluation Agent — Design Document

**Date:** 2026-02-17
**Status:** Approved
**Agent ID:** `risk-evaluation`
**Tier:** 2B (Analysis Layer)
**Overseer Role:** Severity Steward

---

## Goal

Build the Risk Evaluation agent — a daily Cloud Function that analyzes recently approved signals and topics, evaluates their impact on the 10 tracked AI risks (R01-R10), and proposes score/velocity updates to a staging collection for admin review before they reach the public dashboard.

## Architecture

Risk Evaluation is a two-stage batch processor. It runs daily (1 hour after Topic Tracker), reads approved signals, topics, and current risk data, then uses Gemini 2.0 Flash in a triage-then-evaluate pattern. Stage 1 identifies which risks have meaningful new evidence. Stage 2 produces detailed proposed updates for each flagged risk. Proposed updates are written to a `risk_updates` staging collection where admins review and approve/reject them before they reach the `risks` collection.

This staging approach keeps the public dashboard safe — no automated agent writes directly to public-facing data. Admins act as the second human gate (Gate 2) in the pipeline.

## Approach

**Two-Stage Gemini Pipeline** — Stage 1 (triage) sends a compact summary of all signals, topics, and risk names to identify which risks need updates. Stage 2 sends the full risk document + relevant signals/topics to produce proposed changes per flagged risk.

Alternatives considered and deferred:
- Per-risk calls without triage — wastes calls on risks with no new evidence
- Single batch call — context dilution, lower quality for individual risk analysis
- Direct writes to risks collection — unsafe without Validation/Consolidation agents

---

## 1. Data Model

### New collection: `risk_updates/{auto-id}`

```typescript
interface RiskUpdateDoc {
  riskId: string;                // "R01"
  riskName: string;              // "Systemic Algorithmic Discrimination" (for admin display)
  status: 'pending' | 'approved' | 'rejected';

  // Proposed changes
  proposedChanges: {
    score_2026: number;
    score_2035: number;
    velocity: 'Critical' | 'High' | 'Medium' | 'Low';
    expert_severity: number;     // 0-100
    public_perception: number;   // 0-100
  };

  // New signal evidence to append
  newSignalEvidence: Array<{
    signalId: string;
    date: string;
    headline: string;
    source: string;
    url?: string;
  }>;

  // Current values (for diff display in admin UI)
  currentValues: {
    score_2026: number;
    score_2035: number;
    velocity: string;
    expert_severity: number;
    public_perception: number;
  };

  // Analysis metadata
  reasoning: string;             // Why scores changed
  confidence: number;            // 0-1
  topicIds: string[];            // Which topics informed this update
  signalCount: number;           // How many signals were analyzed
  scoreDelta: number;            // abs(new score_2026 - old score_2026) for triage
  requiresEscalation: boolean;   // true if scoreDelta >= 5 (needs Observatory Steward)

  // Lifecycle
  createdAt: Timestamp;
  createdBy: 'risk-evaluation';
  runId: string;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  adminNotes?: string;
}
```

### Health & run tracking (existing pattern)

Reuses the same schema as Signal Scout and Topic Tracker:

- `agents/risk-evaluation/health/latest` — rolling health doc
- `agents/risk-evaluation/runs/{auto-id}` — per-run summary

The existing `writeAgentRunSummary()` function handles both.

### Firestore indexes

```json
{
  "collectionGroup": "risk_updates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Security rules

```
// Risk updates: admin read + write (approve/reject from UI)
match /risk_updates/{updateId} {
  allow read: if isAdmin();
  allow write: if isAdmin();
}

// Risks: add admin write (to apply approved updates)
match /risks/{riskId} {
  allow read: if true;
  allow write: if isAdmin();
}
```

---

## 2. Cloud Function

### Function: `riskEvaluation`

**Schedule:** Daily (`0 9 * * *` — 09:00 UTC, 1 hour after Topic Tracker)
**Memory:** 512 MiB
**Timeout:** 300s
**Secrets:** `GEMINI_API_KEY`

### Pipeline steps

```
1. Read inputs
   ├─ Approved signals (last 7 days)
   ├─ Latest topics (last 24h)
   ├─ Current risk documents (R01-R10)
   │
   ├─ < 3 approved signals → log "insufficient data", record empty run, exit
   │
2. Stage 1: Triage (single Gemini call)
   │  Input: signal summaries + topic names/velocities + risk IDs/names
   │  Output: which risks have meaningful new evidence + relevant signal/topic IDs
   │
   ├─ No risks flagged → log "no updates needed", record empty run, exit
   │
3. Stage 2: Per-risk evaluation (one Gemini call per flagged risk)
   │  Input: full risk doc + its relevant signals + relevant topics
   │  Output: proposed scores, velocity, evidence links, reasoning, confidence
   │
4. Write risk_updates to staging collection
   │
5. Track health via writeAgentRunSummary()
```

### Stage 1: Triage

Single call to `gemini-2.0-flash` with structured JSON output.

**System prompt includes:**
- The 10 risk category definitions (R01-R10) with current scores and velocity
- Instructions to identify which risks have meaningful new evidence
- Instructions to return relevant signal IDs and topic IDs per flagged risk

**User prompt includes:**
- Array of signal summaries: `{ id, title, risk_categories, severity_hint }`
- Array of topic summaries: `{ id, name, riskCategories, velocity, signalCount }`

**Expected output:**
```json
[
  {
    "riskId": "R01",
    "reason": "3 new high-severity signals about algorithmic bias in hiring",
    "relevantSignalIds": ["abc123", "def456", "ghi789"],
    "relevantTopicIds": ["topic1"]
  }
]
```

### Stage 2: Per-risk evaluation

One call per flagged risk. Sends the full context for deep analysis.

**System prompt includes:**
- The weighted scoring methodology (signal frequency 20%, severity 30%, expert consensus 25%, public awareness gap 15%, trend velocity 10%)
- Instructions to propose updated scores on the same 0-100 scale
- Instructions to assess velocity (Critical/High/Medium/Low)
- Instructions to explain reasoning and assign confidence

**User prompt includes:**
- Full current risk document (name, scores, velocity, evidence count, expert_severity, public_perception)
- Relevant signals (full title, summary, severity, source, date)
- Relevant topics (name, description, velocity)

**Expected output:**
```json
{
  "score_2026": 74.3,
  "score_2035": 52.1,
  "velocity": "High",
  "expert_severity": 78,
  "public_perception": 45,
  "reasoning": "Score increased due to 3 high-severity signals about...",
  "confidence": 0.87,
  "newSignalEvidence": [
    {
      "signalId": "abc123",
      "date": "2026-02-15",
      "headline": "EU finds widespread bias in hiring algorithms",
      "source": "Reuters",
      "url": "https://..."
    }
  ]
}
```

### Step 4: Store risk_updates

Batch write to `risk_updates/` collection. Each doc gets:
- `currentValues` captured from the risk doc before changes
- `scoreDelta` computed as `abs(proposedChanges.score_2026 - currentValues.score_2026)`
- `requiresEscalation` set to `true` if `scoreDelta >= 5`
- `createdAt` as server timestamp
- `createdBy: "risk-evaluation"`
- `runId` referencing the current run

### Step 5: Track health

Call `writeAgentRunSummary()` with:
```typescript
{
  agentId: "risk-evaluation",
  startedAt: runStartedAt,
  outcome: "success" | "empty" | "error",
  error: null | errorMessage,
  metrics: {
    articlesFetched: signals.length,    // signals read
    signalsStored: updatesWritten,      // risk_updates produced
    geminiCalls: 1 + flaggedRisks,      // triage + per-risk
    tokensInput,
    tokensOutput,
    firestoreReads: signalReads + topicReads + riskReads,
    firestoreWrites: updatesWritten,
  },
  sourcesUsed: [],
}
```

### Cost estimate

- Triage: ~2K input + ~500 output = $0.0003/call
- Per-risk eval: ~3K input + ~1K output × ~4 risks = $0.002
- **Total: ~$0.003/day, ~$0.09/month**

---

## 3. Admin UI — Risk Updates Review

### Admin page tab

Add a **"Risk Updates"** tab to the Admin page (alongside Signal Review and Observatory):

```
┌──────────────────────────────────────────────┐
│  PENDING RISK UPDATES                        │
│                                              │
│  R01: Algorithmic Discrimination    Δ +2.3   │
│    score: 72 → 74.3 · velocity: High → High │
│    3 new signals · confidence 0.87           │
│                                              │
│  R05: Autonomous Weapons            Δ +5.1   │
│    score: 61 → 66.1 · velocity: Med → High  │
│    🔴 ESCALATION · 4 new signals · conf 0.91│
│                                              │
│  [Approve] [Reject] [Admin Notes]            │
└──────────────────────────────────────────────┘
```

**Left panel:** List of risk updates filtered by status (pending/approved/rejected/all)
**Right panel:** Detail view showing:
- Current vs proposed values with visual diff
- Score delta with escalation badge if >= 5
- Gemini reasoning text
- Linked signal evidence with headlines and sources
- Topic context
- Admin notes field
- Approve/Reject buttons

### Applying approved updates

When admin clicks "Approve":
1. Firestore batch writes:
   - `risk_updates/{id}`: `status: 'approved'`, `reviewedAt`, `reviewedBy`, `adminNotes`
   - `risks/{riskId}`: Apply `proposedChanges` fields + append `newSignalEvidence` to `signal_evidence` array
2. Both writes atomic via batch

When admin clicks "Reject":
- `risk_updates/{id}`: `status: 'rejected'`, `reviewedAt`, `reviewedBy`, `adminNotes`
- No changes to `risks/{riskId}`

### AgentDetail for risk-evaluation

Add a **"Risk Updates"** tab to AgentDetail (same pattern as TopicsTab for topic-tracker):
- Shows recent risk updates from all runs
- Each shows: risk name, score delta, velocity change, status badge
- Expandable to see reasoning and signal evidence
- Filter by status (all/pending/approved/rejected)

---

## 4. Data Lifecycle

Add risk_updates cleanup to the existing `dataLifecycle` function:
- Delete risk_updates older than 30 days (ephemeral staging artifacts)

---

## 5. Agent Registry Update

Update the seed script to set `risk-evaluation` status to `active` after deployment:

```typescript
'risk-evaluation': {
    status: 'active',
    deployedAt: FieldValue.serverTimestamp(),
    functionName: 'riskEvaluation',
    schedule: '0 9 * * *',
    // ... rest unchanged
}
```

---

## 6. Files to Create/Modify

**Create:**
- `functions/src/risk-evaluation/triage.ts` — Stage 1 Gemini triage prompt + response parsing
- `functions/src/risk-evaluation/evaluator.ts` — Stage 2 per-risk Gemini evaluation
- `functions/src/risk-evaluation/store.ts` — Write risk_updates to Firestore
- `src/components/admin/RiskUpdatesTab.tsx` — Admin review UI with approve/reject
- `src/components/observatory/RiskUpdatesTab.tsx` — Observatory tab for risk-evaluation agent

**Modify:**
- `functions/src/index.ts` — Add `riskEvaluation` scheduled function
- `functions/src/data-lifecycle.ts` — Add risk_updates cleanup (>30 days)
- `firestore.rules` — Add risk_updates rules + admin write on risks
- `firestore.indexes.json` — Add risk_updates composite index
- `src/pages/Admin.tsx` — Add "Risk Updates" tab
- `src/components/observatory/AgentDetail.tsx` — Add Risk Updates tab for risk-evaluation agent
- `src/scripts/seed-agents.ts` — Update risk-evaluation status to active
