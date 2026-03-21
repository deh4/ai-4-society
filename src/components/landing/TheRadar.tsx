// src/components/landing/TheRadar.tsx
import { Link } from "react-router-dom";
import { useGraph } from "../../store/GraphContext";
import { toSlug } from "../../lib/slugs";

const SCORE_GRADIENT: Record<string, string> = {
  Critical: "from-red-600 to-red-500",
  High: "from-orange-600 to-orange-500",
  Medium: "from-blue-600 to-blue-500",
  Low: "from-gray-600 to-gray-500",
};

export default function TheRadar() {
  const { snapshot, summaries } = useGraph();
  if (!snapshot) return null;

  // Get risk + solution nodes, sorted by score descending
  // Note: GraphSnapshot uses score_2026 for both risk and solution nodes
  const nodes = snapshot.nodes
    .filter((n) => n.type === "risk" || n.type === "solution")
    .sort((a, b) => (b.score_2026 ?? 0) - (a.score_2026 ?? 0))
    .slice(0, 10);

  return (
    <section className="py-8">
      <h2 className="text-[10px] uppercase tracking-[3px] text-gray-500 mb-4">
        The Radar
      </h2>
      <div className="flex flex-col gap-2">
        {nodes.map((node) => {
          const score = node.score_2026 ?? 0;
          const velocity = node.velocity ?? node.implementation_stage ?? "Medium";
          const summary = summaries.find((s) => s.node_id === node.id);
          const signalCount = summary?.signal_count_7d ?? 0;
          const trending = summary?.trending ?? "stable";
          const gradient = SCORE_GRADIENT[velocity] ?? SCORE_GRADIENT.Medium;

          return (
            <Link
              key={node.id}
              to={`/observatory/${toSlug(node.name)}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
              >
                {Math.round(score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 truncate group-hover:text-white transition-colors">
                  {node.name}
                </div>
                <div className="text-[9px] text-gray-600">
                  {velocity} · {signalCount} signals
                </div>
              </div>
              <div className="text-[10px] shrink-0">
                {trending === "rising" && <span className="text-red-400">↑</span>}
                {trending === "stable" && <span className="text-gray-600">→</span>}
                {trending === "declining" && <span className="text-green-400">↓</span>}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="text-center mt-6">
        <Link
          to="/observatory"
          className="inline-block text-xs px-6 py-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
        >
          Enter the Observatory
        </Link>
      </div>
    </section>
  );
}
