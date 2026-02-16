import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

// --- Types ---

interface AgentRegistry {
    id: string;
    name: string;
    description: string;
    tier: 'scout' | 'analyst' | 'sentinel';
    status: 'active' | 'paused' | 'not_deployed';
    functionName: string | null;
    schedule: string | null;
    overseerRole: string;
}

interface AgentHealth {
    lastRunAt: { seconds: number } | null;
    lastRunOutcome: 'success' | 'partial' | 'empty' | 'error' | null;
    consecutiveErrors: number;
    consecutiveEmptyRuns: number;
    lifetimeSignals: number;
    articlesFetched: number;
    signalsStored: number;
    tokensIn: number;
    tokensOut: number;
    monthlyTokensIn: number;
    monthlyTokensOut: number;
    monthlyCostEstimate: number;
    lastError: string | null;
    lastErrorAt: { seconds: number } | null;
}

interface AgentConfig {
    dataSources: Record<string, { enabled: boolean; label?: string }>;
    updatedAt?: { seconds: number } | null;
    updatedBy?: string | null;
}

interface RunRecord {
    id: string;
    startedAt: { seconds: number } | null;
    endedAt: { seconds: number } | null;
    outcome: 'success' | 'partial' | 'empty' | 'error';
    articlesFetched: number;
    signalsStored: number;
    tokensIn: number;
    tokensOut: number;
    sourcesUsed: string[];
    errorMessage: string | null;
}

interface Props {
    agent: AgentRegistry;
    health: AgentHealth | null;
    onBack: () => void;
}

// --- Helpers ---

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

const OUTCOME_ICON: Record<string, string> = {
    success: '\u2713',
    partial: '\u26A0',
    empty: '\u25CB',
    error: '\u2717',
};

const OUTCOME_COLOR: Record<string, string> = {
    success: 'text-green-400',
    partial: 'text-yellow-400',
    empty: 'text-gray-400',
    error: 'text-red-400',
};

// --- Component ---

export default function AgentDetail({ agent, health, onBack }: Props) {
    const { user } = useAuth();
    const [tab, setTab] = useState<'health' | 'config' | 'runs'>('health');

    // Not deployed: show info card only
    if (agent.status === 'not_deployed') {
        return (
            <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
                    <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors">
                        &larr; Back
                    </button>
                    <h1 className="text-lg font-bold">{agent.name}</h1>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 uppercase tracking-wider">
                        Not Deployed
                    </span>
                </div>
                <div className="p-6 max-w-3xl mx-auto">
                    <div className="bg-white/5 rounded-lg border border-white/10 p-6 space-y-4">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Description</div>
                            <div className="text-sm text-gray-300">{agent.description}</div>
                        </div>
                        <div className="flex gap-8">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Tier</div>
                                <div className="text-sm text-cyan-400 capitalize">{agent.tier}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Overseer Role</div>
                                <div className="text-sm text-gray-300">{agent.overseerRole}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const tabs = ['health', 'config', 'runs'] as const;

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
                <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors">
                    &larr; Back
                </button>
                <h1 className="text-lg font-bold">{agent.name}</h1>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 uppercase tracking-wider">
                    {agent.tier}
                </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 px-6 border-b border-white/10">
                {tabs.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`py-3 text-sm capitalize transition-colors border-b-2 ${
                            tab === t
                                ? 'border-cyan-400 text-white'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {t === 'runs' ? 'Run History' : t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="p-6 max-w-4xl mx-auto">
                {tab === 'health' && <HealthTab health={health} />}
                {tab === 'config' && <ConfigTab agentId={agent.id} schedule={agent.schedule} functionName={agent.functionName} userId={user?.uid ?? null} />}
                {tab === 'runs' && <RunsTab agentId={agent.id} />}
            </div>
        </div>
    );
}

// --- Health Tab ---

function HealthTab({ health }: { health: AgentHealth | null }) {
    if (!health) {
        return <div className="text-gray-500 text-sm py-8 text-center">No health data available</div>;
    }

    return (
        <div className="space-y-6">
            {/* Status Grid */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-[10px] text-gray-500">Outcome</div>
                        <div className={`text-sm font-bold capitalize ${OUTCOME_COLOR[health.lastRunOutcome ?? 'empty']}`}>
                            {health.lastRunOutcome ?? 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Last Run</div>
                        <div className="text-sm font-bold">
                            {health.lastRunAt ? timeAgo(health.lastRunAt.seconds) : 'Never'}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Consecutive Errors</div>
                        <div className={`text-sm font-bold ${health.consecutiveErrors >= 2 ? 'text-red-400' : ''}`}>
                            {health.consecutiveErrors}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Lifetime Signals</div>
                        <div className="text-sm font-bold">{health.lifetimeSignals.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Last Run Metrics */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Last Run Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-[10px] text-gray-500">Articles Fetched</div>
                        <div className="text-sm font-bold">{health.articlesFetched}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Signals Stored</div>
                        <div className="text-sm font-bold">{health.signalsStored}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Tokens In</div>
                        <div className="text-sm font-bold">{health.tokensIn.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Tokens Out</div>
                        <div className="text-sm font-bold">{health.tokensOut.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Monthly Totals */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Monthly Totals</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-[10px] text-gray-500">Tokens In</div>
                        <div className="text-sm font-bold">{health.monthlyTokensIn.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Tokens Out</div>
                        <div className="text-sm font-bold">{health.monthlyTokensOut.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Est. Cost</div>
                        <div className="text-sm font-bold">${health.monthlyCostEstimate.toFixed(4)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Consecutive Empty</div>
                        <div className={`text-sm font-bold ${health.consecutiveEmptyRuns >= 3 ? 'text-yellow-400' : ''}`}>
                            {health.consecutiveEmptyRuns}
                        </div>
                    </div>
                </div>
            </div>

            {/* Last Error */}
            {health.lastError && (
                <div className="bg-red-400/5 rounded-lg border border-red-400/20 p-4">
                    <h3 className="text-xs uppercase tracking-widest text-red-400 mb-2">Last Error</h3>
                    <div className="text-sm text-red-300 font-mono break-all">{health.lastError}</div>
                    {health.lastErrorAt && (
                        <div className="text-[10px] text-gray-500 mt-2">{formatTime(health.lastErrorAt.seconds)}</div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- Config Tab ---

function ConfigTab({ agentId, schedule, functionName, userId }: { agentId: string; schedule: string | null; functionName: string | null; userId: string | null }) {
    const [config, setConfig] = useState<AgentConfig | null>(null);
    const [localSources, setLocalSources] = useState<Record<string, { enabled: boolean; label?: string }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, 'agents', agentId, 'config', 'current'),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data() as AgentConfig;
                    setConfig(data);
                    setLocalSources(JSON.parse(JSON.stringify(data.dataSources ?? {})));
                    setHasChanges(false);
                }
            }
        );
        return unsubscribe;
    }, [agentId]);

    const toggleSource = (key: string) => {
        setLocalSources((prev) => {
            const updated = { ...prev };
            const existing = updated[key];
            if (existing) {
                updated[key] = { ...existing, enabled: !existing.enabled };
            }
            return updated;
        });
        setHasChanges(true);
    };

    const saveChanges = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'agents', agentId, 'config', 'current'), {
                dataSources: localSources,
                updatedAt: serverTimestamp(),
                updatedBy: userId,
            });
            setHasChanges(false);
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return <div className="text-gray-500 text-sm py-8 text-center">No config found</div>;
    }

    return (
        <div className="space-y-6">
            {/* Data Sources */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Data Sources</h3>
                <div className="space-y-2">
                    {Object.entries(localSources).map(([key, source]) => (
                        <label key={key} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-white/5 cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                checked={source.enabled}
                                onChange={() => toggleSource(key)}
                                className="accent-cyan-400"
                            />
                            <span className="text-sm">{source.label ?? key}</span>
                            <span className="text-[10px] text-gray-500 ml-auto">{key}</span>
                        </label>
                    ))}
                </div>
                {hasChanges && (
                    <button
                        onClick={saveChanges}
                        disabled={saving}
                        className="mt-4 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                )}
            </div>

            {/* View-only config */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Runtime Config</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-[10px] text-gray-500">Schedule</div>
                        <div className="text-sm font-mono">{schedule ?? 'N/A'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500">Function Name</div>
                        <div className="text-sm font-mono">{functionName ?? 'N/A'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Runs Tab ---

function RunsTab({ agentId }: { agentId: string }) {
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'agents', agentId, 'runs'),
            orderBy('startedAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as RunRecord[];
            setRuns(docs);
        });
        return unsubscribe;
    }, [agentId]);

    if (runs.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No run history</div>;
    }

    return (
        <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-5 gap-4 px-4 py-2 border-b border-white/10 text-[10px] text-gray-500 uppercase tracking-wider">
                <div>Time</div>
                <div>Outcome</div>
                <div>Duration</div>
                <div>Signals</div>
                <div>Tokens</div>
            </div>

            {/* Rows */}
            {runs.map((run) => {
                const duration =
                    run.startedAt && run.endedAt
                        ? Math.round((run.endedAt.seconds - run.startedAt.seconds))
                        : null;
                const isExpanded = expandedId === run.id;

                return (
                    <div key={run.id}>
                        <div
                            onClick={() => setExpandedId(isExpanded ? null : run.id)}
                            className="grid grid-cols-5 gap-4 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/10 text-sm"
                        >
                            <div className="text-gray-300">
                                {run.startedAt ? timeAgo(run.startedAt.seconds) : 'N/A'}
                            </div>
                            <div className={OUTCOME_COLOR[run.outcome]}>
                                {OUTCOME_ICON[run.outcome]} {run.outcome}
                            </div>
                            <div className="text-gray-300">{duration !== null ? `${duration}s` : 'N/A'}</div>
                            <div className="text-gray-300">{run.signalsStored}</div>
                            <div className="text-gray-300">{(run.tokensIn + run.tokensOut).toLocaleString()}</div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div>
                                        <span className="text-gray-500">Articles Fetched:</span>{' '}
                                        <span className="text-gray-300">{run.articlesFetched}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Signals Stored:</span>{' '}
                                        <span className="text-gray-300">{run.signalsStored}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Tokens In:</span>{' '}
                                        <span className="text-gray-300">{run.tokensIn.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Tokens Out:</span>{' '}
                                        <span className="text-gray-300">{run.tokensOut.toLocaleString()}</span>
                                    </div>
                                </div>
                                {run.sourcesUsed && run.sourcesUsed.length > 0 && (
                                    <div className="text-xs">
                                        <span className="text-gray-500">Sources:</span>{' '}
                                        <span className="text-gray-300">{run.sourcesUsed.join(', ')}</span>
                                    </div>
                                )}
                                {run.errorMessage && (
                                    <div className="text-xs text-red-400 font-mono break-all">
                                        Error: {run.errorMessage}
                                    </div>
                                )}
                                {run.startedAt && (
                                    <div className="text-[10px] text-gray-500">
                                        Started: {formatTime(run.startedAt.seconds)}
                                        {run.endedAt && <> | Ended: {formatTime(run.endedAt.seconds)}</>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
