# Observatory UI Redesign — Progressive Disclosure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the crowded 3-column dashboard with a progressive disclosure architecture: card grid overview (Layer 0) → full-width reading detail (Layer 1) → existing data view opt-in (Layer 2).

**Architecture:** The `/dashboard` route gains a `view` state (`overview | detail | data`). Overview is the default landing — a filterable card grid grouped by velocity tier. Clicking a card transitions to a full-width reading view with risk + solution unified. A "Data View" toggle in the detail view opens the existing 3-column layout for power users. The Risk/Solution binary toggle is removed; solutions appear inline within each risk's detail.

**Tech Stack:** React 19, Tailwind 3, CSS animations (no Framer Motion), existing RiskContext/AuthContext, React Router 7.

**Existing files that will be modified:**
- `src/pages/Dashboard.tsx` — complete rewrite (view state machine replaces 3-column layout)
- `src/components/dashboard/RiskDetailPanel.tsx` — refactored for full-width + inline solution
- `src/App.tsx` — add `/dashboard/:riskId?` route param
- `tailwind.config.js` — add card animation keyframes

**Existing files preserved as-is:**
- `src/components/dashboard/SolutionDetailPanel.tsx` — solution content absorbed into RiskDetailPanel
- `src/components/dashboard/PerceptionGap.tsx` — reused inline in detail view
- `src/components/dashboard/SignalEvidenceList.tsx` — reused inline in detail view
- `src/store/RiskContext.tsx` — no changes needed
- `src/store/AuthContext.tsx` — no changes needed

**New files:**
- `src/components/dashboard/RiskCard.tsx` — individual risk card
- `src/components/dashboard/RiskOverview.tsx` — card grid + filters + section headers
- `src/components/dashboard/OverviewHeader.tsx` — hero strip with filters and sort

**Removed UI elements:**
- Risk/Solution binary toggle (solutions shown inline within risk detail)
- Left sidebar (navigation IS the card grid)
- Right sidebar (perception gap + signals move inline)
- "Personalized Exposure" coming soon placeholder
- Mobile drawer mechanism (card grid is inherently mobile-friendly)

---

### Task 1: Tailwind Animation Config

**Files:**
- Modify: `tailwind.config.js`

**Context:** We need staggered card entrance animations and a subtle pulse for critical risk cards. The project already has a `fadeInUp` keyframe — we'll add `cardFadeIn` (shorter, starts from less distance) and `pulse-subtle` (gentler than Tailwind's built-in `animate-pulse`).

**Step 1: Update tailwind.config.js**

Replace the entire file with:

```js
/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            animation: {
                'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
                'card-enter': 'cardEnter 0.4s ease-out both',
                'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
                'signal-blink': 'signalBlink 2s ease-in-out infinite',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                cardEnter: {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                pulseSubtle: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.6' },
                },
                signalBlink: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.3' },
                },
            },
        },
    },
    plugins: [],
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat(ui): add card animation keyframes to Tailwind config"
```

---

### Task 2: RiskCard Component

**Files:**
- Create: `src/components/dashboard/RiskCard.tsx`

**Context:** This is the primary visual element of the overview. Each card shows: risk name, score, velocity accent, 1-line summary, score trajectory (2026→2035), metadata counts (affected groups, signal count). Critical velocity cards get a pulsing left accent. Cards use CSS custom property `--index` for staggered entrance animation.

**Step 1: Create the component**

```tsx
import type { Risk } from '../../store/RiskContext';

interface RiskCardProps {
    risk: Risk;
    index: number;
    onClick: (id: string) => void;
}

const VELOCITY_COLORS: Record<string, { accent: string; text: string; bg: string }> = {
    Critical: { accent: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
    High: { accent: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10' },
    Medium: { accent: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10' },
    Low: { accent: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10' },
    Emerging: { accent: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' },
};

export default function RiskCard({ risk, index, onClick }: RiskCardProps) {
    const colors = VELOCITY_COLORS[risk.velocity] ?? VELOCITY_COLORS.Medium;
    const isCritical = risk.velocity === 'Critical';
    const newSignalCount = risk.signal_evidence?.filter(s => s.isNew).length ?? 0;
    const totalSignals = risk.signal_evidence?.length ?? 0;
    const affectedCount = risk.who_affected?.length ?? 0;

    // Score trajectory: positive = worsening (red), negative = improving (green)
    const delta = risk.score_2035 - risk.score_2026;
    const trajectoryWidth = Math.min(Math.abs(delta), 30); // cap visual width
    const isWorsening = delta > 0;

    return (
        <button
            onClick={() => onClick(risk.id)}
            className="group w-full text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-200 hover:-translate-y-0.5 overflow-hidden animate-card-enter"
            style={{ animationDelay: `${index * 60}ms` }}
        >
            <div className="flex">
                {/* Left accent bar */}
                <div className={`w-1 shrink-0 ${colors.accent} ${isCritical ? 'animate-pulse-subtle' : ''}`} />

                <div className="flex-1 p-4 sm:p-5">
                    {/* Top row: category + velocity */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500">
                            {risk.category}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                            {risk.velocity}
                        </span>
                    </div>

                    {/* Title + Score */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="text-base font-semibold leading-snug group-hover:text-white transition-colors">
                            {risk.risk_name}
                        </h3>
                        <span className={`text-2xl font-bold shrink-0 ${colors.text}`}>
                            {risk.score_2026}
                        </span>
                    </div>

                    {/* Summary (2 lines max) */}
                    <p className="text-sm text-gray-400 leading-relaxed mb-4 line-clamp-2">
                        {risk.summary}
                    </p>

                    {/* Score trajectory bar */}
                    <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-gray-600">2026</span>
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${isWorsening ? 'bg-red-500/60' : 'bg-green-500/60'}`}
                                    style={{ width: `${Math.max(trajectoryWidth * 3, 5)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-gray-600">2035</span>
                        </div>
                        <div className="text-[10px] text-center">
                            <span className={isWorsening ? 'text-red-400/70' : 'text-green-400/70'}>
                                {risk.score_2026} → {risk.score_2035}
                                {isWorsening ? ' ▲' : delta < 0 ? ' ▼' : ' ─'}
                            </span>
                        </div>
                    </div>

                    {/* Metadata footer */}
                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                        {affectedCount > 0 && (
                            <span>{affectedCount} group{affectedCount !== 1 ? 's' : ''} affected</span>
                        )}
                        {totalSignals > 0 && (
                            <span className="flex items-center gap-1">
                                {totalSignals} signal{totalSignals !== 1 ? 's' : ''}
                                {newSignalCount > 0 && (
                                    <span className="flex items-center gap-0.5">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-signal-blink" />
                                        <span className="text-green-400">{newSignalCount} new</span>
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/dashboard/RiskCard.tsx
git commit -m "feat(ui): create RiskCard component with velocity accents and trajectory"
```

---

### Task 3: OverviewHeader Component

**Files:**
- Create: `src/components/dashboard/OverviewHeader.tsx`

**Context:** Compact hero strip at the top of the overview. Shows headline, subtitle, category filter pills, and sort control. No globe, no 3D — clean and informational.

**Step 1: Create the component**

```tsx
interface OverviewHeaderProps {
    riskCount: number;
    activeCategory: string | null;
    onCategoryChange: (category: string | null) => void;
    sortBy: 'severity' | 'velocity' | 'name';
    onSortChange: (sort: 'severity' | 'velocity' | 'name') => void;
    categories: string[];
}

const SORT_LABELS: Record<string, string> = {
    severity: 'Severity',
    velocity: 'Velocity',
    name: 'A–Z',
};

export default function OverviewHeader({
    riskCount,
    activeCategory,
    onCategoryChange,
    sortBy,
    onSortChange,
    categories,
}: OverviewHeaderProps) {
    return (
        <div className="mb-8">
            {/* Headline */}
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    {riskCount} risks reshaping society
                </h1>
                <p className="text-sm sm:text-base text-gray-400">
                    Tracked by 6 autonomous AI agents. Updated daily.
                </p>
            </div>

            {/* Filters + Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Category pills */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => onCategoryChange(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            activeCategory === null
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                        }`}
                    >
                        All
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => onCategoryChange(cat)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                activeCategory === cat
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Sort control */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-gray-600 mr-1">Sort</span>
                    {(['severity', 'velocity', 'name'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => onSortChange(s)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                                sortBy === s
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {SORT_LABELS[s]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/dashboard/OverviewHeader.tsx
git commit -m "feat(ui): create OverviewHeader with category filters and sort controls"
```

---

### Task 4: RiskOverview Component (Layer 0)

**Files:**
- Create: `src/components/dashboard/RiskOverview.tsx`

**Context:** The main card grid view. Groups risks by velocity tier (Critical → High → Emerging/Medium/Low), applies category filter and sort, renders section headers and RiskCard components.

**Step 1: Create the component**

```tsx
import { useState, useMemo } from 'react';
import type { Risk } from '../../store/RiskContext';
import RiskCard from './RiskCard';
import OverviewHeader from './OverviewHeader';

interface RiskOverviewProps {
    risks: Risk[];
    loading: boolean;
    error: string | null;
    onSelectRisk: (id: string) => void;
}

type SortBy = 'severity' | 'velocity' | 'name';

const VELOCITY_ORDER: Record<string, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Emerging: 2,
    Low: 3,
};

interface TierGroup {
    label: string;
    description: string;
    risks: Risk[];
}

function groupByTier(risks: Risk[]): TierGroup[] {
    const critical = risks.filter(r => r.velocity === 'Critical');
    const high = risks.filter(r => r.velocity === 'High');
    const rest = risks.filter(r => !['Critical', 'High'].includes(r.velocity));

    const groups: TierGroup[] = [];
    if (critical.length > 0) {
        groups.push({
            label: 'Critical',
            description: 'Immediate and accelerating threats',
            risks: critical,
        });
    }
    if (high.length > 0) {
        groups.push({
            label: 'High Velocity',
            description: 'Rapidly developing risks',
            risks: high,
        });
    }
    if (rest.length > 0) {
        groups.push({
            label: 'Emerging',
            description: 'Developing trends to watch',
            risks: rest,
        });
    }
    return groups;
}

function sortRisks(risks: Risk[], sortBy: SortBy): Risk[] {
    const sorted = [...risks];
    switch (sortBy) {
        case 'severity':
            return sorted.sort((a, b) => b.score_2026 - a.score_2026);
        case 'velocity':
            return sorted.sort((a, b) =>
                (VELOCITY_ORDER[a.velocity] ?? 99) - (VELOCITY_ORDER[b.velocity] ?? 99)
                || b.score_2026 - a.score_2026
            );
        case 'name':
            return sorted.sort((a, b) => a.risk_name.localeCompare(b.risk_name));
        default:
            return sorted;
    }
}

export default function RiskOverview({ risks, loading, error, onSelectRisk }: RiskOverviewProps) {
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortBy>('severity');

    const categories = useMemo(() => {
        const cats = [...new Set(risks.map(r => r.category))];
        return cats.sort();
    }, [risks]);

    const filteredRisks = useMemo(() => {
        const filtered = activeCategory
            ? risks.filter(r => r.category === activeCategory)
            : risks;
        return sortRisks(filtered, sortBy);
    }, [risks, activeCategory, sortBy]);

    const tierGroups = useMemo(() => groupByTier(filteredRisks), [filteredRisks]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-gray-500 text-sm">Loading observatory data...</div>
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

    // Track card index across groups for staggered animation
    let cardIndex = 0;

    return (
        <div>
            <OverviewHeader
                riskCount={risks.length}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                sortBy={sortBy}
                onSortChange={setSortBy}
                categories={categories}
            />

            {tierGroups.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-12">
                    No risks match the selected filter.
                </div>
            ) : (
                <div className="space-y-10">
                    {tierGroups.map((group) => (
                        <section key={group.label}>
                            {/* Section header */}
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                                    {group.label}
                                </h2>
                                <div className="flex-1 h-px bg-white/5" />
                                <span className="text-[10px] text-gray-600">
                                    {group.risks.length} risk{group.risks.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Card grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.risks.map((risk) => {
                                    const idx = cardIndex++;
                                    return (
                                        <RiskCard
                                            key={risk.id}
                                            risk={risk}
                                            index={idx}
                                            onClick={onSelectRisk}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/dashboard/RiskOverview.tsx
git commit -m "feat(ui): create RiskOverview with tier-grouped card grid, filters, and sort"
```

---

### Task 5: Refactor RiskDetailPanel for Full-Width (Layer 1)

**Files:**
- Modify: `src/components/dashboard/RiskDetailPanel.tsx`

**Context:** The detail panel needs to work in a full-width single-column reading layout. The Risk/Solution toggle is eliminated — the related solution appears inline at the bottom. Perception Gap and Signal Evidence are integrated as sections instead of living in a sidebar. Typography bumps up for readability. A back button is added at the top.

**Step 1: Rewrite RiskDetailPanel.tsx**

Replace the entire file with:

```tsx
import type { Risk, Solution } from '../../store/RiskContext';
import SignalEvidenceList from './SignalEvidenceList';
import PerceptionGap from './PerceptionGap';
import SolutionDetailPanel from './SolutionDetailPanel';

interface RiskDetailPanelProps {
    risk: Risk;
    relatedSolution: Solution | undefined;
    onBack: () => void;
}

export default function RiskDetailPanel({ risk, relatedSolution, onBack }: RiskDetailPanelProps) {
    return (
        <div className="max-w-3xl mx-auto">
            {/* Back button */}
            <button
                onClick={onBack}
                className="text-sm text-gray-500 hover:text-white transition-colors mb-6 flex items-center gap-1.5"
            >
                <span>&larr;</span>
                <span>All risks</span>
            </button>

            {/* Risk Header */}
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2 leading-tight">{risk.risk_name}</h1>
                <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-widest text-cyan-400">
                        {risk.category}
                    </span>
                    <span className={`text-xs uppercase tracking-wider px-2.5 py-0.5 rounded ${
                        risk.velocity === 'Critical' ? 'bg-red-500/20 text-red-400' :
                        risk.velocity === 'High' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-gray-500/20 text-gray-400'
                    }`}>
                        {risk.velocity} Velocity
                    </span>
                </div>
            </div>

            {/* Summary Box */}
            <div className="mb-6 p-5 bg-red-950/20 border border-red-900/30 rounded-lg">
                <p className="text-base text-gray-200 leading-relaxed">{risk.summary}</p>
            </div>

            {/* Perception Gap — inline */}
            <div className="mb-8 p-4 bg-white/[0.03] border border-white/10 rounded-lg">
                <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Perception Gap</h2>
                <PerceptionGap
                    isMonitorMode={true}
                    selectedRisk={risk}
                    selectedSolution={undefined}
                />
            </div>

            {/* Deep Dive */}
            <div className="mb-8">
                <h2 className="text-sm font-medium text-gray-400 mb-3">Deep Dive</h2>
                <div className="text-base text-gray-300 leading-relaxed whitespace-pre-line">
                    {risk.deep_dive}
                </div>
            </div>

            {/* Affected Groups */}
            {risk.who_affected && risk.who_affected.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Who's Affected</h2>
                    <div className="flex flex-wrap gap-2">
                        {risk.who_affected.map((group, idx) => (
                            <span key={idx} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm">
                                {group}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Timeline Evolution */}
            {risk.timeline_narrative && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Evolution Timeline</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2026–2030</div>
                            <div className="text-xl font-bold text-red-400 mb-2">{risk.score_2026}</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.near_term}</p>
                        </div>
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2030–2040</div>
                            <div className="text-xl font-bold text-orange-400 mb-2">Peak</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.mid_term}</p>
                        </div>
                        <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-4">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">2040–2050</div>
                            <div className="text-xl font-bold text-yellow-400 mb-2">{risk.score_2035}</div>
                            <p className="text-sm text-gray-400 leading-relaxed">{risk.timeline_narrative.long_term}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Mitigation Strategies */}
            {risk.mitigation_strategies && risk.mitigation_strategies.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Mitigation Strategies</h2>
                    <ul className="space-y-2.5">
                        {risk.mitigation_strategies.map((strategy, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                                <span className="text-cyan-400 mt-0.5">→</span>
                                <span className="text-base text-gray-300">{strategy}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Connected Risks */}
            {risk.connected_to && risk.connected_to.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Connected Risks</h2>
                    <div className="flex flex-wrap gap-2">
                        {risk.connected_to.map((id) => (
                            <span key={id} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                                {id}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Signal Evidence — full width */}
            {risk.signal_evidence && risk.signal_evidence.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">
                        Signal Evidence
                        <span className="text-[10px] text-gray-600 ml-2">
                            ({risk.signal_evidence.length} signal{risk.signal_evidence.length !== 1 ? 's' : ''})
                        </span>
                    </h2>
                    <SignalEvidenceList evidence={risk.signal_evidence} />
                </div>
            )}

            {/* Related Solution — inline, no mode switch */}
            {relatedSolution && (
                <div className="mt-10 pt-8 border-t border-white/10">
                    <div className="text-xs uppercase tracking-widest text-green-400 mb-4">
                        What's being done about it
                    </div>
                    <SolutionDetailPanel solution={relatedSolution} />
                </div>
            )}
        </div>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors (the old props `setThemeMode` and `setSelectedId` are removed — Dashboard.tsx will be updated in Task 7 to use the new interface)

Note: This will temporarily break the import in Dashboard.tsx because the props changed. That's fine — Dashboard.tsx gets rewritten in Task 7.

**Step 3: Commit**

```bash
git add src/components/dashboard/RiskDetailPanel.tsx
git commit -m "feat(ui): refactor RiskDetailPanel for full-width reading layout with inline solution"
```

---

### Task 6: Add Route Param Support

**Files:**
- Modify: `src/App.tsx`

**Context:** We need `/dashboard/:riskId?` so that clicking a risk card can use URL-based navigation. The `?` makes the param optional — `/dashboard` shows the overview, `/dashboard/R03` shows the detail.

**Step 1: Update the dashboard route in App.tsx**

Find this line:
```tsx
<Route path="/dashboard" element={<Dashboard />} />
```

Replace with:
```tsx
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/dashboard/:riskId" element={<Dashboard />} />
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): add /dashboard/:riskId route for deep-linkable risk detail"
```

---

### Task 7: Rewrite Dashboard.tsx (View State Machine)

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Context:** This is the big change. The Dashboard becomes a view state machine:
- No `riskId` param → show RiskOverview (Layer 0)
- With `riskId` param → show RiskDetailPanel (Layer 1)

The entire 3-column layout, mobile drawer, year slider, Risk/Solution toggle, IndexList, and RiskAccordion components are removed. The header is simplified to: logo, auth links, and a subtle "About" link.

**Step 1: Rewrite Dashboard.tsx**

Replace the entire file with:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
import { useRisks } from '../store/RiskContext';
import { useAuth } from '../store/AuthContext';
import RiskOverview from '../components/dashboard/RiskOverview';
import RiskDetailPanel from '../components/dashboard/RiskDetailPanel';

export default function Dashboard() {
    const { riskId } = useParams<{ riskId?: string }>();
    const { risks, solutions, loading, error } = useRisks();
    const { user, isAdmin, signIn, logOut } = useAuth();
    const navigate = useNavigate();

    const selectedRisk = riskId ? risks.find(r => r.id === riskId) : undefined;
    const relatedSolution = selectedRisk
        ? solutions.find(s => s.parent_risk_id === selectedRisk.id)
        : undefined;

    const handleSelectRisk = (id: string) => {
        navigate(`/dashboard/${id}`);
    };

    const handleBack = () => {
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#0a0f1a] text-white font-sans">
            {/* Header */}
            <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-[#1a2035] flex items-center justify-between px-4 sm:px-6 bg-[#0a0f1a]/95 backdrop-blur-sm">
                {/* Left: Logo */}
                <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2.5"
                >
                    <div className="w-7 h-7 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                        <div className="w-1.5 h-3.5 rounded-full bg-cyan-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide">AI 4 Society</span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Observatory</span>
                    </div>
                </button>

                {/* Right: Auth + links */}
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => navigate('/contribute')}
                        className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors hidden sm:block"
                    >
                        Contribute
                    </button>
                    {user ? (
                        <>
                            {isAdmin && (
                                <button
                                    onClick={() => navigate('/admin')}
                                    className="text-[10px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors"
                                >
                                    Admin
                                </button>
                            )}
                            <button
                                onClick={logOut}
                                className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
                            >
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={signIn}
                            className="text-[10px] uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </header>

            {/* Content */}
            <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {riskId && selectedRisk ? (
                    <RiskDetailPanel
                        risk={selectedRisk}
                        relatedSolution={relatedSolution}
                        onBack={handleBack}
                    />
                ) : riskId && !loading ? (
                    <div className="text-center py-20">
                        <div className="text-gray-500 mb-4">Risk not found</div>
                        <button
                            onClick={handleBack}
                            className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                            &larr; Back to overview
                        </button>
                    </div>
                ) : (
                    <RiskOverview
                        risks={risks}
                        loading={loading}
                        error={error}
                        onSelectRisk={handleSelectRisk}
                    />
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-white/5 px-4 sm:px-6 py-6 mt-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-gray-600 max-w-5xl mx-auto">
                    <span>AI 4 Society Observatory — Real-time AI risk intelligence</span>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="hover:text-gray-400 transition-colors"
                        >
                            About
                        </button>
                        <button
                            onClick={() => navigate('/contribute')}
                            className="hover:text-gray-400 transition-colors"
                        >
                            Contribute
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Verify full build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(ui): rewrite Dashboard with progressive disclosure — overview grid + detail view"
```

---

### Task 8: Visual QA and Polish

**Files:**
- Possibly modify: any of the new components

**Context:** Run the dev server and visually verify the new layout works across breakpoints. Check for any issues and fix them.

**Step 1: Start dev server and inspect**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run dev`

Verify these scenarios:
1. `/dashboard` shows the card grid overview with 10 risks grouped by velocity tier
2. Category filter pills work — clicking "Geopolitical" shows only 3 risks
3. Sort controls work — "A–Z" reorders alphabetically
4. Clicking a card navigates to `/dashboard/R01` (detail view)
5. Detail view shows: back button, full-width risk content, perception gap inline, signal evidence inline, related solution at the bottom
6. Back button returns to the overview
7. Mobile viewport (375px): cards stack single-column, header adapts
8. Tablet viewport (768px): cards 2-column
9. Desktop (1280px+): cards 3-column
10. Card entrance animations stagger correctly
11. Critical risk cards have pulsing left accent
12. Deep link `/dashboard/R05` works directly (shows detail)
13. Invalid deep link `/dashboard/R99` shows "Risk not found"

**Step 2: Fix any issues found**

Apply targeted fixes to the specific files/components.

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix(ui): visual polish and responsive adjustments for redesigned dashboard"
```

---

### Task 9: Deploy

**Files:**
- None (deployment only)

**Step 1: Build and type-check**

Run both in sequence:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npx tsc --noEmit && npx vite build 2>&1 | tail -5
```
Expected: Both pass

**Step 2: Verify Firebase project**

Run: `firebase use`
Expected: `ai-4-society`

**Step 3: Deploy hosting**

Run: `firebase deploy --only hosting 2>&1 | tail -10`
Expected: Deploy succeeds, shows hosting URL

**Step 4: Commit and verify**

If any files changed during build, commit them. Then verify the live site at https://ai-4-society.web.app/dashboard works correctly.

---

## Summary of Changes

| Before | After |
|--------|-------|
| 3-column layout (sidebar + content + sidebar) | Card grid overview → full-width detail |
| Binary Risk/Solution toggle | Unified view (solution inline within risk) |
| Always-visible left sidebar | No sidebar (grid IS navigation) |
| Right sidebar (perception gap + signals + placeholder) | Integrated into detail view sections |
| Mobile drawer with overlay | Naturally responsive card grid |
| `text-sm` (14px) body everywhere | `text-base` (16px) for reading content |
| All data visible simultaneously | Progressive disclosure (overview → detail) |
| Single route `/dashboard` | URL-based `/dashboard/:riskId?` with deep links |
| "Coming Soon" placeholder | Removed |

## Files Created
- `src/components/dashboard/RiskCard.tsx`
- `src/components/dashboard/RiskOverview.tsx`
- `src/components/dashboard/OverviewHeader.tsx`

## Files Modified
- `tailwind.config.js` — added animation keyframes
- `src/components/dashboard/RiskDetailPanel.tsx` — full-width + inline solution
- `src/App.tsx` — added `/dashboard/:riskId` route
- `src/pages/Dashboard.tsx` — complete rewrite

## Files Untouched (reused as-is)
- `src/components/dashboard/SolutionDetailPanel.tsx`
- `src/components/dashboard/PerceptionGap.tsx`
- `src/components/dashboard/SignalEvidenceList.tsx`
- `src/store/RiskContext.tsx`
- `src/store/AuthContext.tsx`
