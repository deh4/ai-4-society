import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ValidationReport {
    id: string;
    runId: string;
    duration: number;
    signals: { scanned: number; passed: number; rejected: number; flagged: number };
    riskUpdates: { scanned: number; passed: number; rejected: number; flagged: number };
    solutionUpdates: { scanned: number; passed: number; rejected: number; flagged: number };
    topics: { scanned: number; flagged: number };
    urlChecks: { total: number; reachable: number; unreachable: number; timeouts: number };
    createdAt: { seconds: number } | null;
}

function formatTime(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString();
}

function StatRow({ label, stats }: { label: string; stats: { scanned: number; passed: number; rejected: number; flagged: number } }) {
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-32 text-gray-400">{label}</span>
            <span className="text-gray-300">{stats.scanned} scanned</span>
            <span className="text-green-400">{stats.passed} passed</span>
            {stats.rejected > 0 && <span className="text-red-400">{stats.rejected} rejected</span>}
            {stats.flagged > 0 && <span className="text-yellow-400">{stats.flagged} flagged</span>}
        </div>
    );
}

export default function ValidationReportsTab() {
    const [reports, setReports] = useState<ValidationReport[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, 'validation_reports'),
            orderBy('createdAt', 'desc'),
            limit(20)
        );
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setReports(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ValidationReport[]);
            },
            (error) => {
                console.error('Validation reports query error:', error);
            }
        );
        return unsubscribe;
    }, []);

    if (reports.length === 0) {
        return <div className="text-gray-500 text-sm py-8 text-center">No validation reports yet</div>;
    }

    return (
        <div className="space-y-4">
            {reports.map((report) => (
                <div key={report.id} className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">Run: {report.runId}</span>
                        {report.createdAt && (
                            <span className="text-[10px] text-gray-500">{formatTime(report.createdAt.seconds)}</span>
                        )}
                        <span className="text-[10px] text-gray-500">{report.duration}ms</span>
                    </div>

                    <StatRow label="Signals" stats={report.signals} />
                    <StatRow label="Risk Updates" stats={report.riskUpdates} />
                    <StatRow label="Solution Updates" stats={report.solutionUpdates} />
                    <div className="flex items-center gap-3 text-sm">
                        <span className="w-32 text-gray-400">Topics</span>
                        <span className="text-gray-300">{report.topics.scanned} scanned</span>
                        {report.topics.flagged > 0 && <span className="text-yellow-400">{report.topics.flagged} flagged</span>}
                    </div>

                    <div className="border-t border-white/10 pt-2 flex items-center gap-3 text-[10px] text-gray-500">
                        <span>URLs: {report.urlChecks.total} checked</span>
                        <span className="text-green-400">{report.urlChecks.reachable} reachable</span>
                        {report.urlChecks.unreachable > 0 && <span className="text-red-400">{report.urlChecks.unreachable} dead</span>}
                        {report.urlChecks.timeouts > 0 && <span className="text-yellow-400">{report.urlChecks.timeouts} timeouts</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}
