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
