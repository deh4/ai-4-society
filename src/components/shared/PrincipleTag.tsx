const PRINCIPLE_LABELS: Record<string, string> = {
  P01: "Accountability",
  P02: "Fairness",
  P03: "Transparency",
  P04: "Safety",
  P05: "Privacy",
  P06: "Human Oversight",
  P07: "Sustainability",
  P08: "Wellbeing",
  P09: "Democracy",
  P10: "Intl. Cooperation",
};

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

export default function PrincipleTag({ id }: { id: string }) {
  const label = PRINCIPLE_LABELS[id] ?? id;
  const color = PRINCIPLE_COLORS[id] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}
