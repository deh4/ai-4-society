import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, where, increment, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface DiscoveryProposal {
    id: string;
    type: 'new_risk' | 'new_solution';
    proposed_name: string;
    description: string;
    why_novel: string;
    key_themes: string[];
    supporting_signal_ids: string[];
    signal_count: number;
    suggested_parent_risk_id?: string;
    status: ProposalStatus;
    created_at: { seconds: number } | null;
    admin_notes?: string;
}

const RISK_IDS = ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10'];

export default function DiscoveryTab() {
    const { user } = useAuth();
    const [proposals, setProposals] = useState<DiscoveryProposal[]>([]);
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<DiscoveryProposal | null>(null);
    const [saving, setSaving] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');
    const [newDocId, setNewDocId] = useState('');
    const [parentRiskId, setParentRiskId] = useState('');
    const [narrativeName, setNarrativeName] = useState('');
    const [narrativeSummary, setNarrativeSummary] = useState('');

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')];
        if (filter !== 'all') constraints.unshift(where('status', '==', filter));
        const q = query(collection(db, 'discovery_proposals'), ...constraints);
        return onSnapshot(q, (snap) => {
            setProposals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DiscoveryProposal[]);
        });
    }, [filter]);

    const selectProposal = (p: DiscoveryProposal) => {
        setSelected(p);
        setAdminNotes(p.admin_notes ?? '');
        setNarrativeName(p.proposed_name);
        setNarrativeSummary(p.description);
        setNewDocId('');
        setParentRiskId(p.suggested_parent_risk_id ?? '');
    };

    const canApprove = newDocId.trim() !== '' &&
        narrativeName.trim() !== '' &&
        narrativeSummary.trim() !== '' &&
        (selected?.type === 'new_risk' || parentRiskId !== '');

    const handleApprove = async () => {
        if (!selected || !user) return;
        setSaving(true);
        try {
            const colName = selected.type === 'new_risk' ? 'risks' : 'solutions';
            const baseDoc: Record<string, unknown> = {
                [selected.type === 'new_risk' ? 'risk_name' : 'solution_title']: narrativeName,
                summary: narrativeSummary,
                version: 1,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdFromProposal: selected.id,
            };
            if (selected.type === 'new_solution') baseDoc.parent_risk_id = parentRiskId;

            await addDoc(collection(db, colName), baseDoc);

            await updateDoc(doc(db, 'discovery_proposals', selected.id), {
                status: 'approved',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes || null,
                new_document_id: newDocId.trim(),
            });
            // Increment reviewer's totalReviews
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                updateDoc(userRef, { totalReviews: increment(1) }).catch(() => {});
            }
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

    const handleReject = async () => {
        if (!selected || !user) return;
        if (!adminNotes.trim()) { alert('Add a rejection note before rejecting.'); return; }
        setSaving(true);
        try {
            await updateDoc(doc(db, 'discovery_proposals', selected.id), {
                status: 'rejected',
                reviewed_at: serverTimestamp(),
                reviewed_by: user.uid,
                admin_notes: adminNotes,
            });
            // Increment reviewer's totalReviews
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                updateDoc(userRef, { totalReviews: increment(1) }).catch(() => {});
            }
            setSelected(null);
        } finally {
            setSaving(false);
        }
    };

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
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {proposals.map((p) => (
                        <div key={p.id} onClick={() => selectProposal(p)}
                            className={`p-3 rounded cursor-pointer transition-all ${selected?.id === p.id ? 'bg-cyan-950/50 border-l-2 border-cyan-400' : 'hover:bg-white/5'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${p.type === 'new_risk' ? 'bg-red-400/15 text-red-400' : 'bg-green-400/15 text-green-400'}`}>
                                    {p.type === 'new_risk' ? 'NEW RISK' : 'NEW SOLUTION'}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' : p.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                                    {p.status}
                                </span>
                            </div>
                            <div className="text-sm font-medium line-clamp-2">{p.proposed_name}</div>
                            <div className="text-[9px] text-gray-500 mt-1">{p.signal_count} signals</div>
                        </div>
                    ))}
                    {proposals.length === 0 && <div className="text-center text-gray-500 text-sm py-8">No {filter === 'all' ? '' : filter} proposals</div>}
                </div>
            </div>

            {/* Right: detail + narrative form (full-screen overlay on mobile) */}
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
                            <div>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold mr-2 ${selected.type === 'new_risk' ? 'bg-red-400/15 text-red-400' : 'bg-green-400/15 text-green-400'}`}>
                                    {selected.type === 'new_risk' ? 'NEW RISK' : 'NEW SOLUTION'}
                                </span>
                                <h2 className="text-xl font-bold mt-2">{selected.proposed_name}</h2>
                            </div>

                            <div className="bg-white/5 rounded p-4 space-y-3">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400">Gemini Skeleton</h3>
                                <div><span className="text-[10px] text-gray-500">Description</span><p className="text-sm text-gray-300 mt-1">{selected.description}</p></div>
                                <div><span className="text-[10px] text-gray-500">Why Novel</span><p className="text-sm text-gray-300 mt-1">{selected.why_novel}</p></div>
                                <div>
                                    <span className="text-[10px] text-gray-500">Key Themes</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selected.key_themes.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300">{t}</span>)}
                                    </div>
                                </div>
                                <div><span className="text-[10px] text-gray-500">Supporting Signals</span><p className="text-sm text-gray-400 mt-1">{selected.signal_count} signals · IDs: {selected.supporting_signal_ids.slice(0, 3).join(', ')}{selected.supporting_signal_ids.length > 3 ? ` +${selected.supporting_signal_ids.length - 3} more` : ''}</p></div>
                            </div>

                            {selected.status === 'pending' && (
                                <div className="bg-white/5 rounded p-4 space-y-4">
                                    <h3 className="text-xs uppercase tracking-widest text-gray-400">Complete Narrative</h3>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Document ID *</label>
                                        <input value={newDocId} onChange={(e) => setNewDocId(e.target.value)}
                                            placeholder={selected.type === 'new_risk' ? 'e.g. R11' : 'e.g. S11'}
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50" />
                                    </div>
                                    {selected.type === 'new_solution' && (
                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">Parent Risk *</label>
                                            <select value={parentRiskId} onChange={(e) => setParentRiskId(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-cyan-400/50">
                                                <option value="">Select parent risk…</option>
                                                {RISK_IDS.map((r) => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Name *</label>
                                        <input value={narrativeName} onChange={(e) => setNarrativeName(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-cyan-400/50" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Summary *</label>
                                        <textarea value={narrativeSummary} onChange={(e) => setNarrativeSummary(e.target.value)} rows={4}
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                                    </div>
                                    <p className="text-[10px] text-gray-500">Complete the remaining fields directly in Firestore after creation, or extend this form as the registry grows.</p>
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Admin Notes {selected.status === 'pending' ? '(required for rejection)' : ''}</label>
                                <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50" />
                            </div>

                            {selected.status === 'pending' && (
                                <div className="flex gap-3 flex-wrap">
                                    <button onClick={handleApprove} disabled={saving || !canApprove}
                                        className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                        Approve &amp; Create
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
