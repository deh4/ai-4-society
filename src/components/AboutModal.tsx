import { useEffect } from 'react';

interface AboutModalProps {
    onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-[#0d1526] border border-[var(--card-border)] p-6 md:p-8 max-w-2xl w-full rounded-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl md:text-2xl font-bold text-[var(--accent-structural)] mb-6 tracking-wide uppercase border-b border-gray-800 pb-2">
                    What is AI 4 Society?
                </h2>

                <div className="space-y-5 text-gray-300 text-sm leading-relaxed mb-8">
                    <section>
                        <h3 className="text-lg font-bold text-white mb-3">🌍 Our Mission</h3>
                        <p className="mb-2">
                            The AI 4 Society Observatory is a <strong className="text-white">volunteer-driven, open-source project</strong> dedicated to tracking, analyzing, and visualizing the societal impact of Artificial Intelligence in real time.
                        </p>
                        <p className="mb-3">
                            As AI capabilities accelerate, we bridge the gap between technical metrics and human reality—translating complex risks into tangible, human-centric narratives that policymakers, educators, and the public can understand.
                        </p>
                        <p className="text-xs italic text-gray-400">
                            This platform is designed for education, awareness, and exploration.<br/>
                            Risk scores and projections are illustrative, not predictions or prescriptions.
                        </p>
                    </section>

                    <section className="p-4 bg-white/5 border-l-2 border-cyan-500 rounded-r">
                        <h3 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider">Why Volunteers Matter</h3>
                        <p className="text-xs text-gray-300 mb-3">
                            This observatory is <strong className="text-white">not funded by corporations or governments</strong>.<br/>
                            It exists because contributors like you believe transparency and public understanding are essential in an AI-driven world.
                        </p>
                        <p className="text-xs text-gray-400 mb-2">Volunteers help us:</p>
                        <ul className="space-y-1 text-xs text-gray-300 ml-4">
                            <li>• validate real-world signals</li>
                            <li>• maintain accurate and accessible narratives</li>
                            <li>• track emerging risks and evolving solutions</li>
                            <li>• ensure no single perspective dominates the system</li>
                        </ul>
                        <p className="text-xs text-gray-400 mt-3">
                            No individual volunteer controls the platform.<br/>
                            All critical updates pass through layered review and human oversight.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-white mb-3">🔍 How We Collect Signals & Evidence</h3>
                        <p className="mb-2">Our data comes from a diverse ecosystem of sources:</p>
                        <ul className="space-y-2 text-xs text-gray-300">
                            <li><strong className="text-white">News aggregators</strong> — global reporting on AI incidents and policy changes</li>
                            <li><strong className="text-white">Academic research</strong> — papers from arXiv, Semantic Scholar, and peer-reviewed journals</li>
                            <li><strong className="text-white">Regulatory filings</strong> — government reports, EU AI Act updates, public disclosures</li>
                            <li><strong className="text-white">Expert networks</strong> — think tanks, safety forums, and industry research</li>
                            <li><strong className="text-white">Community contributions</strong> — verified signals submitted by our volunteer network</li>
                        </ul>
                        <p className="text-xs text-gray-400 mt-3">
                            Automated systems help us process scale.<br/>
                            <strong className="text-white">Humans decide what matters, what's credible, and what's uncertain.</strong>
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-white mb-3">🤖 The Role of Human Oversight</h3>
                        <p className="mb-2 text-xs">
                            AI helps us detect patterns and summarize information at speed.<br/>
                            But <strong className="text-white">judgment, context, and accountability remain human responsibilities</strong>.
                        </p>
                        <p className="text-xs text-gray-300 mb-3">
                            Every high-impact update—risk scores, narratives, systemic links, and projections—is reviewed by trained volunteers with defined roles and permissions.
                        </p>
                        <p className="text-xs text-gray-400">
                            Disagreement is expected.<br/>
                            Uncertainty is explicitly labeled.<br/>
                            All changes are auditable and reversible.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-white mb-3">⏱️ How Often the Observatory Updates</h3>
                        <div className="space-y-2 text-xs">
                            <div className="bg-white/5 p-3 rounded border border-gray-800">
                                <div className="font-bold text-cyan-400 mb-1">High-frequency (near real-time)</div>
                                <div className="text-gray-400">Signal evidence, breaking news, public perception shifts</div>
                            </div>
                            <div className="bg-white/5 p-3 rounded border border-gray-800">
                                <div className="font-bold text-orange-400 mb-1">Medium-frequency (weekly)</div>
                                <div className="text-gray-400">Risk scores, narratives, and trend assessments</div>
                            </div>
                            <div className="bg-white/5 p-3 rounded border border-gray-800">
                                <div className="font-bold text-gray-400 mb-1">Low-frequency (monthly)</div>
                                <div className="text-gray-400">Core definitions, systemic relationships, and long-term frameworks</div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3 italic">
                            This balance helps us stay responsive without amplifying noise.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-white mb-3">👥 Who's Behind This?</h3>
                        <p className="mb-2 text-xs">
                            The AI 4 Society Observatory is maintained by a decentralized network of volunteers, including:
                        </p>
                        <ul className="space-y-1 text-xs text-gray-300 ml-4">
                            <li>• AI researchers tracking technical developments</li>
                            <li>• Policy analysts monitoring governance and regulation</li>
                            <li>• Journalists documenting real-world impacts</li>
                            <li>• Ethicists examining societal implications</li>
                            <li>• Developers and designers building the platform</li>
                        </ul>
                        <p className="text-xs text-gray-400 mt-3">
                            We operate as a collective.<br/>
                            <strong className="text-white">No single organization, ideology, or funder controls this space.</strong>
                        </p>
                    </section>

                    <section className="p-4 bg-cyan-950/30 border border-cyan-800/50 rounded">
                        <h3 className="text-sm font-bold text-cyan-300 mb-2">💡 Want to Get Involved?</h3>
                        <p className="text-xs text-cyan-200 mb-2">
                            You don't need to be an expert to contribute.
                        </p>
                        <p className="text-xs text-cyan-200 mb-2">Whether you want to:</p>
                        <ul className="space-y-1 text-xs text-cyan-200 ml-4">
                            <li>• validate signals</li>
                            <li>• improve explanations</li>
                            <li>• expand language coverage</li>
                            <li>• track solutions and barriers</li>
                            <li>• or help build tools</li>
                        </ul>
                        <p className="text-xs text-cyan-100 mt-2 font-semibold">
                            There's a role designed for your time and skills.
                        </p>
                    </section>
                </div>

                <div className="flex justify-end gap-4 mt-6">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-[var(--accent-structural)] text-white text-sm font-bold tracking-wider uppercase rounded hover:bg-blue-600 transition-colors shadow-lg hover:shadow-blue-500/20"
                    >
                        [ Close ]
                    </button>
                </div>
            </div>
        </div>
    );
}
