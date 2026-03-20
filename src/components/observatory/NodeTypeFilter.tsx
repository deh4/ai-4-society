import type { NodeType } from "../../types/graph";

interface NodeTypeFilterProps {
  active: Set<NodeType>;
  onChange: (types: Set<NodeType>) => void;
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
}: NodeTypeFilterProps) {
  const toggle = (type: NodeType) => {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  };

  return (
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
  );
}
