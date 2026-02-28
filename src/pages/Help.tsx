import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { RISK_TAXONOMY, SOLUTION_TAXONOMY, GLOSSARY, FAQ, PIPELINE_STEPS } from '../lib/help-content';
import { VALID_ROLES } from '../lib/roles';

const ROLE_INFO: Record<string, { label: string; tabs: string; time: string; description: string }> = {
    'signal-reviewer': { label: 'Signal Reviewer', tabs: 'Risk Signals, Solution Signals', time: '30-60 min/week', description: 'Reviews Signal Scout AI output. Approves or rejects classified signals.' },
    'discovery-reviewer': { label: 'Discovery Reviewer', tabs: 'Discovery', time: '1-2 hours/week', description: 'Reviews AI-generated proposals for new risk and solution categories.' },
    'scoring-reviewer': { label: 'Scoring Reviewer', tabs: 'Validation', time: '1-2 hours/week', description: 'Reviews AI-proposed score changes and field updates for existing entries.' },
    'editor': { label: 'Editor', tabs: 'Milestones', time: '1-3 hours/week', description: 'Creates and edits milestones and narrative content.' },
    'lead': { label: 'Lead', tabs: 'All tabs + Users', time: '2-5 hours/week', description: 'Final authority. Manages users, resolves conflicts, oversees all review activities.' },
};

export default function Help() {
    const { logOut, user } = useAuth();
    const navigate = useNavigate();
    const [glossaryFilter, setGlossaryFilter] = useState('');
    const [expandedRole, setExpandedRole] = useState<string | null>(null);

    const filteredGlossary = glossaryFilter
        ? GLOSSARY.filter((g) =>
            g.term.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
            g.definition.toLowerCase().includes(glossaryFilter.toLowerCase()))
        : GLOSSARY;

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => navigate('/admin')} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
                        &larr; Admin
                    </button>
                    <h1 className="text-lg font-bold shrink-0">Help & Reference</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 truncate">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors shrink-0">
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="p-4 max-w-4xl mx-auto space-y-8 md:p-6">
                {/* 1. Pipeline */}
                <section id="pipeline">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">The Pipeline</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-2">
                        {PIPELINE_STEPS.map((step, i) => (
                            <div key={step.id} className="flex gap-3 items-start">
                                <div className="flex flex-col items-center shrink-0">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step.agent ? 'bg-cyan-400/10 text-cyan-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
                                        {step.agent ? 'AI' : 'H'}
                                    </div>
                                    {i < PIPELINE_STEPS.length - 1 && <div className="w-px h-4 bg-white/10 mt-1" />}
                                </div>
                                <div className="pb-2">
                                    <div className="text-sm font-medium">{step.label}</div>
                                    <div className="text-xs text-gray-400">{step.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2. Roles */}
                <section id="roles">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Roles & Responsibilities</h2>
                    <div className="space-y-2">
                        {VALID_ROLES.map((role) => {
                            const info = ROLE_INFO[role];
                            if (!info) return null;
                            const isExpanded = expandedRole === role;
                            return (
                                <div key={role} className="bg-white/5 rounded-lg border border-white/10">
                                    <button
                                        onClick={() => setExpandedRole(isExpanded ? null : role)}
                                        className="w-full flex items-center justify-between p-3 text-left"
                                    >
                                        <span className="text-sm font-medium">{info.label}</span>
                                        <span className="text-[10px] text-gray-500">{info.time}</span>
                                    </button>
                                    {isExpanded && (
                                        <div className="px-3 pb-3 space-y-2 text-xs text-gray-400">
                                            <div>{info.description}</div>
                                            <div><span className="text-gray-500">Tabs:</span> {info.tabs}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 3. Risk Taxonomy */}
                <section id="risks">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Risk Taxonomy (R01-R10)</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {Object.entries(RISK_TAXONOMY).map(([code, { name, description }]) => (
                            <div key={code} className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-bold">{code}</span>
                                    <span className="text-sm font-medium">{name}</span>
                                </div>
                                <div className="text-xs text-gray-400">{description}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 4. Solution Taxonomy */}
                <section id="solutions">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Solution Taxonomy (S01-S10)</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {Object.entries(SOLUTION_TAXONOMY).map(([code, { name, description, addresses }]) => (
                            <div key={code} className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-bold">{code}</span>
                                    <span className="text-sm font-medium">{name}</span>
                                    <span className="text-[9px] text-gray-500">addresses {addresses}</span>
                                </div>
                                <div className="text-xs text-gray-400">{description}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 5. Glossary */}
                <section id="glossary">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Glossary</h2>
                    <input
                        value={glossaryFilter}
                        onChange={(e) => setGlossaryFilter(e.target.value)}
                        placeholder="Search terms..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white placeholder-gray-600 mb-3 focus:outline-none focus:border-cyan-400/50"
                    />
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {filteredGlossary.map((g) => (
                            <div key={g.term} className="p-3">
                                <div className="text-sm font-medium text-cyan-400">{g.term}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{g.definition}</div>
                            </div>
                        ))}
                        {filteredGlossary.length === 0 && (
                            <div className="p-3 text-xs text-gray-500">No matching terms</div>
                        )}
                    </div>
                </section>

                {/* 6. FAQ */}
                <section id="faq">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">FAQ</h2>
                    <div className="space-y-3">
                        {FAQ.map((f) => (
                            <div key={f.question} className="bg-white/5 rounded-lg border border-white/10 p-3">
                                <div className="text-sm font-medium mb-1">{f.question}</div>
                                <div className="text-xs text-gray-400">{f.answer}</div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
