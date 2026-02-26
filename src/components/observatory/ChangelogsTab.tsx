import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ChangelogEntry {
    id: string;
    documentType: 'risk' | 'solution';
    documentId: string;
    version: number;
    changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    reasoning: string;
    confidence: number;
    reviewedBy: string;
    createdBy: string;
    createdAt: { seconds: number } | null;
}

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 80) + '…';
    return String(val);
}

export default function ChangelogsTab() {
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'changelogs'),
            orderBy('createdAt', 'desc'),
            limit(30)
        );
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChangelogEntry[]);
            },
            (error) => {
                console.error('Changelogs query error:', error);
            }
        );
        return unsubscribe;
    }, []);

    if (entries.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No changelogs yet</div>;
    }

    return (
        <div className="space-y-3">
            {entries.map((entry) => (
                <div key={entry.id} className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-2">
                    <div className="flex items-center gap-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${
                            entry.documentType === 'risk' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'
                        }`}>
                            {entry.documentType}
                        </span>
                        <span className="text-sm font-medium">{entry.documentId}</span>
                        <span className="text-[10px] text-gray-500">v{entry.version}</span>
                        {entry.createdAt && (
                            <span className="text-[10px] text-gray-500">{formatTime(entry.createdAt.seconds)}</span>
                        )}
                    </div>

                    <div className="space-y-1">
                        {entry.changes.map((change, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400 w-40 shrink-0">{change.field}</span>
                                <span className="text-red-400/70">{formatValue(change.oldValue)}</span>
                                <span className="text-gray-600">→</span>
                                <span className="text-green-400/70">{formatValue(change.newValue)}</span>
                            </div>
                        ))}
                    </div>

                    {entry.reasoning && (
                        <div className="text-[11px] text-gray-500 border-t border-white/5 pt-2 line-clamp-2">
                            {entry.reasoning}
                        </div>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-gray-600">
                        <span>by {entry.createdBy}</span>
                        <span>confidence: {(entry.confidence * 100).toFixed(0)}%</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
