import { useMemo, useState } from "react";
import { useGraph } from "../../store/GraphContext";
import NodeTypeFilter from "./NodeTypeFilter";
import type { NodeType, FeedItem } from "../../types/graph";

interface ObservatoryTimelineProps {
  onSelectNode: (nodeId: string) => void;
}

function groupByMonth(items: FeedItem[]): Map<string, FeedItem[]> {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const key = item.published_date
      ? item.published_date.slice(0, 7)
      : "Unknown";
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  return groups;
}

function formatMonth(key: string): string {
  if (key === "Unknown") return "Unknown Date";
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ObservatoryTimeline({
  onSelectNode,
}: ObservatoryTimelineProps) {
  const { feedItems, loading } = useGraph();
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    () => new Set<NodeType>(["risk", "solution", "milestone"])
  );

  const filtered = useMemo(() => {
    return [...feedItems]
      .filter((item) => {
        if (item.type === "milestone") return activeTypes.has("milestone");
        return activeTypes.has("risk") || activeTypes.has("solution");
      })
      .sort(
        (a, b) =>
          new Date(b.published_date).getTime() -
          new Date(a.published_date).getTime()
      );
  }, [feedItems, activeTypes]);

  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs animate-pulse">
        Loading timeline...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NodeTypeFilter active={activeTypes} onChange={setActiveTypes} />

      {filtered.length === 0 && (
        <div className="py-8 text-center text-gray-500 text-xs">
          No timeline items match your filters.
        </div>
      )}

      <div className="space-y-6">
        {[...grouped.entries()].map(([month, items]) => (
          <div key={month}>
            <h3 className="text-xs font-semibold text-gray-400 mb-2 sticky top-14 bg-[var(--bg-primary)] py-1 z-10">
              {formatMonth(month)}
            </h3>
            <div className="space-y-2 pl-4 border-l border-white/10">
              {items.map((item) => {
                const isMilestone = item.type === "milestone";
                return (
                  <div
                    key={item.id}
                    className={`relative pl-4 py-2 ${
                      isMilestone ? "bg-yellow-500/5 rounded" : ""
                    }`}
                  >
                    <div
                      className={`absolute -left-[21px] top-3 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-primary)] ${
                        isMilestone ? "bg-yellow-500" : "bg-white/30"
                      }`}
                    />

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-[10px] uppercase tracking-wider ${
                            isMilestone ? "text-yellow-400" : "text-gray-600"
                          }`}
                        >
                          {isMilestone ? "Milestone" : "Signal"}
                        </span>
                        <h4 className="text-sm font-medium leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                          {item.summary}
                        </p>
                        {item.related_node_ids.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {item.related_node_ids.slice(0, 3).map((id) => (
                              <button
                                key={id}
                                onClick={() => onSelectNode(id)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--accent-structural)] hover:bg-white/10"
                              >
                                {id}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-600 shrink-0">
                        {item.published_date
                          ? new Date(item.published_date).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
