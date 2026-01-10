import { useEffect } from 'react';

interface PrivacyModalProps {
    onClose: () => void;
    onConfirm?: () => void;
}

export function PrivacyModal({ onClose, onConfirm }: PrivacyModalProps) {
    // Prevent scrolling when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-[#0d1526] border border-[var(--card-border)] p-8 max-w-lg w-full rounded-lg shadow-2xl relative">
                <h2 className="text-xl font-bold text-[var(--accent-structural)] mb-6 tracking-wide uppercase border-b border-gray-800 pb-2">
                    Observatory Access Protocol
                </h2>

                <div className="space-y-4 text-gray-300 text-sm leading-relaxed mb-8">
                    <p>
                        The AI 4 Society Observatory is an aggregation of real-time global signals intended solely for <strong className="text-white">transparency and awareness</strong>.
                    </p>
                    <div className="p-4 bg-white/5 border-l-2 border-yellow-500 rounded-r">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1 font-bold">Disclaimer</p>
                        <p>
                            This platform visualizes potential societal shifts based on current data trends. It is <strong className="text-white">not financial or legal advice</strong>, nor is it intended to induce anxiety, distress, or promote conspiracy.
                        </p>
                    </div>
                    <p>
                        By entering, you acknowledge that this is a data visualization tool designed to foster understanding of the complex, often invisible interactions shaping our collective future.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-4 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-3 text-sm text-gray-500 hover:text-white transition-colors uppercase tracking-wider"
                    >
                        Decline & Exit
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-6 py-3 bg-[var(--accent-structural)] text-white text-sm font-bold tracking-wider uppercase rounded hover:bg-blue-600 transition-colors shadow-lg hover:shadow-blue-500/20"
                    >
                        [ Acknowledge & Enter ]
                    </button>
                </div>
            </div>
        </div>
    );
}
