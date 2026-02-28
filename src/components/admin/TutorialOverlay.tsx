import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';
import type { TutorialStep } from '../../lib/tutorial-steps';

interface Props {
    steps: TutorialStep[];
    tabName: string;
    onComplete: () => void;
}

export default function TutorialOverlay({ steps, tabName, onComplete }: Props) {
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    const step = steps[currentStep];

    const updateTargetRect = useCallback(() => {
        if (!step) return;
        const el = document.querySelector(step.target);
        if (el) {
            setTargetRect(el.getBoundingClientRect());
        } else {
            setTargetRect(null);
        }
    }, [step]);

    useEffect(() => {
        updateTargetRect();
        window.addEventListener('resize', updateTargetRect);
        window.addEventListener('scroll', updateTargetRect, true);
        return () => {
            window.removeEventListener('resize', updateTargetRect);
            window.removeEventListener('scroll', updateTargetRect, true);
        };
    }, [updateTargetRect]);

    const markComplete = async () => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                [`onboardingCompleted.${tabName}`]: true,
            });
        } catch {
            // Non-blocking — tutorial still dismisses
        }
        onComplete();
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep((s) => s + 1);
        } else {
            markComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep((s) => s - 1);
    };

    const handleSkip = () => {
        markComplete();
    };

    if (!step) return null;

    // Tooltip positioning
    const padding = 8;
    const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 60, maxWidth: 320 };
    if (targetRect) {
        if (step.position === 'bottom') {
            tooltipStyle.top = targetRect.bottom + padding;
            tooltipStyle.left = targetRect.left;
        } else if (step.position === 'top') {
            tooltipStyle.bottom = window.innerHeight - targetRect.top + padding;
            tooltipStyle.left = targetRect.left;
        } else if (step.position === 'right') {
            tooltipStyle.top = targetRect.top;
            tooltipStyle.left = targetRect.right + padding;
        } else {
            tooltipStyle.top = targetRect.top;
            tooltipStyle.right = window.innerWidth - targetRect.left + padding;
        }
    } else {
        // Fallback: center the tooltip
        tooltipStyle.top = '50%';
        tooltipStyle.left = '50%';
        tooltipStyle.transform = 'translate(-50%, -50%)';
    }

    return (
        <div className="fixed inset-0 z-50">
            {/* Overlay with cutout */}
            <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                <defs>
                    <mask id="tutorial-mask">
                        <rect width="100%" height="100%" fill="white" />
                        {targetRect && (
                            <rect
                                x={targetRect.left - 4}
                                y={targetRect.top - 4}
                                width={targetRect.width + 8}
                                height={targetRect.height + 8}
                                rx={8}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    width="100%" height="100%"
                    fill="rgba(0,0,0,0.7)"
                    mask="url(#tutorial-mask)"
                    style={{ pointerEvents: 'all' }}
                    onClick={(e) => e.stopPropagation()}
                />
            </svg>

            {/* Highlight border */}
            {targetRect && (
                <div
                    className="absolute border-2 border-cyan-400 rounded-lg pointer-events-none"
                    style={{
                        top: targetRect.top - 4,
                        left: targetRect.left - 4,
                        width: targetRect.width + 8,
                        height: targetRect.height + 8,
                        zIndex: 55,
                    }}
                />
            )}

            {/* Tooltip */}
            <div style={tooltipStyle} className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 shadow-2xl">
                <div className="text-xs text-gray-500 mb-1">
                    Step {currentStep + 1} of {steps.length}
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.content}</p>
                <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                        <button
                            onClick={handleBack}
                            className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white transition-colors"
                        >
                            Back
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
                    >
                        {currentStep < steps.length - 1 ? 'Next' : 'Finish'}
                    </button>
                    <button
                        onClick={handleSkip}
                        className="px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors ml-auto"
                    >
                        Skip Tutorial
                    </button>
                </div>
            </div>
        </div>
    );
}
