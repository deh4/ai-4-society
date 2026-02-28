import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

export default function AcknowledgmentModal({ onComplete }: { onComplete: () => void }) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    const handleAcknowledge = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                acknowledgedAt: serverTimestamp(),
            });
            onComplete();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0f1a] border border-white/10 rounded-xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white">Welcome to the AI 4 Society Observatory</h2>

                <p className="text-sm text-gray-300 leading-relaxed">
                    You have been granted reviewer access to this platform. Before you begin, please read and acknowledge the following.
                </p>

                <p className="text-sm text-gray-300 leading-relaxed">
                    The AI 4 Society Observatory is a public intelligence resource. The decisions you make as a reviewer — approving signals, validating risk scores, or shaping new categories — directly influence the information that researchers, policymakers, and the public rely on.
                </p>

                <div className="bg-white/5 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-white">By proceeding, you acknowledge that:</p>
                    <ul className="space-y-2 text-sm text-gray-300">
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will review each item carefully and in good faith, applying your honest judgment</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You understand that approved content becomes part of a public record</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will not approve, reject, or modify content to serve personal, commercial, or political interests</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will flag or escalate items you are uncertain about rather than guessing</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>Inaction is safe — unreviewed items remain pending and never publish automatically</span>
                        </li>
                    </ul>
                </div>

                <p className="text-xs text-gray-500">
                    All reviewer actions are logged with your identity and timestamp for transparency and accountability.
                </p>

                <button
                    onClick={handleAcknowledge}
                    disabled={saving}
                    className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'I Understand and Acknowledge'}
                </button>
            </div>
        </div>
    );
}
