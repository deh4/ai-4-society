import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface HealthData {
    lastRunAt: { seconds: number } | null;
    lastRunOutcome: 'success' | 'partial' | 'empty' | 'error' | null;
    consecutiveEmptyRuns: number;
    consecutiveErrors: number;
    lastNewSignalAt: { seconds: number } | null;
    totalSignals: number;
    articlesFetched: number;
    signalsStored: number;
}

type HealthStatus = 'green' | 'yellow' | 'red' | 'unknown';

const STATUS_CONFIG: Record<HealthStatus, { color: string; bg: string; label: string }> = {
    green: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', label: 'Healthy' },
    yellow: { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', label: 'Warning' },
    red: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Degraded' },
    unknown: { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', label: 'Unknown' },
};

function computeHealth(data: HealthData): { status: HealthStatus; warnings: string[] } {
    const warnings: string[] = [];
    const lastRunAt = data.lastRunAt ? new Date(data.lastRunAt.seconds * 1000) : null;
    const hoursAgo = lastRunAt ? (Date.now() - lastRunAt.getTime()) / (1000 * 60 * 60) : Infinity;

    if (hoursAgo > 12 || data.consecutiveErrors >= 2) {
        if (hoursAgo > 12) warnings.push(`Last run ${Math.round(hoursAgo)}h ago`);
        if (data.consecutiveErrors >= 2) warnings.push(`${data.consecutiveErrors} consecutive errors`);
        return { status: 'red', warnings };
    }
    if (hoursAgo > 7 || data.consecutiveEmptyRuns >= 3) {
        if (hoursAgo > 7) warnings.push(`Last run ${Math.round(hoursAgo)}h ago`);
        if (data.consecutiveEmptyRuns >= 3) warnings.push(`${data.consecutiveEmptyRuns} consecutive empty runs`);
        return { status: 'yellow', warnings };
    }
    return { status: 'green', warnings };
}

function timeAgo(seconds: number): string {
    const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function PipelineHealth() {
    const [data, setData] = useState<HealthData | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, '_pipeline_health', 'status'),
            (snap) => {
                if (snap.exists()) {
                    setData(snap.data() as HealthData);
                }
            },
            (err) => {
                console.error('Pipeline health listener error:', err);
            }
        );
        return unsubscribe;
    }, []);

    if (!data) {
        const cfg = STATUS_CONFIG.unknown;
        return (
            <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
                 style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span className="text-xs" style={{ color: cfg.color }}>No pipeline data</span>
            </div>
        );
    }

    const { status, warnings } = computeHealth(data);
    const cfg = STATUS_CONFIG[status];

    return (
        <div
            className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-default"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {/* Pulsing dot */}
            <div className="relative">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                {status === 'green' && (
                    <div
                        className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                        style={{ backgroundColor: cfg.color, opacity: 0.4 }}
                    />
                )}
            </div>

            <span className="text-xs font-medium" style={{ color: cfg.color }}>
                Pipeline {cfg.label}
            </span>

            {/* Tooltip */}
            {showTooltip && (
                <div
                    className="absolute top-full left-0 mt-2 z-50 w-64 p-3 rounded-lg text-xs space-y-2"
                    style={{
                        backgroundColor: 'var(--bg-secondary, #1a1a2e)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    <div className="flex justify-between">
                        <span className="text-gray-400">Last Run</span>
                        <span className="text-white">
                            {data.lastRunAt ? timeAgo(data.lastRunAt.seconds) : 'Never'}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Outcome</span>
                        <span className="text-white capitalize">{data.lastRunOutcome ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Articles Fetched</span>
                        <span className="text-white">{data.articlesFetched}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Signals Stored</span>
                        <span className="text-white">{data.signalsStored}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Total Signals</span>
                        <span className="text-white">{data.totalSignals}</span>
                    </div>
                    {data.lastNewSignalAt && (
                        <div className="flex justify-between">
                            <span className="text-gray-400">Last New Signal</span>
                            <span className="text-white">{timeAgo(data.lastNewSignalAt.seconds)}</span>
                        </div>
                    )}
                    {warnings.length > 0 && (
                        <div className="pt-1 border-t border-white/10 space-y-1">
                            {warnings.map((w, i) => (
                                <div key={i} className="text-yellow-400">&#x26A0; {w}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
