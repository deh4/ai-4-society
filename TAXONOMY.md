# Observatory Taxonomy

Canonical definitions for every domain concept in AI 4 Society Observatory.
The authoritative TypeScript types live in `src/types/taxonomy.ts`.

---

## Domain Entities (stored in Firestore)

### Signal

A classified news article or report ingested by the system.

| Field | Meaning |
|---|---|
| `signal_type` | `risk`, `solution`, `both`, or `unmatched` |
| `status` | `pending` → `approved` / `rejected` / `edited` |
| `related_node_ids` | Links to existing graph nodes (matched signals only) |
| `proposed_topic` | Free-text label (unmatched signals only) |

**Collection:** `signals/{id}`
**Created by:** Signal Scout agent
**Reviewed by:** `signal-reviewer` or `lead`

### Node (Graph Vertex)

A vertex in the knowledge graph. Four concrete types, all in the same collection:

| Type | ID Pattern | Key Fields |
|---|---|---|
| **RiskNode** | `R01`–`R99` | `score_2026`, `score_2035`, `velocity`, `expert_severity` |
| **SolutionNode** | `S01`–`S99` | `adoption_score_2026`, `implementation_stage`, `key_players` |
| **StakeholderNode** | `SH01`+ | `description` |
| **MilestoneNode** | `M01`+ | `date` (ISO 8601 partial), `significance` |

All nodes share: `id`, `type`, `name`, `createdAt`.
Risk and Solution nodes are **versioned** (`version`, `lastUpdated`, `lastUpdatedBy`).

**Collection:** `nodes/{id}`
**Canonical field for display name:** `name` (not `risk_name`, not `solution_title`)

### Edge (Graph Relationship)

A directed relationship between two nodes.

| Relationship | Meaning |
|---|---|
| `correlates_with` | Two nodes trend together |
| `addressed_by` | A risk is addressed by a solution |
| `impacts` | A node has downstream effects on another |
| `amplifies` | A node makes another more severe |
| `depends_on` | A node requires another to function |

**Collection:** `edges/{id}`

> **Clarification:** "Edge" is a graph term for a _connection_, not a node type.
> There is no "edge node". If you mean a vertex, use "Node".

### Proposal (Pending Change)

An agent-generated change awaiting human review.

| `proposal_type` | Agent | What it proposes |
|---|---|---|
| `new_node` | Discovery Agent | Create a new risk / solution / stakeholder |
| `new_edge` | Discovery Agent | Create a relationship between existing nodes |
| `update_node` | Validator Agent | Change fields on an existing node |

**Collection:** `graph_proposals/{id}`
**Status:** `pending` → `approved` / `rejected`

### Editorial Hook

A one-sentence, jargon-free summary of a signal for the public feed.

**Collection:** `editorial_hooks/{id}`
**Created by:** Feed Curator agent
**Canonical name:** "editorial hook" (not "editor hook")

---

## Agents (Processes, not entities)

Agents are Cloud Functions that create or modify domain entities.
They are **not** stored as domain data — they are _processes_.

| Agent ID | Schedule | Creates / Modifies |
|---|---|---|
| `signal-scout` | Every 6 hours | Signal (pending) |
| `discovery-agent` | Weekly, Sun 10:00 UTC | Proposal (new_node, new_edge) |
| `validator-agent` | Weekly, Mon 09:00 UTC | Proposal (update_node) |
| `feed-curator` | On demand | FeedItem, EditorialHook |
| `data-lifecycle` | Daily | Cleans old / orphaned documents |
| `graph-builder` | On demand | GraphSnapshot, NodeSummary |

### Signal Scout

Fetches articles from configured sources, runs Gemini classification, creates
pending signals. Matched signals link to existing R/S codes. Unmatched signals
get a `proposed_topic` and flow directly to Discovery Agent without manual review.

### Discovery Agent

Clusters recent signals (5+ classified OR 3+ unmatched in 30 days) and proposes
new nodes or edges. Each proposal needs 3+ supporting signals for nodes, 2+ for edges.

### Validator Agent

Reviews each existing risk/solution node against its linked signals from the
last 30 days. Proposes field updates when confidence > 0.6.

### Feed Curator

Ranks approved signals by `impact_score × recency_decay`, generates editorial
hooks (max 15 in a circular buffer).

---

## Pipeline Flow

```
Signal Scout (6h)
    │ creates pending signals
    ▼
┌─ Human Gate 1: Signal Review ─┐
│  approve / reject / edit       │
└────────────────────────────────┘
    │
    ├─ matched (approved) ───────┐
    │                            ▼
    │              Validator Agent (Mon 09Z)
    │                   │ proposes score/field updates
    │                   ▼
    │         ┌─ Human Gate 3: Scoring Review ─┐
    │         │  approve / reject               │
    │         └─────────────────────────────────┘
    │
    ├─ unmatched (auto) ─────────┐
    │                            ▼
    │              Discovery Agent (Sun 10Z)
    │                   │ proposes new nodes / edges
    │                   ▼
    │         ┌─ Human Gate 2: Discovery Review ─┐
    │         │  approve / reject                 │
    │         └───────────────────────────────────┘
    │
    └─ approved ─────────────────┐
                                 ▼
                     Feed Curator (on demand)
                          │ generates editorial hooks
                          ▼
                ┌─ Human Gate 4: Editorial Review ─┐
                │  approve / edit / reject          │
                └───────────────────────────────────┘
```

---

## RBAC Roles

| Role | Can access |
|---|---|
| `signal-reviewer` | Review tab (signals) |
| `discovery-reviewer` | Review tab (discovery proposals) |
| `scoring-reviewer` | Review tab (validation proposals) |
| `editor` | Editorial tab |
| `lead` | Everything |

---

## Naming Rules

1. **Node display name** → always `name` (never `risk_name` or `solution_title`)
2. **Timestamps** → camelCase (`createdAt`, `lastUpdated`)
3. **Agent IDs** → kebab-case (`signal-scout`, `discovery-agent`)
4. **Node IDs** → uppercase prefix + zero-padded number (`R01`, `S12`, `SH03`, `M07`)
5. **"Editorial hook"** not "editor hook"
6. **"Edge"** means a graph connection, not a node type

---

## Legacy (v1) — To Be Removed

| v1 Collection | v1 Field | v2 Equivalent |
|---|---|---|
| `risks` | `risk_name` | `nodes` → `name` |
| `solutions` | `solution_title` | `nodes` → `name` |
| `milestones` | `year: number` | `nodes` → `date: string` |
| `signal_evidence` | inline on risk docs | `signals` (separate collection) |

Legacy types are preserved as `LegacyRisk`, `LegacySolution`, `LegacyMilestone`
in `src/types/taxonomy.ts` with `@deprecated` annotations.
