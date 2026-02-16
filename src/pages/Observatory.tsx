import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import AgentDetail from '../components/observatory/AgentDetail';

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

type HealthStatus = 'green' | 'yellow' | 'red' | 'gray';

// --- Helpers ---

const TIER_ORDER: Record<string, number> = { scout: 0, analyst: 1, sentinel: 2 };

function computeAgentStatus(agent: AgentRegistry, health: AgentHealth | null): HealthStatus {
    if (agent.status === 'not_deployed') return 'gray';
    if (!health || !health.lastRunAt) return 'gray';

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
    yellow: 'Warning',
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
        (sum, h) => sum + (h.monthlyTokensIn || 0) + (h.monthlyTokensOut || 0),
        0
    );
    const totalMonthlyCost = Object.values(healthMap).reduce(
        (sum, h) => sum + (h.monthlyCostEstimate || 0),
        0
    );
    const totalLifetimeSignals = Object.values(healthMap).reduce(
        (sum, h) => sum + (h.lifetimeSignals || 0),
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white transition-colors">
                        &larr; Home
                    </button>
                    <h1 className="text-lg font-bold">Observatory</h1>
                    <span className="text-xs text-gray-500">
                        {activeCount} active agent{activeCount !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors">
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="p-6 max-w-7xl mx-auto space-y-6">
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
                                        {agent.tier}
                                    </span>
                                    <span className="text-[10px] text-gray-500">{STATUS_LABEL[status]}</span>
                                </div>
                                <div className="text-[10px] text-gray-500">
                                    {health?.lastRunAt
                                        ? `Last run ${timeAgo(health.lastRunAt.seconds)}`
                                        : 'No runs yet'}
                                </div>
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
