import type { NodeType } from "../../types/graph";
import { useGraph } from "../../store/GraphContext";

const PRINCIPLE_COLORS: Record<string, string> = {
  P01: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  P02: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  P03: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  P04: "bg-red-500/10 text-red-400 border-red-500/20",
  P05: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  P06: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  P07: "bg-green-500/10 text-green-400 border-green-500/20",
  P08: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  P09: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  P10: "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

interface NodeTypeFilterProps {
  active: Set<NodeType>;
  onChange: (types: Set<NodeType>) => void;
  activePrinciples?: Set<string>;
  onPrinciplesChange?: (principles: Set<string>) => void;
}

const NODE_TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: "risk",        label: "Risks",        color: "bg-red-500" },
  { type: "solution",   label: "Solutions",    color: "bg-green-500" },
  { type: "stakeholder",label: "Stakeholders", color: "bg-blue-500" },
  { type: "milestone",  label: "Milestones",   color: "bg-yellow-500" },
];

export default function NodeTypeFilter({
  active,
  onChange,
  activePrinciples,
  onPrinciplesChange,
}: NodeTypeFilterProps) {
  const { principleNodes } = useGraph();

  const toggle = (type: NodeType) => {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  };

  const togglePrinciple = (principleId: string) => {
    if (!onPrinciplesChange || !activePrinciples) return;
    const next = new Set(activePrinciples);
    if (next.has(principleId)) next.delete(principleId);
    else next.add(principleId);
    onPrinciplesChange(next);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {NODE_TYPES.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => toggle(type)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
              active.has(type)
                ? "border-white/30 text-white"
                : "border-white/10 text-gray-600"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color} ${
                active.has(type) ? "opacity-100" : "opacity-30"
              }`}
            />
            {label}
          </button>
        ))}
      </div>

      {principleNodes.length > 0 && onPrinciplesChange && activePrinciples && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
            Filter by Principle
          </div>
          <div className="flex flex-wrap gap-1">
            {principleNodes.map((p) => {
              const isActive = activePrinciples.has(p.id);
              const activeColor = PRINCIPLE_COLORS[p.id] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
              return (
                <button
                  key={p.id}
                  onClick={() => togglePrinciple(p.id)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                    isActive
                      ? activeColor
                      : "border-white/10 text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
