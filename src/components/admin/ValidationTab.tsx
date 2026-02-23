import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, where, type QueryConstraint } from 'firebase/firestore';
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

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

export default function ValidationTab() {
    const { user } = useAuth();
    const [proposals, setProposals] = useState<ValidationProposal[]>([]);
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<ValidationProposal | null>(null);
    const [editedChanges, setEditedChanges] = useState<Record<string, unknown>>({});
    const [adminNotes, setAdminNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')];
        if (filter !== 'all') constraints.unshift(where('status', '==', filter));
        const q = query(collection(db, 'validation_proposals'), ...constraints);
        return onSnapshot(q, (snap) => {
            setProposals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ValidationProposal[]);
        });
    }, [filter]);

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

    return (
        <div className="flex h-[calc(100vh-105px)]">
            {/* Left: proposal list */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
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

            {/* Right: detail + editable changes */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl space-y-6">
                        <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${selected.document_type === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>
                                {selected.document_type.toUpperCase()}
                            </span>
                            <h2 className="text-xl font-bold">{selected.document_name}</h2>
                            <span className="text-sm text-gray-500">{Math.round(selected.confidence * 100)}% confidence</span>
                        </div>

                        <div className="bg-white/5 rounded p-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Overall Reasoning</h3>
                            <p className="text-sm text-gray-300">{selected.overall_reasoning}</p>
                            <p className="text-[10px] text-gray-500 mt-2">{selected.supporting_signal_ids.length} supporting signals</p>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400">{changeCount} Proposed Change{changeCount !== 1 ? 's' : ''}</h3>
                            {Object.entries(selected.proposed_changes).map(([field, change]) => (
                                <div key={field} className="bg-white/5 rounded p-4 space-y-2">
                                    <div className="text-xs font-mono text-cyan-400">{field}</div>
                                    <div className="flex gap-4 text-sm">
                                        <div className="flex-1">
                                            <div className="text-[10px] text-gray-500 mb-1">Current</div>
                                            <div className="text-gray-400 bg-white/5 rounded p-2 text-xs font-mono whitespace-pre-wrap">
                                                {formatValue(change.current_value)}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[10px] text-gray-500 mb-1">Proposed (editable)</div>
                                            <textarea
                                                value={typeof editedChanges[field] === 'object'
                                                    ? JSON.stringify(editedChanges[field], null, 2)
                                                    : String(editedChanges[field] ?? '')}
                                                onChange={(e) => {
                                                    try {
                                                        setEditedChanges((prev) => ({ ...prev, [field]: JSON.parse(e.target.value) }));
                                                    } catch {
                                                        setEditedChanges((prev) => ({ ...prev, [field]: e.target.value }));
                                                    }
                                                }}
                                                rows={3}
                                                disabled={selected.status !== 'pending'}
                                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs font-mono text-white resize-none focus:outline-none focus:border-cyan-400/50 disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500">{change.reasoning}</p>
                                </div>
                            ))}
                        </div>

                        {error && <div className="text-red-400 text-sm bg-red-400/10 rounded p-3">{error}</div>}

                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                        </div>

                        {selected.status === 'pending' && (
                            <div className="flex gap-3">
                                <button onClick={handleApprove} disabled={saving}
                                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    {saving ? 'Applying…' : 'Approve & Apply'}
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
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a proposal to review</div>
                )}
            </div>
        </div>
    );
}
