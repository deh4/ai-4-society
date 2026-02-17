# Topic Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Topic Tracker agent — a daily Cloud Function that clusters approved signals into named topics with trend velocity, stored in a new `topics` collection for downstream agent consumption.

**Architecture:** Scheduled Cloud Function reads last 7 days of approved signals, sends them to Gemini 2.0 Flash in a single batch call for clustering, writes structured topic documents to Firestore. Reuses existing `writeAgentRunSummary()` for health/run tracking. Observatory UI gets a topics card on the main page and a topics tab in the agent detail view.

**Tech Stack:** Firebase Cloud Functions v2, Gemini 2.0 Flash (`@google/generative-ai`), Firestore, React 19, TypeScript

---

## Task 1: Firestore Rules + Indexes for Topics

**Files:**
- Modify: `firestore.rules:48` (add topics rule before agents block)
- Modify: `firestore.indexes.json` (add topics index)

**Step 1: Add topics security rule**

In `firestore.rules`, add this block between the `_usage` rule and the `agents` rule (around line 48):

```
    // Topics: admin read, server write only (intermediate agent output)
    match /topics/{topicId} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

**Step 2: Add topics index**

In `firestore.indexes.json`, add to the `indexes` array:

```json
{
  "collectionGroup": "topics",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Step 3: Validate rules**

Run: `firebase deploy --only firestore:rules,firestore:indexes --project ai-4-society 2>&1 | tail -5`
Expected: `Deploy complete!`

**Step 4: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(topic-tracker): add Firestore rules and indexes for topics collection"
```

---

## Task 2: Topic Tracker Clusterer (Gemini Integration)

This is the core logic — the Gemini prompt that clusters signals into topics.

**Files:**
- Create: `functions/src/topic-tracker/clusterer.ts`

**Step 1: Create the clusterer module**

Create `functions/src/topic-tracker/clusterer.ts`:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface SignalInput {
  id: string;
  title: string;
  summary: string;
  risk_categories: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface PreviousTopic {
  name: string;
  riskCategories: string[];
  velocity: string;
  signalCount: number;
}

export interface ClusteredTopic {
  name: string;
  description: string;
  riskCategories: string[];
  velocity: "rising" | "stable" | "declining";
  signalIds: string[];
}

export interface ClusteringResult {
  topics: ClusteredTopic[];
  tokenUsage: { input: number; output: number };
}

const RISK_TAXONOMY = `
Risk categories:
- R01: Systemic Algorithmic Discrimination
- R02: Privacy Erosion via Agentic AI
- R03: AI-Amplified Disinformation
- R04: Mass Labor Displacement
- R05: Autonomous Weapons & Conflict Escalation
- R06: AI Power Concentration & Oligopoly
- R07: Environmental Cost of AI
- R08: Loss of Human Agency & Cognitive Atrophy
- R09: AI-Enabled Mass Surveillance
- R10: Model Collapse & Data Scarcity
`;

const SYSTEM_PROMPT = `You are a topic analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

You will receive a list of recently approved signals (news articles classified by risk category) and optionally a list of topics identified in the previous analysis run.

Your task:
1. Group related signals into named topics (2-10 topics). A topic is a coherent theme or trend, e.g. "EU AI Act Enforcement Ramp-Up" or "Deepfake Election Interference Wave".
2. Each topic must have:
   - "name": A concise, descriptive name (3-8 words)
   - "description": 2-3 sentences explaining what this topic represents and why it matters
   - "riskCategories": Array of risk category IDs this topic relates to (e.g. ["R01", "R09"])
   - "velocity": Compare with previous topics if provided. "rising" if the topic is growing (more signals, higher severity), "stable" if similar, "declining" if fewer signals. If no previous topics exist, infer from signal dates and severity.
   - "signalIds": Array of signal IDs that belong to this topic
3. A signal can belong to multiple topics if relevant.
4. Signals that don't fit any coherent cluster should be omitted (not every signal needs a topic).
5. Only create a topic if it has at least 2 signals.

Only output valid JSON array. No markdown fences. No explanation.`;

export async function clusterSignals(
  signals: SignalInput[],
  previousTopics: PreviousTopic[],
  geminiApiKey: string
): Promise<ClusteringResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const signalList = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\nRisk: ${s.risk_categories.join(", ")} | Severity: ${s.severity_hint}\nSummary: ${s.summary}`
    )
    .join("\n\n");

  let prompt = `Cluster these ${signals.length} signals into topics:\n\n${signalList}`;

  if (previousTopics.length > 0) {
    const prevList = previousTopics
      .map(
        (t) =>
          `- "${t.name}" (${t.riskCategories.join(", ")}, velocity: ${t.velocity}, ${t.signalCount} signals)`
      )
      .join("\n");
    prompt += `\n\nPrevious topics for velocity comparison:\n${prevList}`;
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const usage = result.response.usageMetadata;
    const tokenUsage = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };

    const text = result.response.text();
    const parsed: ClusteredTopic[] = JSON.parse(text);

    // Validate: filter out topics with fewer than 2 signals or invalid signalIds
    const validSignalIds = new Set(signals.map((s) => s.id));
    const validTopics = parsed
      .map((t) => ({
        ...t,
        signalIds: t.signalIds.filter((id) => validSignalIds.has(id)),
      }))
      .filter((t) => t.signalIds.length >= 2);

    logger.info(`Clustered ${signals.length} signals into ${validTopics.length} topics`);

    return { topics: validTopics, tokenUsage };
  } catch (err) {
    logger.error("Gemini clustering failed:", err);
    throw err;
  }
}
```

**Step 2: Commit**

```bash
git add functions/src/topic-tracker/clusterer.ts
git commit -m "feat(topic-tracker): add Gemini-based signal clustering module"
```

---

## Task 3: Topic Store (Firestore Writer)

**Files:**
- Create: `functions/src/topic-tracker/store.ts`

**Step 1: Create the store module**

Create `functions/src/topic-tracker/store.ts`:

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClusteredTopic } from "./clusterer.js";

interface SignalFetchedAt {
  id: string;
  fetched_at: FirebaseFirestore.Timestamp | null;
}

export async function storeTopics(
  topics: ClusteredTopic[],
  signalDates: Map<string, FirebaseFirestore.Timestamp>,
  runId: string
): Promise<number> {
  if (topics.length === 0) {
    logger.info("No topics to store.");
    return 0;
  }

  const db = getFirestore();
  const batch = db.batch();

  for (const topic of topics) {
    const ref = db.collection("topics").doc();

    // Find earliest signal date for firstSeenAt
    let earliestTimestamp: FirebaseFirestore.Timestamp | null = null;
    for (const signalId of topic.signalIds) {
      const ts = signalDates.get(signalId);
      if (ts && (!earliestTimestamp || ts.toMillis() < earliestTimestamp.toMillis())) {
        earliestTimestamp = ts;
      }
    }

    batch.set(ref, {
      name: topic.name,
      description: topic.description,
      riskCategories: topic.riskCategories,
      velocity: topic.velocity,
      signalCount: topic.signalIds.length,
      signalIds: topic.signalIds,
      firstSeenAt: earliestTimestamp ?? FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "topic-tracker",
      runId,
    });
  }

  await batch.commit();
  logger.info(`Stored ${topics.length} topics.`);
  return topics.length;
}
```

**Step 2: Commit**

```bash
git add functions/src/topic-tracker/store.ts
git commit -m "feat(topic-tracker): add topic store module for Firestore writes"
```

---

## Task 4: Topic Tracker Cloud Function (Main Pipeline)

**Files:**
- Modify: `functions/src/index.ts` (add `topicTracker` export)

**Step 1: Add the topicTracker function**

In `functions/src/index.ts`, add the import at the top (after existing imports around line 12):

```typescript
import { clusterSignals } from "./topic-tracker/clusterer.js";
import { storeTopics } from "./topic-tracker/store.js";
```

Then add this new export after the `dataLifecycle` function (after line 293):

```typescript
// ─── Topic Tracker Pipeline ─────────────────────────────────────────────────

export const topicTracker = onSchedule(
  {
    schedule: "0 8 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Topic Tracker: starting daily run");
    const runStartedAt = new Date();
    const db = getFirestore();

    try {
      // Step 1: Read approved signals from last 7 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: d.data().title as string,
        summary: d.data().summary as string,
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      // Build signal date map for firstSeenAt calculation
      const signalDates = new Map<string, FirebaseFirestore.Timestamp>();
      for (const d of signalsSnap.docs) {
        const fetchedAt = d.data().fetched_at;
        if (fetchedAt) {
          signalDates.set(d.id, fetchedAt);
        }
      }

      logger.info(`Read ${signals.length} approved signals from last 7 days`);

      if (signals.length < 3) {
        logger.info("Fewer than 3 signals — insufficient data for clustering. Ending run.");
        await writeAgentRunSummary({
          agentId: "topic-tracker",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read previous topics (from last 24h) for velocity comparison
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const prevTopicsSnap = await db
        .collection("topics")
        .where("createdAt", ">", oneDayAgo)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const previousTopics = prevTopicsSnap.docs.map((d) => ({
        name: d.data().name as string,
        riskCategories: (d.data().riskCategories as string[]) ?? [],
        velocity: (d.data().velocity as string) ?? "stable",
        signalCount: (d.data().signalCount as number) ?? 0,
      }));

      logger.info(`Read ${previousTopics.length} previous topics for velocity comparison`);

      // Step 3: Cluster with Gemini
      const { topics, tokenUsage } = await clusterSignals(
        signals,
        previousTopics,
        geminiApiKey.value()
      );

      if (topics.length === 0) {
        logger.info("No topics produced. Ending run.");
        await writeAgentRunSummary({
          agentId: "topic-tracker",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 1,
            tokensInput: tokenUsage.input,
            tokensOutput: tokenUsage.output,
            firestoreReads: 1 + (prevTopicsSnap.size > 0 ? 1 : 0),
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 4: Generate a run ID and store topics
      const runRef = db.collection("agents").doc("topic-tracker").collection("runs").doc();
      const stored = await storeTopics(topics, signalDates, runRef.id);

      logger.info(`Topic Tracker complete. Stored ${stored} topics from ${signals.length} signals.`);

      // Step 5: Track health
      const outcome = stored > 0 ? "success" : "partial";
      await writeAgentRunSummary({
        agentId: "topic-tracker",
        startedAt: runStartedAt,
        outcome,
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls: 1,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 1 + (prevTopicsSnap.size > 0 ? 1 : 0),
          firestoreWrites: stored + 1,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      logger.error("Topic Tracker pipeline error:", err);
      await writeAgentRunSummary({
        agentId: "topic-tracker",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);
```

**Step 2: Build functions to verify**

Run: `cd functions && npm run build 2>&1 | tail -5`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(topic-tracker): add topicTracker scheduled Cloud Function"
```

---

## Task 5: Data Lifecycle — Topic Cleanup

**Files:**
- Modify: `functions/src/data-lifecycle.ts`

**Step 1: Add topic cleanup**

In `functions/src/data-lifecycle.ts`, add `topicsDeleted` to the `LifecycleStats` interface (line 14):

```typescript
interface LifecycleStats {
  archived: number;
  deleted: number;
  evidenceMarkedStale: number;
  agentRunsDeleted: number;
  topicsDeleted: number;
}
```

Update the initial stats object in `runDataLifecycle()` (line 32):

```typescript
const stats: LifecycleStats = { archived: 0, deleted: 0, evidenceMarkedStale: 0, agentRunsDeleted: 0, topicsDeleted: 0 };
```

Add this block after the agent runs cleanup (after line 127, before `return stats;`):

```typescript
  // 5. Delete old topics (>30 days — ephemeral analysis artifacts)
  const topicCutoff = daysAgo(30);
  const topicsQuery = db
    .collection("topics")
    .where("createdAt", "<", topicCutoff)
    .limit(BATCH_SIZE);

  let topicsSnap = await topicsQuery.get();
  while (!topicsSnap.empty) {
    const batch = db.batch();
    for (const topicDoc of topicsSnap.docs) {
      batch.delete(topicDoc.ref);
      stats.topicsDeleted++;
    }
    await batch.commit();
    logger.info(`Deleted ${topicsSnap.size} old topics`);

    if (topicsSnap.size < BATCH_SIZE) break;
    topicsSnap = await topicsQuery.get();
  }
```

**Step 2: Build to verify**

Run: `cd functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 3: Commit**

```bash
git add functions/src/data-lifecycle.ts
git commit -m "feat(topic-tracker): add 30-day topic cleanup to data lifecycle"
```

---

## Task 6: Observatory UI — Topics Card

**Files:**
- Create: `src/components/observatory/TopicsCard.tsx`
- Modify: `src/pages/Observatory.tsx` (import and render TopicsCard)

**Step 1: Create TopicsCard component**

Create `src/components/observatory/TopicsCard.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Topic {
    id: string;
    name: string;
    description: string;
    riskCategories: string[];
    velocity: 'rising' | 'stable' | 'declining';
    signalCount: number;
    createdAt: { seconds: number } | null;
}

const VELOCITY_ICON: Record<string, string> = {
    rising: '\u25B2',
    stable: '\u2500',
    declining: '\u25BC',
};

const VELOCITY_COLOR: Record<string, string> = {
    rising: 'text-green-400',
    stable: 'text-gray-400',
    declining: 'text-orange-400',
};

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function TopicsCard() {
    const [topics, setTopics] = useState<Topic[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'topics'),
            orderBy('createdAt', 'desc'),
            limit(10)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as Topic[];
            setTopics(docs);
        });
        return unsubscribe;
    }, []);

    if (topics.length === 0) {
        return null; // Don't render card if no topics exist yet
    }

    return (
        <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Recent Topics</h2>
            <div className="space-y-3">
                {topics.map((topic) => (
                    <div key={topic.id} className="flex items-start gap-3">
                        <span className={`text-sm font-bold mt-0.5 ${VELOCITY_COLOR[topic.velocity]}`}>
                            {VELOCITY_ICON[topic.velocity]}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{topic.name}</span>
                                {topic.riskCategories.map((rc) => (
                                    <span
                                        key={rc}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400"
                                    >
                                        {rc}
                                    </span>
                                ))}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                                {topic.velocity} · {topic.signalCount} signal{topic.signalCount !== 1 ? 's' : ''}
                                {topic.createdAt && ` · ${timeAgo(topic.createdAt.seconds)}`}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**Step 2: Add TopicsCard to Observatory page**

In `src/pages/Observatory.tsx`, add the import at the top (after the AgentDetail import, line 6):

```typescript
import TopicsCard from '../components/observatory/TopicsCard';
```

Then insert `<TopicsCard />` right after the System Summary `</div>` closing tag (after line 197, before the Agent Grid comment):

```tsx
                {/* Recent Topics */}
                <TopicsCard />
```

**Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/observatory/TopicsCard.tsx src/pages/Observatory.tsx
git commit -m "feat(topic-tracker): add Recent Topics card to Observatory page"
```

---

## Task 7: Observatory UI — Topics Tab in AgentDetail

**Files:**
- Create: `src/components/observatory/TopicsTab.tsx`
- Modify: `src/components/observatory/AgentDetail.tsx` (add Topics tab for topic-tracker)

**Step 1: Create TopicsTab component**

Create `src/components/observatory/TopicsTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Topic {
    id: string;
    name: string;
    description: string;
    riskCategories: string[];
    velocity: 'rising' | 'stable' | 'declining';
    signalCount: number;
    signalIds: string[];
    createdAt: { seconds: number } | null;
}

const VELOCITY_BADGE: Record<string, { label: string; color: string }> = {
    rising: { label: 'Rising', color: 'text-green-400 bg-green-400/10' },
    stable: { label: 'Stable', color: 'text-gray-400 bg-gray-400/10' },
    declining: { label: 'Declining', color: 'text-orange-400 bg-orange-400/10' },
};

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

export default function TopicsTab() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [velocityFilter, setVelocityFilter] = useState<string>('all');

    useEffect(() => {
        const q = query(
            collection(db, 'topics'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as Topic[];
            setTopics(docs);
        });
        return unsubscribe;
    }, []);

    const filtered = velocityFilter === 'all'
        ? topics
        : topics.filter((t) => t.velocity === velocityFilter);

    if (topics.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No topics generated yet</div>;
    }

    return (
        <div className="space-y-4">
            {/* Velocity filter */}
            <div className="flex gap-1">
                {(['all', 'rising', 'stable', 'declining'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setVelocityFilter(f)}
                        className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                            velocityFilter === f
                                ? 'bg-white/10 text-white'
                                : 'text-gray-500 hover:text-white'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Topics list */}
            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {filtered.map((topic) => {
                    const isExpanded = expandedId === topic.id;
                    const badge = VELOCITY_BADGE[topic.velocity] ?? VELOCITY_BADGE.stable;

                    return (
                        <div key={topic.id}>
                            <div
                                onClick={() => setExpandedId(isExpanded ? null : topic.id)}
                                className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/10"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{topic.name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {topic.riskCategories.map((rc) => (
                                        <span
                                            key={rc}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400"
                                        >
                                            {rc}
                                        </span>
                                    ))}
                                    <span className="text-[10px] text-gray-500">
                                        {topic.signalCount} signal{topic.signalCount !== 1 ? 's' : ''}
                                    </span>
                                    {topic.createdAt && (
                                        <span className="text-[10px] text-gray-500">
                                            {formatTime(topic.createdAt.seconds)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                    <div className="text-sm text-gray-300">{topic.description}</div>
                                    <div className="text-[10px] text-gray-500">
                                        Signal IDs: {topic.signalIds.join(', ')}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No {velocityFilter} topics
                    </div>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Add Topics tab to AgentDetail**

In `src/components/observatory/AgentDetail.tsx`, add the import at the top (after the existing imports):

```typescript
import TopicsTab from './TopicsTab';
```

Find the tabs definition (line 130, `const tabs = ['health', 'config', 'runs'] as const;`) and the tab state (line 93, `const [tab, setTab] = useState<'health' | 'config' | 'runs'>('health');`).

Change the tab state type to include 'topics':

```typescript
const [tab, setTab] = useState<'health' | 'config' | 'runs' | 'topics'>('health');
```

Change the tabs array to conditionally include 'topics' for topic-tracker:

```typescript
const tabs = agent.id === 'topic-tracker'
    ? (['health', 'topics', 'runs'] as const)
    : (['health', 'config', 'runs'] as const);
```

In the tab content section (around line 164), add the TopicsTab rendering:

```tsx
{tab === 'topics' && <TopicsTab />}
```

This line goes right after `{tab === 'health' && <HealthTab health={health} />}`.

**Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/components/observatory/TopicsTab.tsx src/components/observatory/AgentDetail.tsx
git commit -m "feat(topic-tracker): add Topics tab to AgentDetail for topic-tracker agent"
```

---

## Task 8: Update Agent Registry + Deploy

**Files:**
- Modify: `src/scripts/seed-agents.ts` (update topic-tracker status)

**Step 1: Update topic-tracker in seed script**

In `src/scripts/seed-agents.ts`, find the `'topic-tracker'` entry and update it:

```typescript
'topic-tracker': {
    name: 'Topic Tracker',
    description: 'Monitors AI domains and emerging themes. Detects trend shifts, clusters related signals, and identifies new topics requiring risk/solution entries.',
    tier: '2A',
    status: 'active',
    deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    functionName: 'topicTracker',
    schedule: '0 8 * * *',
    overseerRole: 'Causality Cartographer',
},
```

**Step 2: Build functions**

Run: `cd functions && npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 3: Build frontend**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build.

**Step 4: Check active Firebase project**

Run: `firebase use`
Expected: `ai-4-society`

**Step 5: Deploy everything**

Run: `firebase deploy --only functions,hosting,firestore 2>&1 | tail -10`
Expected: `Deploy complete!`

**Step 6: Run seed script to update agent registry**

Run: `npx tsx src/scripts/seed-agents.ts 2>&1`
Expected: `Agent registry seeding complete!`

**Step 7: Commit**

```bash
git add src/scripts/seed-agents.ts
git commit -m "feat(topic-tracker): update agent registry and deploy"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Firestore rules + indexes | `firestore.rules`, `firestore.indexes.json` |
| 2 | Clusterer (Gemini prompt) | `functions/src/topic-tracker/clusterer.ts` (create) |
| 3 | Topic store (Firestore writer) | `functions/src/topic-tracker/store.ts` (create) |
| 4 | Cloud Function (main pipeline) | `functions/src/index.ts` (modify) |
| 5 | Data lifecycle (30-day cleanup) | `functions/src/data-lifecycle.ts` (modify) |
| 6 | Topics card (Observatory main) | `src/components/observatory/TopicsCard.tsx` (create), `src/pages/Observatory.tsx` (modify) |
| 7 | Topics tab (AgentDetail) | `src/components/observatory/TopicsTab.tsx` (create), `src/components/observatory/AgentDetail.tsx` (modify) |
| 8 | Agent registry update + deploy | `src/scripts/seed-agents.ts` (modify), deploy all |
