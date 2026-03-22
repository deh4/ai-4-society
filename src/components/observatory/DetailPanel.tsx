import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { graphClient } from "../../data";
import { useGraph } from "../../store/GraphContext";
import EvidenceList from "./EvidenceList";
import PerceptionGap from "./PerceptionGap";
import VoteButton from "./VoteButton";
import PrincipleTag from "../shared/PrincipleTag";
import { toSlug } from "../../lib/slugs";
import type { GraphNode, Edge, NodeType } from "../../types/graph";

function useIsMobile() {
  const [v, setV] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const h = (e: MediaQueryListEvent) => setV(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return v;
}

interface DetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  mode?: "overlay" | "inline" | "bottomSheet";
}

const TYPE_BADGES: Record<NodeType, { label: string; color: string }> = {
  risk: { label: "Risk", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  solution: { label: "Solution", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  stakeholder: { label: "Stakeholder", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  milestone: { label: "Milestone", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  principle: { label: "Principle", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

export default function DetailPanel({
  nodeId,
  onClose,
  onNavigate,
  mode = "overlay",
}: DetailPanelProps) {
  // Used only in the overlay (non-inline) path
  const isMobile = useIsMobile();
  const { summaries, snapshot } = useGraph();
  const [node, setNode] = useState<GraphNode | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeepDive, setShowDeepDive] = useState(false);

  const panelClass =
    mode === "inline"
      ? "" // inline has its own wrapper
      : mode === "bottomSheet"
        ? "" // parent wrapper handles positioning
        : isMobile
          ? "fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] border-t border-white/10 z-40 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
          : "fixed right-0 top-14 w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto";

  const panelHeight =
    mode === "inline"
      ? undefined
      : mode === "bottomSheet"
        ? undefined // parent wrapper handles height
        : isMobile
          ? { height: "calc(var(--vh-full, 100vh) * 0.58)" }
          : { height: "calc(var(--vh-full, 100vh) - 3.5rem)" };

  const panelAnim =
    mode === "bottomSheet"
      ? { initial: {}, animate: {}, exit: {} } // no animation — fixed panel
      : isMobile
        ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
        : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } };

  const summary = summaries.find((s) => s.node_id === nodeId);

  // Must be before any early returns (Rules of Hooks)
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (snapshot) {
      for (const n of snapshot.nodes) map.set(n.id, n.name);
    }
    return map;
  }, [snapshot]);

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
    const loadingInner = (
      <div className="text-gray-500 text-xs animate-pulse">Loading...</div>
    );
    if (mode === "inline" || mode === "bottomSheet") {
      return (
        <div className={mode === "inline" ? "overflow-y-auto rounded-lg border border-white/10 bg-[var(--bg-primary)] h-[calc(100vh-220px)] p-4" : "p-4"}>
          {loadingInner}
        </div>
      );
    }
    return (
      <motion.div
        {...panelAnim}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`${panelClass} p-4`}
        style={panelHeight}
      >
        {isMobile && <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />}
        {loadingInner}
      </motion.div>
    );
  }

  if (!node) {
    const notFoundInner = (
      <>
        <button onClick={onClose} className="text-xs text-gray-400 mb-4">
          ← Back
        </button>
        <div className="text-gray-500 text-xs">Node not found.</div>
      </>
    );
    if (mode === "inline" || mode === "bottomSheet") {
      return (
        <div className={mode === "inline" ? "overflow-y-auto rounded-lg border border-white/10 bg-[var(--bg-primary)] h-[calc(100vh-220px)] p-4" : "p-4"}>
          {notFoundInner}
        </div>
      );
    }
    return (
      <motion.div
        {...panelAnim}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`${panelClass} p-4`}
        style={panelHeight}
      >
        {isMobile && <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />}
        {notFoundInner}
      </motion.div>
    );
  }

  const badge = TYPE_BADGES[node.type];
  const nodeData = node as unknown as Record<string, unknown>;
  const deepDive = (nodeData.deep_dive as string) ?? "";
  const narrativeSummary = (nodeData.summary as string) ?? "";
  const hasNarrative = narrativeSummary.length > 0;
  const timelineNarrative = nodeData.timeline_narrative as
    | { near_term: string; mid_term: string; long_term: string }
    | undefined;

  // Connected nodes from edges, with names resolved from snapshot
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

  const mainContent = (
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

      {/* Summary or placeholder for newly-approved nodes */}
      {!hasNarrative && (
        <div className="text-xs text-gray-500 italic bg-white/5 rounded p-3">
          Content pending — the Validator Agent will enrich this node in its next weekly run.
        </div>
      )}
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

      {/* Related Principles */}
      {(nodeData.principles as string[] | undefined)?.length ? (
        <div>
          <h4 className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
            Related Principles
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(nodeData.principles as string[]).map((p) => (
              <PrincipleTag key={p} id={p} />
            ))}
          </div>
        </div>
      ) : null}

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

      {/* Evidence */}
      {(node.type === "risk" || node.type === "solution") && (
        <EvidenceList nodeId={nodeId} />
      )}

      {/* Connected Nodes */}
      {connectedNodes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
            Connected ({connectedNodes.length})
          </h4>
          <div className="space-y-1">
            {connectedNodes.map((cn) => {
              const snapshotNode = snapshot?.nodes.find((n) => n.id === cn.id);
              const nodeType = snapshotNode?.type ?? "stakeholder";
              const typeColors: Record<string, string> = {
                risk: "text-red-400",
                solution: "text-green-400",
                stakeholder: "text-blue-400",
                milestone: "text-yellow-400",
              };
              const nameColor = typeColors[nodeType] ?? "text-[var(--accent-structural)]";
              return (
                <a
                  key={`${cn.id}-${cn.relationship}`}
                  href={`/observatory/${toSlug(cn.name)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(cn.id);
                  }}
                  className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-white/5 hover:bg-white/[0.08] transition-colors"
                >
                  <span className="text-gray-500 text-[10px] italic shrink-0">
                    {cn.direction === "out" ? cn.relationship : `← ${cn.relationship}`}
                  </span>
                  <span className={`${nameColor} truncate`}>
                    {cn.name}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
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
  );

  if (mode === "inline") {
    return (
      <div className="overflow-y-auto rounded-lg border border-white/10 bg-[var(--bg-primary)] h-[calc(100vh-220px)]">
        {mainContent}
      </div>
    );
  }

  if (mode === "bottomSheet") {
    return <>{mainContent}</>;
  }

  return (
    <motion.div
      {...panelAnim}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={panelClass}
      style={panelHeight}
    >
      {/* Drag handle (mobile only) */}
      {isMobile && (
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-1 mb-1" />
      )}
      {mainContent}
    </motion.div>
  );
}
