import { useState } from 'react';
import { useRisks, type Risk } from '../store/RiskContext';

interface DashboardProps {
    themeMode: 'monitor' | 'solution';
    setThemeMode: (mode: 'monitor' | 'solution') => void;
}

// Accordion component for risk categories
function RiskAccordion({
    title,
    risks,
    selectedId,
    onSelect,
    defaultOpen = false,
    year
}: {
    title: string;
    risks: Risk[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    defaultOpen?: boolean;
    year: number;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    if (risks.length === 0) return null;

    return (
        <div className="mb-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
            >
                <span className="text-[10px] uppercase tracking-widest text-gray-400">{title}</span>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-500">{risks.length}</span>
                    <span className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </div>
            </button>
            {isOpen && (
                <div className="mt-1 space-y-1">
                    {risks.map((risk) => (
                        <div
                            key={risk.id}
                            onClick={() => onSelect(risk.id)}
                            className={`p-2 rounded cursor-pointer transition-all ${selectedId === risk.id
                                ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                : 'hover:bg-white/5'
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-sm font-medium">{risk.risk_name}</div>
                                    <div className="text-[9px] uppercase tracking-wider text-gray-500 mt-0.5">
                                        {risk.category}
                                    </div>
                                </div>
                                <div className={`text-sm font-bold ${risk.velocity === 'Critical' ? 'text-red-400' :
                                    risk.velocity === 'High' ? 'text-orange-400' : 'text-gray-400'
                                    }`}>
                                    {year <= 2030 ? risk.score_2026 : risk.score_2035}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg max-w-lg w-full p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold mb-4 text-white">Privacy & Disclaimer</h2>

                <div className="space-y-4 text-sm text-gray-300 max-h-[60vh] overflow-y-auto pr-2">
                    <section>
                        <h3 className="font-semibold text-white mb-2">Disclaimer</h3>
                        <p>The AI 4 Society Observatory is an educational simulation. Risk scores, timelines, and impact assessments are illustrative estimates based on current research trends and do not constitute financial, legal, or professional advice. The "Weather Station" metaphor is for visualization purposes only.</p>
                    </section>

                    <section>
                        <h3 className="font-semibold text-white mb-2">Privacy Policy</h3>
                        <p>We respect your privacy. This dashboard:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Does <strong>not</strong> use cookies for tracking.</li>
                            <li>Does <strong>not</strong> collect personal identifiable information (PII).</li>
                            <li>Stores user preferences (like "Your Exposure" selection) strictly in your local browser storage if at all.</li>
                            <li>Uses anonymous aggregate analytics to understand general usage patterns.</li>
                        </ul>
                    </section>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-medium transition-colors"
                    >
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard({ themeMode, setThemeMode }: DashboardProps) {
    const [year, setYear] = useState(2026);
    const [selectedId, setSelectedId] = useState<string | null>('R01');
    const [showPrivacy, setShowPrivacy] = useState(false);
    const { risks, solutions, loading, error } = useRisks();

    const isMonitorMode = themeMode === 'monitor';

    // Categorize risks by urgency
    const nearTermRisks = risks.filter(r => r.score_2026 >= 7);
    const midTermRisks = risks.filter(r => r.score_2026 >= 4 && r.score_2026 < 7);
    const longTermRisks = risks.filter(r => r.score_2026 < 4);

    // Find selected items
    const selectedRisk = risks.find(r => r.id === selectedId);
    const selectedSolution = solutions.find(s => s.id === selectedId);
    const relatedSolution = solutions.find(s => s.parent_risk_id === selectedId);
    const parentRisk = selectedSolution ? risks.find(r => r.id === selectedSolution.parent_risk_id) : null;
    const connectedRisks = selectedRisk?.connected_to?.map(id => risks.find(r => r.id === id)).filter(Boolean) as Risk[] || [];

    return (
        <div className={`h-screen flex flex-col font-sans transition-colors duration-500 ${isMonitorMode ? 'bg-[#0a0f1a] text-white' : 'bg-[#051A10] text-green-50'
            }`}>
            {/* Header */}
            <header className={`h-14 shrink-0 border-b flex items-center justify-between px-5 ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'
                }`}>
                {/* Left: Logo */}
                <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${isMonitorMode ? 'border-cyan-400' : 'border-green-400'
                        }`}>
                        <div className={`w-1.5 h-3.5 rounded-full animate-pulse ${isMonitorMode ? 'bg-cyan-400' : 'bg-green-400'
                            }`} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide">AI 4 Society</span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Observatory</span>
                    </div>
                </div>

                {/* Center: Year Slider */}
                <div className="flex items-center gap-4">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500">Horizon</span>
                    <span className={`text-xl font-bold ${isMonitorMode ? 'text-cyan-400' : 'text-green-400'}`}>{year}</span>
                    <input
                        type="range"
                        min={2026}
                        max={2050}
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                        className={`w-48 h-1 bg-gray-800 rounded appearance-none cursor-pointer ${isMonitorMode ? 'accent-cyan-400' : 'accent-green-400'
                            }`}
                    />
                </div>

                {/* Right: Mode Toggle */}
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase tracking-widest ${isMonitorMode ? 'text-red-400 font-bold' : 'text-gray-500'
                        }`}>Risks</span>
                    <button
                        onClick={() => {
                            setThemeMode(isMonitorMode ? 'solution' : 'monitor');
                            setSelectedId(isMonitorMode ? 'S01' : 'R01');
                        }}
                        className="w-12 h-6 rounded-full bg-gray-800 relative"
                    >
                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-300 ${isMonitorMode ? 'left-1 bg-red-400' : 'left-7 bg-green-400'
                            }`} />
                    </button>
                    <span className={`text-[10px] uppercase tracking-widest ${!isMonitorMode ? 'text-green-400 font-bold' : 'text-gray-500'
                        }`}>Solutions</span>
                </div>
            </header>

            {/* Main Grid - Fixed height, no page scroll */}
            <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden min-h-0">

                {/* Left Panel - Scrollable risks with accordions */}
                <div className={`col-span-2 border-r flex flex-col overflow-hidden ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'
                    }`}>
                    {/* Risk List with Accordions */}
                    <div className="flex-1 p-3 overflow-y-auto min-h-0">
                        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                            {isMonitorMode ? 'Risk Index' : 'Solution Index'}
                        </h2>

                        {loading ? (
                            <div className="text-gray-600 text-xs">Scanning...</div>
                        ) : error ? (
                            <div className="text-red-400 text-xs">{error}</div>
                        ) : isMonitorMode ? (
                            <>
                                <RiskAccordion
                                    title="Critical (Now)"
                                    risks={nearTermRisks}
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    defaultOpen={true}
                                    year={year}
                                />
                                <RiskAccordion
                                    title="Emerging (2030s)"
                                    risks={midTermRisks}
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    year={year}
                                />
                                <RiskAccordion
                                    title="Horizon (2040s)"
                                    risks={longTermRisks}
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    year={year}
                                />
                            </>
                        ) : (
                            <div className="space-y-1">
                                {solutions.map((sol) => (
                                    <div
                                        key={sol.id}
                                        onClick={() => setSelectedId(sol.id)}
                                        className={`p-2 rounded cursor-pointer transition-all ${selectedId === sol.id
                                            ? 'bg-green-950/50 border-l-2 border-green-400'
                                            : 'hover:bg-white/5'
                                            }`}
                                    >
                                        <div className="text-sm font-medium">{sol.solution_title}</div>
                                        <div className="text-[9px] uppercase tracking-wider text-gray-500 mt-0.5">
                                            {sol.solution_type}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Systemic Links - Fixed at bottom */}
                    <div className={`shrink-0 h-40 border-t p-3 ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'}`}>
                        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                            {isMonitorMode ? 'Connected Risks' : 'Addresses'}
                        </h2>
                        <div className="overflow-y-auto h-28">
                            {isMonitorMode && connectedRisks.length > 0 ? (
                                <div className="space-y-1">
                                    {connectedRisks.map((linked) => (
                                        <button
                                            key={linked.id}
                                            onClick={() => setSelectedId(linked.id)}
                                            className="w-full text-left p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
                                        >
                                            <div className="text-xs font-medium">{linked.risk_name}</div>
                                            <div className="text-[9px] text-gray-500">{linked.category}</div>
                                        </button>
                                    ))}
                                </div>
                            ) : !isMonitorMode && parentRisk ? (
                                <button
                                    onClick={() => {
                                        setThemeMode('monitor');
                                        setSelectedId(parentRisk.id);
                                    }}
                                    className="w-full text-left p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <div className="text-[9px] text-gray-500 uppercase mb-1">Parent Risk</div>
                                    <div className="text-xs font-medium">{parentRisk.risk_name}</div>
                                </button>
                            ) : (
                                <div className="text-gray-600 text-xs">None linked</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center Panel - Scrollable content */}
                <div className="col-span-7 flex flex-col overflow-hidden">
                    <div className="flex-1 p-4 overflow-y-auto">
                        {isMonitorMode && selectedRisk ? (
                            <>
                                {/* Risk Header */}
                                <div className="mb-4">
                                    <h2 className="text-2xl font-bold mb-1">{selectedRisk.risk_name}</h2>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] uppercase tracking-widest text-cyan-400">
                                            {selectedRisk.category}
                                        </span>
                                        <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${selectedRisk.velocity === 'Critical' ? 'bg-red-500/20 text-red-400' :
                                            selectedRisk.velocity === 'High' ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-gray-500/20 text-gray-400'
                                            }`}>
                                            {selectedRisk.velocity} Velocity
                                        </span>
                                    </div>
                                </div>

                                {/* Summary Box */}
                                <div className="mb-4 p-4 bg-red-950/20 border border-red-900/30 rounded">
                                    <p className="text-sm text-gray-200 leading-relaxed">{selectedRisk.summary}</p>
                                </div>

                                {/* Deep Dive */}
                                <div className="mb-6">
                                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Deep Dive</h3>
                                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                                        {selectedRisk.deep_dive}
                                    </div>
                                </div>

                                {/* Affected Groups */}
                                {selectedRisk.who_affected && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Who's Affected</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedRisk.who_affected.map((group, idx) => (
                                                <span key={idx} className="px-3 py-1 bg-white/5 border border-white/10 rounded text-xs">
                                                    {group}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Timeline Evolution */}
                                {selectedRisk.timeline_narrative && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Evolution Timeline</h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-[#0d1526] border border-[#1a2035] rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2026-2030</div>
                                                <div className="text-lg font-bold text-red-400 mb-1">{selectedRisk.score_2026}</div>
                                                <p className="text-[10px] text-gray-400">{selectedRisk.timeline_narrative.near_term}</p>
                                            </div>
                                            <div className="bg-[#0d1526] border border-[#1a2035] rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2030-2040</div>
                                                <div className="text-lg font-bold text-orange-400 mb-1">Peak</div>
                                                <p className="text-[10px] text-gray-400">{selectedRisk.timeline_narrative.mid_term}</p>
                                            </div>
                                            <div className="bg-[#0d1526] border border-[#1a2035] rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2040-2050</div>
                                                <div className="text-lg font-bold text-yellow-400 mb-1">{selectedRisk.score_2035}</div>
                                                <p className="text-[10px] text-gray-400">{selectedRisk.timeline_narrative.long_term}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Mitigation Strategies */}
                                {selectedRisk.mitigation_strategies && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Mitigation Strategies</h3>
                                        <ul className="space-y-2">
                                            {selectedRisk.mitigation_strategies.map((strategy, idx) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                    <span className="text-cyan-400 mt-0.5">→</span>
                                                    <span className="text-sm text-gray-300">{strategy}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Solution CTA */}
                                {relatedSolution && (
                                    <button
                                        onClick={() => {
                                            setThemeMode('solution');
                                            setSelectedId(relatedSolution.id);
                                        }}
                                        className="w-full p-4 bg-green-950/30 border border-green-800/50 rounded hover:border-green-400 transition-colors text-left"
                                    >
                                        <div className="text-[9px] uppercase text-green-400 mb-1">Explore Solution →</div>
                                        <div className="text-lg font-bold text-green-300">{relatedSolution.solution_title}</div>
                                        <div className="text-xs text-gray-400 mt-1">{relatedSolution.summary}</div>
                                    </button>
                                )}
                            </>
                        ) : !isMonitorMode && selectedSolution ? (
                            <>
                                {/* Solution Header */}
                                <div className="mb-4">
                                    <h2 className="text-2xl font-bold text-green-300 mb-1">{selectedSolution.solution_title}</h2>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] uppercase tracking-widest text-green-400">
                                            {selectedSolution.solution_type}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                                            {selectedSolution.implementation_stage}
                                        </span>
                                    </div>
                                </div>

                                {/* Summary */}
                                <div className="mb-4 p-4 bg-green-950/20 border border-green-900/30 rounded">
                                    <p className="text-sm text-gray-200 leading-relaxed">{selectedSolution.summary}</p>
                                </div>

                                {/* Deep Dive */}
                                <div className="mb-6">
                                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">How It Works</h3>
                                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                                        {selectedSolution.deep_dive}
                                    </div>
                                </div>

                                {/* Key Players */}
                                {selectedSolution.key_players && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Key Players</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedSolution.key_players.map((player, idx) => (
                                                <span key={idx} className="px-3 py-1 bg-green-900/30 border border-green-800/50 rounded text-xs text-green-300">
                                                    {player}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Adoption Timeline */}
                                {selectedSolution.timeline_narrative && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Adoption Trajectory</h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2026-2030</div>
                                                <div className="text-lg font-bold text-green-400 mb-1">{selectedSolution.adoption_score_2026}</div>
                                                <p className="text-[10px] text-gray-400">{selectedSolution.timeline_narrative.near_term}</p>
                                            </div>
                                            <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2030-2040</div>
                                                <div className="text-lg font-bold text-green-400 mb-1">Growth</div>
                                                <p className="text-[10px] text-gray-400">{selectedSolution.timeline_narrative.mid_term}</p>
                                            </div>
                                            <div className="bg-[#0a1a10] border border-green-900/50 rounded p-3">
                                                <div className="text-[9px] text-gray-500 uppercase mb-1">2040-2050</div>
                                                <div className="text-lg font-bold text-green-400 mb-1">{selectedSolution.adoption_score_2035}</div>
                                                <p className="text-[10px] text-gray-400">{selectedSolution.timeline_narrative.long_term}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Barriers */}
                                {selectedSolution.barriers && (
                                    <div className="mb-6">
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Barriers</h3>
                                        <ul className="space-y-2">
                                            {selectedSolution.barriers.map((barrier, idx) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                    <span className="text-yellow-400 mt-0.5">⚠</span>
                                                    <span className="text-sm text-gray-300">{barrier}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                Select an item to view details
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Scrollable sections */}
                <div className={`col-span-3 border-l flex flex-col overflow-hidden ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'
                    }`}>
                    {/* Perception Gap - Fixed height */}
                    <div className={`shrink-0 p-4 border-b ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'}`}>
                        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                            {isMonitorMode ? 'Perception Gap' : 'Adoption Metrics'}
                        </h2>
                        {selectedRisk && isMonitorMode ? (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-400">Expert Assessment</span>
                                        <span className="text-red-400 font-bold">{selectedRisk.expert_severity}</span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                                        <div className="h-full bg-red-500" style={{ width: `${(selectedRisk.expert_severity || 0) * 10}%` }} />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-400">Public Awareness</span>
                                        <span className="text-cyan-400 font-bold">{selectedRisk.public_perception}</span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                                        <div className="h-full bg-cyan-500" style={{ width: `${(selectedRisk.public_perception || 0) * 10}%` }} />
                                    </div>
                                </div>
                                {selectedRisk.expert_severity && selectedRisk.public_perception &&
                                    (selectedRisk.expert_severity - selectedRisk.public_perception) > 2 && (
                                        <div className="text-[10px] text-yellow-400 mt-2">
                                            ⚠ Significant awareness gap
                                        </div>
                                    )}
                            </div>
                        ) : selectedSolution && !isMonitorMode ? (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-400">Current</span>
                                        <span className="text-green-400 font-bold">{selectedSolution.adoption_score_2026}</span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                                        <div className="h-full bg-green-500" style={{ width: `${(selectedSolution.adoption_score_2026 || 0) * 10}%` }} />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-400">2035 Projected</span>
                                        <span className="text-green-400 font-bold">{selectedSolution.adoption_score_2035}</span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                                        <div className="h-full bg-green-400" style={{ width: `${(selectedSolution.adoption_score_2035 || 0) * 10}%` }} />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Signal Evidence - Scrollable */}
                    <div className={`flex-1 p-4 border-b overflow-hidden flex flex-col ${isMonitorMode ? 'border-[#1a2035]' : 'border-green-900'
                        }`}>
                        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3 shrink-0">
                            Signal Evidence
                        </h2>
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {selectedRisk?.signal_evidence && isMonitorMode ? (
                                <div className="space-y-3">
                                    {selectedRisk.signal_evidence.map((item, idx) => {
                                        const Content = () => (
                                            <>
                                                <div className="text-[10px] text-gray-600 w-10 shrink-0">{item.date}</div>
                                                <div className="flex-1">
                                                    {item.isNew && (
                                                        <span className="text-[8px] bg-red-500 text-white px-1 rounded mr-1">NEW</span>
                                                    )}
                                                    <span className={`text-xs ${item.url ? 'group-hover:text-cyan-400 decoration-cyan-400 group-hover:underline' : ''}`}>
                                                        {item.headline}
                                                        {item.url && <span className="inline-block ml-1 text-gray-500">↗</span>}
                                                    </span>
                                                    <div className="text-[9px] text-gray-500 uppercase mt-0.5">{item.source}</div>
                                                </div>
                                            </>
                                        );

                                        return item.url ? (
                                            <a
                                                key={idx}
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex gap-2 p-2 rounded bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
                                            >
                                                <Content />
                                            </a>
                                        ) : (
                                            <div key={idx} className="flex gap-2 p-2 rounded bg-white/5">
                                                <Content />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-gray-600 text-xs">No signals available</div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 p-4">
                        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Your Exposure</h2>
                        <select className={`w-full text-sm p-2 rounded mb-4 ${isMonitorMode
                            ? 'bg-[#0d1526] border border-[#1a2035] text-gray-400'
                            : 'bg-[#0a1a10] border border-green-900 text-green-300'
                            }`}>
                            <option>Select profile...</option>
                            <option>Software Engineer</option>
                            <option>Policy Maker</option>
                            <option>Journalist</option>
                            <option>Educator</option>
                            <option>Healthcare Worker</option>
                            <option>Financial Professional</option>
                        </select>

                        <div className="flex justify-center border-t border-white/5 pt-3">
                            <button
                                onClick={() => setShowPrivacy(true)}
                                className="text-[9px] uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors"
                            >
                                Privacy & Disclaimer
                            </button>
                        </div>
                    </div>
                </div>

            </main>

            {/* Privacy Modal */}
            {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
        </div>
    );
}
