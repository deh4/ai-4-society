# Frontend Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add principle and harm_status filter facets to the observatory and admin UI, fix carousel consistency, and update admin review tabs to display the new classification dimensions.

**Architecture:** Principles and harm_status are displayed as filter chips and tags throughout the UI. The observatory graph remains unchanged (risks + solutions + milestones only). Carousel is fixed to always show all 3 metric cards with fallback values for missing data.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4, Framer Motion

**Spec:** `docs/superpowers/specs/2026-03-22-pipeline-architecture-v3-design.md` (Sections 3.2, 3.6, 8.6)

**Depends on:** Plan 1 (Data Migration — types and field names), Plan 2 (Agent Pipeline — signals have harm_status/principles)

---

## File Structure

### Files to Modify

| File | Changes |
|------|---------|
| `src/types/signal.ts` | Add `harm_status`, `principles`, anti-recursion fields |
| `src/components/landing/FeaturedStory.tsx` | Fix carousel to always show 3 metric cards |
| `src/components/observatory/DetailPanel.tsx` | Show principles as tags on node detail pages |
| `src/components/observatory/NodeTypeFilter.tsx` | Add principle and harm_status filter facets |
| `src/components/admin/RiskSignalsTab.tsx` | Display harm_status badge and principle tags on signals |
| `src/components/admin/SolutionSignalsTab.tsx` | Same as RiskSignalsTab |
| `src/store/GraphContext.tsx` | Expose principle nodes for filter facet labels |

### Files to Create

| File | Responsibility |
|------|---------------|
| `src/components/shared/PrincipleTag.tsx` | Reusable principle tag component (colored chip with P01-P10 label) |
| `src/components/shared/HarmStatusBadge.tsx` | Reusable incident/hazard badge component |

---

## Task 1: Fix carousel consistency (the original bug)

**Files:**
- Modify: `src/components/landing/FeaturedStory.tsx`

- [ ] **Step 1: Read FeaturedStory.tsx**

Read `src/components/landing/FeaturedStory.tsx` to understand the current conditional rendering of metric cards.

- [ ] **Step 2: Always show all 3 metric cards**

Replace the conditional rendering with always-visible cards that show fallback values:

```tsx
{/* Evidence cards — always show all 3 for consistent layout */}
{parentNode && (
  <div className="flex gap-2 mb-6">
    <div className="flex-1 p-3 bg-red-500/5 rounded-lg border-l-2 border-red-500">
      <div className="text-[8px] text-gray-600 uppercase tracking-wider">
        {parentNode.type === "risk" ? "Risk Score" : "Adoption Score"}
      </div>
      <div className="text-xl font-bold text-red-400 mt-1">
        {Math.round(score)}
      </div>
    </div>
    <div className="flex-1 p-3 bg-blue-500/5 rounded-lg border-l-2 border-blue-500">
      <div className="text-[8px] text-gray-600 uppercase tracking-wider">Velocity</div>
      <div className="text-xl font-bold text-blue-400 mt-1">
        {velocity ?? "—"}
      </div>
    </div>
    <div className="flex-1 p-3 bg-green-500/5 rounded-lg border-l-2 border-green-500">
      <div className="text-[8px] text-gray-600 uppercase tracking-wider">Solutions</div>
      <div className="text-xl font-bold text-green-400 mt-1">{solutionCount}</div>
      <div className="text-[8px] text-gray-600">
        {solutionCount === 0 ? "None yet" : "Being tracked"}
      </div>
    </div>
  </div>
)}
```

Key changes:
- Remove `{velocity && (...)}` conditional — always show velocity card with "—" fallback
- Remove `{solutionCount > 0 && (...)}` conditional — always show solutions card, "None yet" when 0

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: PASS

Run: `npm run dev` and check carousel — all slides should show 3 cards.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/FeaturedStory.tsx
git commit -m "fix: carousel always shows 3 metric cards with fallback values"
```

---

## Task 2: Add Signal type updates for harm_status and principles

**Files:**
- Modify: `src/types/signal.ts`

- [ ] **Step 1: Read signal.ts**

Read `src/types/signal.ts` to see the current Signal interface.

- [ ] **Step 2: Add new fields to Signal interface**

Add:
```typescript
// Classification dimensions (V3)
harm_status: "incident" | "hazard" | null;
principles: string[];  // P01-P10 IDs

// Anti-recursion (V3)
classification_version: number;
last_classified_by: string;
last_classified_at: Timestamp;
discovery_locked: boolean;
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS (these are additive fields, shouldn't break existing code)

- [ ] **Step 4: Commit**

```bash
git add src/types/signal.ts
git commit -m "feat: add harm_status, principles, and anti-recursion fields to Signal type"
```

---

## Task 3: Create reusable PrincipleTag and HarmStatusBadge components

**Files:**
- Create: `src/components/shared/PrincipleTag.tsx`
- Create: `src/components/shared/HarmStatusBadge.tsx`

- [ ] **Step 1: Create PrincipleTag.tsx**

```tsx
const PRINCIPLE_LABELS: Record<string, string> = {
  P01: "Accountability",
  P02: "Fairness",
  P03: "Transparency",
  P04: "Safety",
  P05: "Privacy",
  P06: "Human Oversight",
  P07: "Sustainability",
  P08: "Wellbeing",
  P09: "Democracy",
  P10: "Intl. Cooperation",
};

const PRINCIPLE_COLORS: Record<string, string> = {
  P01: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  P02: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  P03: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  P04: "bg-red-500/10 text-red-400 border-red-500/20",
  P05: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  P06: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  P07: "bg-green-500/10 text-green-400 border-green-500/20",
  P08: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  P09: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  P10: "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

export default function PrincipleTag({ id }: { id: string }) {
  const label = PRINCIPLE_LABELS[id] ?? id;
  const color = PRINCIPLE_COLORS[id] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create HarmStatusBadge.tsx**

```tsx
export default function HarmStatusBadge({ status }: { status: "incident" | "hazard" | null }) {
  if (!status) return null;

  const styles = {
    incident: "bg-red-500/15 text-red-400 border-red-500/30",
    hazard: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };

  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/PrincipleTag.tsx src/components/shared/HarmStatusBadge.tsx
git commit -m "feat: add reusable PrincipleTag and HarmStatusBadge components"
```

---

## Task 4: Add principles and harm_status to admin signal review tabs

**Files:**
- Modify: `src/components/admin/RiskSignalsTab.tsx`
- Modify: `src/components/admin/SolutionSignalsTab.tsx`

- [ ] **Step 1: Read RiskSignalsTab.tsx**

Understand how each signal row is rendered.

- [ ] **Step 2: Add harm_status badge to signal rows**

Import `HarmStatusBadge` and render it next to the signal type badge:

```tsx
import HarmStatusBadge from "../shared/HarmStatusBadge";

// In the signal row, after the signal_type badge:
<HarmStatusBadge status={signal.harm_status} />
```

- [ ] **Step 3: Add principle tags to signal rows**

Import `PrincipleTag` and render principle tags:

```tsx
import PrincipleTag from "../shared/PrincipleTag";

// Below the signal summary:
{signal.principles?.length > 0 && (
  <div className="flex gap-1 mt-1">
    {signal.principles.map(p => <PrincipleTag key={p} id={p} />)}
  </div>
)}
```

- [ ] **Step 4: Apply the same changes to SolutionSignalsTab.tsx**

Mirror the same HarmStatusBadge and PrincipleTag additions.

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/RiskSignalsTab.tsx src/components/admin/SolutionSignalsTab.tsx
git commit -m "feat: show harm_status and principles on admin signal review tabs"
```

---

## Task 5: Add principles display to observatory detail panel

**Files:**
- Modify: `src/components/observatory/DetailPanel.tsx`
- Modify: `src/store/GraphContext.tsx`

- [ ] **Step 1: Read DetailPanel.tsx**

Understand how node details are rendered.

- [ ] **Step 2: Expose principle nodes from GraphContext**

In `src/store/GraphContext.tsx`, add a query/subscription for principle nodes (or derive from `nodes` collection). Expose as `principleNodes` in the context value. These are needed to display principle names on detail pages.

If principle nodes are not in the graph snapshot (they're excluded per spec), query them separately:
```typescript
const principleNodesSnap = await getDocs(
  query(collection(db, "nodes"), where("type", "==", "principle"))
);
```

Cache in context state.

- [ ] **Step 3: Show principles on node detail panel**

In `DetailPanel.tsx`, after the node summary section, add a principles section:

```tsx
{node.principles?.length > 0 && (
  <div className="mt-4">
    <h4 className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
      Related Principles
    </h4>
    <div className="flex flex-wrap gap-1.5">
      {node.principles.map(p => <PrincipleTag key={p} id={p} />)}
    </div>
  </div>
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/observatory/DetailPanel.tsx src/store/GraphContext.tsx
git commit -m "feat: show principle tags on observatory node detail panel"
```

---

## Task 6: Add filter facets to observatory

**Files:**
- Modify: `src/components/observatory/NodeTypeFilter.tsx`

- [ ] **Step 1: Read NodeTypeFilter.tsx**

Understand the current filter toggle UI.

- [ ] **Step 2: Add principle filter facet**

Add a collapsible "Principles" section below the node type toggles. Each principle is a toggle chip that filters the graph to show only nodes with that principle in their `principles` array:

```tsx
<div className="mt-3 pt-3 border-t border-white/5">
  <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
    Filter by Principle
  </div>
  <div className="flex flex-wrap gap-1">
    {principleNodes.map(p => (
      <button
        key={p.id}
        onClick={() => togglePrincipleFilter(p.id)}
        className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
          activePrinciples.includes(p.id)
            ? PRINCIPLE_COLORS[p.id]
            : "border-white/10 text-gray-600"
        }`}
      >
        {p.name}
      </button>
    ))}
  </div>
</div>
```

The filtering logic should be in GraphContext or a local state that filters the `snapshot.nodes` array before rendering.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/observatory/NodeTypeFilter.tsx
git commit -m "feat: add principle filter facets to observatory"
```

---

## Task 7: Visual verification and polish

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify carousel**

Navigate to landing page. Check:
- Every carousel slide shows 3 metric cards (Risk Score, Velocity, Solutions)
- Slides with no velocity show "—"
- Slides with 0 solutions show "None yet"
- Layout is consistent across all slides

- [ ] **Step 3: Verify admin tabs**

Navigate to admin panel. Check:
- Risk Signals tab shows harm_status badges (incident/hazard) on signals that have them
- Principle tags appear below signal summaries
- Solution Signals tab has the same enhancements

- [ ] **Step 4: Verify observatory detail panel**

Click on a risk/solution node in the observatory. Check:
- Principles section appears if the node has principles assigned
- Principle tags are colored and readable

- [ ] **Step 5: Verify principle filters**

In the observatory, check:
- Principle filter chips appear below node type toggles
- Clicking a principle filters the graph to show only nodes with that principle
- Multiple principles can be toggled (OR logic)

- [ ] **Step 6: Build production bundle**

Run: `npm run build`
Expected: PASS — no warnings or errors

- [ ] **Step 7: Commit and push**

```bash
git add -A src/
git commit -m "feat: V3 frontend updates — carousel fix, principles, harm_status"
git push origin main
```
