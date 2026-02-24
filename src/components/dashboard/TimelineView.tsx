import { useMemo, useRef } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { Risk, Solution } from '../../store/RiskContext';
import { buildTimelineItems } from '../../lib/derivePeakYear';
import type { TimelineItem } from '../../lib/derivePeakYear';
import TimelinePin from './TimelinePin';
import TimelineLegend from './TimelineLegend';

interface TimelineViewProps {
    risks: Risk[];
    solutions: Solution[];
    loading: boolean;
    error: string | null;
    onSelectRisk: (id: string) => void;
}

const MIN_YEAR = 2026;
const MAX_YEAR = 2038;
const YEAR_COUNT = MAX_YEAR - MIN_YEAR + 1;
const YEAR_WIDTH_PX = 120;
const STEM_BASE = 40;
const STEM_STAGGER = 24;

interface YearGroup {
    year: number;
    risks: TimelineItem[];
    solutions: TimelineItem[];
}

function groupByYear(items: TimelineItem[]): YearGroup[] {
    const map = new Map<number, { risks: TimelineItem[]; solutions: TimelineItem[] }>();

    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
        map.set(y, { risks: [], solutions: [] });
    }

    for (const item of items) {
        const group = map.get(item.peakYear);
        if (group) {
            if (item.type === 'risk') group.risks.push(item);
            else group.solutions.push(item);
        }
    }

    return Array.from(map.entries()).map(([year, group]) => ({
        year,
        ...group,
    }));
}

function handlePinClick(item: TimelineItem, onSelectRisk: (id: string) => void) {
    if (item.type === 'risk') {
        onSelectRisk(item.id);
    } else if (item.parentRiskId) {
        onSelectRisk(item.parentRiskId);
    }
}

export default function TimelineView({ risks, solutions, loading, error, onSelectRisk }: TimelineViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const dragX = useMotionValue(0);

    const items = useMemo(
        () => buildTimelineItems(risks, solutions),
        [risks, solutions]
    );

    const yearGroups = useMemo(() => groupByYear(items), [items]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-gray-500 text-sm">Loading timeline data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-red-400 text-sm">{error}</div>
            </div>
        );
    }

    const totalWidth = YEAR_COUNT * YEAR_WIDTH_PX;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-gray-300">Risk & Solution Timeline</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                        Estimated peak impact year — drag to explore
                    </p>
                </div>
                <TimelineLegend />
            </div>

            {/* Desktop: horizontal draggable timeline */}
            <div className="hidden md:block overflow-hidden" ref={containerRef}>
                <motion.div
                    drag="x"
                    dragConstraints={{ left: -(totalWidth - 800), right: 100 }}
                    dragElastic={0.1}
                    style={{ x: dragX, width: totalWidth }}
                    className="relative cursor-grab active:cursor-grabbing"
                >
                    {/* Risk pins (above axis) */}
                    <div className="relative" style={{ height: 180 }}>
                        {yearGroups.map((group) => (
                            group.risks.map((item, i) => (
                                <div
                                    key={item.id}
                                    className="absolute bottom-0"
                                    style={{
                                        left: (group.year - MIN_YEAR) * YEAR_WIDTH_PX + (YEAR_WIDTH_PX / 2),
                                        transform: `translateX(${(i - (group.risks.length - 1) / 2) * 40}px)`,
                                    }}
                                >
                                    <TimelinePin
                                        item={item}
                                        stemLength={STEM_BASE + i * STEM_STAGGER}
                                        onClick={(it) => handlePinClick(it, onSelectRisk)}
                                        orientation="horizontal"
                                    />
                                </div>
                            ))
                        ))}
                    </div>

                    {/* Axis line + year labels */}
                    <div className="relative h-8">
                        <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
                        {yearGroups.map((group) => (
                            <div
                                key={group.year}
                                className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
                                style={{ left: (group.year - MIN_YEAR) * YEAR_WIDTH_PX + (YEAR_WIDTH_PX / 2) }}
                            >
                                <div className="w-px h-3 bg-white/20" />
                                <span className="text-[10px] text-gray-500 mt-1">{group.year}</span>
                            </div>
                        ))}
                    </div>

                    {/* Solution pins (below axis) */}
                    <div className="relative" style={{ height: 180 }}>
                        {yearGroups.map((group) => (
                            group.solutions.map((item, i) => (
                                <div
                                    key={item.id}
                                    className="absolute top-0"
                                    style={{
                                        left: (group.year - MIN_YEAR) * YEAR_WIDTH_PX + (YEAR_WIDTH_PX / 2),
                                        transform: `translateX(${(i - (group.solutions.length - 1) / 2) * 40}px)`,
                                    }}
                                >
                                    <TimelinePin
                                        item={item}
                                        stemLength={STEM_BASE + i * STEM_STAGGER}
                                        onClick={(it) => handlePinClick(it, onSelectRisk)}
                                        orientation="horizontal"
                                    />
                                </div>
                            ))
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Mobile: vertical scrollable timeline */}
            <div className="md:hidden space-y-0">
                {yearGroups.map((group) => {
                    if (group.risks.length === 0 && group.solutions.length === 0) return null;
                    return (
                        <div key={group.year}>
                            {/* Sticky year header */}
                            <div className="sticky top-14 z-10 bg-[#0a0f1a]/95 backdrop-blur-sm py-2 flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400">{group.year}</span>
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-[9px] text-gray-600">
                                    {group.risks.length + group.solutions.length} item{group.risks.length + group.solutions.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Pins row: risks left, center axis, solutions right */}
                            <div className="relative py-2">
                                {/* Center axis line */}
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />

                                <div className="space-y-2">
                                    {/* Risks (left side) */}
                                    {group.risks.map((item, i) => (
                                        <div key={item.id} className="flex justify-end pr-[calc(50%+8px)]">
                                            <TimelinePin
                                                item={item}
                                                stemLength={STEM_BASE + i * STEM_STAGGER}
                                                onClick={(it) => handlePinClick(it, onSelectRisk)}
                                                orientation="vertical"
                                            />
                                        </div>
                                    ))}

                                    {/* Solutions (right side) */}
                                    {group.solutions.map((item, i) => (
                                        <div key={item.id} className="flex justify-start pl-[calc(50%+8px)]">
                                            <TimelinePin
                                                item={item}
                                                stemLength={STEM_BASE + i * STEM_STAGGER}
                                                onClick={(it) => handlePinClick(it, onSelectRisk)}
                                                orientation="vertical"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
