import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface ProposedChange {
    current_value: unknown;
    proposed_value: unknown;
    reasoning: string;
}

interface ValidationProposal {
    id: string;
    document_type: 'risk' | 'solution';
    document_id: string;
    document_name: string;
    proposed_changes: Record<string, ProposedChange>;
    overall_reasoning: string;
    confidence: number;
    supporting_signal_ids: string[];
    status: ProposalStatus;
    created_at: { seconds: number } | null;
    admin_notes?: string;
}

// --- Word-level diff utility ---

interface DiffSegment {
    type: 'same' | 'add' | 'remove';
    text: string;
}

function computeWordDiff(oldStr: string, newStr: string): DiffSegment[] {
    const oldWords = oldStr.split(/(\s+)/);
    const newWords = newStr.split(/(\s+)/);

    // LCS table
    const m = oldWords.length;
    const n = newWords.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldWords[i - 1] === newWords[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack to build diff
    const segments: DiffSegment[] = [];
    let i = m, j = n;
    const raw: DiffSegment[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            raw.push({ type: 'same', text: oldWords[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            raw.push({ type: 'add', text: newWords[j - 1] });
            j--;
        } else {
            raw.push({ type: 'remove', text: oldWords[i - 1] });
            i--;
        }
    }
    raw.reverse();

    // Group consecutive same-type tokens
    for (const seg of raw) {
        if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
            segments[segments.length - 1].text += seg.text;
        } else {
            segments.push({ ...seg });
        }
    }

    return segments;
}

// --- Field labels ---

const FIELD_LABELS: Record<string, string> = {
    score_2026: 'Score 2026', score_2035: 'Score 2035',
    velocity: 'Velocity', expert_severity: 'Expert Severity',
    public_perception: 'Public Perception', deep_dive: 'Deep Dive',
    key_players: 'Key Players', case_studies: 'Case Studies',
    summary: 'Summary', risk_name: 'Risk Name', solution_title: 'Solution Title',
};

function humanizeField(field: string): string {
    if (FIELD_LABELS[field]) return FIELD_LABELS[field];
    return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Classification ---

function isShortField(change: ProposedChange): boolean {
    const cur = change.current_value;
    const prop = change.proposed_value;
    if (typeof cur === 'number' || typeof prop === 'number') return true;
    const curLen = typeof cur === 'string' ? cur.length : JSON.stringify(cur).length;
    const propLen = typeof prop === 'string' ? prop.length : JSON.stringify(prop).length;
    return curLen < 100 && propLen < 100;
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

// --- Inline diff renderer ---

function InlineDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
    const segments = computeWordDiff(oldStr, newStr);
    return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {segments.map((seg, i) => {
                if (seg.type === 'same') return <span key={i}>{seg.text}</span>;
                if (seg.type === 'add')
                    return <span key={i} className="bg-green-400/20 text-green-300 rounded-sm px-0.5">{seg.text}</span>;
                return <span key={i} className="bg-red-400/20 text-red-400 line-through rounded-sm px-0.5">{seg.text}</span>;
            })}
        </div>
    );
}

// --- Short field summary ---

function ShortFieldSummary({ field, change }: { field: string; change: ProposedChange }) {
    const cur = change.current_value;
    const prop = change.proposed_value;
    const isNumeric = typeof cur === 'number' && typeof prop === 'number';

    if (isNumeric) {
        const delta = (prop as number) - (cur as number);
        const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
        const sign = delta > 0 ? '+' : '';
        const colorClass = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';
        return (
            <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">{humanizeField(field)}:</span>
                <span className="text-gray-300">{String(cur)}</span>
                <span className="text-gray-500">→</span>
                <span className="text-white font-medium">{String(prop)}</span>
                {delta !== 0 && (
                    <span className={`text-xs font-medium ${colorClass}`}>
                        ({arrow}{sign}{delta})
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">{humanizeField(field)}:</span>
            <span className="text-gray-300">{formatValue(cur)}</span>
            <span className="text-gray-500">→</span>
            <span className="text-white font-medium">{formatValue(prop)}</span>
        </div>
    );
}

// --- Long field card ---

function LongFieldCard({
    field,
    change,
    editedValue,
    onEdit,
    isPending,
}: {
    field: string;
    change: ProposedChange;
    editedValue: unknown;
    onEdit: (value: unknown) => void;
    isPending: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const COLLAPSED_LINES = 5;

    const oldStr = formatValue(change.current_value);
    const newStr = formatValue(change.proposed_value);

    const segments = computeWordDiff(oldStr, newStr);
    const previewText = segments.map((s) => s.text).join('');
    const lines = previewText.split('\n');
    const needsCollapse = lines.length > COLLAPSED_LINES;
    const isCollapsed = needsCollapse && !expanded;

    return (
        <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-cyan-400">{humanizeField(field)}</h4>
                {isPending && (
                    <button
                        onClick={() => setEditing(!editing)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            editing
                                ? 'border-cyan-400/50 text-cyan-400 bg-cyan-400/10'
                                : 'border-white/10 text-gray-500 hover:text-white hover:border-white/20'
                        }`}
                    >
                        {editing ? 'Done' : 'Edit'}
                    </button>
                )}
            </div>

            {editing ? (
                <textarea
                    value={typeof editedValue === 'object'
                        ? JSON.stringify(editedValue, null, 2)
                        : String(editedValue ?? '')}
                    onChange={(e) => {
                        try {
                            onEdit(JSON.parse(e.target.value));
                        } catch {
                            onEdit(e.target.value);
                        }
                    }}
                    rows={10}
                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm font-mono text-white resize-y focus:outline-none focus:border-cyan-400/50"
                />
            ) : (
                <div>
                    <div className={isCollapsed ? 'max-h-32 overflow-y-auto' : ''}>
                        <InlineDiff oldStr={oldStr} newStr={newStr} />
                    </div>
                    {needsCollapse && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-2 transition-colors"
                        >
                            {expanded ? 'Show less' : `Show more (${lines.length} lines)`}
                        </button>
                    )}
                </div>
            )}

            {change.reasoning && (
                <p className="text-xs text-gray-500 italic border-l-2 border-white/10 pl-3">
                    {change.reasoning}
                </p>
            )}
        </div>
    );
}

// --- Main component ---

export default function ValidationTab() {
    const { user } = useAuth();
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<ValidationProposal | null>(null);
    const [editedChanges, setEditedChanges] = useState<Record<string, unknown>>({});
    const [adminNotes, setAdminNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [allProposals, setAllProposals] = useState<ValidationProposal[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'validation_proposals'), orderBy('created_at', 'desc'));
        return onSnapshot(q, (snap) => {
            setAllProposals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ValidationProposal[]);
        }, (error) => {
            console.error('Validation proposals query error:', error);
        });
    }, []);

    const proposals = filter === 'all' ? allProposals : allProposals.filter(p => p.status === filter);

    const selectProposal = (p: ValidationProposal) => {
        setSelected(p);
        setAdminNotes(p.admin_notes ?? '');
        setError(null);
        const initial: Record<string, unknown> = {};
        Object.entries(p.proposed_changes).forEach(([field, change]) => {
            initial[field] = change.proposed_value;
        });
        setEditedChanges(initial);
    };

    const handleApprove = async () => {
        if (!selected || !user) return;
        setSaving(true);
        setError(null);
        try {
            const updatedChanges: Record<string, ProposedChange> = {};
            Object.entries(selected.proposed_changes).forEach(([field, change]) => {
                updatedChanges[field] = {
                    ...change,
                    proposed_value: editedChanges[field] ?? change.proposed_value,
                };
            });

            await updateDoc(doc(db, 'validation_proposals', selected.id), {
                proposed_changes: updatedChanges,
                admin_notes: adminNotes || null,
            });

            const functions = getFunctions();
            const applyProposal = httpsCallable(functions, 'applyValidationProposal');
            await applyProposal({ proposalId: selected.id });
            setSelected(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Approval failed');
        } finally {
            setSaving(false);
        }
    };

    const handleReject = async () => {
        if (!selected || !user) return;
        if (!adminNotes.trim()) { alert('Add a rejection note.'); return; }
        setSaving(true);
        try {
            await updateDoc(doc(db, 'validation_proposals', selected.id), {
                status: 'rejected',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes,
            });
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

    const changeCount = selected ? Object.keys(selected.proposed_changes).length : 0;

    // Separate short vs long fields
    const shortFields = selected
        ? Object.entries(selected.proposed_changes).filter(([, c]) => isShortField(c))
        : [];
    const longFields = selected
        ? Object.entries(selected.proposed_changes).filter(([, c]) => !isShortField(c))
        : [];

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
            {/* Left: proposal list (full width on mobile, hidden when detail selected) */}
            <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-white/10 flex-col`}>
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <div data-tutorial="proposal-list" className="flex-1 overflow-y-auto p-2 space-y-1">
                    {proposals.map((p) => (
                        <div key={p.id} onClick={() => selectProposal(p)}
                            className={`p-3 rounded cursor-pointer transition-all ${selected?.id === p.id ? 'bg-cyan-950/50 border-l-2 border-cyan-400' : 'hover:bg-white/5'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${p.document_type === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>
                                    {p.document_type.toUpperCase()}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' : p.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                    {p.status}
                                </span>
                            </div>
                            <div className="text-sm font-medium line-clamp-1">{p.document_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-gray-500">{Object.keys(p.proposed_changes).length} changes</span>
                                <span className="text-[9px] text-gray-500">·</span>
                                <span className="text-[9px] text-gray-500">{Math.round(p.confidence * 100)}% confidence</span>
                            </div>
                        </div>
                    ))}
                    {proposals.length === 0 && <div className="text-center text-gray-500 text-sm py-8">No {filter === 'all' ? '' : filter} proposals</div>}
                </div>
            </div>

            {/* Right: detail panel */}
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

                        <div className="max-w-2xl space-y-6">
                            {/* Header */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${selected.document_type === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>
                                    {selected.document_type.toUpperCase()}
                                </span>
                                <h2 className="text-xl font-bold">{selected.document_name}</h2>
                                <span className="text-sm text-gray-500">{Math.round(selected.confidence * 100)}% confidence</span>
                            </div>

                            {/* Quick Summary Bar — short field changes */}
                            {shortFields.length > 0 && (
                                <div className="bg-white/5 rounded-lg p-4">
                                    <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Quick Summary</h3>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {shortFields.map(([field, change]) => (
                                            <ShortFieldSummary key={field} field={field} change={change} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Overall Reasoning */}
                            <div className="bg-white/5 rounded-lg p-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Overall Reasoning</h3>
                                <p className="text-sm text-gray-300">{selected.overall_reasoning}</p>
                                <p className="text-[10px] text-gray-500 mt-2">{selected.supporting_signal_ids.length} supporting signals</p>
                            </div>

                            {/* Long Field Changes — inline diff cards */}
                            {longFields.length > 0 && (
                                <div data-tutorial="proposed-changes" className="space-y-4">
                                    <h3 className="text-xs uppercase tracking-widest text-gray-400">
                                        {changeCount} Proposed Change{changeCount !== 1 ? 's' : ''}
                                    </h3>
                                    {longFields.map(([field, change]) => (
                                        <LongFieldCard
                                            key={field}
                                            field={field}
                                            change={change}
                                            editedValue={editedChanges[field]}
                                            onEdit={(val) => setEditedChanges((prev) => ({ ...prev, [field]: val }))}
                                            isPending={selected.status === 'pending'}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Short-only proposals still need the data-tutorial attribute */}
                            {longFields.length === 0 && shortFields.length > 0 && (
                                <div data-tutorial="proposed-changes" />
                            )}

                            {error && <div className="text-red-400 text-sm bg-red-400/10 rounded p-3">{error}</div>}

                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                                <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                            </div>

                            {selected.status === 'pending' && (
                                <div data-tutorial="actions" className="flex gap-3 flex-wrap">
                                    <button onClick={handleApprove} disabled={saving}
                                        className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                        {saving ? 'Applying...' : 'Approve & Apply'}
                                    </button>
                                    <button onClick={handleReject} disabled={saving}
                                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                        Reject
                                    </button>
                                </div>
                            )}
                            {selected.status !== 'pending' && (
                                <span className={`text-sm px-3 py-1 rounded ${selected.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                    {selected.status}
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a proposal to review</div>
                )}
            </div>
        </div>
    );
}
