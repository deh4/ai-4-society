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
    createdAt: { seconds: number } | null;
}

const VELOCITY_ICON: Record<string, string> = {
    rising: '\u25B2',
    stable: '\u2500',
    declining: '\u25BC',
};

const VELOCITY_COLOR: Record<string, string> = {
    rising: 'text-green-400',
    stable: 'text-gray-400',
    declining: 'text-orange-400',
};

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function TopicsCard() {
    const [topics, setTopics] = useState<Topic[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'topics'),
            orderBy('createdAt', 'desc'),
            limit(10)
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

    if (topics.length === 0) {
        return null; // Don't render card if no topics exist yet
    }

    return (
        <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Recent Topics</h2>
            <div className="space-y-3">
                {topics.map((topic) => (
                    <div key={topic.id} className="flex items-start gap-3">
                        <span className={`text-sm font-bold mt-0.5 ${VELOCITY_COLOR[topic.velocity]}`}>
                            {VELOCITY_ICON[topic.velocity]}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{topic.name}</span>
                                {topic.riskCategories.map((rc) => (
                                    <span
                                        key={rc}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400"
                                    >
                                        {rc}
                                    </span>
                                ))}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                                {topic.velocity} · {topic.signalCount} signal{topic.signalCount !== 1 ? 's' : ''}
                                {topic.createdAt && ` · ${timeAgo(topic.createdAt.seconds)}`}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
