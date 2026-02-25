import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion';
import type { TimelineItem } from '../../lib/derivePeakYear';

interface FrequencyStripProps {
    items: TimelineItem[];
    onCenterChange: (centerPx: number) => void;
    onSnap: (item: TimelineItem) => void;
    onUnsnap: () => void;
    activeItemId: string | null;
}

const MIN_YEAR = 1950;
const MAX_YEAR = 2038;
const PIVOT_YEAR = 2026;
export const YEAR_WIDTH_PX = 120;
const HISTORY_YEAR_WIDTH_PX = 30;
const CURRENT_YEAR = 2026;
const SNAP_THRESHOLD_PX = 30;
const FADE_RANGE = 5;

// Historical section is compressed, future section is full width
const HISTORY_WIDTH = (PIVOT_YEAR - MIN_YEAR) * HISTORY_YEAR_WIDTH_PX;
const FUTURE_WIDTH = (MAX_YEAR - PIVOT_YEAR + 1) * YEAR_WIDTH_PX;
const TOTAL_WIDTH = HISTORY_WIDTH + FUTURE_WIDTH;

export function yearToPx(year: number): number {
    if (year < PIVOT_YEAR) {
        return (year - MIN_YEAR) * HISTORY_YEAR_WIDTH_PX + HISTORY_YEAR_WIDTH_PX / 2;
    }
    return HISTORY_WIDTH + (year - PIVOT_YEAR) * YEAR_WIDTH_PX + YEAR_WIDTH_PX / 2;
}

function computeTickPositions(items: TimelineItem[]): Map<string, number> {
    const positions = new Map<string, number>();
    const byYear = new Map<number, TimelineItem[]>();

    for (const item of items) {
        const arr = byYear.get(item.peakYear) ?? [];
        arr.push(item);
        byYear.set(item.peakYear, arr);
    }

    for (const [year, yearItems] of byYear) {
        const basePx = yearToPx(year);
        const spread = 20;
        const offset = -((yearItems.length - 1) * spread) / 2;
        yearItems.forEach((item, i) => {
            positions.set(item.id, basePx + offset + i * spread);
        });
    }

    return positions;
}

function calcTickOpacity(tickPx: number, centerPx: number): number {
    const distYears = Math.abs(tickPx - centerPx) / YEAR_WIDTH_PX;
    if (distYears <= 1) return 1;
    if (distYears >= FADE_RANGE) return 0.08;
    return 1 - ((distYears - 1) / (FADE_RANGE - 1)) * 0.92;
}

export default function FrequencyStrip({ items, onCenterChange, onSnap, onUnsnap, activeItemId }: FrequencyStripProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [centerPx, setCenterPx] = useState(yearToPx(CURRENT_YEAR));
    const initializedRef = useRef(false);
    const dragX = useMotionValue(0);

    const totalWidth = TOTAL_WIDTH;

    const tickPositions = useMemo(() => computeTickPositions(items), [items]);

    // Combined measure + init: reads DOM directly, avoids state race
    useEffect(() => {
        const measure = () => {
            if (!containerRef.current) return;
            const width = containerRef.current.clientWidth;
            setContainerWidth(width);
            if (!initializedRef.current) {
                const initX = -(yearToPx(CURRENT_YEAR) - width / 2);
                dragX.set(initX);
                initializedRef.current = true;
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [dragX]);

    // Fix #3: Track centerPx as state so opacity updates during drag
    useEffect(() => {
        const unsubscribe = dragX.on('change', (latest) => {
            const center = -latest + containerWidth / 2;
            setCenterPx(center);
            onCenterChange(center);
        });
        return unsubscribe;
    }, [dragX, containerWidth, onCenterChange]);

    // Fix #4: Use spring animation for snap
    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const center = -dragX.get() + containerWidth / 2;
        let nearest: { item: TimelineItem; dist: number; px: number } | null = null;

        for (const item of items) {
            const px = tickPositions.get(item.id);
            if (px == null) continue;
            const dist = Math.abs(px - center);
            if (dist < SNAP_THRESHOLD_PX && (!nearest || dist < nearest.dist)) {
                nearest = { item, dist, px };
            }
        }

        const velocityMag = Math.abs(info.velocity.x);
        if (nearest && velocityMag < 500) {
            const snapX = -(nearest.px - containerWidth / 2);
            animate(dragX, snapX, { type: 'spring', stiffness: 300, damping: 30 });
            onSnap(nearest.item);
        } else {
            onUnsnap();
        }
    }, [dragX, containerWidth, items, tickPositions, onSnap, onUnsnap]);

    const years = useMemo(() => {
        const arr: number[] = [];
        for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
            // Before 2026: show every 10 years only (compressed section)
            // From 2026+: show every year (full-width section)
            if (y < PIVOT_YEAR ? y % 10 === 0 : true) arr.push(y);
        }
        return arr;
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            {/* Center hairline */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/40 z-20 pointer-events-none" />

            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0f1a] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0f1a] to-transparent z-10 pointer-events-none" />

            <div className="overflow-hidden">
                <motion.div
                    drag="x"
                    dragConstraints={{ left: -(totalWidth - containerWidth), right: 0 }}
                    dragElastic={0.1}
                    style={{ width: totalWidth, x: dragX }}
                    onDragEnd={handleDragEnd}
                    className="relative cursor-grab active:cursor-grabbing"
                >
                    {/* Risk ticks (above axis) */}
                    <div className="relative h-8">
                        {items.filter(it => it.type === 'risk').map((item) => {
                            const px = tickPositions.get(item.id) ?? 0;
                            const isActive = item.id === activeItemId;
                            return (
                                <button
                                    key={item.id}
                                    aria-label={`Risk ${item.label}: ${item.name}`}
                                    className="absolute bottom-0 flex flex-col items-center -translate-x-1/2"
                                    style={{
                                        left: px,
                                        opacity: calcTickOpacity(px, centerPx),
                                    }}
                                    onClick={() => {
                                        animate(dragX, -(px - containerWidth / 2), { type: 'spring', stiffness: 300, damping: 30 });
                                        onSnap(item);
                                    }}
                                >
                                    <span className={`text-[8px] font-mono font-bold tracking-wider mb-0.5 ${isActive ? 'text-red-400' : 'text-red-500/60'}`}>
                                        {item.label}
                                    </span>
                                    <div className={`w-0.5 ${isActive ? 'h-[18px] bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]' : 'h-3 bg-red-500/40'} rounded-full transition-all`} />
                                </button>
                            );
                        })}
                    </div>

                    {/* Milestone ticks (on axis) */}
                    <div className="relative h-4">
                        {items.filter(it => it.type === 'milestone').map((item) => {
                            const px = tickPositions.get(item.id) ?? 0;
                            const isActive = item.id === activeItemId;
                            return (
                                <button
                                    key={item.id}
                                    aria-label={`Milestone ${item.name}`}
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center"
                                    style={{
                                        left: px,
                                        opacity: calcTickOpacity(px, centerPx),
                                    }}
                                    onClick={() => {
                                        animate(dragX, -(px - containerWidth / 2), { type: 'spring', stiffness: 300, damping: 30 });
                                        onSnap(item);
                                    }}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]' : 'bg-yellow-500/50'} transition-all`} />
                                </button>
                            );
                        })}
                    </div>

                    {/* Axis + year labels */}
                    <div className="relative h-6">
                        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                        {years.map((year) => (
                            <div
                                key={year}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                                style={{ left: yearToPx(year) }}
                            >
                                <div className="w-px h-2 bg-white/15" />
                                <span className="text-[8px] font-mono text-gray-600 mt-0.5">
                                    {year}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Solution ticks (below axis) */}
                    <div className="relative h-8">
                        {items.filter(it => it.type === 'solution').map((item) => {
                            const px = tickPositions.get(item.id) ?? 0;
                            const isActive = item.id === activeItemId;
                            return (
                                <button
                                    key={item.id}
                                    aria-label={`Solution ${item.label}: ${item.name}`}
                                    className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                                    style={{
                                        left: px,
                                        opacity: calcTickOpacity(px, centerPx),
                                    }}
                                    onClick={() => {
                                        animate(dragX, -(px - containerWidth / 2), { type: 'spring', stiffness: 300, damping: 30 });
                                        onSnap(item);
                                    }}
                                >
                                    <div className={`w-0.5 ${isActive ? 'h-[18px] bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'h-3 bg-emerald-400/40'} rounded-full transition-all`} />
                                    <span className={`text-[8px] font-mono font-bold tracking-wider mt-0.5 ${isActive ? 'text-emerald-400' : 'text-emerald-400/60'}`}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
