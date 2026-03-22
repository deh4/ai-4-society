# Pipeline Architecture v3 — Design Spec

**Date:** 2026-03-22
**Status:** Draft
**Scope:** Data model cleanup, agent pipeline redesign, new classification dimensions

---

## 1. Problem Statement

The current system has accumulated technical debt from the V1→V2 migration:

- **Dual data stores**: R01-R10 risks exist in both `risks` and `nodes` collections with drifted values
- **Inconsistent IDs**: Original nodes use `R01`/`S01` codes; discovery-created nodes use Firestore auto-IDs
- **Duplicate nodes**: At least 2 pairs of near-identical discovery-created nodes in the graph
- **Duplicate edges**: 7 edges appear twice in `graph_snapshot`
- **Legacy collections**: `risks`, `solutions`, `milestones`, `risk_updates`, `discovery_proposals`, `topics`, `admins` are orphaned
- **Missing fields**: Discovery-created nodes lack `score_2026`, `velocity`, `deep_dive` — causing carousel rendering inconsistencies
- **Changelog bug**: `node_type` is always empty string
- **No incident/hazard dimension**: Can't distinguish "harm happened" from "harm might happen"
- **No principle tagging**: No way to classify signals against AI governance principles

Additionally, the pipeline conflates signal sourcing with signal classification, and agent schedules/windows need recalibration.

---

## 2. Design Goals

1. **Single source of truth** per data type — no duplicate collections
2. **Consistent node IDs** — all nodes use the `{TYPE}{NN}` format (R01, S01, P01, SH01, M01)
3. **Decoupled agents** — sourcing, classification, discovery, scoring are independent pipeline stages
4. **New classification dimensions** — incident/hazard status and AI principle tagging
5. **Anti-recursion safeguards** — discovery↔classifier feedback loop prevention
6. **Cost-efficient model selection** — right model for each reasoning task

---

## 3. Data Model (V3)

### 3.1 Node Types

All nodes live in the `nodes` collection. Node ID format: `{TYPE_PREFIX}{ZERO_PADDED_NUMBER}`.

#### Risk Node (ID: `R01`–`R99`)

```typescript
interface RiskNode {
  id: string;                    // "R01"
  type: "risk";
  name: string;
  category: string;              // "Societal" | "Technological" | "Geopolitical" | "Economic"
  summary: string;
  deep_dive: string;
  score_2026: number;            // 0–100
  score_2035: number;            // 0–100
  velocity: "Critical" | "High" | "Medium" | "Low";
  expert_severity: number;       // 0–100
  public_perception: number;     // 0–100
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  mitigation_strategies: string[];
  principles: string[];          // NEW: ["P01", "P03"] — principle IDs
  version: number;
  lastUpdated: Timestamp;
  lastUpdatedBy: string;
  createdAt: Timestamp;
  created_by: "seed" | "discovery-agent" | string;
}
```

#### Solution Node (ID: `S01`–`S99`)

```typescript
interface SolutionNode {
  id: string;                    // "S01"
  type: "solution";
  name: string;
  solution_type: string;         // "Policy" | "Technology" | "Governance" | "Policy + Technology"
  summary: string;
  deep_dive: string;
  score_2026: number;            // 0–100, renamed from adoption_score_2026
  score_2035: number;            // 0–100, renamed from adoption_score_2035
  implementation_stage: "Research" | "Policy Debate" | "Pilot" | "Early Adoption" | "Scaling" | "Mainstream";
  key_players: string[];
  barriers: string[];
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  principles: string[];          // NEW: principle IDs this solution advances
  version: number;
  lastUpdated: Timestamp;
  lastUpdatedBy: string;
  createdAt: Timestamp;
  created_by: "seed" | "discovery-agent" | string;
}
```

#### Principle Node (ID: `P01`–`P10`) — NEW

Based on the OECD AI Principles framework. These are seeded once and rarely change.

```typescript
interface PrincipleNode {
  id: string;                    // "P01"
  type: "principle";
  name: string;                  // "Accountability"
  summary: string;
  oecd_reference: string;        // OECD principle identifier for interop
  createdAt: Timestamp;
}
```

**Seed values:**

| ID | Name | OECD Mapping |
|----|------|-------------|
| P01 | Accountability | OECD 1.5 — Accountability |
| P02 | Fairness & Non-discrimination | OECD 1.2(b) — Fairness and non-discrimination |
| P03 | Transparency & Explainability | OECD 1.3 — Transparency and explainability |
| P04 | Safety & Robustness | OECD 1.4 — Robustness, security and safety |
| P05 | Privacy & Data Governance | OECD 1.2(a) — Human-centred values (privacy) |
| P06 | Human Oversight & Autonomy | OECD 1.4 + 1.5 — Safety (human oversight) + Accountability |
| P07 | Sustainability & Environment | OECD 1.1 (2024 revision) — Sustainable development |
| P08 | Inclusive Growth & Wellbeing | OECD 1.1 — Inclusive growth and well-being |
| P09 | Democracy & Rule of Law | OECD 2.2 — International standards and interoperability |
| P10 | International Cooperation | OECD 2.4 — International cooperation |

#### Stakeholder Node (ID: `SH01`–`SH99`)

```typescript
interface StakeholderNode {
  id: string;                    // "SH01"
  type: "stakeholder";
  name: string;
  description: string;
  createdAt: Timestamp;
  created_by: "seed" | "discovery-agent" | string;
}
```

#### Milestone Node (ID: `M01`–`M99`)

```typescript
interface MilestoneNode {
  id: string;                    // "M01"
  type: "milestone";
  name: string;
  description: string;
  date: string;                  // ISO 8601 partial: "2023", "2023-06", "2023-06-14"
  significance: "breakthrough" | "regulatory" | "incident" | "deployment";
  source_url?: string;
  createdAt: Timestamp;
}
```

### 3.2 Signal

```typescript
interface Signal {
  id: string;                    // Firestore auto-ID (signals scale, no sequential IDs needed)
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  source_credibility: number;    // 0–1
  published_date: string;        // ISO 8601
  fetched_at: Timestamp;

  // Classification (set by Signal Classifier)
  signal_type: "risk" | "solution" | "both" | "unmatched";
  harm_status: "incident" | "hazard" | null;  // NEW: orthogonal to signal_type
  principles: string[];          // NEW: ["P01", "P03"] — principle IDs as tags
  confidence_score: number;      // 0–1
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  impact_score: number;          // 0–1

  // Node mapping
  related_nodes: Array<{
    node_id: string;
    node_type: "risk" | "solution" | "stakeholder";
    relevance: number;           // 0–1
  }>;
  related_node_ids: string[];    // denormalized for query efficiency

  // Unmatched-only
  proposed_topic?: string;

  // Review
  status: "pending" | "approved" | "rejected" | "edited";
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: Timestamp;

  // Assignment
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Timestamp;

  // Anti-recursion (NEW)
  classification_version: number;  // increments on reclassification
  last_classified_by: string;      // "signal-classifier" | "reclassifier-{run_id}"
  last_classified_at: Timestamp;
  discovery_locked: boolean;       // true = discovery agent ignores this signal
}
```

**Key changes from V2:**
- Added `harm_status` (incident/hazard/null)
- Added `principles` array (principle IDs as tags)
- Added anti-recursion fields: `classification_version`, `last_classified_by`, `last_classified_at`, `discovery_locked`
- Removed redundant `risk_categories` and `solution_ids` fields

### 3.3 Graph Proposal

Unified proposal pipeline. Replaces `discovery_proposals` and `risk_updates`.

```typescript
interface GraphProposal {
  id: string;
  proposal_type: "new_node" | "new_edge" | "update_node";
  status: "pending" | "approved" | "rejected";

  // new_node
  node_data?: {
    type: "risk" | "solution" | "stakeholder";
    name: string;
    description: string;
    why_novel: string;
    key_themes: string[];
    suggested_parent_risk_id?: string;
    // Discovery agent now provides full node skeleton:
    summary: string;
    deep_dive: string;
    score_2026: number;
    score_2035: number;
    velocity?: string;                // risks only
    implementation_stage?: string;     // solutions only
    principles: string[];             // principle IDs
  };

  // new_edge
  edge_data?: {
    from_node: string;
    to_node: string;
    relationship: "correlates_with" | "addressed_by" | "impacts" | "amplifies" | "depends_on" | "governs";
    reasoning: string;
  };

  // update_node
  update_data?: {
    node_id: string;
    node_name: string;
    node_type: string;               // FIXED: was always empty string
    proposed_changes: Record<string, {
      current_value: unknown;
      proposed_value: unknown;
      reasoning: string;
    }>;
    overall_reasoning: string;
  };

  supporting_signal_ids: string[];
  signal_quality?: {
    summary: string;
    approved_count: number;
    pending_count: number;
    rejected_count: number;
    unmatched_count: number;
  };
  confidence: number;
  created_by: "discovery-agent" | "scoring-agent";  // renamed from "validator-agent"
  created_at: Timestamp;
  reviewed_by?: string;
  reviewed_at?: Timestamp;
  admin_notes?: string;
}
```

### 3.4 Edge

Updated from V2: added `"principle"` to `from_type`/`to_type` unions and `"governs"` to relationship types.

```typescript
interface Edge {
  id: string;                    // "{from}-{to}-{relationship}"
  from_node: string;
  from_type: "risk" | "solution" | "stakeholder" | "principle" | "milestone";
  to_node: string;
  to_type: "risk" | "solution" | "stakeholder" | "principle" | "milestone";
  relationship: "correlates_with" | "addressed_by" | "impacts" | "amplifies" | "depends_on";
  properties?: {
    strength?: number;
    reasoning?: string;
  };
  created_by: "seed" | "discovery-agent" | string;
  approved_by?: string;
  createdAt: Timestamp;
}
```

**Relationship semantics for principles:** Principle→risk edges use `"governs"` (e.g., `P01 --[governs]--> R01` means the Accountability principle governs the scope of that risk). Principle→solution edges also use `"governs"`. This is distinct from `"impacts"` (which describes risk→stakeholder relationships) and avoids semantic confusion.

### 3.5 Editorial Hook

No structural changes. Null fields (`narrative_headline`, `featured_image_url`, `featured_image_alt`) removed from schema — they were never populated.

```typescript
interface EditorialHook {
  id: string;                    // same as signal_id
  signal_id: string;
  signal_title: string;
  hook_text: string;
  status: "pending" | "approved" | "rejected";
  related_node_ids: string[];
  impact_score: number;
  source_name: string;
  source_credibility: number;
  published_date: string;
  generated_at: Timestamp;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Timestamp;
}
```

### 3.6 Graph Snapshot

```typescript
interface GraphSnapshot {
  nodes: Array<{
    id: string;
    type: "risk" | "solution" | "stakeholder" | "principle" | "milestone";
    name: string;
    score_2026?: number;         // risks + solutions
    velocity?: string;           // risks only
    implementation_stage?: string; // solutions only
    significance?: string;       // milestones only
    principles?: string[];       // risks + solutions
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
```

### 3.7 Collections to Delete (Legacy)

| Collection | Reason |
|-----------|--------|
| `risks` | Migrated to `nodes` (type: "risk") |
| `solutions` | Migrated to `nodes` (type: "solution") |
| `milestones` | Migrated to `nodes` (type: "milestone") |
| `risk_updates` | Replaced by `graph_proposals` (type: "update_node") |
| `discovery_proposals` | Replaced by `graph_proposals` (type: "new_node") |
| `topics` | Orphaned from removed topic-tracker agent |
| `admins` | Replaced by `users.roles` |
| `validation_reports` | Replaced by `agents/*/runs/*` |
| `validator_proposals` | Empty, never used |

These collections will be deleted after verifying no code reads from them.

---

## 4. Pipeline Architecture

### 4.1 Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SIGNAL SOURCING AGENT (every 6h)                                   │
│  Fetches articles from 38 sources via RSS/API                       │
│  Cheap heuristic filters: credibility, recency, dedup, keywords     │
│  Output: raw_articles (in-memory, passed to classifier)             │
│  Model: None                                                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ raw articles
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SIGNAL CLASSIFIER AGENT (triggered by sourcing agent)              │
│  Classifies each article against current graph nodes                │
│  Maps: signal_type, harm_status, principles[], related_nodes[]      │
│  Output: signals collection (status: "pending")                     │
│  Model: Gemini 2.5 Flash (batch of 25)                              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ pending signals
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW (Admin UI — Risk Signals / Solution Signals tabs)     │
│  Approve, reject, or edit matched signals                           │
│  Unmatched signals bypass review → flow to Discovery Agent          │
└──────────┬───────────────────────────────────────┬──────────────────┘
           │ approved/edited signals                │ unmatched signals
           ▼                                        ▼
┌──────────────────────────┐   ┌──────────────────────────────────────┐
│  FEED CURATOR (every 6h) │   │  DISCOVERY AGENT (every 2 weeks)     │
│  Ranks approved signals  │   │  Sliding window: 6 months            │
│  Generates editorial     │   │  Looks for emerging patterns from    │
│  hooks for landing page  │   │  unmatched + approved signals        │
│  Model: Gemini 2.5 Flash │   │  Proposes new nodes with full data   │
│  (1 call per hook)       │   │  Model: Gemini 2.5 Pro               │
└──────────────────────────┘   └──────────────────┬───────────────────┘
                                                   │ new_node / new_edge proposals
                                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW (Admin UI — Discovery tab)                            │
│  Approve or reject proposed new risks/solutions/edges               │
│  On approve: Graph Builder creates node with assigned ID (R11, S12) │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ new node approved
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GRAPH BUILDER (on-demand, triggered by approval)                   │
│  1. Assigns next sequential ID (R11, S12, SH41, etc.)              │
│  2. Creates node in `nodes` collection with full data               │
│  3. Creates edges in `edges` collection                             │
│  4. Rebuilds `graph_snapshot/current`                               │
│  5. Triggers RECLASSIFICATION of pending signals (see §4.3)        │
│  Model: None                                                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ graph updated
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCORING AGENT (monthly, 1st of month 09:00 UTC)                    │
│  For each risk/solution node:                                       │
│  - Evaluates accumulated signals from last 30 days                  │
│  - Re-scores: velocity, score_2026, public_perception, etc.         │
│  - If no new signals: evaluates ongoing relevance                   │
│  Output: update_node proposals → Discovery tab for human review     │
│  Model: Gemini 2.5 Pro (1 call per node)                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  DATA LIFECYCLE (daily 03:00 UTC)                                   │
│  Archive/delete stale signals, expired proposals, old runs          │
│  Model: None                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Schedule Summary

| Agent | Schedule | Trigger | Model |
|-------|----------|---------|-------|
| Signal Sourcing | Every 6h | Scheduled | None |
| Signal Classifier | Every 6h | Called by Sourcing Agent | Gemini 2.5 Flash |
| Feed Curator | Every 6h | Scheduled | Gemini 2.5 Flash |
| Discovery Agent | Every 2 weeks | Scheduled (Sun 10:00 UTC) | Gemini 2.5 Pro |
| Graph Builder | On-demand | Triggered by proposal approval | None |
| Scoring Agent | Monthly (1st, 09:00 UTC) | Scheduled | Gemini 2.5 Pro |
| Data Lifecycle | Daily 03:00 UTC | Scheduled | None |

### 4.3 Anti-Recursion Safeguards

**Problem:** When a new node is approved (e.g., R11), the signal classifier should re-evaluate pending signals against it. But if those re-classified signals then trigger the discovery agent to propose R11 again (or a variant), we get a loop.

**Solution: Two-layer protection.**

#### Layer 1: `discovery_locked` flag on signals

When the Graph Builder triggers reclassification after a new node approval:
1. The reclassifier runs ONLY on signals with `status: "pending"` AND `classification_version == 1` (never reclassified before)
2. After reclassification, signals get `classification_version: 2` and `discovery_locked: true`
3. The discovery agent **skips** signals where `discovery_locked == true`

This means: a signal can only contribute to ONE discovery cycle. Once it has been reclassified due to a new node, it cannot trigger further discoveries.

#### Layer 2: `classification_version` cap

Signals can be classified at most **twice**:
- Version 1: Initial classification by Signal Classifier
- Version 2: Reclassification after new node approval

No agent may set `classification_version > 2`. This hard cap prevents any runaway reclassification.

#### Design trade-off: approved signals are not reclassified

Reclassification targets only `pending` signals (not yet reviewed by a human). Signals that have already been `approved` or `edited` by a reviewer are NOT reclassified, even if a new node would be a better fit. This is deliberate: reclassifying approved signals would undermine human review decisions and could confuse reviewers. The trade-off is that some approved signals may remain mapped to a less-specific node. This is acceptable — the scoring agent will eventually pick up the evidence pattern through accumulated signals on the new node.

### 4.4 Discovery Agent — Redesigned

**Key changes from V2:**

| Aspect | V2 (Current) | V3 (New) |
|--------|-------------|----------|
| Schedule | Weekly (Sun) | Every 2 weeks |
| Window | 30 days | 6 months (sliding) |
| Min signals for new node | 3 | 5 |
| Min signals for new edge | 2 | 3 |
| Output completeness | Name + description only | Full node skeleton (scores, velocity, summary, deep_dive) |
| Model | Gemini 2.5 Pro | Gemini 2.5 Pro |
| Signal filter | All signals | Excludes `discovery_locked == true` |

**Why 2-week cadence with 6-month window:**
- A genuinely new risk/solution needs time to accumulate evidence across multiple sources
- 6-month window captures slow-developing trends that a 30-day window misses
- 2-week cadence (instead of weekly) reduces noise and cost — if a pattern is real, waiting 1 extra week won't matter
- The 5-signal minimum ensures sufficient evidence before proposing

**Full node skeleton:** The discovery agent now proposes nodes with ALL required fields populated (summary, deep_dive, scores, velocity, principles). This eliminates the current problem where discovery-created nodes lack fields and cause rendering issues. The human reviewer can edit any field before approval.

### 4.5 Signal Classifier — New Classification Dimensions

The classifier prompt is extended with two new dimensions:

#### Harm Status (incident vs hazard)

Added to the classifier's system prompt:
```
For each article, additionally determine harm_status:
- "incident": The article describes an AI-related harm that HAS ALREADY OCCURRED.
  Evidence: past tense, specific victims/damages, legal proceedings, documented failures.
- "hazard": The article describes a PLAUSIBLE FUTURE harm or near-miss.
  Evidence: warnings, risk assessments, "could lead to", vulnerability disclosures.
- null: The article is about a solution, policy, or does not describe a specific harm.
  Use null for solution-type signals unless they reference a specific past incident.
```

#### Principle Tagging

Added to the classifier's system prompt:
```
PRINCIPLES (tag all that apply):
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

Map 1–3 most relevant principle IDs per signal. Use [] if none apply.
```

### 4.6 Scoring Agent (renamed from Validator)

**Key changes from V2:**

| Aspect | V2 (Current) | V3 (New) |
|--------|-------------|----------|
| Name | Validator Agent | Scoring Agent |
| Schedule | Weekly (Mon 09:00) | Monthly (1st, 09:00 UTC) |
| Window | 30 days | 30 days |
| No-signal handling | Skips node | Evaluates relevance decay |
| Output | `proposal_type: "validation"` | `proposal_type: "update_node"` |
| `node_type` field | Always empty string (bug) | Correctly set from node data |

**Monthly cadence rationale:** Scores should not fluctuate week-to-week based on news cycles. Monthly evaluation gives a more stable, meaningful assessment of whether a risk's trajectory has actually changed.

**No-signal evaluation:** When a node has received 0 new signals in 30 days, the scoring agent explicitly evaluates whether this means: (a) the risk is stable/resolved, or (b) it's under-monitored. This informs velocity updates.

---

## 5. Model Selection & Cost Estimates

### 5.1 Model Assignment

| Agent | Model | Reasoning Level | Why This Model |
|-------|-------|----------------|----------------|
| Signal Sourcing | None | — | RSS/API fetching + heuristic filters only |
| Signal Classifier | Gemini 2.5 Flash | Low (temperature 0.1) | Pattern matching against known taxonomy — fast, cheap, deterministic |
| Feed Curator | Gemini 2.5 Flash | Low | Simple summarization — one-sentence hooks |
| Discovery Agent | Gemini 2.5 Pro | Medium (temperature 0.2) | Novel pattern recognition across 6 months of signals — needs stronger reasoning |
| Scoring Agent | Gemini 2.5 Pro | Medium (temperature 0.1) | Nuanced evaluation of evidence quality and score adjustments |
| Graph Builder | None | — | Data operations only |
| Data Lifecycle | None | — | Cleanup operations only |

### 5.2 Gemini Pricing (as of March 2026)

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.5 Flash | $0.15/M tokens (≤200k), $0.30/M (>200k) | $0.60/M tokens (≤200k), $2.50/M (>200k) |
| Gemini 2.5 Pro | $1.25/M tokens (≤200k) | $10.00/M tokens (≤200k) |

### 5.3 Per-Run Token Estimates

#### Signal Classifier (every 6h)

| Component | Tokens |
|-----------|--------|
| System prompt (taxonomy + principles + harm_status rules) | ~1,500 |
| Per article (title + snippet) | ~80 |
| Batch of 25 articles (input) | ~3,500 |
| Response per article | ~60 (added harm_status + principles) |
| Batch response (output) | ~1,500 |
| **Batches per run** (100 articles) | **4** |
| **Total per run** | **~14,000 input / ~6,000 output** |

**Cost per run:** (14k × $0.15/M) + (6k × $0.60/M) = $0.002 + $0.004 = **$0.006**
**Cost per month** (4 runs/day × 30): **$0.72**

#### Discovery Agent (every 2 weeks)

| Component | Tokens |
|-----------|--------|
| System prompt (full graph + rules) | ~3,500 |
| 6 months of signals (~300 signals × 30 tokens) | ~9,000 |
| Full node skeleton output (~3 proposals) | ~3,000 |
| **Total per run** | **~12,500 input / ~3,000 output** |

**Cost per run:** (12.5k × $1.25/M) + (3k × $10/M) = $0.016 + $0.030 = **$0.046**
**Cost per month** (~2 runs): **$0.09**

#### Scoring Agent (monthly)

| Component | Tokens |
|-----------|--------|
| System prompt per node | ~1,000 |
| Node data + signals per node | ~1,500 |
| Response per node | ~400 |
| **Nodes per run** (~30 risk+solution nodes) | **30** |
| **Total per run** | **~75,000 input / ~12,000 output** |

**Cost per run:** (75k × $1.25/M) + (12k × $10/M) = $0.094 + $0.120 = **$0.21**
**Cost per month** (1 run): **$0.21**

#### Feed Curator (every 6h)

| Component | Tokens |
|-----------|--------|
| Per hook (input + output) | ~250 |
| Hooks per run | 0–5 |
| **Total per run** | **~1,250 max** |

**Cost per run:** negligible (<$0.001)
**Cost per month:** **~$0.02**

### 5.4 Monthly Cost Summary

| Agent | Runs/Month | Monthly Cost |
|-------|-----------|-------------|
| Signal Classifier | ~120 | $0.72 |
| Discovery Agent | ~2 | $0.09 |
| Scoring Agent | 1 | $0.21 |
| Feed Curator | ~120 | $0.02 |
| **Total Gemini** | | **~$1.04/month** |

**Note:** These estimates assume current signal volume (~100 articles/run). As signal volume grows, the classifier cost scales linearly. At 500 articles/run, classifier cost would be ~$3.60/month. Discovery agent cost grows with the 6-month accumulation but remains bounded by the graph size.

**Firestore costs** are negligible at current scale (<$1/month on Blaze plan).

---

## 6. Data Migration Plan

### 6.1 Pre-Migration: Fix Existing Data

1. **Deduplicate nodes**: Merge the 2 pairs of duplicate discovery nodes. Keep the one with more edges/signals, delete the other, redirect edges.
2. **Deduplicate edges**: Remove 7 duplicate edges from `graph_snapshot` and `edges` collection.
3. **Fix changelog `node_type`**: Backfill empty strings with correct type from `nodes` collection.
4. **Assign sequential IDs to discovery nodes**: Replace Firestore auto-IDs with proper codes:
   - Discovery risks → R11, R12, ... (based on creation order)
   - Discovery solutions → S11, S12, ...
   - Update all references (edges, signals, proposals, editorial_hooks, graph_snapshot)

### 6.2 Normalize Field Names

In `nodes` collection, ensure all nodes use the V3 field names:
- Solutions: `adoption_score_2026` → `score_2026`, `adoption_score_2035` → `score_2035`
- Add `principles: []` to all existing nodes (empty until scored)
- Add `created_by: "seed"` to original R01-R10/S01-S10 nodes

### 6.3 Populate Missing Fields on Discovery Nodes

Discovery-created nodes currently lack: `summary`, `deep_dive`, `score_2026`, `score_2035`, `velocity` (risks), `implementation_stage` (solutions), `timeline_narrative`, `principles`.

**Approach:** Run a one-time Gemini 2.5 Pro call per incomplete node to generate the missing fields, using the node's existing `description`, `key_themes`, and supporting signals as context. Store as `version: 1` with `lastUpdatedBy: "migration-v3"`.

### 6.4 Seed Principle Nodes

Create P01–P10 in `nodes` collection. Create edges:
- `P01 --[governs]--> R01` (principle→risk relationships, based on existing risk categories)
- `P02 --[governs]--> S01` (principle→solution relationships)

These initial principle↔node edges are seeded manually, then maintained by the discovery agent.

### 6.5 Add `harm_status` + Anti-Recursion Fields to Existing Signals

Backfill all existing signals:
- `harm_status: null` (unknown for historical signals)
- `classification_version: 1`
- `last_classified_by: "signal-classifier"`
- `last_classified_at: fetched_at` (use original fetch time)
- `discovery_locked: false`

### 6.6 Delete Legacy Collections

Order matters — remove code before removing data/rules:
1. Remove any frontend/function code that reads from legacy collections
2. Deploy updated code (CI + `firebase deploy --only functions`)
3. Remove Firestore security rules for legacy collections
4. Deploy security rules (`firebase deploy --only firestore:rules`)
5. Delete documents from: `risks`, `solutions`, `milestones`, `risk_updates`, `discovery_proposals`, `topics`, `admins`, `validation_reports`, `validator_proposals`

### 6.7 Rebuild Graph Snapshot

After all migrations, trigger Graph Builder to rebuild `graph_snapshot/current` from the clean `nodes` + `edges` data. This eliminates duplicate edges and stale scores.

---

## 7. Firestore Collection Map (V3)

```
ROOT
├── nodes/                           (RiskNode | SolutionNode | PrincipleNode |
│   │                                  StakeholderNode | MilestoneNode)
│   └── {nodeId}/votes/{userId}      (Vote)
├── edges/                           (Edge: relationships between nodes)
├── signals/                         (Signal: classified articles)
├── graph_proposals/                 (GraphProposal: pending agent changes)
├── graph_snapshot/
│   └── current                      (GraphSnapshot: denormalized read cache)
├── node_summaries/                  (NodeSummary: trending + votes per node)
├── feed_items/                      (FeedItem: public feed)
├── editorial_hooks/                 (EditorialHook: landing page carousel)
├── changelogs/                      (Changelog: approved scoring changes)
├── users/
│   └── {userId}/preferences/{docId} (UserPreferences)
├── agents/
│   └── {agentId}/
│       ├── config/current           (agent config)
│       ├── health/latest            (health metrics)
│       └── runs/{runId}             (run logs)
├── _archive/signals/items/          (archived signals, server-only)
├── _pipeline_health/status          (pipeline health)
├── _usage/                          (daily/monthly stats + run logs)
```

**Deleted:** `risks`, `solutions`, `milestones`, `risk_updates`, `discovery_proposals`, `topics`, `admins`, `validation_reports`, `validator_proposals`

---

## 8. Open Questions

1. **Reclassification scope**: When a new node is approved, should we reclassify only `pending` signals or also `approved` ones? Reclassifying approved signals could change their node mapping, which might confuse reviewers who already approved them. Current design: pending only.

2. **Principle edge maintenance**: Should the discovery agent propose principle↔risk edges, or should these be inferred automatically from signal principle tags? (e.g., if 10+ signals for R03 tag P09, auto-create `P09 --[governs]--> R03`)

3. **Scoring agent parallelism**: The current validator runs sequentially (1 Gemini call per node). At 30+ nodes, this could approach the 540s timeout. Should we parallelize with `Promise.all` (risk of rate limiting) or split across multiple function invocations?

4. **Historical harm_status backfill**: Should we run a one-time classification pass on historical approved signals to assign `harm_status`? Cost: ~$0.05 for current volume. Benefit: enables immediate incident/hazard filtering in the UI.

5. **Editorial hooks and reclassified signals**: If a signal has an approved editorial hook and then gets reclassified (version 1→2) with new `related_node_ids`, the hook still references the old node mapping. Options: (a) leave hooks as-is (they're human-curated content), (b) flag them for re-review, (c) auto-update `related_node_ids` on the hook. Current design leans toward (a) since hooks are editorial content, not data.

6. **Principle nodes in graph visualization**: Adding P01–P10 to `graph_snapshot` means they appear in the observatory force-directed graph. 10 principle nodes with many `governs` edges could add visual noise. Options: (a) include them with a distinct visual treatment (different color/shape, smaller), (b) exclude them from the snapshot and show principle relationships only on node detail pages, (c) make them toggleable in the UI. This needs a frontend design decision.

7. **Migration cost for §6.3**: Populating missing fields on discovery-created nodes requires ~4–6 Gemini 2.5 Pro calls (one per incomplete node). Estimated cost: ~$0.05–0.10 one-time.
