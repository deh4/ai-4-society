interface PerceptionGapProps {
  expertSeverity: number; // 0-100
  voteUp: number;
  voteDown: number;
}

export default function PerceptionGap({
  expertSeverity,
  voteUp,
  voteDown,
}: PerceptionGapProps) {
  const total = voteUp + voteDown;
  const communityScore = total > 0 ? Math.round((voteUp / total) * 100) : 50;
  const gap = Math.abs(expertSeverity - communityScore);

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
        Perception Gap
      </h4>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 shrink-0">Expert</span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${expertSeverity}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">
          {expertSeverity}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 shrink-0">
          Community
        </span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent-structural)] rounded-full transition-all"
            style={{ width: `${communityScore}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">
          {communityScore}
        </span>
      </div>

      {gap > 20 && (
        <p className="text-[10px] text-yellow-500">
          {gap}-point gap between expert assessment and community perception
        </p>
      )}
    </div>
  );
}
