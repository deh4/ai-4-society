import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import BadgeDrawer from "./BadgeDrawer";
import type { NodeSummary } from "../../types/graph";

const VELOCITY_RING: Record<string, string> = {
  Critical: "from-red-500 via-orange-500 to-red-600",
  High:     "from-orange-400 via-amber-500 to-orange-500",
  Medium:   "from-blue-400 via-cyan-400 to-blue-500",
  Low:      "from-gray-500 via-gray-400 to-gray-500",
};

const VELOCITY_BG: Record<string, string> = {
  Critical: "bg-red-950/80",
  High:     "bg-orange-950/80",
  Medium:   "bg-blue-950/80",
  Low:      "bg-gray-900/80",
};

const VELOCITY_TEXT: Record<string, string> = {
  Critical: "text-red-300",
  High:     "text-orange-300",
  Medium:   "text-blue-300",
  Low:      "text-gray-400",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

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
    .slice(0, 10);
}

export default function RiskReels() {
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
    <div className="w-full relative">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 shrink-0">
          Trending risks this week
        </p>

        {/* Scrolls on mobile; centered on desktop */}
        <div className="flex items-start gap-4 overflow-x-auto sm:flex-wrap sm:justify-center pb-2 scrollbar-hide flex-1">
        {trending.map((summary) => {
          const isActive = summary.node_id === selectedId;
          const velocity = summary.velocity ?? "Medium";
          const ring = VELOCITY_RING[velocity] ?? VELOCITY_RING.Medium;
          const bg = VELOCITY_BG[velocity] ?? VELOCITY_BG.Medium;
          const textColor = VELOCITY_TEXT[velocity] ?? VELOCITY_TEXT.Medium;

          return (
            <button
              key={summary.node_id}
              onClick={() => toggle(summary.node_id)}
              className="flex flex-col items-center gap-1.5 shrink-0 group"
            >
              {/* Gradient ring + circle avatar */}
              <div
                className={`p-[2.5px] rounded-full bg-gradient-to-br ${ring} transition-all duration-200 ${
                  isActive
                    ? "scale-110 shadow-[0_0_16px_rgba(255,100,50,0.4)]"
                    : "opacity-75 group-hover:opacity-100 group-hover:scale-105"
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-full ${bg} flex items-center justify-center border-[3px] border-[var(--bg-primary)]`}
                >
                  <span className={`text-sm font-bold ${textColor}`}>
                    {initials(summary.name)}
                  </span>
                </div>
              </div>

              {/* Label */}
              <span
                className={`text-[10px] w-16 text-center leading-tight line-clamp-2 transition-colors ${
                  isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200"
                }`}
              >
                {summary.name}
              </span>

              {/* Signal count */}
              {summary.signal_count_7d > 0 && (
                <span className="text-[9px] text-gray-600">
                  {summary.signal_count_7d} signal{summary.signal_count_7d !== 1 ? "s" : ""}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Detail drawer — absolute overlay, does not shift page layout */}
      <AnimatePresence>
        {selected && (
          <div className="absolute top-full left-0 right-0 z-50 pt-1">
            <BadgeDrawer
              key={selected.node_id}
              summary={selected}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
