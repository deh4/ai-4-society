# AI 4 Society v2 — Complete Redesign Spec

**Date:** 2026-03-16
**Status:** Draft
**Approach:** Clean slate, same stack (Firebase), graph-based data model, migrated data

---

## 1. Vision & Audience

AI 4 Society is a real-time AI risk intelligence platform — an observatory that continuously monitors emerging societal risks from AI, the solutions being developed to address them, and who is impacted.

### Primary Audiences

- **General public** — raise awareness, make AI risks accessible and understandable, drive curiosity and engagement
- **Researchers & journalists** — provide a curated, living, citable reference for AI societal impact

### Design Tension

Every decision must balance: accessible enough for the public, rigorous enough for researchers to cite.

---

## 2. Information Architecture & Data Model

### 2.1 Graph-Based Taxonomy

The fixed R01-R10 / S01-S10 grid is replaced by an evolving graph with four node types and typed edges.

**Node Types:**

| Type | Description | Examples |
|------|-------------|---------|
| **Risk** | An AI societal risk | "Algorithmic Discrimination", "AI-Amplified Disinformation" |
| **Solution** | An approach addressing one or more risks | "Algorithmic Auditing Standards", "Digital Content Provenance" |
| **Stakeholder** | An affected group | "Gig Workers", "Patients", "Students" |
| **Milestone** | A significant AI event | "EU AI Act Passed", "GPT-4 Released" |

**Edge Types:**

| From → To | Relationship | Properties |
|-----------|-------------|------------|
| Risk → Solution | `addressed_by` | strength: 0-1 |
| Risk → Risk | `amplifies`, `correlates_with` | — |
| Solution → Solution | `complements`, `conflicts_with` | — |
| Risk → Stakeholder | `impacts` | severity: high/medium/low |
| Solution → Stakeholder | `benefits` | — |
| Milestone → Risk | `escalated`, `de_escalated`, `created` | — |
| Milestone → Solution | `enabled`, `blocked`, `accelerated` | — |

**Why this matters:** "AI Surveillance" currently maps only to one solution. In the graph, it connects to Discrimination, Power Concentration, and Loss of Agency — and a journalist can see that in one view. The system can grow organically as Discovery Agent proposes new nodes and edges.

### 2.2 Node Schemas

**Risk Node (`nodes/{id}`, type: "risk")**

```typescript
interface RiskNode {
  id: string;                    // e.g., "R01" (migrated) or auto-generated
  type: "risk";
  name: string;
  category: string;
  summary: string;               // 2-3 sentences, plain language
  deep_dive: string;             // detailed narrative
  score_2026: number;            // 0-100
  score_2035: number;            // 0-100
  velocity: "Critical" | "High" | "Medium" | "Low";
  expert_severity: number;       // 0-100
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
```

**Solution Node (`nodes/{id}`, type: "solution")**

```typescript
interface SolutionNode {
  id: string;
  type: "solution";
  name: string;
  solution_type: string;
  summary: string;
  deep_dive: string;
  implementation_stage: "Research" | "Policy Debate" | "Pilot" | "Early Adoption" | "Scaling" | "Mainstream";
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
```

**Stakeholder Node (`nodes/{id}`, type: "stakeholder")**

```typescript
interface StakeholderNode {
  id: string;
  type: "stakeholder";
  name: string;                  // e.g., "Gig Workers"
  description: string;           // brief context
  createdAt: Timestamp;
}
```

**Milestone Node (`nodes/{id}`, type: "milestone")**

```typescript
interface MilestoneNode {
  id: string;
  type: "milestone";
  name: string;
  description: string;
  date: Timestamp;               // precise date (not just year)
  significance: "breakthrough" | "regulatory" | "incident" | "deployment";
  source_url?: string;
  createdAt: Timestamp;
}
```

**Edge (`edges/{edgeId}`)**

```typescript
interface Edge {
  id: string;
  from_node: string;             // node ID
  from_type: NodeType;
  to_node: string;               // node ID
  to_type: NodeType;
  relationship: string;          // "addressed_by", "amplifies", "impacts", etc.
  properties?: {
    strength?: number;           // 0-1
    severity?: "high" | "medium" | "low";
  };
  created_by: "migration" | "discovery-agent" | string;  // user ID or agent
  createdAt: Timestamp;
}
```

### 2.3 Signal Schema (Enhanced)

```typescript
interface Signal {
  // Preserved from v1
  id: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;        // ISO 8601
  signal_type: "risk" | "solution" | "both" | "unmatched";
  confidence_score: number;      // 0-1, from Gemini
  status: "pending" | "approved" | "rejected" | "edited";
  admin_notes?: string;
  fetched_at: Timestamp;
  proposed_topic?: string;       // only for unmatched

  // New: quality layer
  source_credibility: number;    // 0-1, from source config
  impact_score: number;          // 0-1, computed: credibility * confidence * recency

  // New: graph-native references (replaces risk_categories[] and solution_ids[])
  related_nodes: Array<{
    node_id: string;
    node_type: NodeType;
    relevance: number;           // 0-1
  }>;

  // Deprecated (kept for migration reference, not used in v2)
  // risk_categories: string[];
  // solution_ids: string[];
  // severity_hint: string;
  // affected_groups: string[];
}
```

### 2.4 Pre-Computed Views (Denormalized)

**`graph_snapshot` (single document)**
Contains all nodes and edges, rebuilt by Graph Builder whenever the graph changes. Powers the observatory visualization without N+1 reads.

```typescript
interface GraphSnapshot {
  nodes: Array<{ id: string; type: NodeType; name: string; /* summary fields */ }>;
  edges: Array<{ from: string; to: string; relationship: string; properties?: object }>;
  updatedAt: Timestamp;
  nodeCount: number;
  edgeCount: number;
}
```

**`feed_items/{itemId}` (collection)**
Pre-ranked, pre-formatted documents for the landing page news feed. Rebuilt by Feed Curator every 6 hours or on signal approval.

```typescript
interface FeedItem {
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
```

**`node_summaries/{nodeId}` (collection)**
Per-node aggregates powering risk badges and quick stats.

```typescript
interface NodeSummary {
  node_id: string;
  node_type: NodeType;
  name: string;
  signal_count_7d: number;
  signal_count_30d: number;
  trending: "rising" | "stable" | "declining";
  velocity?: string;
  vote_count: number;
  updatedAt: Timestamp;
}
```

### 2.5 Votes

```typescript
// Subcollection: nodes/{nodeId}/votes/{userId}
interface Vote {
  userId: string;
  value: 1 | -1;                 // upvote or downvote
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

- One vote per member per node
- Voting on risks and solutions only (not signals)
- Aggregate counts stored in `node_summaries`
- Individual votes are private, aggregates are public

### 2.6 Data Access Layer

All Firestore interaction goes through typed functions in `src/data/`:

```typescript
// graph.ts
getNode(id: string): Promise<Node>
getEdges(nodeId: string, type?: string): Promise<Edge[]>
getGraphSnapshot(): Promise<GraphSnapshot>
getNodeSummaries(filter?: { type?: NodeType }): Promise<NodeSummary[]>

// signals.ts
getWeightedSignals(filters: SignalFilters): Promise<Signal[]>
getPendingSignals(type?: SignalType): Promise<Signal[]>
approveSignal(id: string, notes?: string): Promise<void>
rejectSignal(id: string, notes?: string): Promise<void>

// votes.ts
castVote(nodeId: string, value: 1 | -1): Promise<void>
getUserVote(nodeId: string): Promise<Vote | null>
getVoteCounts(nodeId: string): Promise<{ up: number; down: number }>

// admin.ts
getProposals(filter?: ProposalFilter): Promise<Proposal[]>
approveProposal(id: string): Promise<void>
rejectProposal(id: string, notes?: string): Promise<void>
updateAgentConfig(agentId: string, config: AgentConfig): Promise<void>
manageUser(userId: string, action: "grant_reviewer" | "revoke_reviewer" | "block" | "unblock" | "remove"): Promise<void>
```

This abstraction is the escape hatch — if Firestore is outgrown, swap the implementation to Postgres/Supabase without rewriting the UI.

---

## 3. Pipeline & Agents

### 3.1 Two-Stage Signal Processing

**Stage 1: Cheap Filter (new)**

Runs before any Gemini API call. Filters on:
- **Source credibility** — score from source config (0-1)
- **Keyword/topic relevance** — simple text matching against known risk/solution terms
- **Deduplication** — URL match (existing) + title similarity (new, catches same story from different outlets)
- **Recency** — skip articles older than 7 days

Expected to cut Gemini API calls by 40-60%.

**Stage 2: Gemini Classification (enhanced)**

- Model: Gemini 2.5 Flash (configurable per agent)
- Classifies against the graph (node IDs), not fixed R/S codes
- Returns `related_nodes[]` with relevance scores
- Assigns `impact_score` based on content significance
- Can propose new nodes (equivalent to "unmatched" but more structured)
- Batch size: 25 articles per batch
- Confidence threshold: 0.8 (configurable)

### 3.2 Source Tiers

| Tier | Sources | Credibility | Fetch Frequency |
|------|---------|-------------|-----------------|
| **T1 — Institutional** | OECD AI Observatory, EU AI Office, UNESCO, national AI strategies, Nature, Science, SSRN | 0.85-0.95 | Every 12h |
| **T2 — Quality journalism** | MIT Tech Review, Ars Technica, Wired, Reuters, AP | 0.7-0.85 | Every 12h |
| **T3 — Tech/community** | TechCrunch, The Verge, Hacker News, Reddit r/artificial | 0.5-0.7 | Every 12h |
| **T4 — Active search** | Google Custom Search API queries for specific risk topics, GDELT | 0.4-0.7 (varies) | Every 24h |
| **T5 — Newsletters** | TLDR AI, Import AI, Last Week in AI | 0.6-0.75 | Every 24h |

Source credibility scores are configurable by admin and feed directly into the signal's `impact_score`.

### 3.3 Agent Architecture

| Agent | Schedule | Purpose |
|-------|----------|---------|
| **Signal Scout** | Every 12h | Fetch → Stage 1 Filter → Stage 2 Classify → Store |
| **Discovery Agent** | Weekly (Sun 10 UTC) | Propose new graph nodes AND edges from accumulated signals |
| **Validator Agent** | Weekly (Mon 09 UTC) | Propose updates to existing nodes (scores, narratives) |
| **Graph Builder** | On trigger (after graph change) | Rebuild `graph_snapshot` and `node_summaries` |
| **Feed Curator** | Every 6h | Build ranked `feed_items` for landing page |
| **Data Lifecycle** | Daily (03:00 UTC) | Archive, cleanup, stale-marking |

**Discovery Agent changes from v1:**
- Now proposes edges (relationships) in addition to new nodes
- Works with graph model — checks for duplicate nodes by fuzzy name matching
- Proposes `stakeholder` nodes when patterns emerge in affected groups

**Validator Agent changes from v1:**
- Assesses nodes against recent signals via `related_nodes` references
- Can propose new edges between existing nodes (not just field updates)
- Confidence threshold: 0.6 (configurable)

**Graph Builder (new):**
- Triggered after: signal approval, proposal approval, migration, manual trigger
- Reads all nodes and edges, builds `graph_snapshot` document
- Computes `node_summaries` (signal counts, trending direction, vote aggregates)

**Feed Curator (new):**
- Runs every 6h + triggered on signal approval
- Reads approved signals + milestones
- Ranks by `impact_score` (credibility x confidence x recency)
- Writes top items to `feed_items` collection
- Limits feed to last 30 days of content

### 3.4 Agent Configuration (Admin-Managed)

Stored in `agents/{agentId}/config/current`:

```typescript
interface AgentConfig {
  sources: Record<string, {
    enabled: boolean;
    credibility: number;         // 0-1
    maxItems?: number;
  }>;
  schedule?: string;             // cron expression
  model?: string;                // e.g., "gemini-2.5-flash"
  confidenceThreshold?: number;  // 0-1
  batchSize?: number;
  enabled: boolean;              // pause/resume agent
}
```

---

## 4. Human-in-the-Loop

### 4.1 Roles

| Role | How you get it | Capabilities |
|------|---------------|--------------|
| **Visitor** | Anonymous, pick interests | Browse landing page, browse observatory, personalized feed |
| **Member** | Sign in with Google | Everything Visitor + upvote/downvote risks & solutions, follow risks |
| **Reviewer** | Admin grants access | Everything Member + approve/reject/edit signals, review graph proposals |
| **Admin** | Reviewer + admin flag | Everything Reviewer + agent config, user management, source management |

### 4.2 Review Gates

**Gate 1: Signal Review**
- Reviewer approves/rejects/edits classified signals
- Bulk actions for efficiency
- Filter toggles: risk / solution / both / unmatched
- Unmatched signals still flow to Discovery without review (same as v1)

**Gate 2: Graph Review**
- Admin approves/rejects discovery proposals (new nodes, new edges)
- Admin approves/rejects validation proposals (score/narrative updates)
- Inline diffs for text changes
- Combined view with filter toggles by proposal type

### 4.3 User Management (Admin)

| Action | Description |
|--------|-------------|
| Grant reviewer | Promote member to reviewer |
| Revoke reviewer | Demote back to member |
| Block user | Disable account, revoke all access |
| Unblock user | Restore access |
| Remove user | Permanent removal |

### 4.4 Volunteer Onboarding

1. Visit site → browse as Visitor
2. Sign in with Google → automatic Member
3. Optionally request reviewer access (one-click)
4. Admin reviews and grants/denies

No trust tiers, no SLAs, no co-sign requirements. Scale governance complexity later when the team grows beyond 10 active reviewers.

---

## 5. Frontend Architecture

### 5.1 Page Structure

Three pages:

| Route | Page | Access |
|-------|------|--------|
| `/` | Landing | Public |
| `/observatory` | Observatory | Public (voting requires Member) |
| `/admin` | Admin | Reviewer + Admin |

### 5.2 Landing Page (`/`)

**Top-to-bottom flow:**

1. **Hero Section**
   - Rotating earth animation (Three.js, carried from v1)
   - Punchy headline: "Are we shaping AI, or is it shaping us?"
   - Subtitle with live stat (e.g., "Real-time tracking of 40+ existential shifts redefining human society")
   - Three CTAs: "Enter Observatory" / "What is AI-4-Society?" / "Get Involved"

2. **Risk Badges Row**
   - Instagram stories style — small circular/pill badges, always visible
   - Shows 3-5 trending risks (from `node_summaries`, sorted by signal count + velocity)
   - Subtle pulse/glow on the most active badge
   - **On tap: drawer slides down** containing:
     - Risk name + one-line hook (curiosity-driven, e.g., "AI is making hiring decisions about you — and getting it wrong")
     - Velocity indicator (visual: flame for critical, arrow-up for high, etc.)
     - Signal count ("12 new signals this week")
     - CTA button: "Explore in Observatory →"
   - Tapping another badge swaps drawer content; tapping outside closes it

3. **News Feed**
   - Vertically scrollable cards
   - Powered by `feed_items` collection (pre-ranked by Feed Curator)
   - Each card: headline, one-line summary, source name + credibility indicator, timestamp, related risk badge(s)
   - Milestone cards get distinct visual treatment (different card style, marker/pin icon)
   - Soft personalization: if anonymous preferences set, relevant cards rank higher

4. **Footer**
   - About, links
   - Lightweight "Pick your interests" prompt (if preferences not yet set)

### 5.3 Observatory (`/observatory`)

Three switchable views:

**Graph View**
- Interactive node-edge visualization (D3.js or react-force-graph)
- Powered by `graph_snapshot` (single document read)
- Color-coded by node type (risks = red, solutions = green, stakeholders = blue, milestones = gold)
- Zoom, pan, filter by node type
- Click a node → opens Detail Panel
- Edge labels visible on hover
- Personalized: user's interest areas highlighted if preferences set

**Detail Panel** (opens when a node is clicked)
- Node name + type badge
- Narrative summary (plain language) with deep dive toggle
- Connected nodes (clickable, navigate the graph)
- Evidence feed: approved signals related to this node, sorted by impact
- Timeline projection (near/mid/long term)
- Perception gap: expert severity score vs. community vote aggregate
- Related milestones
- Vote button (Members only)
- "Share" link (future)

**Timeline View**
- Chronological view: milestones + high-impact signals on a scrollable timeline
- Filter by risk/solution
- Useful for researchers tracing how a risk evolved over time

### 5.4 Admin (`/admin`)

Three sections:

**Review Section (Reviewer + Admin)**
- All pending items in one list
- Filter toggles: Signals / Discovery Proposals / Validation Proposals
- Signal cards: title, summary, source, classification, approve/reject/edit buttons
- Proposal cards: proposed changes with inline diffs, approve/reject buttons
- Bulk actions for signals

**Agents Section (Admin only)**
- Per-agent configuration:
  - Toggle sources on/off
  - Set credibility scores per source
  - Set fetch frequency, model, confidence threshold, batch size
  - Pause/resume agent
  - Add/remove sources (RSS URL, type, category)
- Per-agent diagnostics:
  - Last run: articles fetched, signals classified, signals stored
  - Per-source success/failure breakdown
  - Cost breakdown: Gemini tokens (in/out), Firestore reads/writes, estimated cost
  - Run history (last 30 days) with trend chart
  - Health status: consecutive errors, last successful run
  - Alert indicators if something looks wrong
- Manual controls:
  - Trigger any agent
  - Test a single source (fetch + classify a few articles)

**Users Section (Admin only)**
- Table: name, email, role, status, last active
- Action buttons: grant reviewer, revoke, block, unblock, remove
- Pending reviewer requests highlighted

### 5.5 Personalization (Anonymous)

- First visit: subtle banner to pick 2-3 interest areas (not a modal)
- Stored in `localStorage`
- Affects: feed card ranking, risk badge selection, graph node highlighting
- Sign in with Google → preferences migrate to Firestore account
- Unlocks: voting, following risks, reviewer application

---

## 6. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Vite 7 + React 19 + TypeScript | Current, proven, existing team knowledge |
| Styling | Tailwind 4 + Motion (Framer Motion v12) | Upgrade from Tailwind 3.4, Motion is latest rebrand |
| Graph visualization | D3.js or react-force-graph | Lightweight, customizable, handles hundreds of nodes |
| 3D hero | Three.js | Existing rotating earth animation, carry forward |
| Backend | Firebase Cloud Functions v2 (Node 20) | Zero ops, existing infrastructure |
| Database | Firestore | Existing, sufficient for 12-18 months at expected scale |
| Auth | Firebase Auth (Google OAuth) | Existing, proven |
| Search | Algolia free tier (deferred) | Full-text search — add when needed |
| AI classification | Gemini 2.5 Flash (signals) + Pro (discovery/validation) | Existing, proven |
| Active search | Google Custom Search API or SerpAPI | New — targeted topic searches |
| Hosting | Firebase Hosting via GitHub Actions | Existing CI/CD pipeline |
| RSS parsing | rss-parser | Existing, proven |

### Scalability Assessment

| Scale | Firestore handles it? | Mitigation |
|-------|----------------------|------------|
| Hundreds of nodes, thousands of edges | Yes | `graph_snapshot` denormalization |
| Thousands of signals | Yes, easily | Standard indexed queries |
| Multi-hop graph traversal | Poorly (N+1 reads) | Pre-computed `graph_snapshot` |
| Full-text search | No | Algolia layer (deferred) |
| Complex ranking/aggregation | No native support | Pre-computed in Cloud Functions (`feed_items`, `node_summaries`) |

**Escape hatch:** Data access layer abstraction (`src/data/`) allows swapping Firestore for Postgres/Supabase without rewriting the UI.

---

## 7. Migration Strategy

### 7.1 Field Mapping

**Risks → Risk Nodes**

| v1 Field | Action | v2 Location |
|----------|--------|-------------|
| id, risk_name, category, summary, deep_dive | Carry forward | `nodes/{id}` with `type: "risk"`, `risk_name` → `name` |
| score_2026, score_2035, velocity | Carry forward | Same document |
| who_affected[] | Transform | Create stakeholder nodes + `impacts` edges |
| connected_to[] | Transform | Create typed edges (amplifies, correlates_with, addressed_by) |
| mitigation_strategies[] | Carry forward | Same document |
| signal_evidence[] | Drop | Replaced by live queries via `related_nodes` |
| expert_severity | Carry forward | Same document |
| public_perception | Carry forward initially | Replaced by vote aggregates over time |
| timeline_narrative | Carry forward | Same document |
| version, lastUpdated, lastUpdatedBy | Carry forward | Same document |

**Solutions → Solution Nodes**

| v1 Field | Action | v2 Location |
|----------|--------|-------------|
| id, solution_title, solution_type, summary, deep_dive | Carry forward | `nodes/{id}` with `type: "solution"`, `solution_title` → `name` |
| parent_risk_id | Transform | `addressed_by` edge (can now have multiple) |
| implementation_stage, adoption_score_2026/2035 | Carry forward | Same document |
| key_players[], barriers[] | Carry forward | Same document |
| timeline_narrative | Carry forward | Same document |

**Signals**

| v1 Field | Action | v2 Location |
|----------|--------|-------------|
| All existing fields | Carry forward | Same collection |
| risk_categories[] | Transform | `related_nodes: [{ node_id, node_type: "risk", relevance }]` |
| solution_ids[] | Transform | Merged into `related_nodes[]` with `node_type: "solution"` |
| severity_hint | Map | Informs initial `impact_score` |
| (new) source_credibility | Backfill | From source config |
| (new) impact_score | Compute | `credibility * confidence * recency_decay` |

**Milestones → Milestone Nodes**

| v1 Field | Action | v2 Location |
|----------|--------|-------------|
| year, title, description | Carry forward | `nodes/{id}` with `type: "milestone"`, `year` → `date` |
| (new) significance | Manual enrichment | Classify each milestone |
| (new) edges | Manual/AI-assisted | Link milestones to relevant risks/solutions |

**Changelogs** — carry forward as-is.

**Users** — simplify roles from 5 (signal-reviewer, discovery-reviewer, scoring-reviewer, editor, lead) to flags: `isReviewer: boolean`, `isAdmin: boolean`.

**Discovery/Validation proposals** — migrate pending proposals with updated node references. Drop already-rejected ones.

**Agent health/runs** — carry forward for historical diagnostics.

### 7.2 Migration Execution

**Phase 1: Schema migration script** (Cloud Function, run once)
1. Read all risks → write as `nodes/{id}` with `type: "risk"`
2. Read all solutions → write as `nodes/{id}` with `type: "solution"`
3. Read all milestones → write as `nodes/{id}` with `type: "milestone"`
4. Extract unique `who_affected` values → create stakeholder nodes
5. Generate edges from: `parent_risk_id`, `connected_to[]`, `who_affected[]`
6. Transform all signals' `risk_categories[]` + `solution_ids[]` → `related_nodes[]`
7. Backfill `source_credibility` and compute `impact_score` for all signals
8. Simplify user roles to `isReviewer` + `isAdmin` flags

**Phase 2: Build initial computed views**
- Run Graph Builder → create `graph_snapshot`
- Run Feed Curator → create initial `feed_items`
- Compute all `node_summaries`

**Phase 3: Verify**
- Compare counts: nodes, edges, signals against v1 data
- Spot-check risks to verify edges are correct
- Verify no data lost

**Zero downtime:** Migration writes to new collections/fields. v1 app keeps running until v2 is deployed. Old collections kept temporarily as safety net.

---

## 8. Project Structure

```
ai-4-society/
├── src/
│   ├── pages/
│   │   ├── Landing.tsx              # Hero + badges + news feed
│   │   ├── Observatory.tsx          # Graph + detail + timeline views
│   │   └── Admin.tsx                # Review + agents + users
│   │
│   ├── components/
│   │   ├── landing/
│   │   │   ├── Hero.tsx             # Rotating earth, headline, CTAs
│   │   │   ├── RiskBadges.tsx       # Badge row + expandable drawer
│   │   │   ├── BadgeDrawer.tsx      # Risk brief, velocity, CTA
│   │   │   ├── NewsFeed.tsx         # Scrollable signal/milestone cards
│   │   │   └── FeedCard.tsx         # Card variants (signal vs milestone)
│   │   │
│   │   ├── observatory/
│   │   │   ├── GraphView.tsx        # Interactive node-edge visualization
│   │   │   ├── DetailPanel.tsx      # Node detail (risk/solution/milestone)
│   │   │   ├── TimelineView.tsx     # Chronological milestone + signal view
│   │   │   ├── EvidenceList.tsx     # Signals for a specific node
│   │   │   ├── PerceptionGap.tsx    # Expert score vs community votes
│   │   │   └── VoteButton.tsx       # Upvote/downvote for members
│   │   │
│   │   ├── admin/
│   │   │   ├── ReviewPanel.tsx      # Signals + proposals with filter toggles
│   │   │   ├── SignalCard.tsx       # Signal review card
│   │   │   ├── ProposalCard.tsx     # Discovery/validation proposal card
│   │   │   ├── AgentPanel.tsx       # Config + diagnostics + triggers
│   │   │   ├── SourceManager.tsx    # Add/remove/toggle sources, credibility
│   │   │   ├── AgentDiagnostics.tsx # Run history, costs, failures
│   │   │   └── UserManager.tsx      # Grant/revoke/block/remove
│   │   │
│   │   └── shared/
│   │       ├── Layout.tsx           # App shell, navigation
│   │       ├── PreferencePicker.tsx # Anonymous interest selection
│   │       └── AuthGate.tsx         # Role-based route protection
│   │
│   ├── data/
│   │   ├── client.ts               # Data access layer (abstraction)
│   │   ├── graph.ts                 # getNode, getEdges, getGraphSnapshot
│   │   ├── signals.ts              # getWeightedSignals, signal queries
│   │   ├── votes.ts                # castVote, getVoteCounts
│   │   └── admin.ts                # proposal actions, user management
│   │
│   ├── store/
│   │   ├── AuthContext.tsx          # User, roles, preferences
│   │   └── GraphContext.tsx         # Graph snapshot, selected node, filters
│   │
│   ├── lib/
│   │   ├── firebase.ts             # Firebase init
│   │   ├── roles.ts                # Simplified: visitor/member/reviewer/admin
│   │   └── preferences.ts          # localStorage for anonymous prefs
│   │
│   └── App.tsx                      # Routing
│
├── functions/src/
│   ├── agents/
│   │   ├── signal-scout/
│   │   │   ├── fetcher.ts          # RSS + API + active search
│   │   │   ├── filter.ts           # Stage 1 cheap relevance filter
│   │   │   ├── classifier.ts       # Stage 2 Gemini classification (graph-native)
│   │   │   └── store.ts            # Signal storage
│   │   │
│   │   ├── discovery-agent/
│   │   │   ├── analyzer.ts         # Proposes new nodes AND edges
│   │   │   └── store.ts            # Proposal storage
│   │   │
│   │   ├── validator-agent/
│   │   │   ├── assessor.ts         # Proposes updates to existing nodes
│   │   │   └── store.ts            # Proposal storage
│   │   │
│   │   ├── graph-builder/
│   │   │   └── index.ts            # Rebuilds graph_snapshot + node_summaries
│   │   │
│   │   ├── feed-curator/
│   │   │   └── index.ts            # Builds ranked feed_items
│   │   │
│   │   └── data-lifecycle/
│   │       └── index.ts            # Archive, cleanup, stale-marking
│   │
│   ├── config/
│   │   ├── sources.ts              # Source definitions with credibility tiers
│   │   └── models.ts               # Gemini model config per agent
│   │
│   ├── migration/
│   │   └── v1-to-v2.ts             # One-time migration script
│   │
│   ├── shared/
│   │   ├── firestore.ts            # Server-side data access layer
│   │   ├── gemini.ts               # Shared Gemini client + token tracking
│   │   └── health.ts               # Agent health/metrics utilities
│   │
│   └── index.ts                     # All function exports
│
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── .github/workflows/deploy.yml
└── docs/
    └── superpowers/specs/
```

---

## 9. What's Explicitly Deferred

| Feature | Why deferred | When to reconsider |
|---------|-------------|-------------------|
| Full-text search (Algolia) | Not critical for launch, adds dependency | When users/researchers request search |
| Persona narrative view | Requires per-persona content generation, hard to validate | When stakeholder nodes are rich enough |
| Comments / sharing | Needs moderation infrastructure, community too small | When 50+ active members |
| Non-English sources | Requires translation pipeline | When institutional sources are solid |
| Social media monitoring (X/Reddit) | API costs, noise, moderation risk | After T1-T3 sources prove pipeline |
| Supabase/Postgres migration | Firestore sufficient for 12-18 months | When graph queries become bottleneck |

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Landing page → Observatory click-through | > 30% of visitors |
| Signal quality (approved/total ratio) | > 60% (up from raw classification) |
| Source diversity | At least 3 T1 institutional sources active |
| Graph coverage | All migrated risks have 2+ solution edges, 1+ stakeholder edge |
| Reviewer workflow time | < 30 seconds per signal approval |
| Agent cost | < $50/month total Gemini + Firestore |
| Uptime | Zero manual hosting deploys needed |
