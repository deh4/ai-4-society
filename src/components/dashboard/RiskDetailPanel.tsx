import type { Risk, Solution } from '../../store/RiskContext';
import SignalEvidenceList from './SignalEvidenceList';
import PerceptionGap from './PerceptionGap';
import SolutionDetailPanel from './SolutionDetailPanel';

interface RiskDetailPanelProps {
    risk: Risk;
    relatedSolution: Solution | undefined;
    onBack: () => void;
}

export default function RiskDetailPanel({ risk, relatedSolution, onBack }: RiskDetailPanelProps) {
    return (
        <div className="max-w-3xl mx-auto">
            {/* Back button */}
            <button
                onClick={onBack}
                className="text-sm text-gray-500 hover:text-white transition-colors mb-6 flex items-center gap-1.5"
            >
                <span>&larr;</span>
                <span>All risks</span>
            </button>

            {/* Risk Header */}
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2 leading-tight">{risk.risk_name}</h1>
                <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-widest text-cyan-400">
                        {risk.category}
                    </span>
                    <span className={`text-xs uppercase tracking-wider px-2.5 py-0.5 rounded ${
                        risk.velocity === 'Critical' ? 'bg-red-500/20 text-red-400' :
                        risk.velocity === 'High' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-gray-500/20 text-gray-400'
                    }`}>
                        {risk.velocity} Velocity
                    </span>
                </div>
            </div>

            {/* Summary Box */}
            <div className="mb-6 p-5 bg-red-950/20 border border-red-900/30 rounded-lg">
                <p className="text-base text-gray-200 leading-relaxed">{risk.summary}</p>
            </div>

            {/* Perception Gap — inline */}
            <div className="mb-8 p-4 bg-white/[0.03] border border-white/10 rounded-lg">
                <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Perception Gap</h2>
                <PerceptionGap
                    isMonitorMode={true}
                    selectedRisk={risk}
                    selectedSolution={undefined}
                />
            </div>

            {/* Deep Dive */}
            <div className="mb-8">
                <h2 className="text-sm font-medium text-gray-400 mb-3">Deep Dive</h2>
                <div className="text-base text-gray-300 leading-relaxed whitespace-pre-line">
                    {risk.deep_dive}
                </div>
            </div>

            {/* Affected Groups */}
            {risk.who_affected && risk.who_affected.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Who's Affected</h2>
                    <div className="flex flex-wrap gap-2">
                        {risk.who_affected.map((group, idx) => (
                            <span key={idx} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm">
                                {group}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Timeline Evolution */}
            {risk.timeline_narrative && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Evolution Timeline</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2026–2030</div>
                            <div className="text-xl font-bold text-red-400 mb-2">{risk.score_2026}</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.near_term}</p>
                        </div>
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2030–2040</div>
                            <div className="text-xl font-bold text-orange-400 mb-2">Peak</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.mid_term}</p>
                        </div>
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2040–2050</div>
                            <div className="text-xl font-bold text-yellow-400 mb-2">{risk.score_2035}</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.long_term}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Mitigation Strategies */}
            {risk.mitigation_strategies && risk.mitigation_strategies.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Mitigation Strategies</h2>
                    <ul className="space-y-2.5">
                        {risk.mitigation_strategies.map((strategy, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                                <span className="text-cyan-400 mt-0.5">→</span>
                                <span className="text-base text-gray-300">{strategy}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Connected Risks */}
            {risk.connected_to && risk.connected_to.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Connected Risks</h2>
                    <div className="flex flex-wrap gap-2">
                        {risk.connected_to.map((id) => (
                            <span key={id} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                                {id}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Signal Evidence — full width */}
            {risk.signal_evidence && risk.signal_evidence.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">
                        Signal Evidence
                        <span className="text-[10px] text-gray-600 ml-2">
                            ({risk.signal_evidence.length} signal{risk.signal_evidence.length !== 1 ? 's' : ''})
                        </span>
                    </h2>
                    <SignalEvidenceList evidence={risk.signal_evidence} />
                </div>
            )}

            {/* Related Solution — inline, no mode switch */}
            {relatedSolution && (
                <div className="mt-10 pt-8 border-t border-white/10">
                    <div className="text-xs uppercase tracking-widest text-green-400 mb-4">
                        What's being done about it
                    </div>
                    <SolutionDetailPanel solution={relatedSolution} />
                </div>
            )}
        </div>
    );
}
