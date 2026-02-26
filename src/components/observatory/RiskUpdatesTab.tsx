import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface RiskUpdate {
    id: string;
    riskId: string;
    riskName: string;
    status: 'pending' | 'approved' | 'rejected';
    proposedChanges: { score_2026: number; velocity: string };
    currentValues: { score_2026: number; velocity: string };
    reasoning: string;
    confidence: number;
    signalCount: number;
    scoreDelta: number;
    requiresEscalation: boolean;
    createdAt: { seconds: number } | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10' },
    approved: { label: 'Approved', color: 'text-green-400 bg-green-400/10' },
    rejected: { label: 'Rejected', color: 'text-red-400 bg-red-400/10' },
};

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

export default function ObservatoryRiskUpdatesTab() {
    const [updates, setUpdates] = useState<RiskUpdate[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        const q = query(
            collection(db, 'risk_updates'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as RiskUpdate[];
            setUpdates(docs);
        });
        return unsubscribe;
    }, []);

    const filtered = statusFilter === 'all'
        ? updates
        : updates.filter((u) => u.status === statusFilter);

    if (updates.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No risk updates generated yet</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-1">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                            statusFilter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {filtered.map((update) => {
                    const isExpanded = expandedId === update.id;
                    const badge = STATUS_BADGE[update.status] ?? STATUS_BADGE.pending;

                    return (
                        <div key={update.id}>
                            <div
                                onClick={() => setExpandedId(isExpanded ? null : update.id)}
                                className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/10"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{update.riskId}: {update.riskName}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                    {update.requiresEscalation && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/10 text-red-400">ESC</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <span>
                                        score: {update.currentValues.score_2026} → {update.proposedChanges.score_2026}
                                        ({update.scoreDelta >= 0 ? '+' : ''}{update.scoreDelta.toFixed(1)})
                                    </span>
                                    <span>·</span>
                                    <span>{update.signalCount} signals</span>
                                    <span>·</span>
                                    <span>{Math.round(update.confidence * 100)}% confidence</span>
                                    {update.createdAt && (
                                        <>
                                            <span>·</span>
                                            <span>{formatTime(update.createdAt.seconds)}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                    <div className="text-sm text-gray-300">{update.reasoning}</div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No {statusFilter} risk updates
                    </div>
                )}
            </div>
        </div>
    );
}
