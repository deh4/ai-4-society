import type { Timestamp } from "firebase/firestore";

export type NodeType = "risk" | "solution" | "stakeholder" | "milestone" | "principle";

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
  public_perception: number; // carried from v1, replaced by vote aggregates over time
  timeline_narrative: {
    near_term: string;
    mid_term: string;
    long_term: string;
  };
  mitigation_strategies: string[];
  principles: string[];
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
  score_2026: number;
  score_2035: number;
  key_players: string[];
  barriers: string[];
  principles: string[];
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

export interface PrincipleNode {
  id: string;
  type: "principle";
  name: string;
  summary: string;
  oecd_reference: string;
  createdAt: Timestamp;
}

export type GraphNode = RiskNode | SolutionNode | StakeholderNode | MilestoneNode | PrincipleNode;

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
  approved_by?: string;
  createdAt: Timestamp;
}

export interface GraphSnapshot {
  nodes: Array<{
    id: string;
    type: "risk" | "solution" | "milestone";
    name: string;
    velocity?: string;
    implementation_stage?: string;
    significance?: string;
    score_2026?: number;
    principles?: string[];
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
  published_date: string;
  createdAt: Timestamp;
}

export interface Vote {
  userId: string;
  value: 1 | -1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
