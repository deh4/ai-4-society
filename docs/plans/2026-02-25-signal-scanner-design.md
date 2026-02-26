# Signal Scanner — Timeline + CRT Screen Redesign

## Overview

Replace the current tall pin-based timeline with a **radio tuner metaphor**: a compact frequency strip for navigation + a CRT-styled monitor screen that shows static when scanning and displays signal content when locked onto a risk or solution.

## Layout

### Desktop (md+)
- **FrequencyStrip** (~80px): Compact horizontal draggable dial with tick marks. Risks above axis, solutions below. Magnetic snap when near a tick.
- **CRTScreen** (fills remaining viewport): SVG-framed green monochrome monitor. Shows static when idle, card content when locked.

### Mobile (<md)
- **Stacked Vertical**: Same layout — horizontal swipe strip at top, CRT screen below. Same mental model, no gesture conflicts.

## Component Architecture

| Component | Replaces | Purpose |
|---|---|---|
| `FrequencyStrip` | `TimelineView` top half + `TimelinePin` | Compact horizontal dial with tick marks |
| `CRTScreen` | New | SVG-framed monitor showing static or signal card |
| `SignalCard` | Adapts from `RiskCard` fields | Card content rendered inside CRT with green monochrome styling |
| `CRTBezel` | New | SVG frame (rounded rect + shadow + scanlines overlay) |

`TimelineView` is rewritten to compose `FrequencyStrip` + `CRTScreen`. `TimelinePin` is removed.

## Interaction Model

### FrequencyStrip
- Horizontal drag (desktop) / swipe (mobile) to navigate years
- Tick marks: small vertical lines labeled with ID (R01, S03)
- Risk ticks above axis (red), solution ticks below (emerald)
- Ticks outside +/-5 years from center fade to 8% opacity
- **Magnetic snap**: When drag velocity drops and center is within ~30px of a tick, spring-animate to center on that tick
- **Click/tap**: Tapping a tick snaps to it immediately
- Active tick: glow ring + enlarged size

### CRT Screen States

| State | Trigger | Display |
|---|---|---|
| `idle` | No signal near center | Animated static grain + "SCANNING..." text |
| `approaching` | Center within ~1 year of tick | Static begins to clear |
| `locked` | Snapped to a tick | Full signal card, clean display |
| `transitioning` | Moving between signals | Brief static burst, then new card |

### Multi-Pin Cycling
- When locked to a year with multiple items: dot indicators at bottom of CRT
- Small arrows or swipe within CRT to cycle between items at same frequency
- FrequencyStrip highlights which specific tick is active

### Navigation
- "Tune In" button visible only in `locked` state
- Navigates to `/dashboard/:riskId` for full `RiskDetailPanel` detail view

## Visual Design

### CRT Bezel (SVG)
- Rounded rectangle, `stroke: #1a3a2a`, border-radius ~16px
- Inner shadow: `inset 0 0 30px rgba(0,255,65,0.05)`
- Outer glow: `0 0 20px rgba(0,255,65,0.03)`
- Scalable SVG — works on mobile and desktop

### Scanline Overlay
- CSS pseudo-element, `repeating-linear-gradient`
- `rgba(0,0,0,0.03)` horizontal lines every 3px
- `pointer-events-none` overlay

### CRT Color Palette
- Background: `#0a1a0f` (dark green-black)
- Primary text: `#00ff41` (terminal green)
- Secondary text: `#00cc33` (dimmer green)
- Muted: `#1a5a2a`
- Risk accent: `#ff4444` (red for warnings)
- Scores: `#00ff41` monospace, larger font

### Static/Noise
- CSS animated grain pattern via repeating gradients
- `idle` = 40% opacity, `approaching` = fading, `locked` = 0%

### Typography (inside CRT)
- All monospace (`font-mono`)
- Signal ID: `text-lg font-bold tracking-widest`
- Title: `text-base`
- Score: `text-2xl font-bold`
- Summary: `text-sm`
- Labels: uppercase (CATEGORY, VELOCITY, SCORE)

### FrequencyStrip Styling
- Axis: thin `white/10` line
- Tick marks: 12px tall, 2px wide
- Active tick: 18px tall, glow ring
- Year labels: `text-[9px] font-mono` below axis
- Center indicator: cyan hairline

## Data Flow

All local state in `TimelineView` — no new stores:

```
FrequencyStrip (drag/click)
    |
    v
snapTarget: TimelineItem | null
screenState: 'idle' | 'approaching' | 'locked' | 'transitioning'
activeIndex: number  (for cycling within year group)
    |
    v
CRTScreen receives snapTarget + screenState
```

### Snap Logic
1. `onDrag` -> compute center px -> find nearest tick
2. If distance < SNAP_THRESHOLD_PX (30px) and velocity low -> snap, set `locked`
3. Moving away -> `idle`, clear target

### Props Interface (unchanged)
`TimelineView` still receives `{ risks, solutions, loading, error, onSelectRisk }` from `Dashboard.tsx`. No changes to parent components.

## Files Modified/Created

- **Rewrite**: `src/components/dashboard/TimelineView.tsx`
- **Create**: `src/components/dashboard/FrequencyStrip.tsx`
- **Create**: `src/components/dashboard/CRTScreen.tsx`
- **Create**: `src/components/dashboard/CRTBezel.tsx`
- **Create**: `src/components/dashboard/SignalCard.tsx`
- **Delete**: `src/components/dashboard/TimelinePin.tsx` (replaced by inline ticks)
- **Keep**: `src/components/dashboard/TimelineLegend.tsx` (update styling)
- **Keep**: `src/lib/derivePeakYear.ts` (unchanged)
