import { motion, AnimatePresence } from 'framer-motion';
import type { TimelineItem } from '../../lib/derivePeakYear';
import type { Risk, Solution } from '../../store/RiskContext';
import CRTBezel from './CRTBezel';
import SignalCard from './SignalCard';

export type ScreenState = 'idle' | 'approaching' | 'locked' | 'transitioning';

interface CRTScreenProps {
    screenState: ScreenState;
    snapTarget: TimelineItem | null;
    risk?: Risk;
    solution?: Solution;
    onTuneIn: () => void;
    totalAtFreq: number;
    activeIndex: number;
    onPrev: () => void;
    onNext: () => void;
}

function StaticNoise({ opacity }: { opacity: number }) {
    return (
        <div
            className="absolute inset-0 z-0"
            style={{
                opacity,
                backgroundImage: `
                    repeating-radial-gradient(circle at 17% 32%, #00ff41 0px, transparent 1px),
                    repeating-radial-gradient(circle at 62% 68%, #00ff41 0px, transparent 1px),
                    repeating-radial-gradient(circle at 85% 15%, #00ff41 0px, transparent 1px)
                `,
                backgroundSize: '4px 4px, 5px 5px, 3px 3px',
                animation: 'crt-static 150ms steps(3) infinite',
            }}
        />
    );
}

export default function CRTScreen({
    screenState,
    snapTarget,
    risk,
    solution,
    onTuneIn,
    totalAtFreq,
    activeIndex,
    onPrev,
    onNext,
}: CRTScreenProps) {
    const noiseOpacity = screenState === 'idle' ? 0.15
        : screenState === 'approaching' ? 0.08
        : screenState === 'transitioning' ? 0.12
        : 0;

    return (
        <CRTBezel>
            <div className="relative min-h-[340px] sm:min-h-[380px]">
                <StaticNoise opacity={noiseOpacity} />

                <AnimatePresence mode="wait">
                    {screenState === 'idle' && (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center min-h-[340px] sm:min-h-[380px]"
                        >
                            <div className="text-[#1a5a2a] font-mono text-sm uppercase tracking-widest animate-pulse">
                                Scanning...
                            </div>
                            <div className="text-[#1a5a2a]/50 font-mono text-[10px] mt-2 uppercase tracking-widest">
                                Drag timeline to find signals
                            </div>
                        </motion.div>
                    )}

                    {screenState === 'approaching' && (
                        <motion.div
                            key="approaching"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center min-h-[340px] sm:min-h-[380px]"
                        >
                            <div className="text-[#00cc33]/50 font-mono text-sm uppercase tracking-widest">
                                Signal detected...
                            </div>
                        </motion.div>
                    )}

                    {(screenState === 'locked' || screenState === 'transitioning') && snapTarget && (
                        <motion.div
                            key={snapTarget.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className="flex items-center justify-center gap-2 py-2 border-b border-[#1a3a2a]">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
                                <span className="text-[9px] font-mono uppercase tracking-widest text-[#00ff41]">
                                    Signal Locked
                                </span>
                                <div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
                            </div>

                            <SignalCard
                                item={snapTarget}
                                risk={risk}
                                solution={solution}
                                onTuneIn={onTuneIn}
                            />

                            {totalAtFreq > 1 && (
                                <div className="flex items-center justify-center gap-3 pb-4">
                                    <button
                                        onClick={onPrev}
                                        aria-label="Previous signal"
                                        className="text-[#00ff41]/50 hover:text-[#00ff41] font-mono text-sm transition-colors"
                                    >
                                        ◄
                                    </button>
                                    <div className="flex items-center gap-1.5">
                                        {Array.from({ length: totalAtFreq }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-2 h-2 rounded-full transition-colors ${i === activeIndex ? 'bg-[#00ff41]' : 'bg-[#1a3a2a]'}`}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        onClick={onNext}
                                        aria-label="Next signal"
                                        className="text-[#00ff41]/50 hover:text-[#00ff41] font-mono text-sm transition-colors"
                                    >
                                        ►
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </CRTBezel>
    );
}
