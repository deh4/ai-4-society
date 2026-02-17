# Topic Tracker Agent — Design Document

**Date:** 2026-02-17
**Status:** Approved
**Agent ID:** `topic-tracker`
**Tier:** 2A (Research Layer)
**Overseer Role:** Causality Cartographer

---

## Goal

Build the Topic Tracker agent — a daily Cloud Function that analyzes recently approved signals, clusters them into named topics with trend velocity scores, and stores the results for downstream consumption by Risk and Solution Evaluation agents.

## Architecture

Topic Tracker is a stateless batch processor. It runs once per day, reads the last 7 days of approved signals, sends them to Gemini 2.0 Flash in a single call, and writes structured topic documents to Firestore. It follows the same infrastructure patterns as Signal Scout (scheduled Cloud Function, Gemini classification, health/run tracking via `writeAgentRunSummary`).

Topics are **intermediate products** — they don't require human approval because they're derived from already-approved signals. They're visible to admins in the Observatory for transparency but don't affect the public dashboard.

## Approach

**Gemini Batch Clustering** — send all recent signals in a single Gemini call. At current volume (~20-50 signals/week), this is the simplest and cheapest approach. A single call per day at Flash pricing is effectively free (~2K input + ~1K output tokens = $0.0003/day).

Alternatives considered and deferred:
- Embedding-based clustering (DBSCAN + naming) — overkill for current volume
- Incremental topic matching — more complex, better suited for event-driven triggers

---

## 1. Data Model

### New collection: `topics/{auto-id}`

```typescript
interface TopicDoc {
  name: string;              // "EU AI Act Enforcement Ramp-Up"
  description: string;       // 2-3 sentence summary of the topic
  riskCategories: string[];  // ["R01", "R09"]
  velocity: "rising" | "stable" | "declining";
  signalCount: number;
  signalIds: string[];       // references to signals/{id}
  firstSeenAt: Timestamp;    // earliest signal's fetched_at in this cluster
  createdAt: Timestamp;      // when this topic doc was written
  createdBy: "topic-tracker";
  runId: string;             // reference to agents/topic-tracker/runs/{id}
}
```

### Health & run tracking (existing pattern)

Reuses the same schema as Signal Scout:

- `agents/topic-tracker/health/latest` — rolling health doc with token counts, cost, consecutive errors
- `agents/topic-tracker/runs/{auto-id}` — per-run summary with metrics, outcome, duration

The existing `writeAgentRunSummary()` function in `usage-monitor.ts` handles both.

### Firestore indexes

```json
{
  "collectionGroup": "topics",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Security rules

```
match /topics/{topicId} {
  allow read: if isAdmin();
  allow write: if false; // server-only writes
}
```

---

## 2. Cloud Function

### Function: `topicTracker`

**Schedule:** Daily (once per day, `0 8 * * *` — 08:00 UTC)
**Memory:** 512 MiB
**Timeout:** 300s
**Secrets:** `GEMINI_API_KEY`

### Pipeline steps

```
1. Read approved signals (last 7 days)
       │
       ├─ < 3 signals → log "insufficient data", record empty run, exit
       │
2. Read previous topics (last run, for velocity comparison)
       │
3. Call Gemini (single batch call)
       │  Input: signal summaries + risk taxonomy + previous topics
       │  Output: structured JSON array of topic clusters
       │
4. Store topics in Firestore
       │
5. Track health via writeAgentRunSummary()
```

### Step 1: Read signals

```typescript
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 7);

const signalsSnap = await db.collection("signals")
  .where("status", "in", ["approved", "edited"])
  .where("fetched_at", ">", cutoff)
  .orderBy("fetched_at", "desc")
  .get();
```

Minimum threshold: 3 signals. Below that, not enough data to form meaningful clusters.

### Step 2: Read previous topics

```typescript
const oneDayAgo = new Date();
oneDayAgo.setDate(oneDayAgo.getDate() - 1);

const prevTopicsSnap = await db.collection("topics")
  .where("createdAt", ">", oneDayAgo)
  .orderBy("createdAt", "desc")
  .limit(20)
  .get();
```

Previous topics are included in the Gemini prompt so it can:
- Recognize recurring topics and assess velocity changes
- Avoid creating duplicate topics for the same trend
- Report "was stable, now rising" style velocity shifts

### Step 3: Gemini call

Single call to `gemini-2.0-flash` with structured JSON output.

**System prompt includes:**
- The 10 risk category definitions (R01-R10) with names
- Instructions to group signals into 2-10 named topics
- Instructions to assign velocity by comparing with previous topics
- Instructions to map each topic to 1-3 risk categories
- Output schema definition

**User prompt includes:**
- Array of signal objects: `{ id, title, summary, risk_categories, severity_hint, source_name, published_date }`
- Array of previous topics (if any): `{ name, riskCategories, velocity, signalCount }`

**Expected output:**
```json
[
  {
    "name": "EU AI Act Enforcement Ramp-Up",
    "description": "Multiple EU member states begin issuing fines...",
    "riskCategories": ["R01", "R09"],
    "velocity": "rising",
    "signalIds": ["abc123", "def456", "ghi789"]
  }
]
```

Signals that don't fit any cluster are dropped (not every signal needs to be in a topic).

### Step 4: Store topics

Batch write to `topics/` collection. Each topic doc gets:
- `firstSeenAt` derived from the earliest signal's `fetched_at` in that cluster
- `createdAt` as server timestamp
- `createdBy: "topic-tracker"`
- `runId` referencing the current run

### Step 5: Track health

Call `writeAgentRunSummary()` with:
```typescript
{
  agentId: "topic-tracker",
  startedAt: runStartedAt,
  outcome: "success" | "empty" | "error",
  error: null | errorMessage,
  metrics: {
    articlesFetched: signals.length,  // reuse field for "signals read"
    signalsStored: topics.length,     // reuse field for "topics produced"
    geminiCalls: 1,
    tokensInput,
    tokensOutput,
    firestoreReads: signalReads + prevTopicReads,
    firestoreWrites: topics.length,
  },
  sourcesUsed: [],  // not applicable for Topic Tracker
}
```

---

## 3. Observatory UI

### Observatory main page

Add a **"Recent Topics"** card below the existing System Summary:

```
┌──────────────────────────────────────────────┐
│  RECENT TOPICS                               │
│                                              │
│  ▲ EU AI Act Enforcement         R01  R09    │
│    rising · 8 signals · 2h ago               │
│                                              │
│  ─ Autonomous Weapons Treaty     R05         │
│    stable · 5 signals · 2h ago               │
│                                              │
│  ▼ Model Collapse Research       R10         │
│    declining · 3 signals · 2h ago            │
└──────────────────────────────────────────────┘
```

Velocity indicators: `▲` rising (green), `─` stable (gray), `▼` declining (orange).

This card uses a Firestore `onSnapshot` on the `topics` collection ordered by `createdAt` desc, limited to 10.

### AgentDetail for topic-tracker

The existing AgentDetail component already supports Health, Config, and Run History tabs. For topic-tracker, add a **"Topics"** tab:

**Topics tab:**
- Shows latest run's topics as a list
- Each topic shows: name, velocity badge, risk category tags, signal count
- Expandable: click a topic to see its linked signal titles
- Filter by velocity (all / rising / stable / declining)

No config tab needed for topic-tracker initially (no configurable parameters — it reads whatever approved signals exist).

### No public dashboard changes

Topics are admin-only. The public dashboard continues to show risks, solutions, and approved signals as before.

---

## 4. Agent Registry Update

Update the seed script to set `topic-tracker` status to `active` after deployment:

```typescript
'topic-tracker': {
    status: 'active',
    deployedAt: FieldValue.serverTimestamp(),
    functionName: 'topicTracker',
    schedule: '0 8 * * *',
    // ... rest unchanged
}
```

---

## 5. Data Lifecycle

Add topic cleanup to the existing `dataLifecycle` function:
- Delete topics older than 30 days (they're ephemeral analysis artifacts, not permanent records)

---

## 6. Files to Create/Modify

**Create:**
- `functions/src/topic-tracker/clusterer.ts` — Gemini prompt + response parsing
- `functions/src/topic-tracker/store.ts` — Write topics to Firestore
- `src/components/observatory/TopicsCard.tsx` — Recent topics card for Observatory main page
- `src/components/observatory/TopicsTab.tsx` — Topics tab for AgentDetail

**Modify:**
- `functions/src/index.ts` — Add `topicTracker` scheduled function
- `functions/src/data-lifecycle.ts` — Add topic cleanup (>30 days)
- `firestore.rules` — Add `topics/{topicId}` read rule
- `firestore.indexes.json` — Add topics index
- `src/pages/Observatory.tsx` — Add TopicsCard below system summary
- `src/components/observatory/AgentDetail.tsx` — Add Topics tab for topic-tracker agent
