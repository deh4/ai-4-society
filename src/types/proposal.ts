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
    node_type?: string;
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
