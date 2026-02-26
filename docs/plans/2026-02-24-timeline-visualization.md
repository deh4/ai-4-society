# Timeline Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Dashboard card grid with an interactive swipeable timeline showing risks (above) and solutions (below) as pins anchored to their derived peak year.

**Architecture:** New `TimelineView` component replaces `RiskOverview` in `Dashboard.tsx`. Horizontal draggable layout on desktop (Framer Motion `drag="x"`), vertical native scroll on mobile. Peak year derived algorithmically from existing score + velocity data. Clicking a pin navigates to existing detail panel at `/dashboard/:riskId`.

**Tech Stack:** React 19, Framer Motion (new dep), TypeScript (strict mode), Tailwind 3, existing Firebase/RiskContext data layer.

**Important TS constraints:** `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax: true` (must use `import type` for type-only imports).

---

### Task 1: Install Framer Motion

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm install framer-motion`

Expected: framer-motion added to dependencies in package.json.

**Step 2: Verify build still works**

Run: `npm run build`

Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion dependency"
```

---

### Task 2: Create derivePeakYear utility

**Files:**
- Create: `src/lib/derivePeakYear.ts`

**Step 1: Create the utility file**

```typescript
// src/lib/derivePeakYear.ts

import type { Risk, Solution } from '../store/RiskContext';

const VELOCITY_OFFSET: Record<string, number> = {
    Critical: 0,
    High: 2,
    Medium: 5,
    Emerging: 7,
    Low: 9,
};

const STAGE_OFFSET: Record<string, number> = {
    'Deployed': 1,
    'Scaling': 2,
    'Piloting': 4,
    'Proposed': 6,
    'Concept': 8,
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export interface TimelineItem {
    id: string;
    label: string;
    name: string;
    score: number;
    peakYear: number;
    type: 'risk' | 'solution';
    velocity: string;
    parentRiskId?: string;
}

export function deriveRiskPeakYear(risk: Risk): number {
    const base = VELOCITY_OFFSET[risk.velocity] ?? 5;
    const trend = (risk.score_2035 - risk.score_2026) > 0 ? 2 : -1;
    return clamp(2026 + base + trend, 2026, 2038);
}

export function deriveSolutionPeakYear(solution: Solution): number {
    const base = STAGE_OFFSET[solution.implementation_stage] ?? 5;
    const trend = (solution.adoption_score_2035 - solution.adoption_score_2026) > 0 ? -1 : 2;
    return clamp(2026 + base + trend, 2026, 2038);
}

export function buildTimelineItems(risks: Risk[], solutions: Solution[]): TimelineItem[] {
    const items: TimelineItem[] = [];

    for (const risk of risks) {
        items.push({
            id: risk.id,
            label: risk.id,
            name: risk.risk_name,
            score: risk.score_2026,
            peakYear: deriveRiskPeakYear(risk),
            type: 'risk',
            velocity: risk.velocity,
        });
    }

    for (const solution of solutions) {
        items.push({
            id: solution.id,
            label: solution.id,
            name: solution.solution_title,
            score: solution.adoption_score_2026,
            peakYear: deriveSolutionPeakYear(solution),
            type: 'solution',
            velocity: solution.implementation_stage,
            parentRiskId: solution.parent_risk_id,
        });
    }

    return items;
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Clean build (file is imported nowhere yet, but TS still checks it via `include: ["src"]`).

**Step 3: Commit**

```bash
git add src/lib/derivePeakYear.ts
git commit -m "feat: add derivePeakYear utility for timeline positioning"
```

---

### Task 3: Create TimelinePin component

**Files:**
- Create: `src/components/dashboard/TimelinePin.tsx`

This is the individual pin — stem line, circular node, label. Used in both horizontal and vertical orientations.

**Step 1: Create the component**

```tsx
// src/components/dashboard/TimelinePin.tsx

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TimelineItem } from '../../lib/derivePeakYear';

interface TimelinePinProps {
    item: TimelineItem;
    stemLength: number;
    onClick: (item: TimelineItem) => void;
    orientation: 'horizontal' | 'vertical';
}

const VELOCITY_SIZE: Record<string, number> = {
    Critical: 14,
    High: 12,
    Medium: 10,
    Emerging: 10,
    Low: 8,
    // Solution stages
    Deployed: 14,
    Scaling: 12,
    Piloting: 10,
    Proposed: 8,
    Concept: 8,
};

export default function TimelinePin({ item, stemLength, onClick, orientation }: TimelinePinProps) {
    const [hovered, setHovered] = useState(false);
    const isRisk = item.type === 'risk';
    const nodeSize = VELOCITY_SIZE[item.velocity] ?? 10;
    const nodeColor = isRisk ? 'bg-red-500' : 'bg-green-500';
    const labelColor = isRisk ? 'text-red-400' : 'text-green-400';
    const stemColor = isRisk ? 'bg-red-500/30' : 'bg-green-500/30';

    if (orientation === 'vertical') {
        // Vertical layout: pin extends horizontally from the axis
        // Risks go left, solutions go right
        return (
            <motion.button
                onClick={() => onClick(item)}
                onHoverStart={() => setHovered(true)}
                onHoverEnd={() => setHovered(false)}
                className={`flex items-center gap-0 cursor-pointer ${isRisk ? 'flex-row-reverse' : 'flex-row'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
            >
                {/* Stem */}
                <div className={`${stemColor} h-0.5`} style={{ width: stemLength }} />

                {/* Node + Label */}
                <div className={`flex items-center gap-1.5 ${isRisk ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                    <div className={`${isRisk ? 'text-right' : 'text-left'}`}>
                        <div className={`text-xs font-bold ${labelColor}`}>
                            {item.label}
                            <span className="text-[10px] text-gray-500 ml-1">{item.score}</span>
                        </div>
                        {hovered && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-[10px] text-gray-400 max-w-[160px] line-clamp-2"
                            >
                                {item.name}
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.button>
        );
    }

    // Horizontal layout: pin extends vertically from the axis
    // Risks go up, solutions go down
    const isAbove = isRisk;

    return (
        <motion.button
            onClick={() => onClick(item)}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className={`flex flex-col items-center gap-0 cursor-pointer ${isAbove ? 'flex-col-reverse' : 'flex-col'}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
        >
            {/* Node + Label */}
            <div className="flex flex-col items-center gap-1">
                {!isAbove && (
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                )}
                <div className="text-center">
                    <div className={`text-xs font-bold ${labelColor}`}>
                        {item.label}
                        <span className="text-[10px] text-gray-500 ml-1">{item.score}</span>
                    </div>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0, y: isAbove ? -4 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[10px] text-gray-400 max-w-[120px] mx-auto line-clamp-2"
                        >
                            {item.name}
                        </motion.div>
                    )}
                </div>
                {isAbove && (
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                )}
            </div>

            {/* Stem */}
            <div className={`${stemColor} w-0.5`} style={{ height: stemLength }} />
        </motion.button>
    );
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

**Step 3: Commit**

```bash
git add src/components/dashboard/TimelinePin.tsx
git commit -m "feat: add TimelinePin component for timeline visualization"
```

---

### Task 4: Create TimelineLegend component

**Files:**
- Create: `src/components/dashboard/TimelineLegend.tsx`

**Step 1: Create the component**

```tsx
// src/components/dashboard/TimelineLegend.tsx

export default function TimelineLegend() {
    return (
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Risks</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>Solutions</span>
            </div>
            <span className="text-gray-600">|</span>
            <span className="text-gray-600">Larger node = higher severity/adoption</span>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

**Step 3: Commit**

```bash
git add src/components/dashboard/TimelineLegend.tsx
git commit -m "feat: add TimelineLegend component"
```

---

### Task 5: Create TimelineView (main container)

**Files:**
- Create: `src/components/dashboard/TimelineView.tsx`

This is the main component. It builds timeline items, groups them by year, and renders the horizontal (desktop) or vertical (mobile) layout.

**Step 1: Create the component**

```tsx
// src/components/dashboard/TimelineView.tsx

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
const YEAR_WIDTH_PX = 120; // horizontal spacing per year on desktop
const YEAR_HEIGHT_PX = 140; // vertical spacing per year on mobile
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
            <div className="flex items-center justify-between">
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

                                    {/* Empty year placeholder */}
                                    {group.risks.length === 0 && group.solutions.length === 0 && (
                                        <div className="h-4" />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Clean build.

**Step 3: Commit**

```bash
git add src/components/dashboard/TimelineView.tsx
git commit -m "feat: add TimelineView main container with horizontal/vertical layouts"
```

---

### Task 6: Wire TimelineView into Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx:1-10,98-105`

**Step 1: Replace RiskOverview with TimelineView**

In `src/pages/Dashboard.tsx`, make these changes:

1. Replace the `RiskOverview` import with `TimelineView`:

```diff
-import RiskOverview from '../components/dashboard/RiskOverview';
+import TimelineView from '../components/dashboard/TimelineView';
```

2. Replace the `<RiskOverview>` usage (around line 98-104):

```diff
-                    <RiskOverview
-                        risks={risks}
-                        loading={loading}
-                        error={error}
-                        onSelectRisk={handleSelectRisk}
-                    />
+                    <TimelineView
+                        risks={risks}
+                        solutions={solutions}
+                        loading={loading}
+                        error={error}
+                        onSelectRisk={handleSelectRisk}
+                    />
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Clean build. `RiskOverview` is no longer imported (but the file stays for reference).

**Step 3: Verify dev server**

Run: `npm run dev` — open browser, navigate to `/dashboard`, confirm the timeline renders.

**Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: replace card grid with timeline visualization on Dashboard"
```

---

### Task 7: Polish and verify

**Step 1: Run full build**

Run: `npm run build`

Expected: Clean build, no unused imports, no type errors.

**Step 2: Visual check on desktop**

Open `http://localhost:5173/dashboard` — verify:
- Horizontal timeline renders with risk pins above, solution pins below
- Year labels visible along the axis
- Drag left/right to scroll through years
- Hovering a pin shows the full name tooltip
- Clicking a pin navigates to the detail panel
- Legend is visible

**Step 3: Visual check on mobile**

Open DevTools, toggle mobile viewport (375px wide):
- Vertical timeline with sticky year headers
- Risks on the left, solutions on the right
- Native scroll works
- Pins are tappable, navigate to detail

**Step 4: Commit final polish (if any tweaks needed)**

```bash
git add -A
git commit -m "feat: timeline visualization polish and responsive fixes"
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add framer-motion |
| `src/lib/derivePeakYear.ts` | Create | Peak year calculation utility |
| `src/components/dashboard/TimelinePin.tsx` | Create | Individual pin component |
| `src/components/dashboard/TimelineLegend.tsx` | Create | Color legend |
| `src/components/dashboard/TimelineView.tsx` | Create | Main timeline container |
| `src/pages/Dashboard.tsx` | Modify | Swap RiskOverview for TimelineView |

No files deleted. `RiskOverview.tsx`, `OverviewHeader.tsx`, and `RiskCard.tsx` remain in codebase for reference.
