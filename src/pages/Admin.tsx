import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, increment, type QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { canAccessTab } from '../lib/roles';
import type { UserRole } from '../lib/roles';
import PipelineHealth from '../components/PipelineHealth';
import DiscoveryTab from '../components/admin/DiscoveryTab';
import ValidationTab from '../components/admin/ValidationTab';
import MilestonesTab from '../components/admin/MilestonesTab';
import UsersTab from '../components/admin/UsersTab';

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
    validationIssues?: Array<{ rule: string; severity: string; message: string; field: string }>;
    signal_type?: "risk" | "solution" | "both" | "unmatched";
    solution_ids?: string[];
    proposed_topic?: string;
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
    const { user, userDoc, logOut } = useAuth();
    const navigate = useNavigate();
    const [allSignals, setAllSignals] = useState<Signal[]>([]);
    const [filter, setFilter] = useState<SignalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<Signal | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [updating, setUpdating] = useState(false);
    type AdminTab = 'risk-signals' | 'solution-signals' | 'discovery' | 'validation' | 'milestones' | 'users';

    const TAB_CONFIG: Record<AdminTab, { label: string; accent: string }> = {
        'risk-signals': { label: 'Risk Signals', accent: 'border-cyan-400' },
        'solution-signals': { label: 'Solution Signals', accent: 'border-cyan-400' },
        'discovery': { label: 'Discovery', accent: 'border-cyan-400' },
        'validation': { label: 'Validation', accent: 'border-cyan-400' },
        'milestones': { label: 'Milestones', accent: 'border-yellow-400' },
        'users': { label: 'Users', accent: 'border-emerald-400' },
    };

    const ALL_TABS: AdminTab[] = ['risk-signals', 'solution-signals', 'discovery', 'validation', 'milestones', 'users'];
    const userRoles: UserRole[] = userDoc?.roles ?? [];
    const visibleTabs = ALL_TABS.filter(tab => canAccessTab(userRoles, tab));

    const [adminTab, setAdminTab] = useState<AdminTab>('risk-signals');
    const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
    const [bulkRejectDay, setBulkRejectDay] = useState<string | null>(null);
    const [bulkRejectNote, setBulkRejectNote] = useState('');
    const [bulkRejecting, setBulkRejecting] = useState(false);
    const [pendingCounts, setPendingCounts] = useState<{ risk: number; solution: number }>({ risk: 0, solution: 0 });

    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.includes(adminTab)) {
            setAdminTab(visibleTabs[0]!);
        }
    }, [visibleTabs, adminTab]);

    // Client-side filter by signal_type — avoids composite index dependency
    const signalTypeValues = adminTab === 'risk-signals' ? ['risk', 'both'] : ['solution', 'both'];
    const signals = allSignals.filter(s => signalTypeValues.includes(s.signal_type ?? 'risk'));

    // Group signals by published_date
    const groupedSignals = useMemo(() => {
        const groups = new Map<string, Signal[]>();
        for (const signal of signals) {
            const day = signal.published_date?.slice(0, 10) || 'Unknown';
            const group = groups.get(day);
            if (group) {
                group.push(signal);
            } else {
                groups.set(day, [signal]);
            }
        }
        return groups;
    }, [signals]);

    // Always track pending counts for both signal tabs
    useEffect(() => {
        const q = query(collection(db, 'signals'), where('status', '==', 'pending'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let risk = 0;
            let solution = 0;
            for (const d of snapshot.docs) {
                const type = d.data().signal_type as string | undefined;
                if (type === 'solution') solution++;
                else if (type === 'both') { risk++; solution++; }
                else if (type !== 'unmatched') risk++; // 'risk' or undefined (skip unmatched)
            }
            setPendingCounts({ risk, solution });
        }, (error) => {
            console.error('Pending count query error:', error);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (adminTab !== 'risk-signals' && adminTab !== 'solution-signals') return;

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
                setAllSignals(docs);
            },
            (error) => {
                console.error('Firestore query error:', error);
            }
        );

        return unsubscribe;
    }, [filter, adminTab]);

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
            // Increment reviewer's totalReviews
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                updateDoc(userRef, { totalReviews: increment(1) }).catch(() => {});
            }
            setSelected(null);
            setAdminNotes('');
        } finally {
            setUpdating(false);
        }
    };

    const toggleDay = (day: string) => {
        setCollapsedDays(prev => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
    };

    const handleBulkReject = async (day: string) => {
        const group = groupedSignals.get(day);
        if (!group || !bulkRejectNote.trim()) {
            alert('Please add a note for the bulk rejection.');
            return;
        }
        const pendingInGroup = group.filter(s => s.status === 'pending');
        if (pendingInGroup.length === 0) return;

        setBulkRejecting(true);
        try {
            await Promise.all(pendingInGroup.map(s =>
                updateDoc(doc(db, 'signals', s.id), {
                    status: 'rejected',
                    admin_notes: bulkRejectNote,
                    reviewed_at: serverTimestamp(),
                    reviewed_by: user?.uid ?? null,
                })
            ));
            // Increment reviewer's totalReviews by number of rejected signals
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                updateDoc(userRef, { totalReviews: increment(pendingInGroup.length) }).catch(() => {});
            }
            setBulkRejectDay(null);
            setBulkRejectNote('');
            if (selected && pendingInGroup.some(s => s.id === selected.id)) {
                setSelected(null);
            }
        } finally {
            setBulkRejecting(false);
        }
    };

    const severityColor = (hint: string) => {
        if (hint === 'Critical') return 'text-red-400';
        if (hint === 'Emerging') return 'text-orange-400';
        return 'text-gray-400';
    };

    const selectSignal = (signal: Signal) => {
        setSelected(signal);
        setAdminNotes(signal.admin_notes ?? '');
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
                        &larr; Home
                    </button>
                    <h1 className="text-lg font-bold shrink-0">Admin</h1>
                    <PipelineHealth />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 truncate">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors shrink-0">
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Tabs — horizontally scrollable on mobile */}
            <div className="flex gap-4 px-4 border-b border-white/10 overflow-x-auto md:gap-6 md:px-6">
                {visibleTabs.map(tab => {
                    const pending = tab === 'risk-signals' ? pendingCounts.risk
                        : tab === 'solution-signals' ? pendingCounts.solution
                        : 0;
                    return (
                        <button
                            key={tab}
                            onClick={() => setAdminTab(tab)}
                            className={`relative py-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
                                adminTab === tab
                                    ? `${TAB_CONFIG[tab].accent} text-white`
                                    : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {TAB_CONFIG[tab].label}
                            {(tab === 'risk-signals' || tab === 'solution-signals') && pending > 0 && (
                                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    adminTab === tab
                                        ? 'bg-yellow-400/15 text-yellow-400'
                                        : 'bg-red-500/15 text-red-400'
                                }`}>
                                    {pending}
                                </span>
                            )}
                        </button>
                    );
                })}
                <button
                    onClick={() => navigate('/observatory')}
                    className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300 whitespace-nowrap"
                >
                    Observatory
                </button>
            </div>

            {adminTab === 'discovery' && (
                <DiscoveryTab />
            )}

            {adminTab === 'validation' && (
                <ValidationTab />
            )}

            {adminTab === 'milestones' && (
                <MilestonesTab />
            )}

            {adminTab === 'users' && (
                <UsersTab />
            )}

            {(adminTab === 'risk-signals' || adminTab === 'solution-signals') && (
                <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
                    {/* Left: Filter + List (full width on mobile, hidden when detail selected on mobile) */}
                    <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-white/10 flex-col`}>
                        {/* Filters */}
                        <div className="flex gap-1 p-3 border-b border-white/10">
                            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-2 py-1 rounded text-xs capitalize transition-colors ${filter === f
                                        ? 'bg-white/10 text-white'
                                        : 'text-gray-500 hover:text-white'
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>

                        {/* Signal List — grouped by day */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {[...groupedSignals.entries()].map(([day, daySignals]) => {
                                const isCollapsed = collapsedDays.has(day);
                                const pendingCount = daySignals.filter(s => s.status === 'pending').length;
                                const showBulkReject = pendingCount > 0 && (filter === 'pending' || filter === 'all');

                                return (
                                    <div key={day} className="mb-1">
                                        {/* Day header */}
                                        <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-[var(--bg-primary)]">
                                            <button
                                                onClick={() => toggleDay(day)}
                                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                            >
                                                <span className="text-[10px] text-gray-500 transition-transform" style={{ display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                                    &#9662;
                                                </span>
                                                <span className="text-[10px] font-medium text-gray-400">{day}</span>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                                                    {daySignals.length}
                                                </span>
                                            </button>
                                            {showBulkReject && bulkRejectDay !== day && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setBulkRejectDay(day); setBulkRejectNote(''); }}
                                                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors shrink-0"
                                                >
                                                    Reject All ({pendingCount})
                                                </button>
                                            )}
                                        </div>

                                        {/* Bulk reject inline form */}
                                        {bulkRejectDay === day && (
                                            <div className="mx-2 mb-2 p-2 rounded bg-red-400/5 border border-red-400/20 space-y-2">
                                                <textarea
                                                    value={bulkRejectNote}
                                                    onChange={(e) => setBulkRejectNote(e.target.value)}
                                                    placeholder="Rejection note for all pending signals..."
                                                    rows={2}
                                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-red-400/50"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleBulkReject(day)}
                                                        disabled={bulkRejecting || !bulkRejectNote.trim()}
                                                        className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-medium transition-colors disabled:opacity-50"
                                                    >
                                                        {bulkRejecting ? 'Rejecting...' : `Reject ${pendingCount} signal${pendingCount !== 1 ? 's' : ''}`}
                                                    </button>
                                                    <button
                                                        onClick={() => setBulkRejectDay(null)}
                                                        className="px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Signals in this day */}
                                        {!isCollapsed && (
                                            <div className="space-y-1">
                                                {daySignals.map((signal) => (
                                                    <div
                                                        key={signal.id}
                                                        onClick={() => selectSignal(signal)}
                                                        className={`p-3 rounded cursor-pointer transition-all ${selected?.id === signal.id
                                                            ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                                            : 'hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <div className="text-sm font-medium line-clamp-2">{signal.title}</div>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[9px] text-gray-500">{signal.source_name}</span>
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[signal.status]}`}>
                                                                {signal.status}
                                                            </span>
                                                            {signal.confidence_score >= 0.9 && (
                                                                <span className="text-[9px] text-green-400">HIGH</span>
                                                            )}
                                                            {signal.validationIssues && signal.validationIssues.length > 0 && (
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                                                    signal.validationIssues.some((i) => i.severity === 'critical')
                                                                        ? 'bg-red-400/10 text-red-400'
                                                                        : 'bg-yellow-400/10 text-yellow-400'
                                                                }`}>
                                                                    {signal.validationIssues.length} issue{signal.validationIssues.length > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                            {signal.signal_type === 'both' && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400">
                                                                    {adminTab === 'risk-signals'
                                                                        ? (signal.solution_ids ?? []).join(', ')
                                                                        : (signal.risk_categories ?? []).join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {signals.length === 0 && (
                                <div className="text-center text-gray-500 text-sm py-8">
                                    No {filter === 'all' ? '' : filter} signals
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Detail Panel (full-screen overlay on mobile) */}
                    <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-y-auto`}>
                        {selected ? (
                            <div className="p-4 md:p-6">
                                {/* Mobile back button */}
                                <button
                                    onClick={() => setSelected(null)}
                                    className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden"
                                >
                                    &larr; Back to list
                                </button>

                                <div className="max-w-2xl">
                                    <h2 className="text-xl font-bold mb-2">{selected.title}</h2>

                                    <div className="flex items-center gap-3 mb-4 flex-wrap">
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

                                        {adminTab === 'risk-signals' && (
                                            <>
                                                <div>
                                                    <span className="text-[10px] text-gray-500">Risk Categories</span>
                                                    <div className="flex gap-1 mt-1 flex-wrap">
                                                        {selected.risk_categories.map((rc) => (
                                                            <span key={rc} className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                                                                {rc}: {RISK_LABELS[rc] ?? rc}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {selected.signal_type === 'both' && selected.solution_ids && selected.solution_ids.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500">Also linked to Solutions</span>
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {selected.solution_ids.map((sid) => (
                                                                <span key={sid} className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400">
                                                                    {sid}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {adminTab === 'solution-signals' && (
                                            <>
                                                {selected.solution_ids && selected.solution_ids.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500">Solution IDs</span>
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {selected.solution_ids.map((sid) => (
                                                                <span key={sid} className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400">
                                                                    {sid}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {selected.signal_type === 'both' && selected.risk_categories.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500">Also linked to Risk Categories</span>
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {selected.risk_categories.map((rc) => (
                                                                <span key={rc} className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                                                                    {rc}: {RISK_LABELS[rc] ?? rc}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

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

                                    {/* Validation Issues */}
                                    {selected.validationIssues && selected.validationIssues.length > 0 && (
                                        <div className="bg-red-400/5 border border-red-400/20 rounded p-4 mb-6">
                                            <h3 className="text-xs uppercase tracking-widest text-red-400 mb-2">Validation Issues</h3>
                                            <div className="space-y-1">
                                                {selected.validationIssues.map((issue, i) => (
                                                    <div key={i} className="flex items-start gap-2 text-sm">
                                                        <span className={`text-[9px] px-1 py-0.5 rounded mt-0.5 ${
                                                            issue.severity === 'critical' ? 'bg-red-400/10 text-red-400' : 'bg-yellow-400/10 text-yellow-400'
                                                        }`}>
                                                            {issue.severity}
                                                        </span>
                                                        <span className="text-gray-300">{issue.message}</span>
                                                        <span className="text-gray-600 text-xs">({issue.field})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

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
                                        <div className="flex gap-3 flex-wrap">
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
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                Select a signal to review
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
