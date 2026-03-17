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

  severity_hint?: "Critical" | "Emerging" | "Horizon";
  affected_groups?: string[];

  source_credibility: number;
  impact_score: number;

  related_nodes: Array<{
    node_id: string;
    node_type: NodeType;
    relevance: number;
  }>;
  related_node_ids: string[];
}
