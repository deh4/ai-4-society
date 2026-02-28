import { TAB_HELP, GLOSSARY, PIPELINE_STEPS } from '../../lib/help-content';

interface Props {
    tabName: string;
    onClose: () => void;
    onReplayTutorial: () => void;
}

export default function HelpPanel({ tabName, onClose, onReplayTutorial }: Props) {
    const help = TAB_HELP[tabName];
    if (!help) return null;

    const relevantTerms = GLOSSARY.filter((g) => help.terms.includes(g.term));

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={onClose} />

            {/* Panel */}
            <div className="fixed top-0 right-0 h-full w-80 z-50 bg-[#0a0f1a] border-l border-white/10 overflow-y-auto shadow-2xl">
                <div className="p-4 space-y-5">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white">{help.title}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">&times;</button>
                    </div>

                    {/* Description */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">What This Tab Does</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">{help.description}</p>
                    </div>

                    {/* Workflow */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Your Workflow</h3>
                        <ol className="space-y-1.5">
                            {help.workflow.map((step, i) => (
                                <li key={i} className="flex gap-2 text-sm text-gray-300">
                                    <span className="text-cyan-400 font-bold shrink-0">{i + 1}.</span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Key Terms */}
                    {relevantTerms.length > 0 && (
                        <div>
                            <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Key Terms</h3>
                            <div className="space-y-2">
                                {relevantTerms.map((term) => (
                                    <div key={term.term}>
                                        <div className="text-xs font-medium text-cyan-400">{term.term}</div>
                                        <div className="text-xs text-gray-400">{term.definition}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pipeline Context */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Pipeline</h3>
                        <div className="space-y-1">
                            {PIPELINE_STEPS.map((ps) => {
                                const isActive =
                                    (tabName === 'risk-signals' || tabName === 'solution-signals') && ps.id === 'signal-review' ||
                                    tabName === 'discovery' && ps.id === 'discovery-review' ||
                                    tabName === 'validation' && ps.id === 'scoring-review';
                                return (
                                    <div
                                        key={ps.id}
                                        className={`text-[10px] px-2 py-1 rounded ${isActive ? 'bg-cyan-400/10 text-cyan-400 font-medium' : 'text-gray-500'}`}
                                    >
                                        {ps.agent ? 'AI' : 'H'} {ps.label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Replay Tutorial */}
                    <button
                        onClick={onReplayTutorial}
                        className="w-full py-2 rounded bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                        Replay Tutorial
                    </button>
                </div>
            </div>
        </>
    );
}
