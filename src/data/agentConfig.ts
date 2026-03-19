import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// --- Types ---

export interface AgentSourceConfig {
  enabled: boolean;
  credibilityOverride?: number;
}

export interface AgentConfig {
  sources: Record<string, AgentSourceConfig>;
  paused: boolean;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
}

export interface SourceFetchHealth {
  status: "ok" | "empty" | "error";
  count: number;
  error?: string;
}

export interface AgentHealthDoc {
  lastRunAt: Timestamp | null;
  lastRunOutcome: string;
  lastError: string | null;
  lastErrorAt: Timestamp | null;
  consecutiveErrors: number;
  consecutiveEmptyRuns: number;
  lastRunTokens: { input: number; output: number };
  lastRunCost: CostBreakdown;
  totalTokensToday: { input: number; output: number };
  totalTokensMonth: { input: number; output: number };
  estimatedCostMonth: CostBreakdown;
  lastRunArticlesFetched: number;
  lastRunSignalsStored: number;
  totalSignalsLifetime: number;
  sourceHealth?: Record<string, SourceFetchHealth>;
}

export interface CostBreakdown {
  geminiTokens: number;
  firestoreReads: number;
  firestoreWrites: number;
  functionsCompute: number;
  total: number;
}

export interface AgentRunSummary {
  id: string;
  startedAt: Timestamp;
  completedAt: Timestamp;
  duration: number;
  outcome: string;
  error: string | null;
  metrics: {
    articlesFetched: number;
    signalsStored: number;
    geminiCalls: number;
    tokensInput: number;
    tokensOutput: number;
    firestoreReads: number;
    firestoreWrites: number;
  };
  modelId: string;
  cost: CostBreakdown;
  sourcesUsed: string[];
}

// --- Agent IDs ---

export const AGENT_IDS = [
  "signal-scout",
  "discovery-agent",
  "validator-agent",
  "data-lifecycle",
  "graph-builder",
  "feed-curator",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_LABELS: Record<AgentId, string> = {
  "signal-scout": "Signal Scout",
  "discovery-agent": "Discovery Agent",
  "validator-agent": "Validator Agent",
  "data-lifecycle": "Data Lifecycle",
  "graph-builder": "Graph Builder",
  "feed-curator": "Feed Curator",
};

export const AGENT_SCHEDULES: Record<AgentId, string> = {
  "signal-scout": "Every 6 hours",
  "discovery-agent": "Weekly (Sun 10:00 UTC)",
  "validator-agent": "Weekly (Mon 09:00 UTC)",
  "data-lifecycle": "Daily (03:00 UTC)",
  "graph-builder": "On demand",
  "feed-curator": "Every 6 hours",
};

// --- Read functions ---

export async function getAgentConfig(agentId: string): Promise<AgentConfig | null> {
  const ref = doc(db, "agents", agentId, "config", "current");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AgentConfig;
}

export async function getAgentHealth(agentId: string): Promise<AgentHealthDoc | null> {
  const ref = doc(db, "agents", agentId, "health", "latest");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AgentHealthDoc;
}

export async function getAgentRuns(
  agentId: string,
  maxResults = 30
): Promise<AgentRunSummary[]> {
  const runsRef = collection(db, "agents", agentId, "runs");
  const q = query(runsRef, orderBy("startedAt", "desc"), limit(maxResults));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentRunSummary));
}

export async function getRecentRunsByOutcome(
  agentId: string,
  days = 30
): Promise<AgentRunSummary[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const runsRef = collection(db, "agents", agentId, "runs");
  const q = query(
    runsRef,
    where("startedAt", ">=", Timestamp.fromDate(cutoff)),
    orderBy("startedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentRunSummary));
}

// --- Write functions ---

export async function updateAgentConfig(
  agentId: string,
  config: Partial<AgentConfig>,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      ...config,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function toggleAgentSource(
  agentId: string,
  sourceId: string,
  enabled: boolean,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      sources: { [sourceId]: { enabled } },
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function setAgentPaused(
  agentId: string,
  paused: boolean,
  updatedBy: string
): Promise<void> {
  const ref = doc(db, "agents", agentId, "config", "current");
  await setDoc(
    ref,
    {
      paused,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}
