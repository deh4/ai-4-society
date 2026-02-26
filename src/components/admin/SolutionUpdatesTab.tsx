import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch, updateDoc, serverTimestamp, arrayUnion, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

type UpdateStatus = 'pending' | 'approved' | 'rejected';

interface SolutionUpdate {
    id: string;
    solutionId: string;
    solutionTitle: string;
    parentRiskId: string;
    status: UpdateStatus;
    proposedChanges: {
        adoption_score_2026: number;
        adoption_score_2035: number;
        implementation_stage: string;
        timeline_narrative: { near_term: string; mid_term: string; long_term: string };
    };
    newKeyPlayers: string[];
    newBarriers: string[];
    currentValues: {
        adoption_score_2026: number;
        adoption_score_2035: number;
        implementation_stage: string;
        key_players: string[];
        barriers: string[];
        timeline_narrative: { near_term: string; mid_term: string; long_term: string };
    };
    reasoning: string;
    confidence: number;
    scoreDelta: number;
    signedDelta: number;
    stageChanged: boolean;
    requiresEscalation: boolean;
    createdAt: { seconds: number } | null;
    reviewedAt?: { seconds: number } | null;
    adminNotes?: string;
    validationIssues?: Array<{ rule: string; severity: string; message: string; field: string }>;
}

const STATUS_COLORS: Record<UpdateStatus, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10',
    approved: 'text-green-400 bg-green-400/10',
    rejected: 'text-red-400 bg-red-400/10',
};

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function SolutionUpdatesTab() {
    const { user } = useAuth();
    const [updates, setUpdates] = useState<SolutionUpdate[]>([]);
    const [filter, setFilter] = useState<UpdateStatus | 'all'>('pending');
    const [selected, setSelected] = useState<SolutionUpdate | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
        if (filter !== 'all') {
            constraints.unshift(where('status', '==', filter));
        }
        const q = query(collection(db, 'solution_updates'), ...constraints);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as SolutionUpdate[];
                setUpdates(docs);
            },
            (error) => {
                console.error('Solution updates query error:', error);
                if (filter !== 'all') setFilter('all');
            }
        );
        return unsubscribe;
    }, [filter]);

    const handleApprove = async (update: SolutionUpdate) => {
        if (!user) return;
        setProcessing(true);
        setError(null);
        try {
            const batch = writeBatch(db);

            // Update the solution_updates doc
            batch.update(doc(db, 'solution_updates', update.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                adminNotes: adminNotes || null,
            });

            // Apply changes to the actual solution doc
            const solutionRef = doc(db, 'solutions', update.solutionId);
            const solutionUpdateData: Record<string, unknown> = {
                adoption_score_2026: update.proposedChanges.adoption_score_2026,
                adoption_score_2035: update.proposedChanges.adoption_score_2035,
                implementation_stage: update.proposedChanges.implementation_stage,
                timeline_narrative: update.proposedChanges.timeline_narrative,
            };

            // Append new key players
            if (update.newKeyPlayers.length > 0) {
                solutionUpdateData.key_players = arrayUnion(...update.newKeyPlayers);
            }

            // Append new barriers
            if (update.newBarriers.length > 0) {
                solutionUpdateData.barriers = arrayUnion(...update.newBarriers);
            }

            batch.update(solutionRef, solutionUpdateData);

            await batch.commit();
            setSelected(null);
            setAdminNotes('');
        } catch (err) {
            console.error('Approve failed:', err);
            setError(`Approve failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (update: SolutionUpdate) => {
        if (!user || !adminNotes.trim()) {
            alert('Please add a note explaining why this update is rejected.');
            return;
        }
        setProcessing(true);
        setError(null);
        try {
            await updateDoc(doc(db, 'solution_updates', update.id), {
                status: 'rejected',
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
                adminNotes,
            });
            setSelected(null);
            setAdminNotes('');
        } catch (err) {
            console.error('Reject failed:', err);
            setError(`Reject failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setProcessing(false);
        }
    };

    const pendingCount = updates.filter((u) => u.status === 'pending').length;

    return (
        <div className="flex h-full">
            {/* Left: Filter + List */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="flex gap-1 p-3 border-b border-white/10">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                                filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                            }`}
                        >
                            {f}{f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                        </button>
                    ))}
                </div>
                {error && (
                    <div className="mx-3 mt-2 px-3 py-2 rounded bg-red-400/10 text-red-400 text-xs">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {updates.map((update) => (
                        <div
                            key={update.id}
                            onClick={() => { setSelected(update); setAdminNotes(update.adminNotes ?? ''); }}
                            className={`p-3 rounded cursor-pointer transition-all ${
                                selected?.id === update.id
                                    ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                    : 'hover:bg-white/5'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{update.solutionId}</span>
                                <span className="text-xs text-gray-400 truncate">{update.solutionTitle}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[update.status]}`}>
                                    {update.status}
                                </span>
                                <span className={`text-[10px] font-mono ${update.scoreDelta >= 10 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {update.signedDelta >= 0 ? '+' : ''}{update.signedDelta.toFixed(1)}
                                </span>
                                {update.stageChanged && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-400/10 text-purple-400">STAGE</span>
                                )}
                                {update.requiresEscalation && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESC</span>
                                )}
                                {update.validationIssues && update.validationIssues.length > 0 && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                        update.validationIssues.some((i) => i.severity === 'critical')
                                            ? 'bg-red-400/10 text-red-400'
                                            : 'bg-yellow-400/10 text-yellow-400'
                                    }`}>
                                        {update.validationIssues.length} issue{update.validationIssues.length > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {updates.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">
                            No {filter === 'all' ? '' : filter} solution updates
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detail Panel */}
            <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-bold mb-1">{selected.solutionId}: {selected.solutionTitle}</h2>
                        <div className="flex items-center gap-2 mb-4">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[selected.status]}`}>
                                {selected.status}
                            </span>
                            <span className="text-[10px] text-gray-500">Parent: {selected.parentRiskId}</span>
                            {selected.requiresEscalation && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
                                    REQUIRES ESCALATION
                                </span>
                            )}
                            {selected.createdAt && (
                                <span className="text-[10px] text-gray-500">{timeAgo(selected.createdAt.seconds)}</span>
                            )}
                        </div>

                        {/* Score & Stage Diff */}
                        <div className="bg-white/5 rounded p-4 mb-4 space-y-3">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Proposed Changes</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {(['adoption_score_2026', 'adoption_score_2035', 'implementation_stage'] as const).map((field) => {
                                    const current = selected.currentValues[field];
                                    const proposed = selected.proposedChanges[field];
                                    const changed = current !== proposed;
                                    return (
                                        <div key={field}>
                                            <div className="text-[10px] text-gray-500">{field.replace(/_/g, ' ')}</div>
                                            <div className={`text-sm font-bold ${changed ? 'text-cyan-400' : 'text-gray-400'}`}>
                                                {String(current)} {changed ? `\u2192 ${String(proposed)}` : '(no change)'}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div>
                                    <div className="text-[10px] text-gray-500">confidence</div>
                                    <div className="text-sm font-bold">{Math.round(selected.confidence * 100)}%</div>
                                </div>
                            </div>
                        </div>

                        {/* New Key Players */}
                        {selected.newKeyPlayers.length > 0 && (
                            <div className="bg-white/5 rounded p-4 mb-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                                    New Key Players (+{selected.newKeyPlayers.length})
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {selected.newKeyPlayers.map((p) => (
                                        <span key={p} className="text-xs px-2 py-0.5 rounded bg-green-400/10 text-green-400">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* New Barriers */}
                        {selected.newBarriers.length > 0 && (
                            <div className="bg-white/5 rounded p-4 mb-4">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                                    New Barriers (+{selected.newBarriers.length})
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {selected.newBarriers.map((b) => (
                                        <span key={b} className="text-xs px-2 py-0.5 rounded bg-orange-400/10 text-orange-400">{b}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Timeline Narrative Diff */}
                        <div className="bg-white/5 rounded p-4 mb-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Timeline Narrative</h3>
                            {(['near_term', 'mid_term', 'long_term'] as const).map((period) => {
                                const current = selected.currentValues.timeline_narrative[period];
                                const proposed = selected.proposedChanges.timeline_narrative[period];
                                const changed = current !== proposed;
                                return (
                                    <div key={period} className="mb-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] text-gray-500 uppercase">{period.replace('_', ' ')}</span>
                                            {changed && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-400/10 text-cyan-400">UPDATED</span>}
                                        </div>
                                        <p className={`text-sm leading-relaxed ${changed ? 'text-gray-200' : 'text-gray-400'}`}>
                                            {proposed}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Reasoning */}
                        <div className="bg-white/5 rounded p-4 mb-4">
                            <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Reasoning</h3>
                            <p className="text-sm text-gray-300 leading-relaxed">{selected.reasoning}</p>
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
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleApprove(selected)}
                                    disabled={processing}
                                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Approve & Apply
                                </button>
                                <button
                                    onClick={() => handleReject(selected)}
                                    disabled={processing}
                                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        )}

                        {selected.status !== 'pending' && (
                            <div className="flex items-center gap-3">
                                <span className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[selected.status]}`}>
                                    {selected.status}
                                </span>
                                {selected.reviewedAt && (
                                    <span className="text-[10px] text-gray-500">
                                        Reviewed {timeAgo(selected.reviewedAt.seconds)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Select a solution update to review
                    </div>
                )}
            </div>
        </div>
    );
}
