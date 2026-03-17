import { useState, useEffect } from "react";
import {
  type AgentId,
  type AgentHealthDoc,
  AGENT_IDS,
  AGENT_LABELS,
  AGENT_SCHEDULES,
  getAgentHealth,
} from "../../data/agentConfig";
import { AgentDetailPanel } from "./AgentDetailPanel";

export function AgentsSection() {
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealthDoc | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      AGENT_IDS.map(async (id) => {
        const health = await getAgentHealth(id);
        return [id, health] as const;
      })
    ).then((results) => {
      const map: Record<string, AgentHealthDoc | null> = {};
      for (const [id, health] of results) {
        map[id] = health;
      }
      setHealthMap(map);
      setLoading(false);
    });
  }, []);

  if (selectedAgent) {
    return (
      <AgentDetailPanel
        agentId={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  if (loading) {
    return <p className="text-white/40 text-center py-8">Loading agents...</p>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white mb-4">Agent Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {AGENT_IDS.map((id) => {
          const health = healthMap[id];
          const lastRun = health?.lastRunAt?.toDate?.()
            ?? (health?.lastRunAt?.seconds ? new Date(health.lastRunAt.seconds * 1000) : null);
          const hoursAgo = lastRun
            ? Math.round((Date.now() - lastRun.getTime()) / 3600_000)
            : null;

          const statusColor =
            !health || (health.consecutiveErrors ?? 0) >= 2
              ? "border-red-500/50"
              : (health.consecutiveEmptyRuns ?? 0) >= 3
              ? "border-yellow-500/50"
              : "border-green-500/50";

          return (
            <button
              key={id}
              onClick={() => setSelectedAgent(id)}
              className={`text-left bg-white/5 hover:bg-white/8 rounded-lg p-4 border-l-4 ${statusColor} transition-colors`}
            >
              <h3 className="text-sm font-medium text-white/90">
                {AGENT_LABELS[id]}
              </h3>
              <p className="text-[10px] text-white/40 mt-0.5">
                {AGENT_SCHEDULES[id]}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                <span>
                  {hoursAgo !== null ? `${hoursAgo}h ago` : "No runs"}
                </span>
                <span>{health?.lastRunOutcome ?? "—"}</span>
                {health?.estimatedCostMonth && (
                  <span>${health.estimatedCostMonth.total.toFixed(4)}/mo</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
