# Timeline Visualization Design

## Overview

Replace the card grid on the Dashboard with an interactive timeline showing risks and solutions as pins anchored to their estimated peak year. Horizontal layout on desktop with drag-to-navigate; vertical layout on mobile with native scroll.

## Layout

### Desktop (>= md breakpoint)

A horizontal timeline axis spanning 2026-2038. Risk pins appear above the axis, solution pins below. The entire timeline is draggable via Framer Motion `drag="x"` — swipe left to move toward the future, swipe right toward the past.

```
   R02 (88)     R09         R03
     |           |           |
 ----*-----------*---*-------*------*---*--------
     |               |             |   |
   S02         S05/S09           S03  S06

  2026   2027   2028   2029   2030  ... 2038
```

### Mobile (< md breakpoint)

A vertical timeline with native scroll. Year labels are sticky headers. Risks appear on the left side of the axis, solutions on the right.

```
  2026
  -- R02 (88) --
  -- S02      --

  2027
  -- R09      --

  2028
  -- R01 (78) --
  -- S05      --
```

## Pin Design

- Vertical stem line connecting to the axis
- Circular node at the tip, color-coded: red tones for risks, green tones for solutions
- Label: ID (R01, S02) + score
- Node size encodes severity/velocity: Critical/High = larger, Emerging/Low = smaller
- Clustered pins (same year) get staggered stem heights to avoid overlap
- Hover: pin expands, tooltip shows full name + score
- Click: navigates to `/dashboard/:riskId` (existing detail panel)

## Peak Year Derivation

No new Firestore fields. Peak year derived from existing data:

```
velocityOffset = { Critical: 0, High: 2, Medium: 5, Emerging: 7, Low: 9 }
trendOffset = (score2035 - score2026) > 0 ? 2 : -1
peakYear = clamp(2026 + velocityOffset[velocity] + trendOffset, 2026, 2038)
```

For solutions: use adoption_score_2026/2035 with implementation_stage as the velocity proxy.

## Tech Stack

- **Framer Motion** — drag gestures (desktop), pin animations, hover effects
- Mobile uses native scroll (vertical) — no drag needed
- Timeline axis: SVG line with tick marks
- Pins: absolutely positioned `motion.div` elements
- Responsive breakpoint: `md` (768px)

## Component Structure

```
Dashboard.tsx (swaps RiskOverview for TimelineView when no riskId selected)
  TimelineView.tsx (new — main container, responsive layout switch)
    TimelineAxis.tsx (SVG line + year ticks + labels)
    TimelinePin.tsx (individual pin: stem, node, label, tooltip, click handler)
    TimelineLegend.tsx (small legend: risk vs solution color key)
```

Existing detail views (RiskDetailPanel, SolutionDetailPanel) unchanged.

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `framer-motion` |
| `src/pages/Dashboard.tsx` | Replace `<RiskOverview>` with `<TimelineView>` |
| `src/components/dashboard/TimelineView.tsx` | New — main timeline container |
| `src/components/dashboard/TimelineAxis.tsx` | New — SVG axis + ticks |
| `src/components/dashboard/TimelinePin.tsx` | New — pin component |
| `src/components/dashboard/TimelineLegend.tsx` | New — color legend |
| `src/lib/derivePeakYear.ts` | New — peak year calculation |

RiskOverview.tsx, OverviewHeader.tsx, RiskCard.tsx are no longer imported but kept for reference.
