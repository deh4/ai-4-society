import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { graphClient } from "../../data";
import { useGraph } from "../../store/GraphContext";
import EvidenceList from "./EvidenceList";
import PerceptionGap from "./PerceptionGap";
import VoteButton from "./VoteButton";
import type { GraphNode, Edge, NodeType } from "../../types/graph";

interface DetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

const TYPE_BADGES: Record<NodeType, { label: string; color: string }> = {
  risk: { label: "Risk", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  solution: { label: "Solution", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  stakeholder: { label: "Stakeholder", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  milestone: { label: "Milestone", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

export default function DetailPanel({
  nodeId,
  onClose,
  onNavigate,
}: DetailPanelProps) {
  const { summaries, snapshot } = useGraph();
  const [node, setNode] = useState<GraphNode | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeepDive, setShowDeepDive] = useState(false);

  const summary = summaries.find((s) => s.node_id === nodeId);

  useEffect(() => {
    setLoading(true);
    setShowDeepDive(false);
    Promise.all([graphClient.getNode(nodeId), graphClient.getEdges(nodeId)])
      .then(([n, e]) => {
        setNode(n);
        setEdges(e);
      })
      .catch((err) => console.error("DetailPanel error:", err))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading) {
    return (
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto p-4"
      >
        <div className="text-gray-500 text-xs animate-pulse">Loading...</div>
      </motion.div>
    );
  }

  if (!node) {
    return (
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto p-4"
      >
        <button onClick={onClose} className="text-xs text-gray-400 mb-4">
          ← Back
        </button>
        <div className="text-gray-500 text-xs">Node not found.</div>
      </motion.div>
    );
  }

  const badge = TYPE_BADGES[node.type];
  const hasNarrative = "summary" in node && (node as { summary?: string }).summary;
  const nodeData = node as unknown as Record<string, unknown>;
  const deepDive = (nodeData.deep_dive as string) ?? "";
  const narrativeSummary = (nodeData.summary as string) ?? "";
  const timelineNarrative = nodeData.timeline_narrative as
    | { near_term: string; mid_term: string; long_term: string }
    | undefined;

  // Connected nodes from edges, with names resolved from snapshot
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (snapshot) {
      for (const n of snapshot.nodes) map.set(n.id, n.name);
    }
    return map;
  }, [snapshot]);

  const connectedNodes = edges.map((e) => {
    const isOutgoing = e.from_node === nodeId;
    const otherId = isOutgoing ? e.to_node : e.from_node;
    return {
      id: otherId,
      name: nodeNameMap.get(otherId) ?? otherId,
      relationship: e.relationship,
      direction: isOutgoing ? "out" : "in",
    };
  });

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto"
    >
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-white mb-2 block"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold leading-tight">{node.name}</h2>
            <span
              className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${badge.color}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Summary */}
        {hasNarrative && (
          <div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {narrativeSummary}
            </p>
            {deepDive && (
              <div className="mt-2">
                <button
                  onClick={() => setShowDeepDive(!showDeepDive)}
                  className="text-[10px] text-[var(--accent-structural)] hover:underline"
                >
                  {showDeepDive ? "Hide deep dive ▲" : "Show deep dive ▼"}
                </button>
                {showDeepDive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-line"
                  >
                    {deepDive}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Voting (risks and solutions only) */}
        {(node.type === "risk" || node.type === "solution") && summary && (
          <VoteButton
            nodeId={nodeId}
            voteUp={summary.vote_up}
            voteDown={summary.vote_down}
          />
        )}

        {/* Perception Gap (risks only) */}
        {node.type === "risk" && summary && (
          <PerceptionGap
            expertSeverity={(nodeData.expert_severity as number) ?? 50}
            voteUp={summary.vote_up}
            voteDown={summary.vote_down}
          />
        )}

        {/* Timeline Projection */}
        {timelineNarrative && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Timeline Projection
            </h4>
            {(["near_term", "mid_term", "long_term"] as const).map((period) => {
              const text = timelineNarrative[period];
              if (!text) return null;
              const labels = {
                near_term: "Near Term",
                mid_term: "Mid Term",
                long_term: "Long Term",
              };
              return (
                <div key={period} className="bg-white/5 rounded p-2">
                  <span className="text-[10px] text-gray-500 font-medium">
                    {labels[period]}
                  </span>
                  <p className="text-xs text-gray-300 mt-0.5">{text}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Connected Nodes */}
        {connectedNodes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Connected ({connectedNodes.length})
            </h4>
            <div className="space-y-1">
              {connectedNodes.map((cn) => (
                <button
                  key={`${cn.id}-${cn.relationship}`}
                  onClick={() => onNavigate(cn.id)}
                  className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-white/5 hover:bg-white/[0.08] transition-colors"
                >
                  <span className="text-gray-500 text-[10px] italic shrink-0">
                    {cn.direction === "out" ? cn.relationship : `← ${cn.relationship}`}
                  </span>
                  <span className="text-[var(--accent-structural)] truncate">
                    {cn.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Related Milestones (highlighted separately) */}
        {connectedNodes.filter((cn) => {
          const snapshotNode = snapshot?.nodes.find((n) => n.id === cn.id);
          return snapshotNode?.type === "milestone";
        }).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Related Milestones
            </h4>
            <div className="space-y-1">
              {connectedNodes
                .filter((cn) => {
                  const snapshotNode = snapshot?.nodes.find((n) => n.id === cn.id);
                  return snapshotNode?.type === "milestone";
                })
                .map((cn) => (
                  <button
                    key={cn.id}
                    onClick={() => onNavigate(cn.id)}
                    className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-yellow-500/5 border border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                  >
                    <span className="text-yellow-400">⬢</span>
                    <span className="text-yellow-300">{cn.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        {(node.type === "risk" || node.type === "solution") && (
          <EvidenceList nodeId={nodeId} />
        )}

        {/* Signal count summary */}
        {summary && (
          <div className="text-[10px] text-gray-600 pt-2 border-t border-white/5">
            {summary.signal_count_7d} signals this week ·{" "}
            {summary.signal_count_30d} this month ·{" "}
            <span
              className={
                summary.trending === "rising"
                  ? "text-red-400"
                  : summary.trending === "declining"
                    ? "text-green-400"
                    : ""
              }
            >
              {summary.trending}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
