// src/components/observatory/RisksSidebar.tsx
import { useGraph } from "../../store/GraphContext";

const SCORE_GRADIENT: Record<string, string> = {
  Critical: "from-red-600 to-red-500",
  High: "from-orange-600 to-orange-500",
  Medium: "from-blue-600 to-blue-500",
  Low: "from-gray-600 to-gray-500",
};

interface RisksSidebarProps {
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

export default function RisksSidebar({ selectedNodeId, onSelectNode }: RisksSidebarProps) {
  const { snapshot, summaries } = useGraph();
  if (!snapshot) return null;

  const nodes = snapshot.nodes
    .filter((n) => n.type === "risk" || n.type === "solution")
    .sort((a, b) => (b.score_2026 ?? 0) - (a.score_2026 ?? 0))
    .slice(0, 20);

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="text-[10px] uppercase tracking-[3px] text-gray-500 px-3 py-3 sticky top-0 bg-[var(--bg-primary)] z-10">
        Risk Radar
      </h3>
      <div className="flex flex-col gap-0.5 px-1">
        {nodes.map((node) => {
          const score = node.score_2026 ?? 0;
          const velocity = node.velocity ?? node.implementation_stage ?? "Medium";
          const summary = summaries.find((s) => s.node_id === node.id);
          const signalCount = summary?.signal_count_7d ?? 0;
          const trending = summary?.trending ?? "stable";
          const gradient = SCORE_GRADIENT[velocity] ?? SCORE_GRADIENT.Medium;
          const isSelected = selectedNodeId === node.id;

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                isSelected
                  ? "bg-white/10 ring-1 ring-white/20"
                  : "hover:bg-white/5"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}
              >
                {Math.round(score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-200 truncate">
                  {node.name}
                </div>
                <div className="text-[9px] text-gray-600">
                  {signalCount}sig · {velocity}
                </div>
              </div>
              <div className="text-[9px] shrink-0">
                {trending === "rising" && <span className="text-red-400">↑</span>}
                {trending === "stable" && <span className="text-gray-600">→</span>}
                {trending === "declining" && <span className="text-green-400">↓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
