import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import AgentDetail from '../components/observatory/AgentDetail';

// --- Types ---

interface AgentRegistry {
    id: string;
    name: string;
    description: string;
    tier: string;
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
    totalSignalsLifetime: number;
    lastRunArticlesFetched: number;
    lastRunSignalsStored: number;
    lastRunTokens: { input: number; output: number } | null;
    totalTokensMonth: { input: number; output: number };
    estimatedCostMonth: { geminiTokens: number; firestoreReads: number; firestoreWrites: number; functionsCompute: number; total: number } | number;
    lastRunCost: { geminiTokens: number; firestoreReads: number; firestoreWrites: number; functionsCompute: number; total: number } | null;
    lastError: string | null;
    lastErrorAt: { seconds: number } | null;
}

type HealthStatus = 'green' | 'yellow' | 'red' | 'gray';

// --- Helpers ---

const TIER_ORDER: Record<string, number> = { '1': 0, '2A': 1, '2B': 2, '2C': 3 };

const TIER_LABEL: Record<string, string> = {
    '1': 'Orchestrator',
    '2A': 'Scout / Tracker',
    '2B': 'Evaluator',
    '2C': 'Quality',
};

function computeAgentStatus(agent: AgentRegistry, health: AgentHealth | null): HealthStatus {
    if (agent.status === 'not_deployed') return 'gray';
    if (!health || !health.lastRunAt) return 'yellow'; // active but no runs yet

    const hoursAgo = (Date.now() - health.lastRunAt.seconds * 1000) / (1000 * 60 * 60);

    if (hoursAgo > 12 || health.consecutiveErrors >= 2) return 'red';
    if (hoursAgo > 7 || health.consecutiveEmptyRuns >= 3) return 'yellow';
    return 'green';
}

const STATUS_DOT: Record<HealthStatus, string> = {
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
    gray: 'bg-gray-500',
};

const STATUS_LABEL: Record<HealthStatus, string> = {
    green: 'Healthy',
    yellow: 'Awaiting Data',
    red: 'Degraded',
    gray: 'Not Deployed',
};

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// --- Component ---

export default function Observatory() {
    const { user, logOut } = useAuth();
    const navigate = useNavigate();
    const [agents, setAgents] = useState<AgentRegistry[]>([]);
    const [healthMap, setHealthMap] = useState<Record<string, AgentHealth>>({});
    const [selectedAgent, setSelectedAgent] = useState<AgentRegistry | null>(null);
    const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
    const [runResults, setRunResults] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

    // Subscribe to agents collection
    useEffect(() => {
        const q = query(collection(db, 'agents'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as AgentRegistry[];
            setAgents(docs);
        });
        return unsubscribe;
    }, []);

    // Subscribe to health docs for active agents
    useEffect(() => {
        const activeAgents = agents.filter((a) => a.status !== 'not_deployed');
        if (activeAgents.length === 0) return;

        const unsubscribes = activeAgents.map((agent) =>
            onSnapshot(doc(db, 'agents', agent.id, 'health', 'latest'), (snap) => {
                if (snap.exists()) {
                    setHealthMap((prev) => ({
                        ...prev,
                        [agent.id]: snap.data() as AgentHealth,
                    }));
                }
            })
        );

        return () => unsubscribes.forEach((u) => u());
    }, [agents]);

    const triggerAgent = async (agentId: string) => {
        setRunningAgents(prev => new Set(prev).add(agentId));
        setRunResults(prev => { const next = { ...prev }; delete next[agentId]; return next; });

        try {
            const functions = getFunctions();
            const trigger = httpsCallable<{ agentId: string }, { success: boolean; message: string }>(functions, 'triggerAgentRun');
            const result = await trigger({ agentId });
            setRunResults(prev => ({ ...prev, [agentId]: { type: 'success', message: result.data.message } }));
        } catch (err) {
            setRunResults(prev => ({ ...prev, [agentId]: { type: 'error', message: err instanceof Error ? err.message : 'Run failed' } }));
        } finally {
            setRunningAgents(prev => { const next = new Set(prev); next.delete(agentId); return next; });
        }
    };

    // Sort: active first, then by tier
    const sortedAgents = [...agents].sort((a, b) => {
        const aActive = a.status !== 'not_deployed' ? 0 : 1;
        const bActive = b.status !== 'not_deployed' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
    });

    const activeCount = agents.filter((a) => a.status !== 'not_deployed').length;

    // System summary
    const totalMonthlyTokens = Object.values(healthMap).reduce(
        (sum, h) => sum + (h.totalTokensMonth?.input || 0) + (h.totalTokensMonth?.output || 0),
        0
    );
    const totalMonthlyCost = Object.values(healthMap).reduce(
        (sum, h) => {
            const cost = h.estimatedCostMonth;
            if (typeof cost === 'number') return sum + cost;
            if (cost && typeof cost === 'object' && 'total' in cost) return sum + (cost as { total: number }).total;
            return sum;
        },
        0
    );
    const totalLifetimeSignals = Object.values(healthMap).reduce(
        (sum, h) => sum + (h.totalSignalsLifetime || 0),
        0
    );

    // If an agent is selected, show detail view
    if (selectedAgent) {
        return (
            <AgentDetail
                agent={selectedAgent}
                health={healthMap[selectedAgent.id] ?? null}
                onBack={() => setSelectedAgent(null)}
            />
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => navigate('/admin')} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
                        &larr; Admin
                    </button>
                    <h1 className="text-lg font-bold shrink-0">Observatory</h1>
                    <span className="text-xs text-gray-500">
                        {activeCount} active agent{activeCount !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 truncate">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors shrink-0">
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="p-4 max-w-7xl mx-auto space-y-6 md:p-6">
                {/* System Summary */}
                <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">System Summary</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <div className="text-[10px] text-gray-500">Tokens This Month</div>
                            <div className="text-lg font-bold">{totalMonthlyTokens.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Est. Cost</div>
                            <div className="text-lg font-bold">${totalMonthlyCost.toFixed(4)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500">Lifetime Signals</div>
                            <div className="text-lg font-bold">{totalLifetimeSignals.toLocaleString()}</div>
                        </div>
                    </div>
                </div>


                {/* Agent Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedAgents.map((agent) => {
                        const health = healthMap[agent.id] ?? null;
                        const status = computeAgentStatus(agent, health);
                        const isRunning = runningAgents.has(agent.id);
                        const runResult = runResults[agent.id];

                        return (
                            <div
                                key={agent.id}
                                onClick={() => setSelectedAgent(agent)}
                                className="bg-white/5 rounded-lg border border-white/10 p-4 cursor-pointer hover:bg-white/[0.08] transition-colors"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                                    <span className="text-sm font-semibold">{agent.name}</span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 uppercase tracking-wider">
                                        {TIER_LABEL[agent.tier] ?? agent.tier}
                                    </span>
                                    <span className="text-[10px] text-gray-500">{STATUS_LABEL[status]}</span>
                                </div>
                                <div className="text-[10px] text-gray-500 mb-2">
                                    {health?.lastRunAt
                                        ? `Last run ${timeAgo(health.lastRunAt.seconds)}`
                                        : 'No runs yet'}
                                </div>

                                {/* Run Now button (only for deployed agents) */}
                                {agent.status !== 'not_deployed' && (
                                    <div className="mt-2 pt-2 border-t border-white/5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); triggerAgent(agent.id); }}
                                            disabled={isRunning}
                                            className="px-3 py-1 rounded text-[10px] font-medium bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors disabled:opacity-50"
                                        >
                                            {isRunning ? (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                                                    Running...
                                                </span>
                                            ) : 'Run Now'}
                                        </button>
                                        {runResult && (
                                            <div className={`mt-1.5 text-[9px] ${runResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                                {runResult.message}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {agents.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-12">
                        No agents found in registry
                    </div>
                )}
            </div>
        </div>
    );
}
