import type { TimelineItem } from '../../lib/derivePeakYear';
import type { Risk, Solution } from '../../store/RiskContext';

interface SignalCardProps {
    item: TimelineItem;
    risk?: Risk;
    solution?: Solution;
    onTuneIn: () => void;
}

export default function SignalCard({ item, risk, solution, onTuneIn }: SignalCardProps) {
    if (item.type === 'milestone') {
        return (
            <div className="flex flex-col gap-4 p-6 font-mono">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">
                        MILESTONE
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold tracking-widest text-yellow-400">
                            {item.peakYear}
                        </span>
                        <span className="text-base text-white">{item.name}</span>
                    </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                    {item.description}
                </p>
            </div>
        );
    }

    const isRisk = item.type === 'risk';
    const summary = isRisk ? risk?.summary : solution?.summary;
    const category = isRisk ? risk?.category : solution?.solution_type;
    const velocity = item.velocity;
    const score2026 = item.score;
    const score2035 = isRisk ? risk?.score_2035 : solution?.adoption_score_2035;
    const delta = score2035 != null ? score2035 - score2026 : 0;
    const isWorsening = isRisk ? delta > 0 : delta < 0;
    const accentColor = isRisk ? 'text-red-400' : 'text-emerald-400';
    const accentBorder = isRisk ? 'border-red-400/30' : 'border-emerald-400/30';

    return (
        <div className="flex flex-col gap-4 p-6 font-mono">
            {/* Signal header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">
                        {isRisk ? 'RISK SIGNAL' : 'SOLUTION SIGNAL'}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold tracking-widest ${accentColor}`}>
                            {item.label}
                        </span>
                        <span className="text-base text-white">{item.name}</span>
                    </div>
                </div>
                <span className={`text-2xl font-bold shrink-0 ${accentColor}`}>{score2026}</span>
            </div>

            {/* Category + Velocity */}
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
                <span className="text-gray-400">
                    {category}
                </span>
                <span className={`px-2 py-0.5 rounded border ${accentBorder} ${accentColor}`}>
                    {velocity}
                </span>
            </div>

            {/* Summary */}
            <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">
                {summary}
            </p>

            {/* Score trajectory */}
            {score2035 != null && (
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-gray-600">2026</span>
                    <span className="text-white font-bold">{score2026}</span>
                    <span className="text-gray-600">{'━━━▶'}</span>
                    <span className="text-gray-600">2035</span>
                    <span className="text-white font-bold">{score2035}</span>
                    <span className={isWorsening ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-gray-500'}>
                        {isWorsening ? '▲ Rising' : delta < 0 ? '▼ Falling' : '─ Stable'}
                    </span>
                </div>
            )}

            {/* Peak year */}
            <div className="text-[10px] text-gray-600 uppercase tracking-widest">
                Est. peak impact: <span className="text-gray-400">{item.peakYear}</span>
            </div>

            {/* Tune In button */}
            <button
                onClick={onTuneIn}
                className="self-center mt-2 px-6 py-2 rounded border border-cyan-400/40 text-cyan-400 text-xs uppercase tracking-widest font-bold hover:bg-cyan-400/10 transition-colors"
            >
                Tune In →
            </button>
        </div>
    );
}
