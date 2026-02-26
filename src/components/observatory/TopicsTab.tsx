import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Topic {
    id: string;
    name: string;
    description: string;
    riskCategories: string[];
    velocity: 'rising' | 'stable' | 'declining';
    signalCount: number;
    signalIds: string[];
    createdAt: { seconds: number } | null;
}

const VELOCITY_BADGE: Record<string, { label: string; color: string }> = {
    rising: { label: 'Rising', color: 'text-green-400 bg-green-400/10' },
    stable: { label: 'Stable', color: 'text-gray-400 bg-gray-400/10' },
    declining: { label: 'Declining', color: 'text-orange-400 bg-orange-400/10' },
};

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

export default function TopicsTab() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [velocityFilter, setVelocityFilter] = useState<string>('all');

    useEffect(() => {
        const q = query(
            collection(db, 'topics'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as Topic[];
            setTopics(docs);
        });
        return unsubscribe;
    }, []);

    const filtered = velocityFilter === 'all'
        ? topics
        : topics.filter((t) => t.velocity === velocityFilter);

    if (topics.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No topics generated yet</div>;
    }

    return (
        <div className="space-y-4">
            {/* Velocity filter */}
            <div className="flex gap-1">
                {(['all', 'rising', 'stable', 'declining'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setVelocityFilter(f)}
                        className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                            velocityFilter === f
                                ? 'bg-white/10 text-white'
                                : 'text-gray-500 hover:text-white'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Topics list */}
            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {filtered.map((topic) => {
                    const isExpanded = expandedId === topic.id;
                    const badge = VELOCITY_BADGE[topic.velocity] ?? VELOCITY_BADGE.stable;

                    return (
                        <div key={topic.id}>
                            <div
                                onClick={() => setExpandedId(isExpanded ? null : topic.id)}
                                className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/10"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{topic.name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {topic.riskCategories.map((rc) => (
                                        <span
                                            key={rc}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400"
                                        >
                                            {rc}
                                        </span>
                                    ))}
                                    <span className="text-[10px] text-gray-500">
                                        {topic.signalCount} signal{topic.signalCount !== 1 ? 's' : ''}
                                    </span>
                                    {topic.createdAt && (
                                        <span className="text-[10px] text-gray-500">
                                            {formatTime(topic.createdAt.seconds)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 space-y-2">
                                    <div className="text-sm text-gray-300">{topic.description}</div>
                                    <div className="text-[10px] text-gray-500">
                                        Signal IDs: {topic.signalIds.join(', ')}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-6">
                        No {velocityFilter} topics
                    </div>
                )}
            </div>
        </div>
    );
}
