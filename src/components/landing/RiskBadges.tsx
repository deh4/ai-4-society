import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import BadgeDrawer from "./BadgeDrawer";
import type { NodeSummary } from "../../types/graph";

function selectTrendingRisks(
  summaries: NodeSummary[],
  preferenceIds: Set<string>
): NodeSummary[] {
  const velocityWeight: Record<string, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };
  const PREF_BOOST = 3;

  return summaries
    .filter((s) => s.node_type === "risk")
    .sort((a, b) => {
      const aScore =
        a.signal_count_7d * 2 +
        (velocityWeight[a.velocity ?? "Medium"] ?? 2) +
        (preferenceIds.has(a.node_id) ? PREF_BOOST : 0);
      const bScore =
        b.signal_count_7d * 2 +
        (velocityWeight[b.velocity ?? "Medium"] ?? 2) +
        (preferenceIds.has(b.node_id) ? PREF_BOOST : 0);
      return bScore - aScore;
    })
    .slice(0, 5);
}

export default function RiskBadges() {
  const { summaries, loading } = useGraph();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefIds] = useState(
    () => new Set(getLocalPreferences().interests)
  );

  const trending = useMemo(
    () => selectTrendingRisks(summaries, prefIds),
    [summaries, prefIds]
  );

  if (loading || trending.length === 0) return null;

  const selected = trending.find((s) => s.node_id === selectedId) ?? null;

  const toggle = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {trending.map((summary) => {
          const isActive = summary.node_id === selectedId;
          const isMostActive =
            summary.node_id === trending[0]?.node_id && !selectedId;

          return (
            <button
              key={summary.node_id}
              onClick={() => toggle(summary.node_id)}
              className={`shrink-0 text-xs px-4 py-2 rounded-full border transition-all ${
                isActive
                  ? "border-red-500/60 bg-red-500/15 text-red-400"
                  : "border-white/15 text-gray-400 hover:border-white/30 hover:text-white"
              } ${isMostActive ? "animate-pulse-subtle" : ""}`}
            >
              {summary.name}
              {summary.signal_count_7d > 0 && (
                <span className="ml-1.5 text-[10px] text-gray-600">
                  {summary.signal_count_7d}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <BadgeDrawer
            key={selected.node_id}
            summary={selected}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
