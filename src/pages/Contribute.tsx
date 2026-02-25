import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import sourceSentinelAvatar from '../assets/source-sentinel.png';
import causalityCartographerAvatar from '../assets/causality-cartographer.png';
import severityStewardAvatar from '../assets/severity-steward.png';
import forecastScribeAvatar from '../assets/forecast-scribe.png';
import observatoryStewardAvatar from '../assets/observatory-steward.png';

interface Role {
    id: string;
    title: string;
    avatar: string;
    tagline: string;
    reviews: string;
    effort: string;
    description: string;
    responsibilities: string[];
    canDo: string[];
    cantDo: string[];
    ifInactive: string;
}

const ROLES: Role[] = [
    {
        id: 'signal-reviewer',
        title: 'Signal Reviewer',
        avatar: sourceSentinelAvatar,
        tagline: 'First line of defense',
        reviews: 'Signal Scout (AI agent, runs every 6 hours)',
        effort: '30-60 min/week',
        description: 'The Signal Scout AI scans news sources around the clock, classifying articles by risk category and relevance. Signal Reviewers check its work — confirming that extracted signals are real, correctly classified, and worth tracking.',
        responsibilities: [
            'Review pending signals in the admin console',
            'Approve signals that are relevant and correctly classified',
            'Reject signals that are noise, duplicates, or misclassified',
            'Flag signals that need attention from other reviewers',
        ],
        canDo: ['Approve or reject signals', 'Add notes explaining decisions'],
        cantDo: ['Change risk scores', 'Edit narratives', 'Create new risk categories'],
        ifInactive: 'Signal stays pending — never enters the system without approval',
    },
    {
        id: 'discovery-reviewer',
        title: 'Discovery Reviewer',
        avatar: causalityCartographerAvatar,
        tagline: 'Gatekeeper for new ideas',
        reviews: 'Discovery Agent (AI agent, runs weekly)',
        effort: '1-2 hours/week',
        description: 'Every week, the Discovery Agent analyzes approved signals looking for emerging risks or solutions not yet in our registry. Discovery Reviewers decide whether these proposals represent genuinely new phenomena worth tracking — or just reframings of what we already cover.',
        responsibilities: [
            'Review proposals for new risks and solutions',
            'Check that proposals have sufficient evidence (3+ supporting signals)',
            'Verify proposals are genuinely novel, not duplicates of existing entries',
            'Approve proposals that expand our understanding of the AI landscape',
        ],
        canDo: ['Approve or reject new risk/solution proposals', 'Edit proposed names and descriptions before approval'],
        cantDo: ['Modify existing risk scores', 'Override other reviewers'],
        ifInactive: 'Proposals expire after 14 days — nothing is added without human approval',
    },
    {
        id: 'scoring-reviewer',
        title: 'Scoring Reviewer',
        avatar: severityStewardAvatar,
        tagline: 'Checks the math',
        reviews: 'Validator Agent (AI agent, runs weekly)',
        effort: '1-2 hours/week',
        description: 'The Validator Agent continuously reassesses every risk and solution, proposing score changes, velocity updates, and field corrections based on recent evidence. Scoring Reviewers verify these proposals are justified — catching both overreactions and blind spots.',
        responsibilities: [
            'Review proposed changes to risk scores, velocities, and adoption stages',
            'Verify that evidence supports the proposed magnitude of change',
            'Approve incremental updates that reflect genuine shifts',
            'Escalate large jumps (>10 points) to the Lead for review',
        ],
        canDo: ['Approve or reject score changes', 'Edit proposed values before applying'],
        cantDo: ['Create new risk categories', 'Publish narratives'],
        ifInactive: 'Small changes expire after 7 days, critical changes escalate to the Lead',
    },
    {
        id: 'editor',
        title: 'Editor',
        avatar: forecastScribeAvatar,
        tagline: 'Makes it make sense',
        reviews: 'All public-facing content',
        effort: '1-3 hours/week',
        description: 'Data without story is just noise. Editors ensure every risk narrative, solution summary, and milestone description is clear, accurate, and compelling. They\'re the bridge between raw intelligence and public understanding — turning agent outputs into content people actually want to read.',
        responsibilities: [
            'Review and improve risk and solution narratives',
            'Write and curate milestone descriptions',
            'Ensure summaries are accessible without dumbing things down',
            'Flag outdated content for re-evaluation',
        ],
        canDo: ['Edit narratives and descriptions', 'Create and manage milestones'],
        cantDo: ['Change risk scores', 'Approve or reject signals'],
        ifInactive: 'Content stays as-is — flagged "needs review" if stale',
    },
    {
        id: 'lead',
        title: 'Lead',
        avatar: observatoryStewardAvatar,
        tagline: 'Final call',
        reviews: 'Everything (escalation point)',
        effort: '2-5 hours/week',
        description: 'The Lead has final authority over the observatory\'s integrity. When scoring changes are too large for a single reviewer, when two reviewers disagree, or when the taxonomy itself needs updating — the Lead decides. They set policy, resolve conflicts, and ensure the system stays honest.',
        responsibilities: [
            'Final sign-off on major scoring changes and new categories',
            'Resolve conflicts between reviewers',
            'Set and update review policies and guidelines',
            'Monitor overall system health and agent performance',
        ],
        canDo: ['Override any decision with documented reasoning', 'Update scoring policy and taxonomy'],
        cantDo: ['Act without audit trail — all decisions are logged and reversible'],
        ifInactive: 'Policy changes freeze, critical escalations queue until addressed',
    },
];

export default function Contribute() {
    const navigate = useNavigate();
    const [openRole, setOpenRole] = useState<string | null>(null);

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
                    &larr; Back to Home
                </button>
            </header>

            {/* Main */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-4xl mx-auto space-y-10">
                    {/* Hero */}
                    <div className="text-center space-y-4">
                        <h1 className="text-3xl md:text-4xl font-bold">
                            Help keep AI oversight <span className="text-cyan-400">human</span>
                        </h1>
                        <p className="text-base text-gray-400 max-w-2xl mx-auto">
                            Our AI agents scan, classify, and analyze thousands of signals every week.
                            But no data enters the observatory without a human saying "yes."
                            That's where you come in.
                        </p>
                    </div>

                    {/* How it works */}
                    <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-6">
                        <h2 className="text-lg font-bold mb-4">How the pipeline works</h2>
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                <span className="text-gray-300">News sources</span>
                            </div>
                            <span className="text-gray-600 hidden md:block">&rarr;</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                                <span className="text-gray-300">Signal Scout <span className="text-gray-600">(AI)</span></span>
                            </div>
                            <span className="text-gray-600 hidden md:block">&rarr;</span>
                            <div className="flex items-center gap-2 bg-cyan-400/10 px-2 py-1 rounded">
                                <span className="text-cyan-400 font-medium">Human review</span>
                            </div>
                            <span className="text-gray-600 hidden md:block">&rarr;</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                                <span className="text-gray-300">Discovery + Validator <span className="text-gray-600">(AI)</span></span>
                            </div>
                            <span className="text-gray-600 hidden md:block">&rarr;</span>
                            <div className="flex items-center gap-2 bg-cyan-400/10 px-2 py-1 rounded">
                                <span className="text-cyan-400 font-medium">Human review</span>
                            </div>
                            <span className="text-gray-600 hidden md:block">&rarr;</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                <span className="text-gray-300">Published</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                            Every piece of data passes through at least one human checkpoint. If nobody reviews it, it stays pending — never published silently.
                        </p>
                    </div>

                    {/* Roles */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold">Open roles</h2>

                        {ROLES.map((role) => {
                            const isOpen = openRole === role.id;
                            return (
                                <div key={role.id} className="bg-[#0d1526] border border-[#1a2035] rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setOpenRole(isOpen ? null : role.id)}
                                        className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <img
                                            src={role.avatar}
                                            alt={role.title}
                                            className="w-14 h-14 rounded-full flex-shrink-0 object-cover"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <h3 className="text-base font-bold text-white">{role.title}</h3>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 uppercase tracking-wider">
                                                    {role.effort}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-400 mt-0.5">{role.tagline}</p>
                                        </div>
                                        <div className="text-gray-500 text-lg shrink-0">{isOpen ? '−' : '+'}</div>
                                    </button>

                                    {isOpen && (
                                        <div className="px-5 pb-5 pt-0 border-t border-[#1a2035] space-y-4">
                                            {/* What they review */}
                                            <div className="pt-4">
                                                <span className="text-[10px] uppercase tracking-widest text-gray-600">Reviews output from</span>
                                                <p className="text-sm text-cyan-400 mt-0.5">{role.reviews}</p>
                                            </div>

                                            {/* Description */}
                                            <p className="text-sm text-gray-300 leading-relaxed">
                                                {role.description}
                                            </p>

                                            {/* Responsibilities */}
                                            <div>
                                                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">What you'd do</h4>
                                                <ul className="space-y-1">
                                                    {role.responsibilities.map((r, i) => (
                                                        <li key={i} className="text-sm text-gray-400 flex gap-2">
                                                            <span className="text-gray-600 shrink-0">·</span>
                                                            {r}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {/* Permissions */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-emerald-400/5 border border-emerald-400/10 rounded p-3">
                                                    <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5">Can do</h4>
                                                    {role.canDo.map((item, i) => (
                                                        <p key={i} className="text-xs text-gray-400">{item}</p>
                                                    ))}
                                                </div>
                                                <div className="bg-red-400/5 border border-red-400/10 rounded p-3">
                                                    <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1.5">Can't do</h4>
                                                    {role.cantDo.map((item, i) => (
                                                        <p key={i} className="text-xs text-gray-400">{item}</p>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* If inactive */}
                                            <div className="text-xs text-gray-500 bg-white/5 rounded p-3">
                                                <strong className="text-gray-400">If you're unavailable:</strong> {role.ifInactive}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Safety */}
                    <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-6">
                        <h2 className="text-base font-bold mb-3">Built-in safety</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-400">
                            <div className="flex gap-2">
                                <span className="text-cyan-400 shrink-0">1.</span>
                                <span>Inaction never causes silent changes — data stays pending, not published</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-cyan-400 shrink-0">2.</span>
                                <span>Every decision is logged with timestamp, author, and reasoning</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-cyan-400 shrink-0">3.</span>
                                <span>All actions are reversible — nothing is permanently deleted</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-cyan-400 shrink-0">4.</span>
                                <span>Large changes automatically escalate for additional review</span>
                            </div>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-6 text-center">
                        <h2 className="text-xl font-bold text-cyan-300 mb-2">Interested?</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            We're building the onboarding platform now. Reach out and we'll get you started.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <a
                                href="mailto:contribute@ai4society.org"
                                className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-white text-sm font-semibold tracking-wider uppercase rounded transition-colors"
                            >
                                Get in touch
                            </a>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-wider uppercase rounded transition-colors"
                            >
                                Explore the Observatory
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="py-6 border-t border-[#1a2035] text-center">
                <p className="text-xs text-gray-500">
                    AI 4 Society Observatory &middot; A volunteer-driven transparency initiative
                </p>
            </footer>
        </div>
    );
}
