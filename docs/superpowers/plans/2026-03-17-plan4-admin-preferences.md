# Plan 4: Admin Panel Overhaul & Preference Sync

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin panel into three clean sections (Unified Review, Agents, Users) and add Firestore preference sync so anonymous localStorage preferences migrate to the user's account on sign-in.

**Architecture:** The current admin has 6 tabs (risk-signals, solution-signals, discovery, validation, milestones, users). The spec calls for 3 sections: a unified Review section combining all pending items with filter toggles, an Agents section for per-agent config/diagnostics/manual controls, and the existing Users section. Preference sync adds a Firestore `users/{uid}/preferences` document that seeds from localStorage on first sign-in and becomes the source of truth for authenticated users.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4, Framer Motion 12, Firebase/Firestore (client SDK), Recharts (run history charts)

**Dependencies completed:**
- Plan 1: Types, data clients, Firestore config
- Plan 2: v2 agents with `agents/{agentId}/runs`, `agents/{agentId}/health/latest`, `agents/{agentId}/config/current` collections
- Plan 3: Frontend public pages, GraphContext, PreferencePicker, AuthContext

**Spec reference:** `docs/superpowers/specs/2026-03-16-ai4society-v2-redesign-design.md` (sections 5.5, 5.6)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/data/preferences.ts` | Firestore client: get/set/sync user preferences |
| `src/data/agentConfig.ts` | Firestore client: read/write agent config, read run history + health |
| `src/components/admin/UnifiedReviewList.tsx` | Single list of all pending items (signals, discovery proposals, validation proposals) with filter toggles |
| `src/components/admin/ReviewItemCard.tsx` | Polymorphic card rendering for signal / discovery / validation items |
| `src/components/admin/AgentsSection.tsx` | Agent dashboard: overview cards for each agent |
| `src/components/admin/AgentDetailPanel.tsx` | Per-agent view: config, diagnostics, run history chart, manual controls |
| `src/components/admin/RunHistoryChart.tsx` | Recharts area chart showing last 30 days of agent runs |
| `src/components/admin/SourceConfigTable.tsx` | Editable table of data sources with enable/disable toggles and credibility overrides |

### Modified files

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Restructure from 6 tabs to 3 sections (Review, Agents, Users), update role access |
| `src/lib/firebase.ts` | Add `functions` export (`getFunctions` + emulator connection) |
| `src/lib/roles.ts` | Add `'review'` and `'agents'` tab access |
| `src/lib/preferences.ts` | Add `savePreferences()` auth-aware write function |
| `src/store/AuthContext.tsx` | On sign-in, trigger preference sync from localStorage to Firestore |
| `src/types/user.ts` | Add `UserPreferencesDoc` type with Firestore timestamps |
| `package.json` | Add `recharts` dependency (if not already present) |

**Important context:**
- Plan 2 replaced all v1 agent exports with v2. The v2 agents store proposals in `graph_proposals` (not v1 `discovery_proposals`/`validation_proposals`). The v2 approval flow uses `approveGraphProposal`/`rejectGraphProposal` callables. The UnifiedReviewList therefore only queries the v2 `graph_proposals` collection for discovery and validation items. Any remaining v1 proposals should have been cleaned up by Data Lifecycle.
- The existing codebase uses `getFunctions()` inline (see `ValidationTab.tsx`). This plan adds a centralized `functions` export to `src/lib/firebase.ts` for consistency.

### Unchanged files (reused as-is)

| File | Why unchanged |
|------|--------------|
| `src/components/admin/UsersTab.tsx` | Already implements spec 5.5 Users section |
| `src/components/admin/MilestonesTab.tsx` | Milestones CRUD moves into Review section as-is |
| `src/components/admin/AcknowledgmentModal.tsx` | Reused for onboarding |
| `src/components/admin/HelpPanel.tsx` | Reused, content updated in Admin.tsx |
| `src/components/admin/TutorialOverlay.tsx` | Reused for onboarding |
| `src/components/shared/PreferencePicker.tsx` | Already built in Plan 3, reused for preference UI |
| `functions/src/usage-monitor.ts` | Agent run data already written here — frontend reads it |

---

## Chunk 1: Preference Sync

### Task 1: Add Firestore preference types

**Files:**
- Modify: `src/types/user.ts`

- [ ] **Step 1: Add `UserPreferencesDoc` interface**

Add below the existing `UserPreferences` interface:

```typescript
export interface UserPreferencesDoc extends UserPreferences {
  syncedAt: Timestamp | null;
  source: "localStorage" | "manual";
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/user.ts
git commit -m "feat(types): add UserPreferencesDoc for Firestore preference sync"
```

---

### Task 2: Create Firestore preferences data client

**Files:**
- Create: `src/data/preferences.ts`

- [ ] **Step 1: Create `src/data/preferences.ts`**

```typescript
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { UserPreferences, UserPreferencesDoc } from "../types/user";
import { getLocalPreferences, setLocalPreferences } from "../lib/preferences";

/**
 * Read preferences from Firestore for an authenticated user.
 * Returns null if no Firestore preferences exist yet.
 */
export async function getFirestorePreferences(
  uid: string
): Promise<UserPreferencesDoc | null> {
  const ref = doc(db, "users", uid, "preferences", "current");
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserPreferencesDoc) : null;
}

/**
 * Write preferences to Firestore for an authenticated user.
 */
export async function setFirestorePreferences(
  uid: string,
  prefs: UserPreferences,
  source: "localStorage" | "manual" = "manual"
): Promise<void> {
  const ref = doc(db, "users", uid, "preferences", "current");
  await setDoc(ref, {
    interests: prefs.interests,
    source,
    syncedAt: serverTimestamp(),
  });
}

/**
 * Sync localStorage preferences to Firestore on first sign-in.
 * - If Firestore has preferences → use Firestore (overwrite localStorage)
 * - If only localStorage has preferences → push to Firestore
 * - If neither has preferences → no-op
 *
 * Returns the resolved preferences.
 */
export async function syncPreferences(
  uid: string
): Promise<UserPreferences> {
  const firestorePrefs = await getFirestorePreferences(uid);
  const localPrefs = getLocalPreferences();

  if (firestorePrefs && firestorePrefs.interests.length > 0) {
    // Firestore wins — update localStorage to match
    setLocalPreferences({ interests: firestorePrefs.interests });
    return { interests: firestorePrefs.interests };
  }

  if (localPrefs.interests.length > 0) {
    // localStorage has preferences, Firestore doesn't — push up
    await setFirestorePreferences(uid, localPrefs, "localStorage");
    return localPrefs;
  }

  // Neither has preferences
  return { interests: [] };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/preferences.ts
git commit -m "feat(data): add Firestore preferences client with sync logic"
```

---

### Task 3: Trigger preference sync on sign-in

**Files:**
- Modify: `src/store/AuthContext.tsx`

- [ ] **Step 1: Import `syncPreferences` and call it after user document loads**

Add import at the top of `AuthContext.tsx`:

```typescript
import { syncPreferences } from "../data/preferences";
```

Inside the `onAuthStateChanged` callback, after the user document is loaded (after the `setUserDoc(...)` calls and before `setLoading(false)`), add:

```typescript
// Sync preferences from localStorage → Firestore on sign-in
syncPreferences(firebaseUser.uid).catch((err) =>
  console.error("Failed to sync preferences:", err)
);
```

Place this call inside the `if (firebaseUser)` block, after the try/catch for user document loading, so it runs for all authenticated users regardless of whether they have a user doc.

- [ ] **Step 2: Commit**

```bash
git add src/store/AuthContext.tsx
git commit -m "feat(auth): trigger preference sync on sign-in"
```

---

### Task 4: Make PreferencePicker auth-aware

**Files:**
- Modify: `src/lib/preferences.ts`

- [ ] **Step 1: Add auth-aware `savePreferences` function**

Add imports at the **top** of `src/lib/preferences.ts` (alongside the existing import):

```typescript
import { auth } from "./firebase";
import { setFirestorePreferences } from "../data/preferences";
```

Then add this function at the bottom of the file:

```typescript
/**
 * Save preferences to localStorage always, and to Firestore if authenticated.
 */
export async function savePreferences(prefs: UserPreferences): Promise<void> {
  setLocalPreferences(prefs);
  const user = auth.currentUser;
  if (user) {
    await setFirestorePreferences(user.uid, prefs, "manual");
  }
}
```

- [ ] **Step 2: Update PreferencePicker to use `savePreferences`**

In `src/components/shared/PreferencePicker.tsx`, replace calls to `setLocalPreferences` with `savePreferences` (imported from `src/lib/preferences`). This ensures that when an authenticated user picks interests, they're saved to both localStorage and Firestore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/preferences.ts src/components/shared/PreferencePicker.tsx
git commit -m "feat(preferences): save to Firestore when authenticated"
```

---

## Chunk 2: Firebase Setup & Agent Data Client

### Task 5: Export `functions` from firebase.ts

**Files:**
- Modify: `src/lib/firebase.ts`

- [ ] **Step 1: Add Functions SDK export with emulator support**

Add to `src/lib/firebase.ts` after the existing `auth` export:

```typescript
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

export const functions = getFunctions(app);

// Inside the existing emulator block, add:
connectFunctionsEmulator(functions, 'localhost', 5001);
```

The full emulator block should now connect Firestore, Auth, and Functions when `VITE_USE_EMULATORS=true`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "feat(firebase): add functions export with emulator support"
```

---

### Task 6: Create agent config/diagnostics data client

**Note:** The spec also lists configurable fetch frequency, model, confidence threshold, batch size, and the ability to add/remove custom sources. These are deferred to a follow-up iteration — the admin can currently only toggle existing sources on/off and pause/resume agents. Adding full parameter editing requires backend validation callables to prevent misconfiguration.

**Files:**
- Create: `src/data/agentConfig.ts`

- [ ] **Step 1: Create `src/data/agentConfig.ts`**

```typescript
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// --- Types ---

export interface AgentSourceConfig {
  enabled: boolean;
  credibilityOverride?: number;
}

export interface AgentConfig {
  sources: Record<string, AgentSourceConfig>;
  paused: boolean;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
}

export interface AgentHealthDoc {
  lastRunAt: Timestamp | null;
  lastRunOutcome: string;
  lastError: string | null;
  lastErrorAt: Timestamp | null;
  consecutiveErrors: number;
  consecutiveEmptyRuns: number;
  lastRunTokens: { input: number; output: number };
  lastRunCost: CostBreakdown;
  totalTokensToday: { input: number; output: number };
  totalTokensMonth: { input: number; output: number };
  estimatedCostMonth: CostBreakdown;
  lastRunArticlesFetched: number;
  lastRunSignalsStored: number;
  totalSignalsLifetime: number;
}

export interface CostBreakdown {
  geminiTokens: number;
  firestoreReads: number;
  firestoreWrites: number;
  functionsCompute: number;
  total: number;
}

export interface AgentRunSummary {
  id: string;
  startedAt: Timestamp;
  completedAt: Timestamp;
  duration: number;
  outcome: string;
  error: string | null;
  metrics: {
    articlesFetched: number;
    signalsStored: number;
    geminiCalls: number;
    tokensInput: number;
    tokensOutput: number;
    firestoreReads: number;
    firestoreWrites: number;
  };
  modelId: string;
  cost: CostBreakdown;
  sourcesUsed: string[];
}

// --- Agent IDs ---

export const AGENT_IDS = [
  "signal-scout",
  "discovery-agent",
  "validator-agent",
  "data-lifecycle",
  "graph-builder",
  "feed-curator",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_LABELS: Record<AgentId, string> = {
  "signal-scout": "Signal Scout",
  "discovery-agent": "Discovery Agent",
  "validator-agent": "Validator Agent",
  "data-lifecycle": "Data Lifecycle",
  "graph-builder": "Graph Builder",
  "feed-curator": "Feed Curator",
};

export const AGENT_SCHEDULES: Record<AgentId, string> = {
  "signal-scout": "Every 6 hours",
  "discovery-agent": "Weekly (Sun 10:00 UTC)",
  "validator-agent": "Weekly (Mon 09:00 UTC)",
  "data-lifecycle": "Daily (03:00 UTC)",
  "graph-builder": "On demand",
  "feed-curator": "Every 6 hours",
};

// --- Read functions ---

export async function getAgentConfig(agentId: string): Promise<AgentConfig | null> {
  const ref = doc(db, "agents", agentId, "config", "current");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AgentConfig;
}

export async function getAgentHealth(agentId: string): Promise<AgentHealthDoc | null> {
  const ref = doc(db, "agents", agentId, "health", "latest");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AgentHealthDoc;
}

export async function getAgentRuns(
  agentId: string,
  maxResults = 30
): Promise<AgentRunSummary[]> {
  const runsRef = collection(db, "agents", agentId, "runs");
  const q = query(runsRef, orderBy("startedAt", "desc"), limit(maxResults));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentRunSummary));
}

export async function getRecentRunsByOutcome(
  agentId: string,
  days = 30
): Promise<AgentRunSummary[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const runsRef = collection(db, "agents", agentId, "runs");
  const q = query(
    runsRef,
    where("startedAt", ">=", Timestamp.fromDate(cutoff)),
    orderBy("startedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentRunSummary));
}

// --- Write functions ---

export async function updateAgentConfig(
  agentId: string,
  config: Partial<AgentConfig>,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      ...config,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function toggleAgentSource(
  agentId: string,
  sourceId: string,
  enabled: boolean,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      sources: { [sourceId]: { enabled } },
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function setAgentPaused(
  agentId: string,
  paused: boolean,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      paused,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/agentConfig.ts
git commit -m "feat(data): add agent config/health/runs Firestore client"
```

---

## Chunk 3: Unified Review Section

### Task 7: Create ReviewItemCard component

**Files:**
- Create: `src/components/admin/ReviewItemCard.tsx`

- [ ] **Step 1: Create `src/components/admin/ReviewItemCard.tsx`**

This is a polymorphic card that renders differently based on item type (signal, discovery proposal, validation proposal). It extracts the common pattern from the existing Admin.tsx signal detail view, DiscoveryTab, and ValidationTab.

```typescript
import { type ReactNode } from "react";

export type ReviewItemType = "signal" | "discovery" | "validation";

export interface ReviewItem {
  id: string;
  type: ReviewItemType;
  title: string;
  summary: string;
  status: string;
  createdAt: { seconds: number } | null;
  /** Signal-specific */
  signalType?: string;
  riskCategories?: string[];
  solutionIds?: string[];
  severityHint?: string;
  confidenceScore?: number;
  sourceName?: string;
  sourceUrl?: string;
  /** Discovery-specific */
  proposedName?: string;
  proposalType?: string;
  skeleton?: Record<string, unknown>;
  supportingSignalIds?: string[];
  /** Validation-specific */
  documentType?: string;
  documentId?: string;
  documentName?: string;
  proposedChanges?: Record<string, { current_value: unknown; proposed_value: unknown }>;
  overallReasoning?: string;
  confidence?: number;
}

interface Props {
  item: ReviewItem;
  selected: boolean;
  onClick: () => void;
}

export function ReviewItemCard({ item, selected, onClick }: Props) {
  const typeColors: Record<ReviewItemType, string> = {
    signal: "border-blue-500",
    discovery: "border-purple-500",
    validation: "border-amber-500",
  };

  const typeLabels: Record<ReviewItemType, string> = {
    signal: "Signal",
    discovery: "Discovery",
    validation: "Validation",
  };

  const borderColor = typeColors[item.type];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-l-4 ${borderColor} rounded-r-lg transition-colors ${
        selected
          ? "bg-white/10 ring-1 ring-white/20"
          : "bg-white/5 hover:bg-white/8"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          {typeLabels[item.type]}
        </span>
        {item.status === "pending" && (
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
        )}
      </div>
      <h4 className="text-sm font-medium text-white/90 line-clamp-2">
        {item.title || item.proposedName || item.documentName || "Untitled"}
      </h4>
      <p className="text-xs text-white/50 mt-1 line-clamp-1">
        {item.sourceName || item.proposalType || item.documentType || ""}
      </p>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/ReviewItemCard.tsx
git commit -m "feat(admin): add ReviewItemCard polymorphic component"
```

---

### Task 8: Create UnifiedReviewList component

**Files:**
- Create: `src/components/admin/UnifiedReviewList.tsx`

- [ ] **Step 1: Create `src/components/admin/UnifiedReviewList.tsx`**

This component combines signals, discovery proposals, and validation proposals into one list with filter toggles. It replaces the separate risk-signals, solution-signals, discovery, and validation tabs.

```typescript
import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ReviewItemCard, type ReviewItem, type ReviewItemType } from "./ReviewItemCard";

interface Props {
  onSelectItem: (item: ReviewItem | null) => void;
  selectedId: string | null;
  /** Bulk selection support — parent manages selected IDs for bulk actions */
  bulkSelectedIds: Set<string>;
  onBulkToggle: (id: string) => void;
  onBulkSelectAll: (ids: string[]) => void;
  onBulkClear: () => void;
}

const TYPE_FILTERS: { key: ReviewItemType; label: string }[] = [
  { key: "signal", label: "Signals" },
  { key: "discovery", label: "Discovery" },
  { key: "validation", label: "Validation" },
];

const STATUS_OPTIONS = ["pending", "all", "approved", "rejected"] as const;

export function UnifiedReviewList({
  onSelectItem,
  selectedId,
  bulkSelectedIds,
  onBulkToggle,
  onBulkSelectAll,
  onBulkClear,
}: Props) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<ReviewItemType>>(
    new Set(["signal", "discovery", "validation"])
  );
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  // Subscribe to signals
  useEffect(() => {
    const signalsRef = collection(db, "signals");
    const q =
      statusFilter === "all"
        ? query(signalsRef, orderBy("fetched_at", "desc"))
        : query(
            signalsRef,
            where("status", "==", statusFilter),
            orderBy("fetched_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const signals: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "signal" as const,
          title: (data.title as string) ?? "",
          summary: (data.summary as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.fetched_at ?? null,
          signalType: data.signal_type as string,
          riskCategories: (data.risk_categories as string[]) ?? [],
          solutionIds: (data.solution_ids as string[]) ?? [],
          severityHint: data.severity_hint as string,
          confidenceScore: data.confidence_score as number,
          sourceName: data.source_name as string,
          sourceUrl: data.source_url as string,
        };
      });
      setItems((prev) => {
        const nonSignals = prev.filter((i) => i.type !== "signal");
        return [...nonSignals, ...signals];
      });
      setLoading(false);
    });

    return unsub;
  }, [statusFilter]);

  // Subscribe to discovery proposals (graph_proposals with proposal_type containing "new_")
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const q =
      statusFilter === "all"
        ? query(proposalsRef, where("proposal_type", "in", ["new_node", "new_edge"]), orderBy("created_at", "desc"))
        : query(
            proposalsRef,
            where("proposal_type", "in", ["new_node", "new_edge"]),
            where("status", "==", statusFilter),
            orderBy("created_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const discoveries: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "discovery" as const,
          title: (data.proposed_changes?.name as string) ?? "New proposal",
          summary: (data.proposed_changes?.summary as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.created_at ?? null,
          proposedName: data.proposed_changes?.name as string,
          proposalType: data.proposal_type as string,
          skeleton: data.proposed_changes as Record<string, unknown>,
          supportingSignalIds: (data.supporting_signal_ids as string[]) ?? [],
        };
      });
      setItems((prev) => {
        const nonDiscovery = prev.filter((i) => i.type !== "discovery");
        return [...nonDiscovery, ...discoveries];
      });
    });

    return unsub;
  }, [statusFilter]);

  // Subscribe to validation proposals (graph_proposals with proposal_type "update_node")
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const q =
      statusFilter === "all"
        ? query(proposalsRef, where("proposal_type", "==", "update_node"), orderBy("created_at", "desc"))
        : query(
            proposalsRef,
            where("proposal_type", "==", "update_node"),
            where("status", "==", statusFilter),
            orderBy("created_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const validations: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "validation" as const,
          title: (data.node_name as string) ?? (data.node_id as string) ?? "Update proposal",
          summary: (data.overall_reasoning as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.created_at ?? null,
          documentType: data.node_type as string,
          documentId: data.node_id as string,
          documentName: data.node_name as string,
          proposedChanges: data.proposed_changes as Record<string, { current_value: unknown; proposed_value: unknown }>,
          overallReasoning: data.overall_reasoning as string,
          confidence: data.confidence as number,
        };
      });
      setItems((prev) => {
        const nonValidation = prev.filter((i) => i.type !== "validation");
        return [...nonValidation, ...validations];
      });
    });

    return unsub;
  }, [statusFilter]);

  // Filter and sort
  const filtered = useMemo(() => {
    return items
      .filter((item) => activeTypes.has(item.type))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
  }, [items, activeTypes]);

  const pendingCounts = useMemo(() => {
    const counts: Record<ReviewItemType, number> = { signal: 0, discovery: 0, validation: 0 };
    for (const item of items) {
      if (item.status === "pending") counts[item.type]++;
    }
    return counts;
  }, [items]);

  const toggleType = (type: ReviewItemType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/10">
        {/* Type toggles */}
        {TYPE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleType(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeTypes.has(key)
                ? "bg-white/20 text-white"
                : "bg-white/5 text-white/40 hover:bg-white/10"
            }`}
          >
            {label}
            {pendingCounts[key] > 0 && (
              <span className="ml-1.5 bg-yellow-400/20 text-yellow-400 px-1.5 rounded-full">
                {pendingCounts[key]}
              </span>
            )}
          </button>
        ))}

        {/* Status filter */}
        <div className="ml-auto flex items-center gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                statusFilter === s
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkSelectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
          <span className="text-xs text-white/60">{bulkSelectedIds.size} selected</span>
          <button
            onClick={onBulkClear}
            className="text-xs text-white/40 hover:text-white/60"
          >
            Clear
          </button>
        </div>
      )}

      {/* Select all for current filter */}
      {filtered.length > 0 && statusFilter === "pending" && (
        <button
          onClick={() => onBulkSelectAll(filtered.map((i) => i.id))}
          className="text-[10px] text-white/40 hover:text-white/60 px-3 py-1"
        >
          Select all {filtered.length}
        </button>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-white/40 text-sm text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">No items match filters</p>
        ) : (
          filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex items-start gap-2">
              {statusFilter === "pending" && (
                <input
                  type="checkbox"
                  checked={bulkSelectedIds.has(item.id)}
                  onChange={() => onBulkToggle(item.id)}
                  className="mt-3 accent-blue-500"
                />
              )}
              <div className="flex-1">
                <ReviewItemCard
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => onSelectItem(item)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/UnifiedReviewList.tsx
git commit -m "feat(admin): add UnifiedReviewList with type and status filters"
```

---

## Chunk 4: Agents Section

### Task 9: Install recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for agent diagnostics charts"
```

---

### Task 10: Create RunHistoryChart component

**Files:**
- Create: `src/components/admin/RunHistoryChart.tsx`

- [ ] **Step 1: Create `src/components/admin/RunHistoryChart.tsx`**

```typescript
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AgentRunSummary } from "../../data/agentConfig";

interface Props {
  runs: AgentRunSummary[];
}

export function RunHistoryChart({ runs }: Props) {
  const data = runs.map((run) => {
    const date = run.startedAt?.toDate?.()
      ?? new Date(run.startedAt?.seconds ? run.startedAt.seconds * 1000 : 0);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      signals: run.metrics.signalsStored,
      articles: run.metrics.articlesFetched,
      cost: run.cost?.total ?? 0,
      outcome: run.outcome,
    };
  });

  if (data.length === 0) {
    return (
      <p className="text-white/40 text-sm text-center py-6">
        No run history available
      </p>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="signalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="articleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "white",
            }}
          />
          <Area
            type="monotone"
            dataKey="articles"
            stroke="#8b5cf6"
            fill="url(#articleGrad)"
            strokeWidth={1.5}
            name="Articles"
          />
          <Area
            type="monotone"
            dataKey="signals"
            stroke="#3b82f6"
            fill="url(#signalGrad)"
            strokeWidth={1.5}
            name="Signals"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/RunHistoryChart.tsx
git commit -m "feat(admin): add RunHistoryChart with recharts area chart"
```

---

### Task 11: Create SourceConfigTable component

**Files:**
- Create: `src/components/admin/SourceConfigTable.tsx`

- [ ] **Step 1: Create `src/components/admin/SourceConfigTable.tsx`**

```typescript
import { useState } from "react";
import type { AgentConfig } from "../../data/agentConfig";
import { toggleAgentSource } from "../../data/agentConfig";

// Source metadata from functions/src/config/sources.ts
const SOURCE_META: Record<string, { name: string; tier: number; defaultCredibility: number }> = {
  arxiv: { name: "arXiv CS.AI", tier: 1, defaultCredibility: 0.85 },
  "mit-tech-review": { name: "MIT Technology Review", tier: 2, defaultCredibility: 0.80 },
  wired: { name: "Wired", tier: 2, defaultCredibility: 0.75 },
  "ars-technica": { name: "Ars Technica", tier: 2, defaultCredibility: 0.75 },
  "the-verge": { name: "The Verge", tier: 3, defaultCredibility: 0.65 },
  techcrunch: { name: "TechCrunch", tier: 3, defaultCredibility: 0.60 },
  "tldr-ai": { name: "TLDR AI", tier: 5, defaultCredibility: 0.65 },
  "import-ai": { name: "Import AI", tier: 5, defaultCredibility: 0.70 },
  "last-week-in-ai": { name: "Last Week in AI", tier: 5, defaultCredibility: 0.65 },
  gdelt: { name: "GDELT", tier: 4, defaultCredibility: 0.50 },
};

interface Props {
  agentId: string;
  config: AgentConfig | null;
  uid: string;
}

export function SourceConfigTable({ agentId, config, uid }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);

  const sources = config?.sources ?? {};
  const sourceIds = Object.keys(SOURCE_META);

  const handleToggle = async (sourceId: string, enabled: boolean) => {
    setToggling(sourceId);
    try {
      await toggleAgentSource(agentId, sourceId, enabled, uid);
    } catch (err) {
      console.error("Failed to toggle source:", err);
    }
    setToggling(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
            <th className="text-left py-2 px-3">Source</th>
            <th className="text-center py-2 px-3">Tier</th>
            <th className="text-center py-2 px-3">Credibility</th>
            <th className="text-center py-2 px-3">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {sourceIds.map((id) => {
            const meta = SOURCE_META[id];
            const sourceConfig = sources[id];
            const enabled = sourceConfig?.enabled ?? true;
            const credibility = sourceConfig?.credibilityOverride ?? meta.defaultCredibility;

            return (
              <tr
                key={id}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="py-2 px-3 text-white/80">{meta.name}</td>
                <td className="py-2 px-3 text-center text-white/60">T{meta.tier}</td>
                <td className="py-2 px-3 text-center text-white/60">
                  {(credibility * 100).toFixed(0)}%
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => handleToggle(id, !enabled)}
                    disabled={toggling === id}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      enabled ? "bg-green-500/60" : "bg-white/10"
                    } ${toggling === id ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        enabled ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/SourceConfigTable.tsx
git commit -m "feat(admin): add SourceConfigTable with enable/disable toggles"
```

---

### Task 12: Create AgentDetailPanel component

**Files:**
- Create: `src/components/admin/AgentDetailPanel.tsx`

- [ ] **Step 1: Create `src/components/admin/AgentDetailPanel.tsx`**

```typescript
import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import {
  type AgentId,
  type AgentHealthDoc,
  type AgentConfig,
  type AgentRunSummary,
  AGENT_LABELS,
  AGENT_SCHEDULES,
  getAgentConfig,
  getAgentHealth,
  getRecentRunsByOutcome,
  setAgentPaused,
} from "../../data/agentConfig";
import { RunHistoryChart } from "./RunHistoryChart";
import { SourceConfigTable } from "./SourceConfigTable";
import { useAuth } from "../../store/AuthContext";

interface Props {
  agentId: AgentId;
  onBack: () => void;
}

// Map agent IDs to v2 trigger callable names
const TRIGGER_MAP: Partial<Record<AgentId, string>> = {
  "signal-scout": "triggerSignalScout",
  "discovery-agent": "triggerDiscovery",
  "validator-agent": "triggerValidator",
  "data-lifecycle": "dataLifecycleV2",
  "graph-builder": "buildGraph",
  "feed-curator": "triggerFeedCurator",
};

export function AgentDetailPanel({ agentId, onBack }: Props) {
  const { user } = useAuth();
  const [health, setHealth] = useState<AgentHealthDoc | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getAgentHealth(agentId),
      getAgentConfig(agentId),
      getRecentRunsByOutcome(agentId, 30),
    ]).then(([h, c, r]) => {
      if (cancelled) return;
      setHealth(h);
      setConfig(c);
      setRuns(r);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleTrigger = async () => {
    const callableName = TRIGGER_MAP[agentId];
    if (!callableName) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const fn = httpsCallable(functions, callableName);
      const result = await fn({});
      const data = result.data as { message?: string };
      setTriggerResult(data.message ?? "Agent triggered successfully");
    } catch (err) {
      setTriggerResult(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    setTriggering(false);
  };

  const handlePauseToggle = async () => {
    if (!user) return;
    const newPaused = !(config?.paused ?? false);
    await setAgentPaused(agentId, newPaused, user.uid);
    setConfig((prev) =>
      prev ? { ...prev, paused: newPaused } : prev
    );
  };

  if (loading) {
    return <p className="text-white/40 text-center py-8">Loading agent data...</p>;
  }

  const healthColor =
    !health || (health.consecutiveErrors ?? 0) >= 2
      ? "text-red-400"
      : (health.consecutiveEmptyRuns ?? 0) >= 3
      ? "text-yellow-400"
      : "text-green-400";

  const lastRun = health?.lastRunAt?.toDate?.()
    ?? (health?.lastRunAt?.seconds ? new Date(health.lastRunAt.seconds * 1000) : null);
  const hoursAgo = lastRun ? Math.round((Date.now() - lastRun.getTime()) / 3600_000) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-white/50 hover:text-white text-sm"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-white">
          {AGENT_LABELS[agentId]}
        </h2>
        <span className={`text-xs ${healthColor}`}>
          {health?.lastRunOutcome ?? "unknown"}
        </span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Last Run" value={hoursAgo !== null ? `${hoursAgo}h ago` : "Never"} />
        <StatCard label="Schedule" value={AGENT_SCHEDULES[agentId]} />
        <StatCard
          label="Errors"
          value={String(health?.consecutiveErrors ?? 0)}
          highlight={!!health && health.consecutiveErrors > 0}
        />
        <StatCard
          label="Cost (month)"
          value={`$${health?.estimatedCostMonth?.total?.toFixed(4) ?? "0.0000"}`}
        />
      </div>

      {/* Last run details */}
      {health && (
        <div className="bg-white/5 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-medium text-white/70">Last Run Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-white/60">
            <span>Articles fetched: {health.lastRunArticlesFetched}</span>
            <span>Signals stored: {health.lastRunSignalsStored}</span>
            <span>Tokens in: {health.lastRunTokens?.input?.toLocaleString() ?? 0}</span>
            <span>Tokens out: {health.lastRunTokens?.output?.toLocaleString() ?? 0}</span>
            <span>Run cost: ${health.lastRunCost?.total?.toFixed(4) ?? "0"}</span>
            <span>Lifetime signals: {health.totalSignalsLifetime ?? 0}</span>
          </div>
          {health.lastError && (
            <p className="text-xs text-red-400 mt-2">
              Last error: {health.lastError}
            </p>
          )}
        </div>
      )}

      {/* Run history chart */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white/70 mb-3">Run History (30 days)</h3>
        <RunHistoryChart runs={runs} />
      </div>

      {/* Source config (only for signal-scout) */}
      {agentId === "signal-scout" && (
        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white/70 mb-3">Source Configuration</h3>
          <SourceConfigTable
            agentId={agentId}
            config={config}
            uid={user?.uid ?? ""}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {TRIGGER_MAP[agentId] && (
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
          >
            {triggering ? "Running..." : "Trigger Run"}
          </button>
        )}
        <button
          onClick={handlePauseToggle}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            config?.paused
              ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
              : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
          }`}
        >
          {config?.paused ? "Resume" : "Pause"}
        </button>
        {triggerResult && (
          <span className="text-xs text-white/50">{triggerResult}</span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-red-400" : "text-white/80"}`}>
        {value}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AgentDetailPanel.tsx
git commit -m "feat(admin): add AgentDetailPanel with health, chart, config, and manual trigger"
```

---

### Task 13: Create AgentsSection component

**Files:**
- Create: `src/components/admin/AgentsSection.tsx`

- [ ] **Step 1: Create `src/components/admin/AgentsSection.tsx`**

```typescript
import { useState, useEffect } from "react";
import {
  type AgentId,
  type AgentHealthDoc,
  AGENT_IDS,
  AGENT_LABELS,
  AGENT_SCHEDULES,
  getAgentHealth,
} from "../../data/agentConfig";
import { AgentDetailPanel } from "./AgentDetailPanel";

export function AgentsSection() {
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealthDoc | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      AGENT_IDS.map(async (id) => {
        const health = await getAgentHealth(id);
        return [id, health] as const;
      })
    ).then((results) => {
      const map: Record<string, AgentHealthDoc | null> = {};
      for (const [id, health] of results) {
        map[id] = health;
      }
      setHealthMap(map);
      setLoading(false);
    });
  }, []);

  if (selectedAgent) {
    return (
      <AgentDetailPanel
        agentId={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  if (loading) {
    return <p className="text-white/40 text-center py-8">Loading agents...</p>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white mb-4">Agent Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {AGENT_IDS.map((id) => {
          const health = healthMap[id];
          const lastRun = health?.lastRunAt?.toDate?.()
            ?? (health?.lastRunAt?.seconds ? new Date(health.lastRunAt.seconds * 1000) : null);
          const hoursAgo = lastRun
            ? Math.round((Date.now() - lastRun.getTime()) / 3600_000)
            : null;

          const statusColor =
            !health || (health.consecutiveErrors ?? 0) >= 2
              ? "border-red-500/50"
              : (health.consecutiveEmptyRuns ?? 0) >= 3
              ? "border-yellow-500/50"
              : "border-green-500/50";

          return (
            <button
              key={id}
              onClick={() => setSelectedAgent(id)}
              className={`text-left bg-white/5 hover:bg-white/8 rounded-lg p-4 border-l-4 ${statusColor} transition-colors`}
            >
              <h3 className="text-sm font-medium text-white/90">
                {AGENT_LABELS[id]}
              </h3>
              <p className="text-[10px] text-white/40 mt-0.5">
                {AGENT_SCHEDULES[id]}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                <span>
                  {hoursAgo !== null ? `${hoursAgo}h ago` : "No runs"}
                </span>
                <span>{health?.lastRunOutcome ?? "—"}</span>
                {health?.estimatedCostMonth && (
                  <span>${health.estimatedCostMonth.total.toFixed(4)}/mo</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AgentsSection.tsx
git commit -m "feat(admin): add AgentsSection overview with health cards"
```

---

## Chunk 5: Admin Page Restructure

### Task 14: Update role tab access

**Files:**
- Modify: `src/lib/roles.ts`

- [ ] **Step 1: Add `agents` to ROLE_TAB_ACCESS**

In `src/lib/roles.ts`, add the `agents` entry to `ROLE_TAB_ACCESS`:

```typescript
export const ROLE_TAB_ACCESS: Record<string, UserRole[]> = {
    'review': ['signal-reviewer', 'discovery-reviewer', 'scoring-reviewer', 'lead'],
    'agents': ['lead'],
    'users': ['lead'],
    // Legacy tab access kept for backward compat during migration
    'risk-signals': ['signal-reviewer', 'lead'],
    'solution-signals': ['signal-reviewer', 'lead'],
    'discovery': ['discovery-reviewer', 'lead'],
    'validation': ['scoring-reviewer', 'lead'],
    'milestones': ['editor', 'lead'],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/roles.ts
git commit -m "feat(roles): add review and agents tab access"
```

---

### Task 15: Rewrite Admin.tsx with 3-section layout

**Files:**
- Modify: `src/pages/Admin.tsx`

This is the core restructure. The new Admin page has 3 top-level sections:

1. **Review** — UnifiedReviewList (left) + detail panel (right), replacing the 4 separate review tabs
2. **Agents** — AgentsSection with per-agent drill-down
3. **Users** — existing UsersTab

The existing detail panel rendering logic (signal detail, discovery form, validation diff) from Admin.tsx is preserved but refactored to work with the `ReviewItem` type.

- [ ] **Step 1: Read the current Admin.tsx thoroughly**

Read `src/pages/Admin.tsx` to understand all the existing detail panel logic, approval/rejection flows, bulk actions, and state management that must be preserved.

- [ ] **Step 2: Rewrite Admin.tsx with 3-section tabs**

Replace the tab structure with 3 sections. The key changes:

1. Replace the 6-tab navigation with 3 section buttons: Review, Agents, Users
2. The Review section uses `UnifiedReviewList` for the left panel and the existing detail panel logic for the right panel
3. The Agents section renders `AgentsSection`
4. The Users section renders the existing `UsersTab`
5. The MilestonesTab is accessible from a button within the Review section (not a top-level tab)
6. All existing approval/rejection logic (approve signal, reject signal, approve discovery, reject discovery, apply validation) is preserved
7. The `canAccessTab` check uses the new `'review'`, `'agents'`, `'users'` keys

The detail panel (right side of Review) should detect the `ReviewItem.type` and render the appropriate UI:
- `signal`: Show classification, severity, confidence, affected groups, source link, approve/reject buttons with admin notes
- `discovery`: Show proposed name, type, skeleton, supporting signals, narrative form, approve/reject
- `validation`: Show inline diffs, proposed changes editor, overall reasoning, confidence, approve/reject

```typescript
// Top-level section type
type AdminSection = "review" | "agents" | "users";
```

The implementation worker should:
- Keep all existing Firestore write logic (approval/rejection handlers)
- Keep the acknowledgment modal and tutorial overlay
- Keep the help panel
- Integrate the `UnifiedReviewList` as the left panel of the review section
- Wire `ReviewItem` selection to the appropriate detail panel
- Use `canAccessTab` with the new keys to show/hide sections

**Approval flow mapping (important — v2 collection changes):**
- **Signal approve/reject:** Write to `signals/{id}` — same as v1, no change
- **Discovery approve:** Call `approveGraphProposal` callable (from `functions/src/agents/approval/index.ts`), NOT the old `discovery_proposals` collection. Use `getFunctions()` + `httpsCallable(functions, 'approveGraphProposal')` with `{ proposalId: item.id }`.
- **Discovery reject:** Call `rejectGraphProposal` callable with `{ proposalId: item.id, reason: adminNotes }`.
- **Validation approve:** Call `approveGraphProposal` callable (same as discovery — graph_proposals collection handles both). This replaces the old `applyValidationProposal` callable.
- **Validation reject:** Call `rejectGraphProposal` callable.
- **Bulk reject (signals only):** For each selected signal ID, update `signals/{id}` with `{ status: "rejected", admin_notes, reviewed_at: serverTimestamp(), reviewed_by: uid }`. Use `writeBatch` for efficiency.

**State management outline:**
```typescript
const [section, setSection] = useState<AdminSection>("review");
const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
const [adminNotes, setAdminNotes] = useState("");
const [submitting, setSubmitting] = useState(false);
```

**Bulk action handlers:**
```typescript
const handleBulkReject = async () => {
  if (bulkSelectedIds.size === 0 || !adminNotes.trim()) return;
  setSubmitting(true);
  const batch = writeBatch(db);
  for (const id of bulkSelectedIds) {
    batch.update(doc(db, "signals", id), {
      status: "rejected",
      admin_notes: adminNotes,
      reviewed_at: serverTimestamp(),
      reviewed_by: user!.uid,
    });
  }
  await batch.commit();
  setBulkSelectedIds(new Set());
  setAdminNotes("");
  setSubmitting(false);
};
```

- [ ] **Step 3: Verify the build compiles**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat(admin): restructure to 3-section layout (Review, Agents, Users)"
```

---

### Task 16: Smoke test and clean up

- [ ] **Step 1: Run the dev server and verify admin loads**

```bash
npm run dev
```

Navigate to `/admin` and verify:
1. The 3-section tabs render (Review, Agents, Users)
2. Review section shows the unified list with filter toggles
3. Clicking an item opens the appropriate detail panel
4. Signal approve/reject still works
5. Agents section shows the 6 agent cards with health data
6. Clicking an agent shows the detail panel with chart and controls
7. Users section works as before

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 3: Commit final cleanup**

```bash
git add -A
git commit -m "fix(admin): lint and cleanup after restructure"
```

---

## Chunk 6: Firebase Functions — Agent Config Callable

### Task 17: Add paused-check to scheduled agent handlers

**Files:**
- Modify: `functions/src/index.ts`

The frontend currently writes agent config directly to Firestore via the client SDK (through `src/data/agentConfig.ts`). This is fine because Firestore security rules enforce role-based access. However, we need to add a callable for the pause/resume feature since scheduled functions need to check the `paused` flag.

- [ ] **Step 1: Add paused-check to v2 agent entry points**

In each v2 agent's `index.ts` (signal-scout, discovery, validator, feed-curator), add a paused check at the start of the scheduled handler:

```typescript
// At the top of the scheduled handler, before any work:
const configSnap = await db.collection("agents").doc("AGENT_ID").collection("config").doc("current").get();
if (configSnap.exists && configSnap.data()?.paused === true) {
  logger.info("AGENT_NAME is paused, skipping scheduled run");
  return;
}
```

The agent IDs for each file:
- `functions/src/agents/signal-scout/index.ts` → `"signal-scout"`
- `functions/src/agents/discovery/index.ts` → `"discovery-agent"`
- `functions/src/agents/validator/index.ts` → `"validator-agent"`
- `functions/src/agents/feed-curator/index.ts` → `"feed-curator"`

- [ ] **Step 2: Build functions to verify**

```bash
npm run functions:build
```

- [ ] **Step 3: Commit**

```bash
git add functions/src/agents/
git commit -m "feat(functions): add paused-check to scheduled agent handlers"
```

---

## Chunk 7: Firestore Security Rules Update

### Task 18: Add security rules for preference sync and agent config

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add rules for user preferences subcollection**

```
match /users/{userId}/preferences/{docId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if request.auth != null && request.auth.uid == userId;
}
```

- [ ] **Step 2: Add rules for agent config (lead-only write)**

```
match /agents/{agentId}/config/{docId} {
  allow read: if isActiveReviewer();
  allow write: if hasRole('lead');
}

match /agents/{agentId}/health/{docId} {
  allow read: if isActiveReviewer();
}

match /agents/{agentId}/runs/{docId} {
  allow read: if isActiveReviewer();
}
```

(Where `isActiveReviewer()` and `hasRole()` are existing rule helpers.)

- [ ] **Step 3: Deploy rules**

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): add security rules for preferences and agent config"
```
