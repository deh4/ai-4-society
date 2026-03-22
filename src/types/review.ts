import type { Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Signal quality metadata (from Discovery Agent)
// ---------------------------------------------------------------------------

export interface SignalQualityMeta {
  summary: string;
  unmatched_count: number;
  rejected_count: number;
  pending_count: number;
  approved_count: number;
}

// ---------------------------------------------------------------------------
// Review item types — discriminated union for all reviewable entities
// ---------------------------------------------------------------------------

export type ReviewItemType = "risk-signal" | "solution-signal" | "discovery" | "validation";

/** Fields common to all reviewable items */
interface ReviewItemBase {
  id: string;
  status: string;
  createdAt: { seconds: number } | null;
  /** Task assignment */
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Timestamp | null;
}

/** A signal classified as risk or both */
export interface RiskSignalItem extends ReviewItemBase {
  type: "risk-signal";
  title: string;
  summary: string;
  signalType: string; // "risk" | "both"
  riskCategories: string[];
  solutionIds: string[];
  severityHint?: string;
  confidenceScore?: number;
  sourceName?: string;
  sourceUrl?: string;
  relatedNodeIds: string[];
  // V3 classification dimensions
  harm_status?: "incident" | "hazard" | null;
  principles?: string[];
}

/** A signal classified as solution or both */
export interface SolutionSignalItem extends ReviewItemBase {
  type: "solution-signal";
  title: string;
  summary: string;
  signalType: string; // "solution" | "both"
  riskCategories: string[];
  solutionIds: string[];
  severityHint?: string;
  confidenceScore?: number;
  sourceName?: string;
  sourceUrl?: string;
  relatedNodeIds: string[];
  // V3 classification dimensions
  harm_status?: "incident" | "hazard" | null;
  principles?: string[];
}

/** A discovery proposal (new_node or new_edge) */
export interface DiscoveryItem extends ReviewItemBase {
  type: "discovery";
  title: string;
  summary: string;
  proposedName?: string;
  proposalType: string; // "new_node" | "new_edge"
  skeleton: Record<string, unknown>;
  supportingSignalIds: string[];
  confidence?: number;
  signalQuality?: SignalQualityMeta;
}

/** A validation proposal (update_node) */
export interface ValidationItem extends ReviewItemBase {
  type: "validation";
  title: string;
  summary: string;
  documentType?: string;
  documentId?: string;
  documentName?: string;
  proposedChanges: Record<string, { current_value: unknown; proposed_value: unknown }>;
  overallReasoning?: string;
  confidence?: number;
}

export type ReviewItem = RiskSignalItem | SolutionSignalItem | DiscoveryItem | ValidationItem;
