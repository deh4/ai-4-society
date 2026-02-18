import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, type QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import PipelineHealth from '../components/PipelineHealth';
import RiskUpdatesTab from '../components/admin/RiskUpdatesTab';
import SolutionUpdatesTab from '../components/admin/SolutionUpdatesTab';

type SignalStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface Signal {
    id: string;
    title: string;
    summary: string;
    source_url: string;
    source_name: string;
    published_date: string;
    risk_categories: string[];
    severity_hint: 'Critical' | 'Emerging' | 'Horizon';
    affected_groups: string[];
    confidence_score: number;
    status: SignalStatus;
    admin_notes?: string;
    fetched_at: { seconds: number } | null;
}

const RISK_LABELS: Record<string, string> = {
    R01: 'Algorithmic Discrimination',
    R02: 'Privacy Erosion',
    R03: 'Disinformation',
    R04: 'Labor Displacement',
    R05: 'Autonomous Weapons',
    R06: 'Power Concentration',
    R07: 'Environmental Cost',
    R08: 'Human Agency Loss',
    R09: 'Surveillance',
    R10: 'Model Collapse',
};

const STATUS_COLORS: Record<SignalStatus, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10',
    approved: 'text-green-400 bg-green-400/10',
    rejected: 'text-red-400 bg-red-400/10',
    edited: 'text-blue-400 bg-blue-400/10',
};

export default function Admin() {
    const { user, logOut } = useAuth();
    const navigate = useNavigate();
    const [signals, setSignals] = useState<Signal[]>([]);
    const [filter, setFilter] = useState<SignalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<Signal | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [updating, setUpdating] = useState(false);
    const [adminTab, setAdminTab] = useState<'signals' | 'risk-updates' | 'solution-updates'>('signals');

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('fetched_at', 'desc')];
        if (filter !== 'all') {
            constraints.unshift(where('status', '==', filter));
        }
        const q = query(collection(db, 'signals'), ...constraints);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as Signal[];
                setSignals(docs);
            },
            (error) => {
                console.error('Firestore query error:', error);
                // Fallback: try without status filter
                if (filter !== 'all') {
                    setFilter('all');
                }
            }
        );

        return unsubscribe;
    }, [filter]);

    const updateSignal = async (id: string, status: SignalStatus) => {
        if (status === 'rejected' && !adminNotes.trim()) {
            alert('Please add a note explaining why this signal is rejected.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'signals', id), {
                status,
                admin_notes: adminNotes || null,
                reviewed_at: serverTimestamp(),
                reviewed_by: user?.uid ?? null,
            });
            setSelected(null);
            setAdminNotes('');
        } finally {
            setUpdating(false);
        }
    };

    const severityColor = (hint: string) => {
        if (hint === 'Critical') return 'text-red-400';
        if (hint === 'Emerging') return 'text-orange-400';
        return 'text-gray-400';
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white transition-colors">
                        &larr; Home
                    </button>
                    <h1 className="text-lg font-bold">Admin</h1>
                    <PipelineHealth />
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors">
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 px-6 border-b border-white/10">
                <button
                    onClick={() => setAdminTab('signals')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'signals' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Signal Review
                    <span className="ml-2 text-[10px] text-gray-500">{signals.length}</span>
                </button>
                <button
                    onClick={() => setAdminTab('risk-updates')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'risk-updates' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Risk Updates
                </button>
                <button
                    onClick={() => setAdminTab('solution-updates')}
                    className={`py-3 text-sm transition-colors border-b-2 ${
                        adminTab === 'solution-updates' ? 'border-cyan-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Solution Updates
                </button>
                <button
                    onClick={() => navigate('/observatory')}
                    className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300"
                >
                    Observatory
                </button>
            </div>

            {adminTab === 'risk-updates' && (
                <div className="h-[calc(100vh-105px)]">
                    <RiskUpdatesTab />
                </div>
            )}

            {adminTab === 'solution-updates' && (
                <div className="h-[calc(100vh-105px)]">
                    <SolutionUpdatesTab />
                </div>
            )}

            {adminTab === 'signals' && <div className="flex h-[calc(100vh-105px)]">
                {/* Left: Filter + List */}
                <div className="w-80 border-r border-white/10 flex flex-col">
                    {/* Filters */}
                    <div className="flex gap-1 p-3 border-b border-white/10">
                        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                                    filter === f
                                        ? 'bg-white/10 text-white'
                                        : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Signal List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {signals.map((signal) => (
                            <div
                                key={signal.id}
                                onClick={() => { setSelected(signal); setAdminNotes(signal.admin_notes ?? ''); }}
                                className={`p-3 rounded cursor-pointer transition-all ${
                                    selected?.id === signal.id
                                        ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                        : 'hover:bg-white/5'
                                }`}
                            >
                                <div className="text-sm font-medium line-clamp-2">{signal.title}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-gray-500">{signal.source_name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[signal.status]}`}>
                                        {signal.status}
                                    </span>
                                    {signal.confidence_score >= 0.9 && (
                                        <span className="text-[9px] text-green-400">HIGH</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {signals.length === 0 && (
                            <div className="text-center text-gray-500 text-sm py-8">
                                No {filter === 'all' ? '' : filter} signals
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 overflow-y-auto p-6">
                    {selected ? (
                        <div className="max-w-2xl">
                            <h2 className="text-xl font-bold mb-2">{selected.title}</h2>

                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-xs text-gray-500">{selected.source_name}</span>
                                <span className="text-xs text-gray-500">{selected.published_date?.slice(0, 10)}</span>
                                {selected.source_url && (
                                    <a
                                        href={selected.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-cyan-400 hover:underline"
                                    >
                                        Source &rarr;
                                    </a>
                                )}
                            </div>

                            <p className="text-sm text-gray-300 leading-relaxed mb-6">{selected.summary}</p>

                            {/* Classification */}
                            <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Gemini Classification</h3>

                                <div>
                                    <span className="text-[10px] text-gray-500">Risk Categories</span>
                                    <div className="flex gap-1 mt-1">
                                        {selected.risk_categories.map((rc) => (
                                            <span key={rc} className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                                                {rc}: {RISK_LABELS[rc] ?? rc}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-6">
                                    <div>
                                        <span className="text-[10px] text-gray-500">Severity</span>
                                        <div className={`text-sm font-bold ${severityColor(selected.severity_hint)}`}>
                                            {selected.severity_hint}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-500">Confidence</span>
                                        <div className="text-sm font-bold">
                                            {Math.round(selected.confidence_score * 100)}%
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-gray-500">Affected Groups</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selected.affected_groups.map((g) => (
                                            <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300">
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Admin Notes */}
                            <div className="mb-4">
                                <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                                <textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add context or reason for rejection..."
                                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-cyan-400/50"
                                />
                            </div>

                            {/* Actions */}
                            {selected.status === 'pending' && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => updateSignal(selected.id, 'approved')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'rejected')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'edited')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Approve (Edited)
                                    </button>
                                </div>
                            )}

                            {selected.status !== 'pending' && (
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[selected.status]}`}>
                                        {selected.status}
                                    </span>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'pending')}
                                        disabled={updating}
                                        className="text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        Reset to Pending
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                            Select a signal to review
                        </div>
                    )}
                </div>
            </div>}
        </div>
    );
}
