import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { NodeSummary, GraphNode } from "../../types/graph";
import { graphClient } from "../../data";

interface BadgeDrawerProps {
  summary: NodeSummary;
  onClose: () => void;
}

const VELOCITY_ICONS: Record<string, string> = {
  Critical: "🔥",
  High: "↑",
  Medium: "→",
  Low: "↓",
};

export default function BadgeDrawer({ summary, onClose }: BadgeDrawerProps) {
  const navigate = useNavigate();
  const [node, setNode] = useState<GraphNode | null>(null);
  const [loadingNode, setLoadingNode] = useState(true);

  useEffect(() => {
    let cancelled = false;
    graphClient.getNode(summary.node_id).then((n) => {
      if (!cancelled) {
        setNode(n);
        setLoadingNode(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingNode(false);
    });
    return () => { cancelled = true; };
  }, [summary.node_id]);

  // RiskNode and SolutionNode have `summary`; Stakeholder/Milestone have `description`.
  // Narrow via type discriminant for full TypeScript safety.
  const rawDescription =
    node && (node.type === "risk" || node.type === "solution") ? node.summary : null;
  const description = rawDescription
    ? rawDescription.length > 120 ? rawDescription.slice(0, 119) + "…" : rawDescription
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 mt-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold">{summary.name}</h3>
            {summary.velocity && (
              <span className="text-xs text-gray-400">
                {VELOCITY_ICONS[summary.velocity] ?? ""} {summary.velocity}{" "}
                velocity
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <div className="mb-3 min-h-[2.5rem]">
          {loadingNode ? (
            <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : description ? (
            <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span>
            {summary.signal_count_7d} signal
            {summary.signal_count_7d !== 1 ? "s" : ""} this week
          </span>
          <span
            className={
              summary.trending === "rising"
                ? "text-red-400"
                : summary.trending === "declining"
                  ? "text-green-400"
                  : "text-gray-500"
            }
          >
            {summary.trending === "rising"
              ? "↑ Rising"
              : summary.trending === "declining"
                ? "↓ Declining"
                : "— Stable"}
          </span>
        </div>

        <button
          onClick={() => navigate(`/observatory/${summary.node_id}`)}
          className="text-xs font-medium text-[var(--accent-structural)] hover:underline"
        >
          Explore in Observatory →
        </button>
      </div>
    </motion.div>
  );
}
