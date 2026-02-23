import type { Solution } from '../../store/RiskContext';

interface SolutionDetailPanelProps {
    solution: Solution;
}

export default function SolutionDetailPanel({ solution }: SolutionDetailPanelProps) {
    return (
        <>
            {/* Solution Header */}
            <div className="mb-4">
                <h2 className="text-2xl font-bold text-green-300 mb-1">{solution.solution_title}</h2>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-green-400">
                        {solution.solution_type}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                        {solution.implementation_stage}
                    </span>
                </div>
            </div>

            {/* Summary */}
            <div className="mb-4 p-4 bg-green-950/20 border border-green-900/30 rounded">
                <p className="text-sm text-gray-200 leading-relaxed">{solution.summary}</p>
            </div>

            {/* Deep Dive */}
            <div className="mb-6">
                <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">How It Works</h3>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {solution.deep_dive}
                </div>
            </div>

            {/* Key Players */}
            {solution.key_players && (
                <div className="mb-6">
                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Key Players</h3>
                    <div className="flex flex-wrap gap-2">
                        {solution.key_players.map((player, idx) => (
                            <span key={idx} className="px-3 py-1 bg-green-900/30 border border-green-800/50 rounded text-xs text-green-300">
                                {player}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Adoption Timeline */}
            {solution.timeline_narrative && (
                <div className="mb-6">
                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Adoption Trajectory</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                            <div className="text-[9px] text-gray-500 uppercase mb-1">2026-2030</div>
                            <div className="text-lg font-bold text-green-400 mb-1">{solution.adoption_score_2026}</div>
                            <p className="text-[10px] text-gray-400">{solution.timeline_narrative.near_term}</p>
                        </div>
                        <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                            <div className="text-[9px] text-gray-500 uppercase mb-1">2030-2040</div>
                            <div className="text-lg font-bold text-green-400 mb-1">Growth</div>
                            <p className="text-[10px] text-gray-400">{solution.timeline_narrative.mid_term}</p>
                        </div>
                        <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                            <div className="text-[9px] text-gray-500 uppercase mb-1">2040-2050</div>
                            <div className="text-lg font-bold text-green-400 mb-1">{solution.adoption_score_2035}</div>
                            <p className="text-[10px] text-gray-400">{solution.timeline_narrative.long_term}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Barriers */}
            {solution.barriers && (
                <div className="mb-6">
                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Barriers</h3>
                    <ul className="space-y-2">
                        {solution.barriers.map((barrier, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                                <span className="text-yellow-400 mt-0.5">⚠</span>
                                <span className="text-sm text-gray-300">{barrier}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
}
