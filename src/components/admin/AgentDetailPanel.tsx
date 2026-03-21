import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import {
  type AgentId,
  type AgentHealthDoc,
  type AgentConfig,
  type AgentRunSummary,
  AGENT_LABELS,
  AGENT_SCHEDULES,
  getAgentConfig,
  getAgentHealth,
  getRecentRunsByOutcome,
  setAgentPaused,
} from "../../data/agentConfig";
import { RunHistoryChart } from "./RunHistoryChart";
import { SourceConfigTable } from "./SourceConfigTable";
import { useAuth } from "../../store/AuthContext";

interface Props {
  agentId: AgentId;
  onBack: () => void;
}

// Map agent IDs to v2 trigger callable names
const TRIGGER_MAP: Partial<Record<AgentId, string>> = {
  "signal-scout": "triggerSignalScout",
  "discovery-agent": "triggerDiscovery",
  "validator-agent": "triggerValidator",
  "data-lifecycle": "dataLifecycleV2",
  "graph-builder": "buildGraph",
  "feed-curator": "triggerFeedCurator",
  "podcast": "triggerPodcast",
};

export function AgentDetailPanel({ agentId, onBack }: Props) {
  const { user } = useAuth();
  const [health, setHealth] = useState<AgentHealthDoc | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timestamp = Date.now();

    Promise.all([
      getAgentHealth(agentId),
      getAgentConfig(agentId),
      getRecentRunsByOutcome(agentId, 30),
    ]).then(([h, c, r]) => {
      if (cancelled) return;
      setHealth(h);
      setConfig(c);
      setRuns(r);
      setNow(timestamp);
      setDataReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleTrigger = async () => {
    const callableName = TRIGGER_MAP[agentId];
    if (!callableName) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const fn = httpsCallable(functions, callableName);
      const result = await fn({});
      const data = result.data as { message?: string };
      setTriggerResult(data.message ?? "Agent triggered successfully");
    } catch (err) {
      setTriggerResult(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    setTriggering(false);
  };

  const handlePauseToggle = async () => {
    if (!user) return;
    const newPaused = !(config?.paused ?? false);
    await setAgentPaused(agentId, newPaused, user.uid);
    setConfig((prev) =>
      prev ? { ...prev, paused: newPaused } : prev
    );
  };

  if (!dataReady) {
    return <p className="text-white/40 text-center py-8">Loading agent data...</p>;
  }

  const healthColor =
    !health || (health.consecutiveErrors ?? 0) >= 2
      ? "text-red-400"
      : (health.consecutiveEmptyRuns ?? 0) >= 3
      ? "text-yellow-400"
      : "text-green-400";

  const lastRun = health?.lastRunAt?.toDate?.()
    ?? (health?.lastRunAt?.seconds ? new Date(health.lastRunAt.seconds * 1000) : null);
  const hoursAgo = lastRun && now ? Math.round((now - lastRun.getTime()) / 3600_000) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-white/50 hover:text-white text-sm"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-white">
          {AGENT_LABELS[agentId]}
        </h2>
        <span className={`text-xs ${healthColor}`}>
          {health?.lastRunOutcome ?? "unknown"}
        </span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Last Run" value={hoursAgo !== null ? `${hoursAgo}h ago` : "Never"} />
        <StatCard label="Schedule" value={AGENT_SCHEDULES[agentId]} />
        <StatCard
          label="Errors"
          value={String(health?.consecutiveErrors ?? 0)}
          highlight={!!health && health.consecutiveErrors > 0}
        />
        <StatCard
          label="Cost (month)"
          value={`$${health?.estimatedCostMonth?.total?.toFixed(4) ?? "0.0000"}`}
        />
      </div>

      {/* Last run details */}
      {health && (
        <div className="bg-white/5 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-medium text-white/70">Last Run Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-white/60">
            <span>Articles fetched: {health.lastRunArticlesFetched}</span>
            <span>Signals stored: {health.lastRunSignalsStored}</span>
            <span>Tokens in: {health.lastRunTokens?.input?.toLocaleString() ?? 0}</span>
            <span>Tokens out: {health.lastRunTokens?.output?.toLocaleString() ?? 0}</span>
            <span>Run cost: ${health.lastRunCost?.total?.toFixed(4) ?? "0"}</span>
            <span>Lifetime signals: {health.totalSignalsLifetime ?? 0}</span>
          </div>
          {health.lastError && (
            <p className="text-xs text-red-400 mt-2">
              Last error: {health.lastError}
            </p>
          )}
        </div>
      )}

      {/* Run history chart */}
      <div className="bg-white/5 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white/70 mb-3">Run History (30 days)</h3>
        <RunHistoryChart runs={runs} />
      </div>

      {/* Source config (only for signal-scout) */}
      {agentId === "signal-scout" && (
        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white/70 mb-3">Source Configuration</h3>
          <SourceConfigTable
            agentId={agentId}
            config={config}
            uid={user?.uid ?? ""}
            sourceHealth={health?.sourceHealth}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {TRIGGER_MAP[agentId] && (
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
          >
            {triggering ? "Running..." : "Trigger Run"}
          </button>
        )}
        <button
          onClick={handlePauseToggle}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            config?.paused
              ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
              : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
          }`}
        >
          {config?.paused ? "Resume" : "Pause"}
        </button>
        {triggerResult && (
          <span className="text-xs text-white/50">{triggerResult}</span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-red-400" : "text-white/80"}`}>
        {value}
      </p>
    </div>
  );
}
