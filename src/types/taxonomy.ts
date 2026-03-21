/**
 * CANONICAL TAXONOMY — Single source of truth for all domain concepts.
 *
 * This file defines the vocabulary, relationships, and invariants of the
 * AI 4 Society Observatory. Every type used across frontend components,
 * cloud functions, and Firestore documents should trace back here.
 *
 * ## Concept Map
 *
 *   Signal Scout (agent)
 *       │ creates
 *       ▼
 *   Signal ──approved──▶ Discovery Agent ──proposes──▶ Proposal (new_node / new_edge)
 *       │                                                  │
 *       │                                                  ▼ (human approval)
 *       │                                              Node / Edge
 *       │
 *       └──approved──▶ Validator Agent ──proposes──▶ Proposal (update_node)
 *       │                                                  │
 *       │                                                  ▼ (human approval)
 *       │                                              Node (updated fields)
 *       │
 *       └──approved──▶ Feed Curator ──generates──▶ EditorialHook
 *
 * ## Firestore Collections
 *
 *   signals            → Signal documents
 *   nodes              → RiskNode | SolutionNode | StakeholderNode | MilestoneNode
 *   edges              → Edge documents (relationships between nodes)
 *   graph_proposals     → Proposal documents (pending changes from agents)
 *   graph_snapshot      → Denormalized snapshot for fast reads (single doc: "current")
 *   node_summaries      → Per-node trending/vote data
 *   editorial_hooks     → EditorialHook documents
 *   feed_items          → FeedItem documents (ranked feed)
 *   agent_health        → Per-agent health/run metadata
 *   agent_runs          → Individual run logs
 *   agent_config        → Per-agent configuration (source toggles, etc.)
 *   users               → User documents with roles
 *
 * ## Legacy Collections (v1, read-only — will be removed)
 *
 *   risks               → v1 Risk (uses risk_name, not name)
 *   solutions           → v1 Solution (uses solution_title, not name)
 *   milestones           → v1 Milestone (uses year: number, not date: string)
 *   signal_evidence     → v1 inline signal evidence
 *
 * ## Naming Conventions
 *
 *   - Node IDs: R01-R99 (risk), S01-S99 (solution), SH01+ (stakeholder), M01+ (milestone)
 *   - All nodes use `name` (not risk_name, solution_title, etc.)
 *   - All reviewable entities use `status: "pending" | "approved" | "rejected"`
 *   - Timestamps: camelCase (createdAt, lastUpdated) — NOT snake_case
 *   - Agent IDs: kebab-case ("signal-scout", "discovery-agent", "validator-agent",
 *     "feed-curator", "data-lifecycle", "graph-builder")
 */

// ---------------------------------------------------------------------------
// 1. ENUMS & LITERAL UNIONS
// ---------------------------------------------------------------------------

/** The four kinds of knowledge-graph node. */
export type NodeType = "risk" | "solution" | "stakeholder" | "milestone";

/** How a signal relates to the taxonomy. */
export type SignalType = "risk" | "solution" | "both" | "unmatched";

/** Universal review status shared by signals, proposals, and editorial hooks. */
export type ReviewStatus = "pending" | "approved" | "rejected";

/** Extended status for signals that can also be edited-then-approved. */
export type SignalStatus = ReviewStatus | "edited";

/** What a proposal wants to do. */
export type ProposalType = "new_node" | "new_edge" | "update_node";

/** Semantic relationship between two nodes (stored on Edge). */
export type EdgeRelationship =
  | "correlates_with"
  | "addressed_by"
  | "impacts"
  | "amplifies"
  | "depends_on";

/** Velocity / urgency rating for risk nodes. */
export type Velocity = "Critical" | "High" | "Medium" | "Low";

/** Severity hint assigned by Signal Scout during classification. */
export type SeverityHint = "Critical" | "Emerging" | "Horizon";

/** Maturity stage for solution nodes. */
export type ImplementationStage =
  | "Research"
  | "Policy Debate"
  | "Pilot"
  | "Early Adoption"
  | "Scaling"
  | "Mainstream";

/** Why a milestone matters. */
export type MilestoneSignificance =
  | "breakthrough"
  | "regulatory"
  | "incident"
  | "deployment";

/** Which agent created a proposal or edge. */
export type AgentId =
  | "signal-scout"
  | "discovery-agent"
  | "validator-agent"
  | "feed-curator"
  | "data-lifecycle"
  | "graph-builder";

/** RBAC roles assignable to users. */
export type UserRole =
  | "signal-reviewer"
  | "discovery-reviewer"
  | "scoring-reviewer"
  | "editor"
  | "lead";

/** User account status. */
export type UserStatus = "pending" | "active" | "blocked";

/** Trending direction for node summaries. */
export type TrendDirection = "rising" | "stable" | "declining";

/** Edge severity property. */
export type EdgeSeverity = "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// 2. SHARED SHAPES
// ---------------------------------------------------------------------------

/** Three-horizon narrative used by both risk and solution nodes. */
export interface TimelineNarrative {
  near_term: string;
  mid_term: string;
  long_term: string;
}

/** A signal's reference to a related graph node. */
export interface RelatedNodeRef {
  node_id: string;
  node_type: NodeType;
  relevance: number;
}

// ---------------------------------------------------------------------------
// 3. SIGNALS — articles classified by Signal Scout
// ---------------------------------------------------------------------------

/**
 * A Signal is a classified news article / report.
 *
 * Created by: Signal Scout agent
 * Firestore:  signals/{id}
 * Lifecycle:  pending → approved | rejected | edited
 *
 * Matched signals (risk/solution/both) link to existing nodes via
 * `related_node_ids`.  Unmatched signals carry a free-text
 * `proposed_topic` and flow directly to the Discovery Agent.
 */
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
  fetched_at: FirestoreTimestamp;
  proposed_topic?: string;

  severity_hint?: SeverityHint;
  affected_groups?: string[];

  source_credibility: number;
  impact_score: number;

  related_nodes: RelatedNodeRef[];
  related_node_ids: string[];
}

// ---------------------------------------------------------------------------
// 4. NODES — the knowledge graph vertices
// ---------------------------------------------------------------------------

/**
 * Base fields shared by every node in the graph.
 * Concrete node types extend this with domain-specific fields.
 */
interface NodeBase {
  id: string;
  type: NodeType;
  name: string;
  createdAt: FirestoreTimestamp;
}

/** Versioned nodes track edit history. */
interface VersionedNode extends NodeBase {
  version: number;
  lastUpdated: FirestoreTimestamp;
  lastUpdatedBy: string;
}

/**
 * RiskNode — an identified AI risk.
 *
 * Firestore: nodes/{id}  (type: "risk")
 * IDs:       R01–R99
 */
export interface RiskNode extends VersionedNode {
  type: "risk";
  category: string;
  summary: string;
  deep_dive: string;
  score_2026: number;
  score_2035: number;
  velocity: Velocity;
  expert_severity: number;
  public_perception: number;
  timeline_narrative: TimelineNarrative;
  mitigation_strategies: string[];
}

/**
 * SolutionNode — a response / mitigation to one or more risks.
 *
 * Firestore: nodes/{id}  (type: "solution")
 * IDs:       S01–S99
 */
export interface SolutionNode extends VersionedNode {
  type: "solution";
  solution_type: string;
  summary: string;
  deep_dive: string;
  implementation_stage: ImplementationStage;
  adoption_score_2026: number;
  adoption_score_2035: number;
  key_players: string[];
  barriers: string[];
  timeline_narrative: TimelineNarrative;
}

/**
 * StakeholderNode — an organisation or actor relevant to risks/solutions.
 *
 * Firestore: nodes/{id}  (type: "stakeholder")
 * IDs:       SH01+
 */
export interface StakeholderNode extends NodeBase {
  type: "stakeholder";
  description: string;
}

/**
 * MilestoneNode — a dated event on the AI timeline.
 *
 * Firestore: nodes/{id}  (type: "milestone")
 * IDs:       M01+
 * `date` uses ISO 8601 partial format: "2023", "2023-06", or "2023-06-14".
 */
export interface MilestoneNode extends NodeBase {
  type: "milestone";
  description: string;
  date: string;
  significance: MilestoneSignificance;
  source_url?: string;
}

/** Discriminated union of all node types. */
export type GraphNode = RiskNode | SolutionNode | StakeholderNode | MilestoneNode;

// ---------------------------------------------------------------------------
// 5. EDGES — relationships between nodes
// ---------------------------------------------------------------------------

/**
 * An Edge connects two nodes with a semantic relationship.
 *
 * Firestore: edges/{id}
 * Created by: migration script or Discovery Agent (via approved proposal).
 *
 * NOTE: "Edge" is a graph term for a *connection*, not a node type.
 * There is no "edge node" — if you mean a node, use GraphNode.
 */
export interface Edge {
  id: string;
  from_node: string;
  from_type: NodeType;
  to_node: string;
  to_type: NodeType;
  relationship: EdgeRelationship;
  properties?: {
    strength?: number;
    severity?: EdgeSeverity;
  };
  created_by: AgentId | "migration";
  createdAt: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// 6. PROPOSALS — agent-generated changes awaiting human review
// ---------------------------------------------------------------------------

/**
 * A GraphProposal is a pending change proposed by an agent.
 *
 * Firestore: graph_proposals/{id}
 *
 * Three shapes, discriminated by `proposal_type`:
 *   - new_node:    Discovery Agent proposes a new risk/solution/stakeholder
 *   - new_edge:    Discovery Agent proposes a relationship between existing nodes
 *   - update_node: Validator Agent proposes field changes to an existing node
 */
export interface GraphProposal {
  id: string;
  proposal_type: ProposalType;

  /** Present when proposal_type === "new_node". */
  node_data?: {
    type: NodeType;
    name: string;
    description: string;
    why_novel?: string;
    key_themes?: string[];
    suggested_parent_risk_id?: string;
  };

  /** Present when proposal_type === "new_edge". */
  edge_data?: {
    from_node: string;
    to_node: string;
    relationship: EdgeRelationship;
    properties?: object;
    reasoning: string;
  };

  /** Present when proposal_type === "update_node". */
  update_data?: {
    node_id: string;
    node_name: string;
    node_type?: NodeType;
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
  created_by: AgentId;
  status: ReviewStatus;
  admin_notes?: string;
  created_at: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// 7. EDITORIAL HOOKS — plain-language signal summaries for public feed
// ---------------------------------------------------------------------------

/**
 * An EditorialHook is a one-sentence, jargon-free summary of a signal,
 * written for a general audience.
 *
 * Firestore:  editorial_hooks/{id}
 * Created by: Feed Curator agent
 * Lifecycle:  pending → approved | rejected
 *
 * Canonical name is "editorial hook" (not "editor hook").
 */
export interface EditorialHook {
  id: string;
  signal_id: string;
  signal_title: string;
  hook_text: string;
  status: ReviewStatus;
  related_node_ids: string[];
  impact_score: number;
  source_name: string;
  source_credibility: number;
  published_date: string;
  generated_at: FirestoreTimestamp | null;
  reviewed_by: string | null;
  reviewed_at: FirestoreTimestamp | null;
}

// ---------------------------------------------------------------------------
// 8. FEED & SNAPSHOTS — derived/denormalized data for fast reads
// ---------------------------------------------------------------------------

/** A ranked item in the public feed (signal or milestone). */
export interface FeedItem {
  id: string;
  type: "signal" | "milestone";
  title: string;
  summary: string;
  source_name?: string;
  source_credibility?: number;
  impact_score: number;
  related_node_ids: string[];
  published_date: string;
  createdAt: FirestoreTimestamp;
}

/** Denormalized graph snapshot for the observatory visualisation. */
export interface GraphSnapshot {
  nodes: Array<{
    id: string;
    type: NodeType;
    name: string;
    velocity?: Velocity;
    implementation_stage?: ImplementationStage;
    significance?: MilestoneSignificance;
    score_2026?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    relationship: EdgeRelationship;
    properties?: object;
  }>;
  updatedAt: FirestoreTimestamp;
  nodeCount: number;
  edgeCount: number;
}

/** Per-node trending summary (signal activity + votes). */
export interface NodeSummary {
  node_id: string;
  node_type: NodeType;
  name: string;
  signal_count_7d: number;
  signal_count_30d: number;
  trending: TrendDirection;
  velocity?: Velocity;
  vote_up: number;
  vote_down: number;
  updatedAt: FirestoreTimestamp;
}

/** A single up/down vote on a node. */
export interface Vote {
  userId: string;
  value: 1 | -1;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// 9. AGENTS — runtime concepts (not stored as domain data)
// ---------------------------------------------------------------------------

/**
 * Agents are Cloud Functions that run on a schedule.  They are NOT domain
 * entities stored in Firestore — they are *processes* that create/modify
 * domain entities.
 *
 * | Agent ID          | Schedule       | Creates / Modifies                  |
 * |-------------------|----------------|-------------------------------------|
 * | signal-scout      | Every 6 hours  | Signal (pending)                    |
 * | discovery-agent   | Weekly Sun 10Z | GraphProposal (new_node, new_edge)  |
 * | validator-agent   | Weekly Mon 09Z | GraphProposal (update_node)         |
 * | feed-curator      | On demand      | FeedItem, EditorialHook             |
 * | data-lifecycle    | Daily          | Cleans old / orphaned documents     |
 * | graph-builder     | On demand      | GraphSnapshot, NodeSummary          |
 */

// ---------------------------------------------------------------------------
// 10. USERS & RBAC — re-exported for completeness
// ---------------------------------------------------------------------------

// UserRole and UserStatus are defined in the enums section above.
// Full User interface lives in ./user.ts — not duplicated here.

// ---------------------------------------------------------------------------
// 11. LEGACY TYPES — v1 compatibility (to be removed)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use RiskNode instead. v1 uses `risk_name`; v2 uses `name`.
 * Firestore: risks/{id}  (legacy collection)
 */
export interface LegacyRisk {
  id: string;
  risk_name: string;
  category: string;
  score_2026: number;
  score_2035: number;
  connected_to: string[];
  velocity: "High" | "Medium" | "Low" | "Critical";
  summary: string;
  deep_dive: string;
  who_affected: string[];
  timeline_narrative: TimelineNarrative;
  mitigation_strategies: string[];
  signal_evidence: LegacySignalEvidence[];
  expert_severity: number;
  public_perception: number;
}

/**
 * @deprecated Use SolutionNode instead. v1 uses `solution_title`; v2 uses `name`.
 * Firestore: solutions/{id}  (legacy collection)
 */
export interface LegacySolution {
  id: string;
  parent_risk_id: string;
  solution_title: string;
  solution_type: string;
  summary: string;
  deep_dive: string;
  implementation_stage: string;
  adoption_score_2026: number;
  adoption_score_2035: number;
  key_players: string[];
  barriers: string[];
  timeline_narrative: TimelineNarrative;
}

/**
 * @deprecated Use MilestoneNode instead. v1 uses `year: number`; v2 uses `date: string`.
 * Firestore: milestones/{id}  (legacy collection)
 */
export interface LegacyMilestone {
  id: string;
  year: number;
  title: string;
  description: string;
}

/** @deprecated Inline signal evidence from v1 risk documents. */
export interface LegacySignalEvidence {
  date: string;
  isNew: boolean;
  headline: string;
  source: string;
  url?: string;
  isLive?: boolean;
}

// ---------------------------------------------------------------------------
// INTERNAL — Firestore timestamp placeholder
// ---------------------------------------------------------------------------

/**
 * We use a type alias so this file doesn't import firebase/firestore directly,
 * keeping it framework-agnostic. Consumers should import Timestamp from
 * firebase/firestore and cast as needed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FirestoreTimestamp = import("firebase/firestore").Timestamp;
