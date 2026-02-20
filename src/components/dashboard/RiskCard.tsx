import type { Risk } from '../../store/RiskContext';

interface RiskCardProps {
    risk: Risk;
    index: number;
    onClick: (id: string) => void;
}

const VELOCITY_COLORS: Record<string, { accent: string; text: string; bg: string }> = {
    Critical: { accent: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
    High: { accent: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10' },
    Medium: { accent: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10' },
    Low: { accent: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10' },
    Emerging: { accent: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' },
};

export default function RiskCard({ risk, index, onClick }: RiskCardProps) {
    const colors = VELOCITY_COLORS[risk.velocity] ?? VELOCITY_COLORS.Medium;
    const isCritical = risk.velocity === 'Critical';
    const newSignalCount = risk.signal_evidence?.filter(s => s.isNew).length ?? 0;
    const totalSignals = risk.signal_evidence?.length ?? 0;
    const affectedCount = risk.who_affected?.length ?? 0;

    // Score trajectory: positive = worsening (red), negative = improving (green)
    const delta = risk.score_2035 - risk.score_2026;
    const trajectoryWidth = Math.min(Math.abs(delta), 30);
    const isWorsening = delta > 0;

    return (
        <button
            onClick={() => onClick(risk.id)}
            className="group w-full text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-200 hover:-translate-y-0.5 overflow-hidden animate-card-enter"
            style={{ animationDelay: `${index * 60}ms` }}
        >
            <div className="flex">
                {/* Left accent bar */}
                <div className={`w-1 shrink-0 ${colors.accent} ${isCritical ? 'animate-pulse-subtle' : ''}`} />

                <div className="flex-1 p-4 sm:p-5">
                    {/* Top row: category + velocity */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500">
                            {risk.category}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                            {risk.velocity}
                        </span>
                    </div>

                    {/* Title + Score */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="text-base font-semibold leading-snug group-hover:text-white transition-colors">
                            {risk.risk_name}
                        </h3>
                        <span className={`text-2xl font-bold shrink-0 ${colors.text}`}>
                            {risk.score_2026}
                        </span>
                    </div>

                    {/* Summary (2 lines max) */}
                    <p className="text-sm text-gray-400 leading-relaxed mb-4 line-clamp-2">
                        {risk.summary}
                    </p>

                    {/* Score trajectory bar */}
                    <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-gray-600">2026</span>
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${isWorsening ? 'bg-red-500/60' : 'bg-green-500/60'}`}
                                    style={{ width: `${Math.max(trajectoryWidth * 3, 5)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-gray-600">2035</span>
                        </div>
                        <div className="text-[10px] text-center">
                            <span className={isWorsening ? 'text-red-400/70' : 'text-green-400/70'}>
                                {risk.score_2026} → {risk.score_2035}
                                {isWorsening ? ' ▲' : delta < 0 ? ' ▼' : ' ─'}
                            </span>
                        </div>
                    </div>

                    {/* Metadata footer */}
                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                        {affectedCount > 0 && (
                            <span>{affectedCount} group{affectedCount !== 1 ? 's' : ''} affected</span>
                        )}
                        {totalSignals > 0 && (
                            <span className="flex items-center gap-1">
                                {totalSignals} signal{totalSignals !== 1 ? 's' : ''}
                                {newSignalCount > 0 && (
                                    <span className="flex items-center gap-0.5">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-signal-blink" />
                                        <span className="text-green-400">{newSignalCount} new</span>
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}
