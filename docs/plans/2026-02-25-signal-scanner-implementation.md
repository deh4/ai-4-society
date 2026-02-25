# Signal Scanner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the tall pin-based timeline with a compact radio-tuner frequency strip + CRT monitor screen that shows static when scanning and displays signal content when locked onto a risk/solution.

**Architecture:** TimelineView is rewritten to compose two child components: FrequencyStrip (compact draggable dial with tick marks) and CRTScreen (SVG-framed green monochrome monitor with static/locked states). All state lives in TimelineView. Props interface to Dashboard is unchanged.

**Tech Stack:** React 19, TypeScript (strict), Framer Motion, Tailwind CSS 3, SVG for CRT bezel

---

### Task 1: Create CRTBezel SVG Component

**Files:**
- Create: `src/components/dashboard/CRTBezel.tsx`

**Step 1: Create CRTBezel component**

```tsx
interface CRTBezelProps {
    children: React.ReactNode;
}

export default function CRTBezel({ children }: CRTBezelProps) {
    return (
        <div className="relative rounded-2xl overflow-hidden"
            style={{
                background: '#0a1a0f',
                boxShadow: 'inset 0 0 30px rgba(0,255,65,0.05), 0 0 20px rgba(0,255,65,0.03)',
                border: '2px solid #1a3a2a',
            }}
        >
            {/* Scanline overlay */}
            <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px)',
                }}
            />
            {/* Content */}
            <div className="relative z-0">
                {children}
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build (component not imported yet, but TS should still compile it as part of the project)

**Step 3: Commit**

```bash
git add src/components/dashboard/CRTBezel.tsx
git commit -m "feat: add CRTBezel SVG frame component with scanline overlay"
```

---

### Task 2: Create SignalCard Component

**Files:**
- Create: `src/components/dashboard/SignalCard.tsx`

This adapts the brief card info from `RiskCard.tsx` to render inside the CRT with green monochrome styling.

**Step 1: Create SignalCard component**

```tsx
import type { TimelineItem } from '../../lib/derivePeakYear';
import type { Risk, Solution } from '../../store/RiskContext';

interface SignalCardProps {
    item: TimelineItem;
    risk?: Risk;
    solution?: Solution;
    onTuneIn: () => void;
}

export default function SignalCard({ item, risk, solution, onTuneIn }: SignalCardProps) {
    const isRisk = item.type === 'risk';
    const summary = isRisk ? risk?.summary : solution?.summary;
    const category = isRisk ? risk?.category : solution?.solution_type;
    const velocity = item.velocity;
    const score2026 = item.score;
    const score2035 = isRisk ? risk?.score_2035 : solution?.adoption_score_2035;
    const delta = score2035 != null ? score2035 - score2026 : 0;
    const isWorsening = isRisk ? delta > 0 : delta < 0;

    return (
        <div className="flex flex-col gap-4 p-6 font-mono">
            {/* Signal header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#1a5a2a] mb-1">
                        {isRisk ? 'RISK SIGNAL' : 'SOLUTION SIGNAL'}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold tracking-widest ${isRisk ? 'text-[#ff4444]' : 'text-[#00ff41]'}`}>
                            {item.label}
                        </span>
                        <span className="text-base text-[#00ff41]">{item.name}</span>
                    </div>
                </div>
                <span className="text-2xl font-bold text-[#00ff41] shrink-0">{score2026}</span>
            </div>

            {/* Category + Velocity */}
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
                <span className="text-[#00cc33]">
                    {category}
                </span>
                <span className={`px-2 py-0.5 rounded border ${isRisk ? 'border-[#ff4444]/30 text-[#ff4444]' : 'border-[#00ff41]/30 text-[#00ff41]'}`}>
                    {velocity}
                </span>
            </div>

            {/* Summary */}
            <p className="text-sm text-[#00cc33] leading-relaxed line-clamp-3">
                {summary}
            </p>

            {/* Score trajectory */}
            {score2035 != null && (
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-[#1a5a2a]">2026</span>
                    <span className="text-[#00ff41] font-bold">{score2026}</span>
                    <span className="text-[#1a5a2a]">{'━━━▶'}</span>
                    <span className="text-[#1a5a2a]">2035</span>
                    <span className="text-[#00ff41] font-bold">{score2035}</span>
                    <span className={isWorsening ? 'text-[#ff4444]' : 'text-[#00ff41]'}>
                        {isWorsening ? '▲ Rising' : delta < 0 ? '▼ Falling' : '─ Stable'}
                    </span>
                </div>
            )}

            {/* Peak year */}
            <div className="text-[10px] text-[#1a5a2a] uppercase tracking-widest">
                Est. peak impact: <span className="text-[#00cc33]">{item.peakYear}</span>
            </div>

            {/* Tune In button */}
            <button
                onClick={onTuneIn}
                className="self-center mt-2 px-6 py-2 rounded border border-[#00ff41]/40 text-[#00ff41] text-xs uppercase tracking-widest font-bold hover:bg-[#00ff41]/10 transition-colors"
            >
                Tune In →
            </button>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/components/dashboard/SignalCard.tsx
git commit -m "feat: add SignalCard component for CRT screen display"
```

---

### Task 3: Create CRTScreen Component

**Files:**
- Create: `src/components/dashboard/CRTScreen.tsx`

The CRT screen wraps CRTBezel, shows static noise when idle, and renders SignalCard when locked. Has 4 states: idle, approaching, locked, transitioning.

**Step 1: Create CRTScreen component**

```tsx
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
    /** Total items at this frequency */
    totalAtFreq: number;
    /** Current index within the frequency group */
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
                {/* Static noise layer */}
                <StaticNoise opacity={noiseOpacity} />

                {/* Content layer */}
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
                            {/* Signal locked header */}
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

                            {/* Cycling dots */}
                            {totalAtFreq > 1 && (
                                <div className="flex items-center justify-center gap-3 pb-4">
                                    <button
                                        onClick={onPrev}
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
```

**Step 2: Add CSS keyframe for static noise animation**

In `src/index.css`, add at the end (after existing styles):

```css
@keyframes crt-static {
    0% { background-position: 0 0, 0 0, 0 0; }
    33% { background-position: 2px 1px, -1px 2px, 3px -1px; }
    66% { background-position: -1px -2px, 3px 1px, -2px 3px; }
    100% { background-position: 0 0, 0 0, 0 0; }
}
```

Find `src/index.css` and add this keyframe. Check existing contents first.

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add src/components/dashboard/CRTScreen.tsx src/index.css
git commit -m "feat: add CRTScreen component with static noise and state machine"
```

---

### Task 4: Create FrequencyStrip Component

**Files:**
- Create: `src/components/dashboard/FrequencyStrip.tsx`

Compact horizontal draggable strip with tick marks. Emits snap events and center position changes.

**Step 1: Create FrequencyStrip component**

```tsx
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useMotionValue, type PanInfo } from 'framer-motion';
import type { TimelineItem } from '../../lib/derivePeakYear';

interface FrequencyStripProps {
    items: TimelineItem[];
    onCenterChange: (centerPx: number) => void;
    onSnap: (item: TimelineItem) => void;
    onUnsnap: () => void;
    activeItemId: string | null;
}

const MIN_YEAR = 2026;
const MAX_YEAR = 2038;
const YEAR_COUNT = MAX_YEAR - MIN_YEAR + 1;
const YEAR_WIDTH_PX = 120;
const CURRENT_YEAR = 2026;
const SNAP_THRESHOLD_PX = 30;
const FADE_RANGE = 5;

function yearToPx(year: number): number {
    return (year - MIN_YEAR) * YEAR_WIDTH_PX + YEAR_WIDTH_PX / 2;
}

/** Maps each item to a unique pixel position, spreading co-located items */
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
        const spread = 20; // px between co-located items
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
    const [containerWidth, setContainerWidth] = useState(800);
    const [initialized, setInitialized] = useState(false);
    const dragX = useMotionValue(0);

    const totalWidth = YEAR_COUNT * YEAR_WIDTH_PX;

    const tickPositions = useMemo(() => computeTickPositions(items), [items]);

    const measureContainer = useCallback(() => {
        if (containerRef.current) {
            setContainerWidth(containerRef.current.clientWidth);
        }
    }, []);

    useEffect(() => {
        measureContainer();
        window.addEventListener('resize', measureContainer);
        return () => window.removeEventListener('resize', measureContainer);
    }, [measureContainer]);

    // Initialize centered on CURRENT_YEAR
    const initialX = useMemo(() => {
        return -(yearToPx(CURRENT_YEAR) - containerWidth / 2);
    }, [containerWidth]);

    useEffect(() => {
        if (!initialized && containerWidth > 0) {
            dragX.set(initialX);
            setInitialized(true);
        }
    }, [initialized, containerWidth, initialX, dragX]);

    // Track center position for opacity + state changes
    useEffect(() => {
        const unsubscribe = dragX.on('change', (latest) => {
            const centerPx = -latest + containerWidth / 2;
            onCenterChange(centerPx);
        });
        return unsubscribe;
    }, [dragX, containerWidth, onCenterChange]);

    // Snap logic on drag end
    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const centerPx = -dragX.get() + containerWidth / 2;
        let nearest: { item: TimelineItem; dist: number; px: number } | null = null;

        for (const item of items) {
            const px = tickPositions.get(item.id);
            if (px == null) continue;
            const dist = Math.abs(px - centerPx);
            if (dist < SNAP_THRESHOLD_PX && (!nearest || dist < nearest.dist)) {
                nearest = { item, dist, px };
            }
        }

        // Only snap if velocity is low enough (user slowed down near a tick)
        const velocityMag = Math.abs(info.velocity.x);
        if (nearest && velocityMag < 500) {
            const snapX = -(nearest.px - containerWidth / 2);
            dragX.set(snapX);
            onSnap(nearest.item);
        } else {
            onUnsnap();
        }
    }, [dragX, containerWidth, items, tickPositions, onSnap, onUnsnap]);

    // Year labels for axis
    const years = useMemo(() => {
        const arr: number[] = [];
        for (let y = MIN_YEAR; y <= MAX_YEAR; y++) arr.push(y);
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
                            const centerPx = -dragX.get() + containerWidth / 2;
                            return (
                                <button
                                    key={item.id}
                                    className="absolute bottom-0 flex flex-col items-center -translate-x-1/2"
                                    style={{
                                        left: px,
                                        opacity: calcTickOpacity(px, centerPx),
                                    }}
                                    onClick={() => {
                                        dragX.set(-(px - containerWidth / 2));
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

                    {/* Axis + year labels */}
                    <div className="relative h-6">
                        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                        {years.map((year) => (
                            <div
                                key={year}
                                className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
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
                            const centerPx = -dragX.get() + containerWidth / 2;
                            return (
                                <button
                                    key={item.id}
                                    className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                                    style={{
                                        left: px,
                                        opacity: calcTickOpacity(px, centerPx),
                                    }}
                                    onClick={() => {
                                        dragX.set(-(px - containerWidth / 2));
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
```

**Important notes for the implementer:**
- `useMotionValue` returns a ref-stable value, so it's safe in deps arrays.
- `PanInfo` is imported from `framer-motion` as a type — use `import type` if it's type-only. But since we use it as a runtime param type annotation, a regular import of the type is fine. Actually, `PanInfo` is used only as a type, so use `import { motion, useMotionValue, type PanInfo }` with inline type import to satisfy `verbatimModuleSyntax`.
- The `calcTickOpacity` function reads `dragX.get()` inline during render. This is okay for initial render; the opacity will update on re-render from parent state changes. For smooth real-time opacity during drag, we'd need `useMotionValueEvent` — but the fade is subtle enough that per-frame updates aren't critical.

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/components/dashboard/FrequencyStrip.tsx
git commit -m "feat: add FrequencyStrip compact dial component with snap logic"
```

---

### Task 5: Rewrite TimelineView to Compose FrequencyStrip + CRTScreen

**Files:**
- Rewrite: `src/components/dashboard/TimelineView.tsx`
- Modify: `src/components/dashboard/TimelineLegend.tsx` (update styling)

**Step 1: Rewrite TimelineView**

This is a full rewrite. The component:
1. Builds timeline items (unchanged)
2. Manages snap state: `snapTarget`, `screenState`, `activeIndex`
3. Looks up the full Risk/Solution for the snapped item
4. Passes callbacks to FrequencyStrip and props to CRTScreen
5. Desktop: both components stacked vertically
6. Mobile: same layout, stacked (FrequencyStrip is swipeable strip at top, CRTScreen below)

```tsx
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
const APPROACH_THRESHOLD_PX = YEAR_WIDTH_PX; // ~1 year

export default function TimelineView({ risks, solutions, loading, error, onSelectRisk }: TimelineViewProps) {
    const [snapTarget, setSnapTarget] = useState<TimelineItem | null>(null);
    const [screenState, setScreenState] = useState<ScreenState>('idle');
    const [activeIndex, setActiveIndex] = useState(0);
    const lastCenterRef = useRef(0);

    const items = useMemo(
        () => buildTimelineItems(risks, solutions),
        [risks, solutions]
    );

    // Items grouped by peakYear for cycling
    const itemsByYear = useMemo(() => {
        const map = new Map<number, TimelineItem[]>();
        for (const item of items) {
            const arr = map.get(item.peakYear) ?? [];
            arr.push(item);
            map.set(item.peakYear, arr);
        }
        return map;
    }, [items]);

    // Get the items at the current snap target's year
    const yearItems = useMemo(() => {
        if (!snapTarget) return [];
        return itemsByYear.get(snapTarget.peakYear) ?? [];
    }, [snapTarget, itemsByYear]);

    // Look up full Risk or Solution for the active item
    const activeItem = yearItems[activeIndex] ?? snapTarget;
    const activeRisk = activeItem?.type === 'risk'
        ? risks.find(r => r.id === activeItem.id)
        : undefined;
    const activeSolution = activeItem?.type === 'solution'
        ? solutions.find(s => s.id === activeItem.id)
        : undefined;

    const handleCenterChange = useCallback((centerPx: number) => {
        lastCenterRef.current = centerPx;

        // If we're already locked, check if we've moved away
        // This is called during drag, so don't snap — just detect approaching
        if (screenState === 'locked') return;

        // Check proximity to any item
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
            {/* Header */}
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

            {/* Frequency Strip */}
            <FrequencyStrip
                items={items}
                onCenterChange={handleCenterChange}
                onSnap={handleSnap}
                onUnsnap={handleUnsnap}
                activeItemId={activeItem?.id ?? null}
            />

            {/* CRT Screen */}
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
```

**Step 2: Update TimelineLegend styling**

Update `src/components/dashboard/TimelineLegend.tsx` to use "tick" language instead of "node":

```tsx
export default function TimelineLegend() {
    return (
        <div className="flex items-center gap-4 text-[9px] font-mono uppercase tracking-widest text-gray-500">
            <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-red-500" />
                <span>Risks</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-emerald-400" />
                <span>Solutions</span>
            </div>
        </div>
    );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. `TimelinePin` import is removed from TimelineView. The file `TimelinePin.tsx` still exists but is no longer imported.

**Step 4: Commit**

```bash
git add src/components/dashboard/TimelineView.tsx src/components/dashboard/TimelineLegend.tsx
git commit -m "feat: rewrite TimelineView with FrequencyStrip + CRTScreen composition"
```

---

### Task 6: Add CSS Animation + Cleanup

**Files:**
- Modify: `src/index.css` — add `crt-static` keyframe
- Delete: `src/components/dashboard/TimelinePin.tsx` — no longer used

**Step 1: Add keyframe to index.css**

Read `src/index.css` first and append the keyframe at the end:

```css
@keyframes crt-static {
    0% { background-position: 0 0, 0 0, 0 0; }
    33% { background-position: 2px 1px, -1px 2px, 3px -1px; }
    66% { background-position: -1px -2px, 3px 1px, -2px 3px; }
    100% { background-position: 0 0, 0 0, 0 0; }
}
```

**Step 2: Delete TimelinePin.tsx**

```bash
rm src/components/dashboard/TimelinePin.tsx
```

Verify no other file imports it:

```bash
grep -r "TimelinePin" src/
```

Expected: No results (only the deleted file itself referenced it).

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build with no warnings about TimelinePin

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: add CRT static animation keyframe, remove unused TimelinePin"
```

---

### Task 7: Final Build Verification + Integration Test

**Files:** None (verification only)

**Step 1: Full clean build**

```bash
rm -rf dist && npm run build
```

Expected: Clean build, no TS errors, no unused variable warnings.

**Step 2: Manual verification checklist**

Run `npm run dev` and verify:
- [ ] Page loads showing "Signal Scanner" header + FrequencyStrip + CRT screen with "Scanning..."
- [ ] FrequencyStrip centered on 2026
- [ ] Dragging the strip moves smoothly, no jump on first drag
- [ ] Risk ticks (red) above axis, solution ticks (green) below
- [ ] Ticks fade when far from center
- [ ] Releasing near a tick snaps and CRT shows "Signal Locked" + card content
- [ ] Cycling arrows appear when multiple items at same year
- [ ] "Tune In" button navigates to detail view
- [ ] Mobile: same layout stacked, swipe works on strip
- [ ] CRT bezel has green tint, scanlines visible

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: Signal Scanner complete — radio tuner + CRT screen timeline"
```
