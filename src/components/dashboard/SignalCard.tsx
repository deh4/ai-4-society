import type { TimelineItem } from '../../lib/derivePeakYear';
import type { Risk, Solution } from '../../store/RiskContext';

interface SignalCardProps {
    item: TimelineItem;
    risk?: Risk;
    solution?: Solution;
    onTuneIn: () => void;
}

export default function SignalCard({ item, risk, solution, onTuneIn }: SignalCardProps) {
    const isRisk = item.type === 'risk';
    const summary = isRisk ? risk?.summary : solution?.summary;
    const category = isRisk ? risk?.category : solution?.solution_type;
    const velocity = item.velocity;
    const score2026 = item.score;
    const score2035 = isRisk ? risk?.score_2035 : solution?.adoption_score_2035;
    const delta = score2035 != null ? score2035 - score2026 : 0;
    const isWorsening = isRisk ? delta > 0 : delta < 0;

    return (
        <div className="flex flex-col gap-4 p-6 font-mono">
            {/* Signal header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#1a5a2a] mb-1">
                        {isRisk ? 'RISK SIGNAL' : 'SOLUTION SIGNAL'}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold tracking-widest ${isRisk ? 'text-[#ff4444]' : 'text-[#00ff41]'}`}>
                            {item.label}
                        </span>
                        <span className="text-base text-[#00ff41]">{item.name}</span>
                    </div>
                </div>
                <span className="text-2xl font-bold text-[#00ff41] shrink-0">{score2026}</span>
            </div>

            {/* Category + Velocity */}
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
                <span className="text-[#00cc33]">
                    {category}
                </span>
                <span className={`px-2 py-0.5 rounded border ${isRisk ? 'border-[#ff4444]/30 text-[#ff4444]' : 'border-[#00ff41]/30 text-[#00ff41]'}`}>
                    {velocity}
                </span>
            </div>

            {/* Summary */}
            <p className="text-sm text-[#00cc33] leading-relaxed line-clamp-3">
                {summary}
            </p>

            {/* Score trajectory */}
            {score2035 != null && (
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-[#1a5a2a]">2026</span>
                    <span className="text-[#00ff41] font-bold">{score2026}</span>
                    <span className="text-[#1a5a2a]">{'━━━▶'}</span>
                    <span className="text-[#1a5a2a]">2035</span>
                    <span className="text-[#00ff41] font-bold">{score2035}</span>
                    <span className={isWorsening ? 'text-[#ff4444]' : 'text-[#00ff41]'}>
                        {isWorsening ? '▲ Rising' : delta < 0 ? '▼ Falling' : '─ Stable'}
                    </span>
                </div>
            )}

            {/* Peak year */}
            <div className="text-[10px] text-[#1a5a2a] uppercase tracking-widest">
                Est. peak impact: <span className="text-[#00cc33]">{item.peakYear}</span>
            </div>

            {/* Tune In button */}
            <button
                onClick={onTuneIn}
                className="self-center mt-2 px-6 py-2 rounded border border-[#00ff41]/40 text-[#00ff41] text-xs uppercase tracking-widest font-bold hover:bg-[#00ff41]/10 transition-colors"
            >
                Tune In →
            </button>
        </div>
    );
}
