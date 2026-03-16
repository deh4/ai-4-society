# Plan 1: Foundation & Migration

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the v2 data model, data access layer, Firestore configuration, migration script, and two new compute agents (Graph Builder, Feed Curator) — providing the foundation all other plans build on.

**Architecture:** Graph-based data model in Firestore with typed nodes (risk, solution, stakeholder, milestone) and edges. A data access layer abstraction sits between all UI/function code and Firestore. Two new Cloud Functions (Graph Builder, Feed Curator) pre-compute denormalized views for performance.

**Tech Stack:** TypeScript, Firebase Cloud Functions v2, Firestore, Node 20

**Spec reference:** `docs/superpowers/specs/2026-03-16-ai4society-v2-redesign-design.md`

---

## Chunk 1: Shared Types & Firestore Configuration

### Task 1: Define shared TypeScript types

**Files:**
- Create: `src/types/graph.ts`
- Create: `src/types/signal.ts`
- Create: `src/types/proposal.ts`
- Create: `src/types/user.ts`
- Create: `src/types/index.ts`

These types are consumed by both frontend (`src/`) and backend (`functions/src/`). We define them in `src/types/` and import from functions via a path alias or copy step.

- [ ] **Step 1: Create `src/types/graph.ts`**

```typescript
import type { Timestamp } from "firebase/firestore";

export type NodeType = "risk" | "solution" | "stakeholder" | "milestone";

export interface RiskNode {
  id: string;
  type: "risk";
  name: string;
  category: string;
  summary: string;
  deep_dive: string;
  score_2026: number;
  score_2035: number;
  velocity: "Critical" | "High" | "Medium" | "Low";
  expert_severity: number;
  public_perception: number;     // carried from v1, replaced by vote aggregates over time
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  mitigation_strategies: string[];
  version: number;
  lastUpdated: Timestamp;
  lastUpdatedBy: string;
  createdAt: Timestamp;
}

export interface SolutionNode {
  id: string;
  type: "solution";
  name: string;
  solution_type: string;
  summary: string;
  deep_dive: string;
  implementation_stage:
    | "Research"
    | "Policy Debate"
    | "Pilot"
    | "Early Adoption"
    | "Scaling"
    | "Mainstream";
  adoption_score_2026: number;
  adoption_score_2035: number;
  key_players: string[];
  barriers: string[];
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  version: number;
  lastUpdated: Timestamp;
  lastUpdatedBy: string;
  createdAt: Timestamp;
}

export interface StakeholderNode {
  id: string;
  type: "stakeholder";
  name: string;
  description: string;
  createdAt: Timestamp;
}

export interface MilestoneNode {
  id: string;
  type: "milestone";
  name: string;
  description: string;
  date: string; // ISO 8601 partial: "2023", "2023-06", or "2023-06-14"
  significance: "breakthrough" | "regulatory" | "incident" | "deployment";
  source_url?: string;
  createdAt: Timestamp;
}

export type GraphNode = RiskNode | SolutionNode | StakeholderNode | MilestoneNode;

export interface Edge {
  id: string;
  from_node: string;
  from_type: NodeType;
  to_node: string;
  to_type: NodeType;
  relationship: string;
  properties?: {
    strength?: number;
    severity?: "high" | "medium" | "low";
  };
  created_by: "migration" | "discovery-agent" | string;
  createdAt: Timestamp;
}

export interface GraphSnapshot {
  nodes: Array<{
    id: string;
    type: NodeType;
    name: string;
    velocity?: string;
    implementation_stage?: string;
    significance?: string;
    score_2026?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    relationship: string;
    properties?: object;
  }>;
  updatedAt: Timestamp;
  nodeCount: number;
  edgeCount: number;
}

export interface NodeSummary {
  node_id: string;
  node_type: NodeType;
  name: string;
  signal_count_7d: number;
  signal_count_30d: number;
  trending: "rising" | "stable" | "declining";
  velocity?: string;
  vote_up: number;
  vote_down: number;
  updatedAt: Timestamp;
}

export interface FeedItem {
  id: string;
  type: "signal" | "milestone";
  title: string;
  summary: string;
  source_name?: string;
  source_credibility?: number;
  impact_score: number;
  related_node_ids: string[];
  published_date: Timestamp;
  createdAt: Timestamp;
}

export interface Vote {
  userId: string;
  value: 1 | -1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

- [ ] **Step 2: Create `src/types/signal.ts`**

```typescript
import type { Timestamp } from "firebase/firestore";
import type { NodeType } from "./graph";

export type SignalType = "risk" | "solution" | "both" | "unmatched";
export type SignalStatus = "pending" | "approved" | "rejected" | "edited";

export interface Signal {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: SignalType;
  confidence_score: number;
  status: SignalStatus;
  admin_notes?: string;
  fetched_at: Timestamp;
  proposed_topic?: string;

  source_credibility: number;
  impact_score: number;

  related_nodes: Array<{
    node_id: string;
    node_type: NodeType;
    relevance: number;
  }>;
  related_node_ids: string[];
}
```

- [ ] **Step 3: Create `src/types/proposal.ts`**

```typescript
import type { Timestamp } from "firebase/firestore";
import type { NodeType } from "./graph";

export type ProposalType = "new_node" | "new_edge" | "update_node";
export type ProposalStatus = "pending" | "approved" | "rejected";

export interface GraphProposal {
  id: string;
  proposal_type: ProposalType;

  node_data?: {
    type: NodeType;
    name: string;
    description: string;
    why_novel?: string;
    key_themes?: string[];
    suggested_parent_risk_id?: string;
  };

  edge_data?: {
    from_node: string;
    to_node: string;
    relationship: string;
    properties?: object;
    reasoning: string;
  };

  update_data?: {
    node_id: string;
    node_name: string;
    proposed_changes: Record<
      string,
      {
        current_value: unknown;
        proposed_value: unknown;
        reasoning: string;
      }
    >;
    overall_reasoning: string;
  };

  supporting_signal_ids: string[];
  confidence: number;
  created_by: "discovery-agent" | "validator-agent";
  status: ProposalStatus;
  admin_notes?: string;
  created_at: Timestamp;
}
```

- [ ] **Step 4: Create `src/types/user.ts`**

```typescript
import type { Timestamp } from "firebase/firestore";

export type UserStatus = "pending" | "active" | "blocked";

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isReviewer: boolean;
  isAdmin: boolean;
  status: UserStatus;
  preferences?: UserPreferences;
  requestedReviewer?: boolean;
  applicationNote?: string;
  appliedAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  lastActiveAt?: Timestamp;
  totalReviews: number;
  createdAt: Timestamp;
}

export interface UserPreferences {
  interests: string[]; // node IDs, e.g., ["R01", "R03", "S07"]
}
```

- [ ] **Step 5: Create barrel export `src/types/index.ts`**

```typescript
export * from "./graph";
export * from "./signal";
export * from "./proposal";
export * from "./user";
```

- [ ] **Step 6: Commit**

```bash
git add src/types/
git commit -m "feat: add v2 shared TypeScript types for graph model"
```

---

### Task 2: Update Firestore security rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Read current firestore.rules**

Run: `cat firestore.rules` — understand what exists before overwriting.

- [ ] **Step 2: Add v2 rules alongside existing v1 rules**

Do NOT replace the existing rules — the v1 app keeps running until v2 UI is deployed. ADD the v2 collection rules below the existing v1 rules within the same `match /databases/{database}/documents` block. The v1 rules (for `risks`, `solutions`, `discovery_proposals`, `validation_proposals`, etc.) remain until Plan 2+ removes them. Key v2 rules to add:
- Public read on `nodes`, `edges`, `graph_snapshot`, `feed_items`, `node_summaries`, `changelogs`, `_pipeline_health`
- Votes subcollection: authenticated users can only write their own vote, individual votes are private
- Signals: approved/edited visible to all, pending only to reviewers
- Proposals: read by reviewer+admin, write by admin only
- Users: own doc + admin can read/write
- Agents, `_usage`, `_archive`: server-only

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: update Firestore security rules for v2 graph model"
```

---

### Task 3: Update Firestore indexes

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Read current firestore.indexes.json**

Understand existing indexes before modifying.

- [ ] **Step 2: Add v2 composite indexes**

Add all indexes from spec section 2.10. Preserve any existing indexes that are still relevant for collections we keep (e.g., `signals` status+fetched_at). Remove indexes for dropped collections (`risks`, `solutions`, `discovery_proposals`, `validation_proposals`).

New indexes needed:
```json
{
  "indexes": [
    { "collectionGroup": "nodes", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "type", "order": "ASCENDING" },
      { "fieldPath": "createdAt", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "edges", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "from_node", "order": "ASCENDING" },
      { "fieldPath": "relationship", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "edges", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "to_node", "order": "ASCENDING" },
      { "fieldPath": "relationship", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "signals", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "fetched_at", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "signals", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "impact_score", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "feed_items", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "impact_score", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "feed_items", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "published_date", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "graph_proposals", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "created_at", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "graph_proposals", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "proposal_type", "order": "ASCENDING" },
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "created_at", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "changelogs", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "document_id", "order": "ASCENDING" },
      { "fieldPath": "createdAt", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "node_summaries", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "node_type", "order": "ASCENDING" },
      { "fieldPath": "signal_count_7d", "order": "DESCENDING" }
    ]}
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat: add v2 Firestore composite indexes for graph model"
```

---

## Chunk 2: Data Access Layer

### Task 4: Create client-side data access layer — interfaces

**Files:**
- Create: `src/data/client.ts`

This file defines the abstract interfaces. Other files implement them against Firestore. If we ever swap to Postgres/Supabase, only the implementations change.

- [ ] **Step 1: Create `src/data/client.ts`**

```typescript
import type {
  GraphNode,
  Edge,
  GraphSnapshot,
  NodeSummary,
  NodeType,
  FeedItem,
  Vote,
} from "../types/graph";
import type { Signal, SignalType, SignalStatus } from "../types/signal";
import type { GraphProposal, ProposalType, ProposalStatus } from "../types/proposal";
import type { User } from "../types/user";

// --- Graph ---

export interface SignalFilters {
  status?: SignalStatus;
  signalType?: SignalType;
  nodeId?: string; // filter by related_node_ids array-contains
  limit?: number;
  orderBy?: "impact_score" | "fetched_at";
}

export interface ProposalFilters {
  status?: ProposalStatus;
  proposalType?: ProposalType;
  limit?: number;
}

export interface GraphDataClient {
  getNode(id: string): Promise<GraphNode | null>;
  getEdges(nodeId: string, relationship?: string): Promise<Edge[]>;
  getGraphSnapshot(): Promise<GraphSnapshot | null>;
  getNodeSummaries(filter?: { type?: NodeType }): Promise<NodeSummary[]>;
}

export interface SignalDataClient {
  getSignals(filters: SignalFilters): Promise<Signal[]>;
  approveSignal(id: string, notes?: string): Promise<void>;
  rejectSignal(id: string, notes?: string): Promise<void>;
  editSignal(id: string, edits: Partial<Signal>, notes?: string): Promise<void>;
}

export interface FeedDataClient {
  getFeedItems(limit?: number): Promise<FeedItem[]>;
}

export interface VoteDataClient {
  castVote(nodeId: string, value: 1 | -1): Promise<void>;
  getUserVote(nodeId: string): Promise<Vote | null>;
  getVoteCounts(nodeId: string): Promise<{ up: number; down: number }>;
}

export interface ProposalDataClient {
  getProposals(filters: ProposalFilters): Promise<GraphProposal[]>;
  approveProposal(id: string, notes?: string): Promise<void>;
  rejectProposal(id: string, notes?: string): Promise<void>;
}

export interface UserDataClient {
  getUser(uid: string): Promise<User | null>;
  getUsers(): Promise<User[]>;
  manageUser(
    uid: string,
    action: "grant_reviewer" | "revoke_reviewer" | "block" | "unblock" | "remove"
  ): Promise<void>;
}

export interface AgentConfigDataClient {
  getAgentConfig(agentId: string): Promise<Record<string, unknown> | null>;
  updateAgentConfig(agentId: string, config: Record<string, unknown>): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/client.ts
git commit -m "feat: define data access layer interfaces"
```

---

### Task 5: Implement graph data client (Firestore)

**Files:**
- Create: `src/data/graph.ts`

- [ ] **Step 1: Create `src/data/graph.ts`**

```typescript
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GraphNode, Edge, GraphSnapshot, NodeSummary, NodeType } from "../types/graph";
import type { GraphDataClient } from "./client";

export const graphClient: GraphDataClient = {
  async getNode(id: string): Promise<GraphNode | null> {
    const snap = await getDoc(doc(db, "nodes", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as GraphNode;
  },

  async getEdges(nodeId: string, relationship?: string): Promise<Edge[]> {
    const fromQ = relationship
      ? query(
          collection(db, "edges"),
          where("from_node", "==", nodeId),
          where("relationship", "==", relationship)
        )
      : query(collection(db, "edges"), where("from_node", "==", nodeId));

    const toQ = relationship
      ? query(
          collection(db, "edges"),
          where("to_node", "==", nodeId),
          where("relationship", "==", relationship)
        )
      : query(collection(db, "edges"), where("to_node", "==", nodeId));

    const [fromSnap, toSnap] = await Promise.all([getDocs(fromQ), getDocs(toQ)]);
    const edges: Edge[] = [];
    fromSnap.forEach((d) => edges.push({ id: d.id, ...d.data() } as Edge));
    toSnap.forEach((d) => edges.push({ id: d.id, ...d.data() } as Edge));
    return edges;
  },

  async getGraphSnapshot(): Promise<GraphSnapshot | null> {
    const snap = await getDoc(doc(db, "graph_snapshot", "current"));
    if (!snap.exists()) return null;
    return snap.data() as GraphSnapshot;
  },

  async getNodeSummaries(filter?: { type?: NodeType }): Promise<NodeSummary[]> {
    let q;
    if (filter?.type) {
      q = query(
        collection(db, "node_summaries"),
        where("node_type", "==", filter.type),
        orderBy("signal_count_7d", "desc")
      );
    } else {
      q = query(collection(db, "node_summaries"));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data() } as NodeSummary));
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/data/graph.ts
git commit -m "feat: implement Firestore graph data client"
```

---

### Task 6: Implement signal data client (Firestore)

**Files:**
- Create: `src/data/signals.ts`

- [ ] **Step 1: Create `src/data/signals.ts`**

```typescript
import {
  doc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Signal } from "../types/signal";
import type { SignalDataClient, SignalFilters } from "./client";

export const signalClient: SignalDataClient = {
  async getSignals(filters: SignalFilters): Promise<Signal[]> {
    const constraints = [];

    if (filters.status) {
      constraints.push(where("status", "==", filters.status));
    }
    if (filters.signalType) {
      constraints.push(where("signal_type", "==", filters.signalType));
    }
    if (filters.nodeId) {
      constraints.push(where("related_node_ids", "array-contains", filters.nodeId));
    }

    const sortField = filters.orderBy === "impact_score" ? "impact_score" : "fetched_at";
    constraints.push(orderBy(sortField, "desc"));

    if (filters.limit) {
      constraints.push(firestoreLimit(filters.limit));
    }

    const q = query(collection(db, "signals"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Signal));
  },

  async approveSignal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    await updateDoc(ref, {
      status: "approved",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async rejectSignal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    await updateDoc(ref, {
      status: "rejected",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async editSignal(id: string, edits: Partial<Signal>, notes?: string): Promise<void> {
    const ref = doc(db, "signals", id);
    await updateDoc(ref, {
      ...edits,
      status: "edited",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/data/signals.ts
git commit -m "feat: implement Firestore signal data client"
```

---

### Task 7: Implement feed, votes, proposals, and user data clients

**Files:**
- Create: `src/data/feed.ts`
- Create: `src/data/votes.ts`
- Create: `src/data/proposals.ts`
- Create: `src/data/users.ts`
- Create: `src/data/index.ts`

- [ ] **Step 1: Create `src/data/feed.ts`**

```typescript
import {
  getDocs,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { FeedItem } from "../types/graph";
import type { FeedDataClient } from "./client";

export const feedClient: FeedDataClient = {
  async getFeedItems(limit = 20): Promise<FeedItem[]> {
    const q = query(
      collection(db, "feed_items"),
      orderBy("impact_score", "desc"),
      firestoreLimit(limit)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem));
  },
};
```

- [ ] **Step 2: Create `src/data/votes.ts`**

```typescript
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import type { Vote } from "../types/graph";
import type { VoteDataClient } from "./client";

export const voteClient: VoteDataClient = {
  async castVote(nodeId: string, value: 1 | -1): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Must be signed in to vote");
    const ref = doc(db, "nodes", nodeId, "votes", uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Update: preserve original createdAt
      await setDoc(ref, {
        userId: uid,
        value,
        createdAt: existing.data().createdAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create: set both timestamps
      await setDoc(ref, {
        userId: uid,
        value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  },

  async getUserVote(nodeId: string): Promise<Vote | null> {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const snap = await getDoc(doc(db, "nodes", nodeId, "votes", uid));
    if (!snap.exists()) return null;
    return snap.data() as Vote;
  },

  async getVoteCounts(nodeId: string): Promise<{ up: number; down: number }> {
    // Read from pre-computed node_summaries for efficiency
    const snap = await getDoc(doc(db, "node_summaries", nodeId));
    if (!snap.exists()) return { up: 0, down: 0 };
    const data = snap.data();
    return { up: data.vote_up ?? 0, down: data.vote_down ?? 0 };
  },
};
```

- [ ] **Step 3: Create `src/data/proposals.ts`**

```typescript
import {
  doc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GraphProposal } from "../types/proposal";
import type { ProposalDataClient, ProposalFilters } from "./client";

export const proposalClient: ProposalDataClient = {
  async getProposals(filters: ProposalFilters): Promise<GraphProposal[]> {
    const constraints = [];

    if (filters.proposalType) {
      constraints.push(where("proposal_type", "==", filters.proposalType));
    }
    if (filters.status) {
      constraints.push(where("status", "==", filters.status));
    }

    constraints.push(orderBy("created_at", "desc"));

    if (filters.limit) {
      constraints.push(firestoreLimit(filters.limit));
    }

    const q = query(collection(db, "graph_proposals"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GraphProposal));
  },

  async approveProposal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "graph_proposals", id);
    await updateDoc(ref, {
      status: "approved",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },

  async rejectProposal(id: string, notes?: string): Promise<void> {
    const ref = doc(db, "graph_proposals", id);
    await updateDoc(ref, {
      status: "rejected",
      ...(notes && { admin_notes: notes }),
      reviewed_at: serverTimestamp(),
    });
  },
};
```

- [ ] **Step 4: Create `src/data/users.ts`**

```typescript
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { User } from "../types/user";
import type { UserDataClient } from "./client";

export const userClient: UserDataClient = {
  async getUser(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() } as User;
  },

  async getUsers(): Promise<User[]> {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
  },

  async manageUser(
    uid: string,
    action: "grant_reviewer" | "revoke_reviewer" | "block" | "unblock" | "remove"
  ): Promise<void> {
    const ref = doc(db, "users", uid);
    switch (action) {
      case "grant_reviewer":
        await updateDoc(ref, {
          isReviewer: true,
          status: "active",
          approvedAt: serverTimestamp(),
        });
        break;
      case "revoke_reviewer":
        await updateDoc(ref, { isReviewer: false });
        break;
      case "block":
        await updateDoc(ref, { status: "blocked", isReviewer: false });
        break;
      case "unblock":
        await updateDoc(ref, { status: "active" });
        break;
      case "remove":
        await deleteDoc(ref);
        break;
    }
  },
};
```

- [ ] **Step 5: Create `src/data/agent-config.ts`**

```typescript
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AgentConfigDataClient } from "./client";

export const agentConfigClient: AgentConfigDataClient = {
  async getAgentConfig(agentId: string): Promise<Record<string, unknown> | null> {
    const snap = await getDoc(doc(db, "agents", agentId, "config", "current"));
    if (!snap.exists()) return null;
    return snap.data() as Record<string, unknown>;
  },

  async updateAgentConfig(agentId: string, config: Record<string, unknown>): Promise<void> {
    await setDoc(doc(db, "agents", agentId, "config", "current"), config, { merge: true });
  },
};
```

- [ ] **Step 6: Create barrel export `src/data/index.ts`**

```typescript
export { graphClient } from "./graph";
export { signalClient } from "./signals";
export { feedClient } from "./feed";
export { voteClient } from "./votes";
export { proposalClient } from "./proposals";
export { userClient } from "./users";
export { agentConfigClient } from "./agent-config";
export type * from "./client";
```

- [ ] **Step 7: Commit**

```bash
git add src/data/
git commit -m "feat: implement complete Firestore data access layer"
```

---

## Chunk 3: Server-Side Shared Utilities & Graph Builder

### Task 8: Create server-side shared Firestore utilities

**Files:**
- Create: `functions/src/shared/firestore.ts`

This provides typed Firestore helpers used by all Cloud Functions. Uses `firebase-admin` (not the client SDK).

- [ ] **Step 1: Create `functions/src/shared/firestore.ts`**

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

export async function getAllNodes() {
  const snap = await db.collection("nodes").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllEdges() {
  const snap = await db.collection("edges").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getNodesByType(type: string) {
  const snap = await db.collection("nodes").where("type", "==", type).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSignalsByStatus(
  statuses: string[],
  days: number
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const snap = await db
    .collection("signals")
    .where("status", "in", statuses)
    .where("fetched_at", ">=", cutoff)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSignalsForNode(nodeId: string, status?: string) {
  let q = db
    .collection("signals")
    .where("related_node_ids", "array-contains", nodeId);
  if (status) {
    q = q.where("status", "==", status);
  }
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function writeGraphSnapshot(snapshot: object) {
  await db.doc("graph_snapshot/current").set({
    ...snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeNodeSummary(nodeId: string, summary: object) {
  await db.doc(`node_summaries/${nodeId}`).set({
    ...summary,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeFeedItems(items: Array<{ id: string } & Record<string, unknown>>) {
  const batch = db.batch();
  for (const item of items) {
    batch.set(db.doc(`feed_items/${item.id}`), item);
  }
  await batch.commit();
}

export async function deleteCollection(collectionPath: string, batchSize = 500) {
  const snap = await db.collection(collectionPath).limit(batchSize).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === batchSize) {
    await deleteCollection(collectionPath, batchSize);
  }
}

export { db, FieldValue };
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/shared/firestore.ts
git commit -m "feat: add server-side Firestore shared utilities"
```

---

### Task 9: Implement Graph Builder agent

**Files:**
- Create: `functions/src/agents/graph-builder/index.ts`

The Graph Builder reads all nodes and edges, builds the `graph_snapshot` document, and computes `node_summaries`. It is triggered explicitly by other Cloud Functions (not by Firestore listeners).

- [ ] **Step 1: Create `functions/src/agents/graph-builder/index.ts`**

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getAllNodes,
  getAllEdges,
  writeGraphSnapshot,
  writeNodeSummary,
  getSignalsForNode,
  db,
  FieldValue,
} from "../../shared/firestore.js";

interface SnapshotNode {
  id: string;
  type: string;
  name: string;
  velocity?: string;
  implementation_stage?: string;
  significance?: string;
  score_2026?: number;
}

export const buildGraph = onCall(
  { memory: "512MiB", timeoutSeconds: 120 },
  async () => {
    // Debounce: check if a build ran in the last 30 seconds
    const lockRef = db.doc("_internal/graph_builder_lock");
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) {
      const lastRun = lockSnap.data()?.lastRunAt?.toDate?.();
      if (lastRun && Date.now() - lastRun.getTime() < 30_000) {
        return { success: true, debounced: true };
      }
    }
    await lockRef.set({ lastRunAt: FieldValue.serverTimestamp() });

    const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);

    // Build minimal snapshot for visualization
    const snapshotNodes: SnapshotNode[] = nodes.map((n: Record<string, unknown>) => ({
      id: n.id as string,
      type: n.type as string,
      name: n.name as string,
      ...(n.velocity && { velocity: n.velocity }),
      ...(n.implementation_stage && { implementation_stage: n.implementation_stage }),
      ...(n.significance && { significance: n.significance }),
      ...(n.score_2026 !== undefined && { score_2026: n.score_2026 }),
    }));

    const snapshotEdges = edges.map((e: Record<string, unknown>) => ({
      from: e.from_node as string,
      to: e.to_node as string,
      relationship: e.relationship as string,
      ...(e.properties && { properties: e.properties }),
    }));

    await writeGraphSnapshot({
      nodes: snapshotNodes,
      edges: snapshotEdges,
      nodeCount: snapshotNodes.length,
      edgeCount: snapshotEdges.length,
    });

    // Compute node summaries
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const node of nodes) {
      const nodeId = node.id as string;
      const signals = await getSignalsForNode(nodeId, "approved");

      const count7d = signals.filter((s: Record<string, unknown>) => {
        const fetchedAt = s.fetched_at as { toDate?: () => Date };
        return fetchedAt?.toDate && fetchedAt.toDate() >= sevenDaysAgo;
      }).length;

      const count30d = signals.filter((s: Record<string, unknown>) => {
        const fetchedAt = s.fetched_at as { toDate?: () => Date };
        return fetchedAt?.toDate && fetchedAt.toDate() >= thirtyDaysAgo;
      }).length;

      // Simple trending logic: compare 7d to previous 7d
      const previousCount = count30d - count7d;
      const avgPrevious = previousCount / 3; // rough weekly avg over remaining 23 days
      let trending: "rising" | "stable" | "declining" = "stable";
      if (count7d > avgPrevious * 1.5) trending = "rising";
      else if (count7d < avgPrevious * 0.5) trending = "declining";

      // Recompute vote totals from scratch (consistency check)
      const votesSnap = await db
        .collection("nodes")
        .doc(nodeId)
        .collection("votes")
        .get();
      let voteUp = 0;
      let voteDown = 0;
      votesSnap.forEach((v) => {
        const val = v.data().value;
        if (val === 1) voteUp++;
        else if (val === -1) voteDown++;
      });

      await writeNodeSummary(nodeId, {
        node_id: nodeId,
        node_type: node.type as string,
        name: node.name as string,
        signal_count_7d: count7d,
        signal_count_30d: count30d,
        trending,
        ...(node.velocity && { velocity: node.velocity }),
        vote_up: voteUp,
        vote_down: voteDown,
      });
    }

    return {
      success: true,
      nodeCount: snapshotNodes.length,
      edgeCount: snapshotEdges.length,
    };
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/agents/graph-builder/
git commit -m "feat: implement Graph Builder agent"
```

---

### Task 10: Implement Feed Curator agent

**Files:**
- Create: `functions/src/agents/feed-curator/index.ts`

- [ ] **Step 1: Create `functions/src/agents/feed-curator/index.ts`**

```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import {
  db,
  FieldValue,
  writeFeedItems,
  deleteCollection,
} from "../../shared/firestore.js";

async function buildFeed() {
  // Clear existing feed items
  await deleteCollection("feed_items");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get approved signals from last 30 days
  const signalsSnap = await db
    .collection("signals")
    .where("status", "in", ["approved", "edited"])
    .where("fetched_at", ">=", thirtyDaysAgo)
    .orderBy("fetched_at", "desc")
    .get();

  const feedItems: Array<{ id: string } & Record<string, unknown>> = [];

  const now = Date.now();
  signalsSnap.forEach((d) => {
    const data = d.data();
    // Apply recency decay: signals lose impact over time
    const fetchedMs = data.fetched_at?.toDate?.()?.getTime() ?? now;
    const daysSinceFetch = (now - fetchedMs) / (1000 * 60 * 60 * 24);
    const recencyDecay = Math.max(0.1, 1 - daysSinceFetch / 30); // 1.0 at day 0, 0.1 at day 30
    const rankedScore = (data.impact_score ?? 0) * recencyDecay;

    feedItems.push({
      id: d.id,
      type: "signal",
      title: data.title,
      summary: data.summary,
      source_name: data.source_name,
      source_credibility: data.source_credibility ?? 0.5,
      impact_score: rankedScore,
      related_node_ids: data.related_node_ids ?? [],
      published_date: data.published_date,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Get milestone nodes (no date filter — include all milestones)
  const milestonesSnap = await db
    .collection("nodes")
    .where("type", "==", "milestone")
    .get();

  milestonesSnap.forEach((d) => {
    const data = d.data();
    feedItems.push({
      id: `milestone-${d.id}`,
      type: "milestone",
      title: data.name,
      summary: data.description,
      impact_score: 1.0, // milestones always rank high
      related_node_ids: [],
      published_date: data.date,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Sort by impact_score descending
  feedItems.sort((a, b) => (b.impact_score as number) - (a.impact_score as number));

  // Write top 100 items
  const topItems = feedItems.slice(0, 100);
  if (topItems.length > 0) {
    await writeFeedItems(topItems);
  }

  return { itemsWritten: topItems.length };
}

// Scheduled: every 6 hours
export const scheduledFeedCurator = onSchedule(
  { schedule: "every 6 hours", memory: "256MiB", timeoutSeconds: 60 },
  async () => {
    await buildFeed();
  }
);

// Manual trigger / async call from approval functions
export const triggerFeedCurator = onCall(
  { memory: "256MiB", timeoutSeconds: 60 },
  async () => {
    return await buildFeed();
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/agents/feed-curator/
git commit -m "feat: implement Feed Curator agent"
```

---

### Task 11: Implement vote aggregation trigger

**Files:**
- Create: `functions/src/triggers/vote-aggregation.ts`

- [ ] **Step 1: Create `functions/src/triggers/vote-aggregation.ts`**

```typescript
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

export const onVoteWritten = onDocumentWritten(
  "nodes/{nodeId}/votes/{userId}",
  async (event) => {
    const nodeId = event.params.nodeId;
    const summaryRef = db.doc(`node_summaries/${nodeId}`);

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    await db.runTransaction(async (tx) => {
      const summarySnap = await tx.get(summaryRef);
      if (!summarySnap.exists) return; // no summary yet, Graph Builder will create it

      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!before && after) {
        // New vote
        if (after.value === 1) updates.vote_up = FieldValue.increment(1);
        else updates.vote_down = FieldValue.increment(1);
      } else if (before && after) {
        // Changed vote
        if (before.value !== after.value) {
          if (before.value === 1) {
            updates.vote_up = FieldValue.increment(-1);
            updates.vote_down = FieldValue.increment(1);
          } else {
            updates.vote_down = FieldValue.increment(-1);
            updates.vote_up = FieldValue.increment(1);
          }
        }
      } else if (before && !after) {
        // Deleted vote
        if (before.value === 1) updates.vote_up = FieldValue.increment(-1);
        else updates.vote_down = FieldValue.increment(-1);
      }

      tx.update(summaryRef, updates);
    });
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/triggers/vote-aggregation.ts
git commit -m "feat: add vote aggregation Firestore trigger"
```

---

## Chunk 4: Migration Script

### Task 12: Create v1 → v2 migration script

**Files:**
- Create: `functions/src/migration/v1-to-v2.ts`

This is a one-time Cloud Function that reads all v1 data and writes it into the v2 schema. It preserves all existing IDs and data. Run manually via `onCall`.

- [ ] **Step 1: Create `functions/src/migration/v1-to-v2.ts`**

```typescript
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

interface MigrationResult {
  nodes: number;
  edges: number;
  stakeholders: number;
  signalsMigrated: number;
  usersMigrated: number;
}

export const migrateV1toV2 = onCall(
  { memory: "1GiB", timeoutSeconds: 540 },
  async (): Promise<MigrationResult> => {
    const result: MigrationResult = {
      nodes: 0,
      edges: 0,
      stakeholders: 0,
      signalsMigrated: 0,
      usersMigrated: 0,
    };

    // --- 1. Migrate risks → nodes (preserve R01-R10 IDs) ---
    const risksSnap = await db.collection("risks").get();
    const stakeholderSet = new Set<string>();

    for (const d of risksSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "risk",
        name: data.risk_name ?? data.name ?? d.id,
        category: data.category ?? "",
        summary: data.summary ?? "",
        deep_dive: data.deep_dive ?? "",
        score_2026: data.score_2026 ?? 50,
        score_2035: data.score_2035 ?? 50,
        velocity: data.velocity ?? "Medium",
        expert_severity: data.expert_severity ?? 50,
        public_perception: data.public_perception ?? 50,
        timeline_narrative: data.timeline_narrative ?? {
          near_term: "",
          mid_term: "",
          long_term: "",
        },
        mitigation_strategies: data.mitigation_strategies ?? [],
        version: data.version ?? 1,
        lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
        lastUpdatedBy: data.lastUpdatedBy ?? "migration",
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      });
      result.nodes++;

      // Collect stakeholders from who_affected
      if (Array.isArray(data.who_affected)) {
        data.who_affected.forEach((s: string) => stakeholderSet.add(s));
      }

      // Create edges from connected_to
      if (Array.isArray(data.connected_to)) {
        for (const target of data.connected_to) {
          const edgeId = `${d.id}-${target}-migration`;
          const relationship = (target as string).startsWith("S")
            ? "addressed_by"
            : "correlates_with";
          const targetType = (target as string).startsWith("S")
            ? "solution"
            : "risk";
          await db.doc(`edges/${edgeId}`).set({
            id: edgeId,
            from_node: d.id,
            from_type: "risk",
            to_node: target,
            to_type: targetType,
            relationship,
            created_by: "migration",
            createdAt: FieldValue.serverTimestamp(),
          });
          result.edges++;
        }
      }
    }

    // --- 2. Migrate solutions → nodes (preserve S01-S10 IDs) ---
    const solutionsSnap = await db.collection("solutions").get();

    for (const d of solutionsSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "solution",
        name: data.solution_title ?? data.name ?? d.id,
        solution_type: data.solution_type ?? "",
        summary: data.summary ?? "",
        deep_dive: data.deep_dive ?? "",
        implementation_stage: data.implementation_stage ?? "Research",
        adoption_score_2026: data.adoption_score_2026 ?? 0,
        adoption_score_2035: data.adoption_score_2035 ?? 0,
        key_players: data.key_players ?? [],
        barriers: data.barriers ?? [],
        timeline_narrative: data.timeline_narrative ?? {
          near_term: "",
          mid_term: "",
          long_term: "",
        },
        version: data.version ?? 1,
        lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
        lastUpdatedBy: data.lastUpdatedBy ?? "migration",
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      });
      result.nodes++;

      // Create edge from parent risk
      if (data.parent_risk_id) {
        const edgeId = `${data.parent_risk_id}-${d.id}-addressed_by`;
        await db.doc(`edges/${edgeId}`).set({
          id: edgeId,
          from_node: data.parent_risk_id,
          from_type: "risk",
          to_node: d.id,
          to_type: "solution",
          relationship: "addressed_by",
          created_by: "migration",
          createdAt: FieldValue.serverTimestamp(),
        });
        result.edges++;
      }
    }

    // --- 3. Migrate milestones → nodes ---
    const milestonesSnap = await db.collection("milestones").get();

    for (const d of milestonesSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "milestone",
        name: data.title ?? "",
        description: data.description ?? "",
        date: data.year ? String(data.year) : "",
        significance: "deployment", // default, can be manually enriched later
        createdAt: FieldValue.serverTimestamp(),
      });
      result.nodes++;
    }

    // --- 4. Create stakeholder nodes ---
    let stakeholderIdx = 0;
    for (const name of stakeholderSet) {
      const sId = `SH${String(stakeholderIdx + 1).padStart(2, "0")}`;
      await db.doc(`nodes/${sId}`).set({
        id: sId,
        type: "stakeholder",
        name,
        description: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      result.stakeholders++;
      stakeholderIdx++;

      // Create impacts edges from all risks that reference this stakeholder
      for (const riskDoc of risksSnap.docs) {
        const riskData = riskDoc.data();
        if (
          Array.isArray(riskData.who_affected) &&
          riskData.who_affected.includes(name)
        ) {
          const edgeId = `${riskDoc.id}-${sId}-impacts`;
          await db.doc(`edges/${edgeId}`).set({
            id: edgeId,
            from_node: riskDoc.id,
            from_type: "risk",
            to_node: sId,
            to_type: "stakeholder",
            relationship: "impacts",
            created_by: "migration",
            createdAt: FieldValue.serverTimestamp(),
          });
          result.edges++;
        }
      }
    }

    // --- 5. Migrate signals (add related_nodes, related_node_ids, scores) ---
    const signalsSnap = await db.collection("signals").get();

    // Source credibility lookup (from v1 config)
    const credibilityMap: Record<string, number> = {
      "arXiv CS.AI": 0.85,
      "MIT Technology Review": 0.8,
      "Ars Technica": 0.75,
      "The Verge": 0.65,
      "TechCrunch": 0.6,
      "Wired": 0.75,
      "TLDR AI": 0.65,
      "Import AI": 0.7,
      "Last Week in AI": 0.65,
      "GDELT": 0.5,
    };

    for (const d of signalsSnap.docs) {
      const data = d.data();
      const relatedNodes: Array<{
        node_id: string;
        node_type: string;
        relevance: number;
      }> = [];
      const relatedNodeIds: string[] = [];

      // Convert risk_categories to related_nodes
      if (Array.isArray(data.risk_categories)) {
        for (const cat of data.risk_categories) {
          relatedNodes.push({
            node_id: cat,
            node_type: "risk",
            relevance: data.confidence_score ?? 0.8,
          });
          relatedNodeIds.push(cat);
        }
      }

      // Convert solution_ids to related_nodes
      if (Array.isArray(data.solution_ids)) {
        for (const sol of data.solution_ids) {
          relatedNodes.push({
            node_id: sol,
            node_type: "solution",
            relevance: data.confidence_score ?? 0.8,
          });
          relatedNodeIds.push(sol);
        }
      }

      const credibility =
        credibilityMap[data.source_name] ?? 0.5;
      const confidence = data.confidence_score ?? 0.5;
      // severity_hint informs impact: Critical=1.0, Emerging=0.7, Horizon=0.4
      const severityMultiplier =
        data.severity_hint === "Critical" ? 1.0
        : data.severity_hint === "Emerging" ? 0.7
        : data.severity_hint === "Horizon" ? 0.4
        : 0.7; // default
      const impactScore = credibility * confidence * severityMultiplier;

      await d.ref.update({
        related_nodes: relatedNodes,
        related_node_ids: relatedNodeIds,
        source_credibility: credibility,
        impact_score: impactScore,
      });
      result.signalsMigrated++;
    }

    // --- 6. Migrate users (simplify roles) ---
    const usersSnap = await db.collection("users").get();

    for (const d of usersSnap.docs) {
      const data = d.data();
      const roles: string[] = data.roles ?? [];
      const isReviewer =
        roles.includes("signal-reviewer") ||
        roles.includes("discovery-reviewer") ||
        roles.includes("scoring-reviewer");
      const isAdmin = roles.includes("lead");

      await d.ref.update({
        isReviewer,
        isAdmin,
      });
      result.usersMigrated++;
    }

    // --- 7. Migrate pending discovery proposals → graph_proposals ---
    const discoverySnap = await db
      .collection("discovery_proposals")
      .where("status", "==", "pending")
      .get();

    for (const d of discoverySnap.docs) {
      const data = d.data();
      await db.doc(`graph_proposals/${d.id}`).set({
        id: d.id,
        proposal_type: "new_node",
        node_data: {
          type: data.type === "new_risk" ? "risk" : "solution",
          name: data.proposed_name ?? "",
          description: data.description ?? "",
          why_novel: data.why_novel ?? "",
          key_themes: data.key_themes ?? [],
          suggested_parent_risk_id: data.suggested_parent_risk_id ?? null,
        },
        supporting_signal_ids: data.supporting_signal_ids ?? [],
        confidence: 0.7,
        created_by: "discovery-agent",
        status: "pending",
        created_at: data.created_at ?? FieldValue.serverTimestamp(),
      });
    }

    // --- 8. Migrate pending validation proposals → graph_proposals ---
    const validationSnap = await db
      .collection("validation_proposals")
      .where("status", "==", "pending")
      .get();

    for (const d of validationSnap.docs) {
      const data = d.data();
      await db.doc(`graph_proposals/${d.id}`).set({
        id: d.id,
        proposal_type: "update_node",
        update_data: {
          node_id: data.document_id ?? "",
          node_name: data.document_name ?? "",
          proposed_changes: data.proposed_changes ?? {},
          overall_reasoning: data.overall_reasoning ?? "",
        },
        supporting_signal_ids: data.supporting_signal_ids ?? [],
        confidence: data.confidence ?? 0.6,
        created_by: "validator-agent",
        status: "pending",
        created_at: data.created_at ?? FieldValue.serverTimestamp(),
      });
    }

    return result;
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/migration/v1-to-v2.ts
git commit -m "feat: add v1 to v2 migration script"
```

---

### Task 13: Wire up Cloud Function exports

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Read existing `functions/src/index.ts`**

Understand current exports before adding new ones.

- [ ] **Step 2: Add v2 function exports**

Add at the end of `functions/src/index.ts` (keep existing v1 exports for now — they'll be removed in Plan 2):

```typescript
// --- v2 agents ---
export { buildGraph } from "./agents/graph-builder/index.js";
export { scheduledFeedCurator, triggerFeedCurator } from "./agents/feed-curator/index.js";
export { onVoteWritten } from "./triggers/vote-aggregation.js";
export { migrateV1toV2 } from "./migration/v1-to-v2.js";
```

- [ ] **Step 3: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: export v2 Cloud Functions (Graph Builder, Feed Curator, migration)"
```

---

### Task 14: Create simplified roles utility

**Files:**
- Create: `src/lib/roles.ts` (replace existing)

- [ ] **Step 1: Read existing `src/lib/roles.ts`**

Understand current role definitions before replacing.

- [ ] **Step 2: Replace with v2 simplified roles**

```typescript
import type { User } from "../types/user";

export function isVisitor(user: User | null): boolean {
  return user === null;
}

export function isMember(user: User | null): boolean {
  return user !== null && user.status === "active";
}

export function isReviewer(user: User | null): boolean {
  return isMember(user) && user!.isReviewer;
}

export function isAdmin(user: User | null): boolean {
  return isMember(user) && user!.isAdmin;
}

export function canReviewSignals(user: User | null): boolean {
  return isReviewer(user) || isAdmin(user);
}

export function canReviewProposals(user: User | null): boolean {
  return isAdmin(user);
}

export function canManageUsers(user: User | null): boolean {
  return isAdmin(user);
}

export function canManageAgents(user: User | null): boolean {
  return isAdmin(user);
}

export function canVote(user: User | null): boolean {
  return isMember(user);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/roles.ts
git commit -m "feat: simplify role system to visitor/member/reviewer/admin"
```

---

### Task 15: Create preferences utility

**Files:**
- Create: `src/lib/preferences.ts`

- [ ] **Step 1: Create `src/lib/preferences.ts`**

```typescript
import type { UserPreferences } from "../types/user";

const STORAGE_KEY = "ai4s_preferences";

export function getLocalPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { interests: [] };
    return JSON.parse(raw) as UserPreferences;
  } catch {
    return { interests: [] };
  }
}

export function setLocalPreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function hasPreferences(): boolean {
  return getLocalPreferences().interests.length > 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/preferences.ts
git commit -m "feat: add anonymous preference localStorage utility"
```

---

### Task 16: Deploy and run migration

This task is executed manually (not by an agent).

- [ ] **Step 1: Build Cloud Functions**

Run: `cd functions && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy v2 Cloud Functions**

Run: `firebase use ai-4-society && firebase deploy --only functions:buildGraph,functions:scheduledFeedCurator,functions:triggerFeedCurator,functions:onVoteWritten,functions:migrateV1toV2`
Expected: Functions deploy successfully.

- [ ] **Step 3: Deploy Firestore rules and indexes**

Run: `firebase deploy --only firestore:rules,firestore:indexes`
Expected: Rules and indexes deploy successfully.

- [ ] **Step 4: Run migration**

Trigger the `migrateV1toV2` callable function from the Firebase console or via a test script:

```typescript
import { getFunctions, httpsCallable } from "firebase/functions";
const result = await httpsCallable(getFunctions(), "migrateV1toV2")();
console.log(result.data);
// Expected: { nodes: ~24, edges: ~30+, stakeholders: ~15+, signalsMigrated: ~N, usersMigrated: ~N }
```

- [ ] **Step 5: Run Graph Builder**

Trigger the `buildGraph` callable function:

```typescript
const result = await httpsCallable(getFunctions(), "buildGraph")();
console.log(result.data);
// Expected: { success: true, nodeCount: ~24, edgeCount: ~30+ }
```

- [ ] **Step 6: Run Feed Curator**

Trigger the `triggerFeedCurator` callable function:

```typescript
const result = await httpsCallable(getFunctions(), "triggerFeedCurator")();
console.log(result.data);
// Expected: { itemsWritten: N }
```

- [ ] **Step 7: Verify in Firestore console**

Check the following collections exist and have data:
- `nodes` — should have risk, solution, milestone, and stakeholder documents
- `edges` — should have relationship documents
- `graph_snapshot/current` — should have the snapshot document
- `node_summaries` — should have per-node summary documents
- `feed_items` — should have ranked feed items
- `signals` — should have `related_nodes`, `related_node_ids`, `source_credibility`, `impact_score` fields

- [ ] **Step 8: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address migration verification findings"
```
