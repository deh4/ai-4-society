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

/** Animated noise bars that flicker like a detuned TV */
function StaticNoise({ intensity }: { intensity: 'high' | 'medium' | 'low' | 'off' }) {
    if (intensity === 'off') return null;
    const opacity = intensity === 'high' ? 0.3 : intensity === 'medium' ? 0.15 : 0.08;
    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {/* Noise grain */}
            <div
                className="absolute inset-0"
                style={{
                    opacity,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundSize: '150px 150px',
                    animation: 'crt-static 100ms steps(4) infinite',
                }}
            />
            {/* Horizontal scan glitch bars */}
            {intensity === 'high' && (
                <>
                    <div
                        className="absolute left-0 right-0 h-1 bg-white/10"
                        style={{ animation: 'crt-glitch-bar1 2.5s ease-in-out infinite', top: '20%' }}
                    />
                    <div
                        className="absolute left-0 right-0 h-0.5 bg-white/5"
                        style={{ animation: 'crt-glitch-bar2 3.7s ease-in-out infinite', top: '65%' }}
                    />
                </>
            )}
            {/* Flicker overlay */}
            <div
                className="absolute inset-0 bg-white/[0.01]"
                style={{ animation: 'crt-flicker 4s ease-in-out infinite' }}
            />
        </div>
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
    const noiseIntensity: 'high' | 'medium' | 'low' | 'off' =
        screenState === 'idle' ? 'high'
        : screenState === 'approaching' ? 'medium'
        : screenState === 'transitioning' ? 'low'
        : 'off';

    return (
        <CRTBezel>
            <div className="relative min-h-[340px] sm:min-h-[380px]">
                <StaticNoise intensity={noiseIntensity} />

                <AnimatePresence mode="wait">
                    {screenState === 'idle' && (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center min-h-[340px] sm:min-h-[380px] relative z-10"
                        >
                            <div className="text-gray-600 font-mono text-sm uppercase tracking-widest animate-pulse">
                                Scanning...
                            </div>
                            <div className="text-gray-700 font-mono text-[10px] mt-2 uppercase tracking-widest">
                                Drag timeline to find signals
                            </div>
                        </motion.div>
                    )}

                    {screenState === 'approaching' && (
                        <motion.div
                            key="approaching"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.7 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center min-h-[340px] sm:min-h-[380px] relative z-10"
                        >
                            <div className="text-gray-500 font-mono text-sm uppercase tracking-widest">
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
                            className="relative z-10"
                        >
                            <div className="flex items-center justify-center gap-2 py-2 border-b border-white/5">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400">
                                    Signal Locked
                                </span>
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
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
                                        className="text-gray-500 hover:text-white font-mono text-sm transition-colors"
                                    >
                                        ◄
                                    </button>
                                    <div className="flex items-center gap-1.5">
                                        {Array.from({ length: totalAtFreq }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-2 h-2 rounded-full transition-colors ${i === activeIndex ? 'bg-cyan-400' : 'bg-gray-700'}`}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        onClick={onNext}
                                        aria-label="Next signal"
                                        className="text-gray-500 hover:text-white font-mono text-sm transition-colors"
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
