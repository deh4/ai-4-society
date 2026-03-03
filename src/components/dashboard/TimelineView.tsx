import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Risk, Solution, Milestone } from '../../store/RiskContext';
import { buildTimelineItems } from '../../lib/derivePeakYear';
import type { TimelineItem } from '../../lib/derivePeakYear';
import FrequencyStrip, { yearToPx, YEAR_WIDTH_PX } from './FrequencyStrip';
import CRTScreen from './CRTScreen';
import type { ScreenState } from './CRTScreen';
import TimelineLegend from './TimelineLegend';

interface TimelineViewProps {
    risks: Risk[];
    solutions: Solution[];
    milestones: Milestone[];
    loading: boolean;
    error: string | null;
    onSelectRisk: (id: string) => void;
}

const APPROACH_THRESHOLD_PX = YEAR_WIDTH_PX;

export default function TimelineView({ risks, solutions, milestones, loading, error, onSelectRisk }: TimelineViewProps) {
    const [snapTarget, setSnapTarget] = useState<TimelineItem | null>(null);
    const [screenState, setScreenState] = useState<ScreenState>('idle');
    const [activeIndex, setActiveIndex] = useState(0);
    const screenStateRef = useRef<ScreenState>('idle');
    screenStateRef.current = screenState;

    const items = useMemo(
        () => buildTimelineItems(risks, solutions, milestones),
        [risks, solutions, milestones]
    );

    // Auto-snap to nearest risk on initial load
    const autoSnappedRef = useRef(false);
    const initialSnapItem = useMemo(() => {
        if (autoSnappedRef.current) return null;
        const currentYear = new Date().getFullYear();
        let nearest: TimelineItem | null = null;
        let nearestDist = Infinity;
        for (const item of items) {
            if (item.type !== 'risk') continue;
            const dist = Math.abs(item.peakYear - currentYear);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = item;
            }
        }
        return nearest;
    }, [items]);

    useEffect(() => {
        if (initialSnapItem && !autoSnappedRef.current) {
            autoSnappedRef.current = true;
            setSnapTarget(initialSnapItem);
            setScreenState('locked');
        }
    }, [initialSnapItem]);

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

    // Fix #1: Use ref to avoid stale closure + subscription churn
    const handleCenterChange = useCallback((centerPx: number) => {
        if (screenStateRef.current === 'locked') return;

        let nearestDist = Infinity;
        for (const item of items) {
            const itemPx = yearToPx(item.peakYear);
            const dist = Math.abs(itemPx - centerPx);
            if (dist < nearestDist) nearestDist = dist;
        }

        if (nearestDist < APPROACH_THRESHOLD_PX) {
            setScreenState('approaching');
        } else {
            setScreenState('idle');
        }
    }, [items]);

    // Fix #5: Trigger transitioning state when switching between locked signals
    const handleSnap = useCallback((item: TimelineItem) => {
        const yearGroup = itemsByYear.get(item.peakYear) ?? [];
        const idx = yearGroup.findIndex(it => it.id === item.id);

        if (screenStateRef.current === 'locked' && snapTarget && snapTarget.id !== item.id) {
            setScreenState('transitioning');
            setTimeout(() => setScreenState('locked'), 250);
        } else {
            setScreenState('locked');
        }

        setSnapTarget(item);
        setActiveIndex(Math.max(0, idx));
    }, [itemsByYear, snapTarget]);

    const handleUnsnap = useCallback(() => {
        setSnapTarget(null);
        setActiveIndex(0);
        setScreenState('idle');
    }, []);

    // Fix #2: Don't call setState inside updater — compute index eagerly
    const handlePrev = useCallback(() => {
        const currentIdx = yearItems.findIndex(it => it.id === snapTarget?.id);
        const newIdx = currentIdx <= 0 ? yearItems.length - 1 : currentIdx - 1;
        const newItem = yearItems[newIdx];
        if (newItem) setSnapTarget(newItem);
        setActiveIndex(newIdx);
    }, [yearItems, snapTarget]);

    const handleNext = useCallback(() => {
        const currentIdx = yearItems.findIndex(it => it.id === snapTarget?.id);
        const newIdx = currentIdx >= yearItems.length - 1 ? 0 : currentIdx + 1;
        const newItem = yearItems[newIdx];
        if (newItem) setSnapTarget(newItem);
        setActiveIndex(newIdx);
    }, [yearItems, snapTarget]);

    const handleTuneIn = useCallback(() => {
        if (!activeItem) return;
        if (activeItem.type === 'milestone') return; // milestones have no detail page
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
                initialSnapItem={initialSnapItem}
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
