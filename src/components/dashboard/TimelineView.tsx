import { useMemo, useState, useCallback, useRef } from 'react';
import type { Risk, Solution } from '../../store/RiskContext';
import { buildTimelineItems } from '../../lib/derivePeakYear';
import type { TimelineItem } from '../../lib/derivePeakYear';
import FrequencyStrip from './FrequencyStrip';
import CRTScreen from './CRTScreen';
import type { ScreenState } from './CRTScreen';
import TimelineLegend from './TimelineLegend';

interface TimelineViewProps {
    risks: Risk[];
    solutions: Solution[];
    loading: boolean;
    error: string | null;
    onSelectRisk: (id: string) => void;
}

const YEAR_WIDTH_PX = 120;
const APPROACH_THRESHOLD_PX = YEAR_WIDTH_PX;

export default function TimelineView({ risks, solutions, loading, error, onSelectRisk }: TimelineViewProps) {
    const [snapTarget, setSnapTarget] = useState<TimelineItem | null>(null);
    const [screenState, setScreenState] = useState<ScreenState>('idle');
    const [activeIndex, setActiveIndex] = useState(0);
    const lastCenterRef = useRef(0);

    const items = useMemo(
        () => buildTimelineItems(risks, solutions),
        [risks, solutions]
    );

    const itemsByYear = useMemo(() => {
        const map = new Map<number, TimelineItem[]>();
        for (const item of items) {
            const arr = map.get(item.peakYear) ?? [];
            arr.push(item);
            map.set(item.peakYear, arr);
        }
        return map;
    }, [items]);

    const yearItems = useMemo(() => {
        if (!snapTarget) return [];
        return itemsByYear.get(snapTarget.peakYear) ?? [];
    }, [snapTarget, itemsByYear]);

    const activeItem = yearItems[activeIndex] ?? snapTarget;
    const activeRisk = activeItem?.type === 'risk'
        ? risks.find(r => r.id === activeItem.id)
        : undefined;
    const activeSolution = activeItem?.type === 'solution'
        ? solutions.find(s => s.id === activeItem.id)
        : undefined;

    const handleCenterChange = useCallback((centerPx: number) => {
        lastCenterRef.current = centerPx;

        if (screenState === 'locked') return;

        let nearestDist = Infinity;
        for (const item of items) {
            const itemPx = (item.peakYear - 2026) * YEAR_WIDTH_PX + YEAR_WIDTH_PX / 2;
            const dist = Math.abs(itemPx - centerPx);
            if (dist < nearestDist) nearestDist = dist;
        }

        if (nearestDist < APPROACH_THRESHOLD_PX) {
            setScreenState('approaching');
        } else {
            setScreenState('idle');
        }
    }, [screenState, items]);

    const handleSnap = useCallback((item: TimelineItem) => {
        const yearGroup = itemsByYear.get(item.peakYear) ?? [];
        const idx = yearGroup.findIndex(it => it.id === item.id);
        setSnapTarget(item);
        setActiveIndex(Math.max(0, idx));
        setScreenState('locked');
    }, [itemsByYear]);

    const handleUnsnap = useCallback(() => {
        setSnapTarget(null);
        setActiveIndex(0);
        setScreenState('idle');
    }, []);

    const handlePrev = useCallback(() => {
        setActiveIndex(i => {
            const newIdx = i <= 0 ? yearItems.length - 1 : i - 1;
            const newItem = yearItems[newIdx];
            if (newItem) setSnapTarget(newItem);
            return newIdx;
        });
    }, [yearItems]);

    const handleNext = useCallback(() => {
        setActiveIndex(i => {
            const newIdx = i >= yearItems.length - 1 ? 0 : i + 1;
            const newItem = yearItems[newIdx];
            if (newItem) setSnapTarget(newItem);
            return newIdx;
        });
    }, [yearItems]);

    const handleTuneIn = useCallback(() => {
        if (!activeItem) return;
        if (activeItem.type === 'risk') {
            onSelectRisk(activeItem.id);
        } else if (activeItem.parentRiskId) {
            onSelectRisk(activeItem.parentRiskId);
        }
    }, [activeItem, onSelectRisk]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-[#1a5a2a] text-sm font-mono animate-pulse">Initializing scanner...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-red-400 text-sm font-mono">{error}</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-sm font-mono font-bold tracking-widest uppercase text-gray-300">
                        Signal Scanner
                    </h2>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-gray-600 mt-0.5">
                        Drag to scan — snap to lock — tune in for detail
                    </p>
                </div>
                <TimelineLegend />
            </div>

            <FrequencyStrip
                items={items}
                onCenterChange={handleCenterChange}
                onSnap={handleSnap}
                onUnsnap={handleUnsnap}
                activeItemId={activeItem?.id ?? null}
            />

            <CRTScreen
                screenState={screenState}
                snapTarget={activeItem ?? null}
                risk={activeRisk}
                solution={activeSolution}
                onTuneIn={handleTuneIn}
                totalAtFreq={yearItems.length}
                activeIndex={activeIndex}
                onPrev={handlePrev}
                onNext={handleNext}
            />
        </div>
    );
}
