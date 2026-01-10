import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import sourceSentinelAvatar from '../assets/source-sentinel.png';
import causalityCartographerAvatar from '../assets/casuality-cartographer.png';
import severityStewardAvatar from '../assets/severity-steaward.png';
import forecastScribeAvatar from '../assets/forecast-scribe.png';
import gapEngineerAvatar from '../assets/gap-engineer.png';
import greenlightGardenerAvatar from '../assets/greenlight-gardener.png';
import observatoryStewardAvatar from '../assets/observatory-steaward.png';

export default function Contribute() {
    const navigate = useNavigate();
    const [openRole, setOpenRole] = useState<string | null>(null);

    const toggleRole = (roleId: string) => {
        setOpenRole(openRole === roleId ? null : roleId);
    };

    return (
        <div className="min-h-screen bg-[#0a0f1a] text-white flex flex-col">
            {/* Header */}
            <header className="h-14 shrink-0 border-b border-[#1a2035] flex items-center justify-between px-4 md:px-8">
                <button 
                    onClick={() => navigate('/')}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <div className="w-7 h-7 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                        <div className="w-1.5 h-3.5 rounded-full bg-cyan-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide">AI 4 Society</span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Observatory</span>
                    </div>
                </button>
                
                <button
                    onClick={() => navigate('/')}
                    className="text-xs uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
                >
                    ← Back to Home
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Hero */}
                    <div className="text-center">
                        <h1 className="text-3xl md:text-5xl font-bold mb-4 text-cyan-400">
                            Volunteer Archetypes for Human Oversight
                        </h1>
                        <p className="text-base md:text-lg text-gray-300 max-w-3xl mx-auto mb-6">
                            Integrated with the Agentic Risk Intelligence Framework
                        </p>
                        <p className="text-sm text-gray-400 max-w-2xl mx-auto">
                            Volunteers are <strong className="text-white">not free-floating contributors</strong>. 
                            They act as <strong className="text-cyan-400">explicit human oversight layers</strong> for specific agents and workflow transitions.
                        </p>
                    </div>

                    {/* Design Principle */}
                    <div className="bg-[#0d1526] border border-cyan-800/50 rounded-lg p-6">
                        <h2 className="text-xl font-bold text-cyan-400 mb-4">Design Principle: Humans as Control Surfaces, Not Bottlenecks</h2>
                        <div className="space-y-2 text-sm text-gray-300">
                            <p>• Humans <strong className="text-white">approve, veto, or annotate</strong> agent outputs</p>
                            <p>• Humans <strong className="text-white">do not replace automation</strong></p>
                            <p>• Every human role corresponds to a <strong className="text-white">named agent responsibility</strong></p>
                            <p>• Oversight is <strong className="text-white">asynchronous, bounded, and auto-fallback safe</strong></p>
                        </div>
                    </div>

                    {/* Understanding the System */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Trust Tiers */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-5">
                            <h3 className="text-lg font-bold text-cyan-400 mb-3">🔰 Trust Tiers</h3>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div className="flex gap-2">
                                    <span className="text-gray-500 font-mono">T1:</span>
                                    <span>Observer — view-only access, learning phase</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-gray-500 font-mono">T2:</span>
                                    <span>Validator — approve/reject agent proposals</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-gray-500 font-mono">T3:</span>
                                    <span>Steward — edit content, escalate decisions</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-gray-500 font-mono">T4:</span>
                                    <span>Architect — governance, policy changes, final authority</span>
                                </div>
                            </div>
                        </div>

                        {/* Guilds */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-5">
                            <h3 className="text-lg font-bold text-cyan-400 mb-3">⚔️ Guilds</h3>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div>
                                    <strong className="text-white">Signalworks:</strong> Data ingestion, validation, perception tracking
                                </div>
                                <div>
                                    <strong className="text-white">Stormwatch:</strong> Risk evaluation, causal analysis, severity assessment
                                </div>
                                <div>
                                    <strong className="text-white">Lenscraft:</strong> Narrative design, public communication, pedagogy
                                </div>
                                <div>
                                    <strong className="text-white">Greenlight:</strong> Solution tracking, mitigation monitoring, hope-engineering
                                </div>
                            </div>
                        </div>

                        {/* Gate Logic */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-5">
                            <h3 className="text-lg font-bold text-cyan-400 mb-3">🚦 Gate Logic</h3>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div>
                                    <strong className="text-green-400">Pre-analysis:</strong> Before data enters the system
                                </div>
                                <div>
                                    <strong className="text-yellow-400">In-process:</strong> During computation or scoring
                                </div>
                                <div>
                                    <strong className="text-orange-400">Pre-publish:</strong> Before canonical state updates
                                </div>
                                <div>
                                    <strong className="text-red-400">Post-publish:</strong> Audit, rollback, or correction
                                </div>
                            </div>
                        </div>

                        {/* Role Boundaries */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-5">
                            <h3 className="text-lg font-bold text-cyan-400 mb-3">🎯 Role Boundaries</h3>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div>
                                    <strong className="text-white">Clear scope:</strong> Each role supervises specific agents
                                </div>
                                <div>
                                    <strong className="text-white">No overlap:</strong> Authority boundaries prevent conflicts
                                </div>
                                <div>
                                    <strong className="text-white">Escalation paths:</strong> Complex decisions route upward
                                </div>
                                <div>
                                    <strong className="text-white">Reversibility:</strong> All actions are logged and auditable
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Oversight Roles */}
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-gray-800 pb-2">
                            Oversight-Critical Roles
                        </h2>

                        {/* Source Sentinel */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('sentinel')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={sourceSentinelAvatar}
                                    alt="Source Sentinel"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Source Sentinel</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Signalworks • Trust Tier: 2 • Pre-analysis gate</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'sentinel' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'sentinel' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Signal Scout & Validation Agents</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">• Validation Agent outputs<br/>• Signal Scout extractions before downstream use</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Approve or quarantine extracted claims, source tier assignments, and injection/manipulation flags. Confirm whether signals influence risk scoring or perception analysis.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Approve signals into "validated" pool<br/>❌ Cannot change risk scores or narratives</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 30–60 min/week • <strong>SLA:</strong> 48h • <strong>No response:</strong> signal stays quarantined</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Causality Cartographer */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('cartographer')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={causalityCartographerAvatar}
                                    alt="Causality Cartographer"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Causality Cartographer</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Stormwatch • Trust Tier: 2–3 • Structural correctness</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'cartographer' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'cartographer' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Topic Tracker Agent</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Topic Tracker proposals for new risks, systemic dependencies, and cascading relationships</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Validate causal claims ("Does X plausibly amplify Y?"), enforce relationship taxonomy consistency, prevent graph inflation and spurious links.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Approve relationships into canonical dependency graph<br/>❌ Cannot finalize new risk categories alone</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 1–2 h/week • <strong>SLA:</strong> 7 days • <strong>Inactive:</strong> proposals expire</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Severity Steward */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('steward')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={severityStewardAvatar}
                                    alt="Severity Steward"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Severity Steward</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Stormwatch • Trust Tier: 3 • Impact gating</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'steward' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'steward' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Risk Evaluation Agent</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Risk Evaluation Agent outputs: score deltas, velocity category changes, time-horizon reclassification</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Review justification quality, corroboration sufficiency, and uncertainty labeling. Decide to auto-approve, request revision, or escalate to Steward Council.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Approve small/moderate changes<br/>⛔ Large jumps require Observatory Steward sign-off</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 1–2 h/week • <strong>SLA:</strong> Critical 24–48h, Others 7 days • <strong>No response:</strong> small deltas expire, critical escalate</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Forecast Scribe */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('scribe')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={forecastScribeAvatar}
                                    alt="Forecast Scribe"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Forecast Scribe</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Lenscraft • Trust Tier: 3 • Interpretability & pedagogy</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'scribe' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'scribe' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Narrative Outputs</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Narrative drafts generated or updated by agents, timeline projections in Analytical Core</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Ensure plain-language clarity, no overclaiming certainty, clear "Who is affected?" framing. Enforce Observed/Supported/Speculative labeling.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Publish narratives<br/>❌ Cannot alter scores or causal graph</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 1–3 h/week • <strong>SLA:</strong> 7 days • <strong>Inactive:</strong> old narrative remains, flagged "out of date"</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Gap Engineer */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('engineer')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={gapEngineerAvatar}
                                    alt="Gap Engineer"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Gap Engineer</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Signalworks • Trust Tier: 2–3 • Metric integrity</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'engineer' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'engineer' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Signal & Perception Engine</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Agent-generated "Expert Severity vs Public Awareness" gap, inputs feeding perception metrics</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Prevent single-platform bias, sensational feedback loops, and algorithmic amplification artifacts. Annotate uncertainty and blind spots.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Approve perception inputs<br/>❌ Cannot modify expert severity scores</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 1–2 h/week • <strong>SLA:</strong> weekly • <strong>Inactive:</strong> conservative default weights</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Greenlight Gardener */}
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('gardener')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={greenlightGardenerAvatar}
                                    alt="Greenlight Gardener"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Greenlight Gardener</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Greenlight • Trust Tier: 2–3 • Hope-with-realism</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'gardener' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'gardener' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Solution Evaluation Agent</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Solution Evaluation Agent outputs: adoption status, maturity claims, mitigation mappings</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Prevent "solutionism". Require evidence of deployment and explicit barriers. Ensure every solution maps to risks.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Approve solution entries<br/>❌ Cannot remove risks or downgrade severity</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 1–2 h/week • <strong>SLA:</strong> 14 days • <strong>Inactive:</strong> solution marked "stale / unverified"</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Observatory Steward */}
                        <div className="bg-[#0d1526] border border-cyan-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleRole('observatory')}
                                className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                            >
                                <img 
                                    src={observatoryStewardAvatar}
                                    alt="Observatory Steward"
                                    className="w-16 h-16 rounded-full flex-shrink-0 object-cover"
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-cyan-400 mb-1">Observatory Steward</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Guild: Cross-cutting • Trust Tier: 4 • Governance & safety</p>
                                </div>
                                <div className="text-cyan-400 text-xl">{openRole === 'observatory' ? '−' : '+'}</div>
                            </button>
                            {openRole === 'observatory' && (
                                <div className="p-6 pt-0 border-t border-gray-800">
                                    <p className="text-sm text-gray-400 mb-4 italic">Human Oversight for Orchestrator & Consolidation Agents</p>
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">What they supervise:</h4>
                                            <p className="text-gray-300">Consolidation Agent write policies, Orchestrator Agent escalation rules, canonical taxonomy and scoring policy</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Responsibilities:</h4>
                                            <p className="text-gray-300">Final approval on new risk categories, major scoring framework changes, emergency overrides. Adjudicate conflicts between human reviewers.</p>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-2">Authority:</h4>
                                            <p className="text-gray-300">✅ Final sign-off power<br/>⛔ Still bound by audit logs & reversibility</p>
                                        </div>
                                        <div className="pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500"><strong>Effort:</strong> 2–5 h/week • <strong>SLA:</strong> policy-defined • <strong>Inactive:</strong> policy changes freeze, emergencies reroute</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Failure Handling */}
                    <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-6">
                        <h2 className="text-xl font-bold text-red-400 mb-4">Failure & Inactivity Handling</h2>
                        <p className="text-sm text-gray-300 mb-3">If a human does nothing:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="bg-black/30 p-3 rounded">
                                <strong className="text-white">Validation:</strong> <span className="text-gray-400">signal stays quarantined</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded">
                                <strong className="text-white">Risk scoring:</strong> <span className="text-gray-400">proposal expires or escalates</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded">
                                <strong className="text-white">Narrative:</strong> <span className="text-gray-400">marked "out of date"</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded">
                                <strong className="text-white">Solutions:</strong> <span className="text-gray-400">marked "stale"</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-4 italic">
                            Rule: <strong className="text-white">inactivity never causes silent data mutation</strong>
                        </p>
                    </div>

                    {/* Get Started */}
                    <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-6 text-center">
                        <h2 className="text-xl font-bold text-cyan-300 mb-3">Ready to Get Involved?</h2>
                        <p className="text-sm text-gray-300 mb-4">
                            We're building the onboarding platform for these roles. Express your interest now.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <a
                                href="mailto:contribute@ai4society.org"
                                className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-white text-sm font-semibold tracking-wider uppercase rounded transition-colors"
                            >
                                Email Us
                            </a>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-wider uppercase rounded transition-colors shadow-lg"
                            >
                                Explore the Observatory
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 border-t border-[#1a2035] text-center">
                <p className="text-xs text-gray-500">
                    AI 4 Society Observatory · A volunteer-driven transparency initiative
                </p>
            </footer>
        </div>
    );
}
