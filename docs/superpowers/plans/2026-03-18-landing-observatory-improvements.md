# Landing & Observatory Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the landing page (reels above the fold, auto-rotating feed, richer drawer, sharper slogan) and improve the Observatory (zoom, auto-select, layout).

**Architecture:** All changes are purely frontend. No new routes are added for Release Notes — it lives as a section inside the About page to avoid a dead-end page. The BadgeDrawer gains an async description fetch via the existing `graphClient.getNode()`. Observatory gets auto-selection on first load via a one-time `useEffect` in Observatory.tsx. The feed carousel is a timer-driven state offset with no dependencies.

**Tech Stack:** React 19, TypeScript, Framer Motion, Tailwind 3.4, react-force-graph-2d, Firebase/Firestore (read-only via existing graphClient.getNode).

---

## File Map

| File | Change |
|---|---|
| `src/pages/HeroPage.tsx` | Move RiskReels above hero section; update slogan copy |
| `src/components/landing/RiskBadges.tsx` | Full-width desktop layout (no max-w cap from parent) |
| `src/components/landing/BadgeDrawer.tsx` | Fetch & show node description (async, loading state) |
| `src/components/landing/NewsFeed.tsx` | Show 5 items, auto-rotate every 5s |
| `src/pages/Observatory.tsx` | Auto-select first risk node on load |
| `src/components/observatory/GraphView.tsx` | Increase default zoom to 2.5 |
| `src/pages/About.tsx` | Add "Release Notes" section at bottom |

---

## Task 1: Move Risk Reels below nav + full-width desktop

**Files:**
- Modify: `src/pages/HeroPage.tsx`

The ribbon must sit between the sticky nav and the hero section — outside the `min-h-screen` centered div. On desktop it should span the full container; on mobile it scrolls horizontally as before.

- [ ] **Step 1: Read current HeroPage structure**

```
The RiskReels is currently inside:
  <div class="relative z-10 flex flex-col items-center justify-center min-h-screen ...">
    ...CTAs...
    <div class="w-full max-w-2xl">
      <RiskReels />
    </div>
  </div>
```

- [ ] **Step 2: Restructure HeroPage — move reels above hero**

In `src/pages/HeroPage.tsx`, replace the entire content of the `<Layout>` inner div with:

```tsx
<Layout>
  <div className="relative w-full overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
    {/* 3D Background — full viewport height */}
    <div className="absolute inset-0 z-0 opacity-60 h-screen pointer-events-none">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <Suspense fallback={null}>
          <Globe />
        </Suspense>
      </Canvas>
    </div>

    {/* Risk Reels — directly below nav, above hero content */}
    <div className="relative z-10 w-full border-b border-white/5 bg-[var(--bg-primary)]/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <RiskReels />
      </div>
    </div>

    {/* Hero Section */}
    <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem-5rem)] text-center px-4 py-16">
      {/* Hero statement */}
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-structural)] mb-4 font-medium">
        AI Observatory
      </p>
      <h1
        className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Humanity's window <br />
        into AI's trajectory
      </h1>

      <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-xl font-light">
        40+ tracked risks and solutions, reviewed by humans. Watch how AI is
        reshaping society — in real time.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setShowDisclaimer(true)}
          className="px-7 py-3.5 text-sm font-semibold tracking-wider uppercase border-2 border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.25)] rounded"
        >
          Enter Observatory
        </button>
        <button
          onClick={() => navigate("/about")}
          className="px-7 py-3.5 text-sm font-semibold tracking-wider uppercase border-2 border-white/20 text-gray-300 hover:bg-white/10 transition-all duration-300 rounded"
        >
          Learn More
        </button>
      </div>
    </div>

    {/* Below the fold: Signal Feed */}
    <div className="relative z-10 max-w-3xl mx-auto px-4 pb-12 space-y-8">
      <NewsFeed />
      <PreferencePicker />
    </div>
  </div>

  {showDisclaimer && (
    <PrivacyModal
      onClose={() => setShowDisclaimer(false)}
      onConfirm={handleEnter}
    />
  )}
</Layout>
```

Note: `min-h-[calc(100vh-3.5rem-5rem)]` accounts for the 56px nav (`h-14`) + approx 80px reels strip, so the hero still fills most of the viewport.

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```
Expected: no TypeScript/ESLint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/HeroPage.tsx
git commit -m "feat(landing): move risk reels above hero, update slogan copy"
```

---

## Task 2: Full-width RiskReels on desktop (no max-w constraint)

**Files:**
- Modify: `src/components/landing/RiskBadges.tsx`

The container that calls `<RiskReels />` is now `max-w-7xl` so the strip gets wide on large screens. On desktop the badges should spread out (flex with gap) and not scroll unless there are too many. On mobile it stays horizontally scrollable.

- [ ] **Step 1: Update the reel strip in RiskBadges.tsx**

Change the overflow div to wrap on desktop. Don't use `sm:overflow-x-visible` — when `overflow-x` is `visible` but `overflow-y` is not, browsers silently upgrade both to `auto`. Just add `sm:flex-wrap` and keep `overflow-x-auto` as-is (on desktop the content wraps before scrolling):

```tsx
{/* Horizontally scrollable reel strip — scrolls on mobile, wraps on desktop */}
<div className="flex items-start gap-4 overflow-x-auto sm:flex-wrap pb-2 scrollbar-hide">
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/RiskBadges.tsx
git commit -m "feat(landing): allow risk reels to wrap on desktop"
```

---

## Task 3: BadgeDrawer — show 1-liner node description

**Files:**
- Modify: `src/components/landing/BadgeDrawer.tsx`

`NodeSummary` has no `description` field. We must call `graphClient.getNode(id)` (which hits Firestore) and read `node.summary` (a short narrative paragraph stored on each graph node). Show a skeleton while loading.

- [ ] **Step 1: Check the GraphNode type and graphClient**

The data client lives at `src/data/graph.ts`. `GraphNode` has a `summary` (or `description`) field — verify:

```bash
grep -n "summary\|description" /Users/dehakuran/Projects/ai-4-society/src/types/graph.ts | head -20
```

- [ ] **Step 2: Update BadgeDrawer to fetch and show description**

**Import note:** `graphClient` is re-exported from the barrel at `src/data/index.ts`. Import from `../../data` (not `../../data/graph`) to match the pattern used everywhere else in the codebase.

**Type note:** `GraphNode` is a union of `RiskNode | SolutionNode | StakeholderNode | MilestoneNode`. `RiskNode` and `SolutionNode` have `summary: string`; `StakeholderNode` and `MilestoneNode` have `description: string`. Accessing `node.summary` directly on the union will fail TypeScript compilation. Since `RiskReels` only ever passes risk nodes (filtered in `selectTrendingRisks`), use a `"summary" in node` narrowing check:

```tsx
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { NodeSummary, GraphNode } from "../../types/graph";
import { graphClient } from "../../data";

interface BadgeDrawerProps {
  summary: NodeSummary;
  onClose: () => void;
}

const VELOCITY_ICONS: Record<string, string> = {
  Critical: "🔥",
  High: "↑",
  Medium: "→",
  Low: "↓",
};

export default function BadgeDrawer({ summary, onClose }: BadgeDrawerProps) {
  const navigate = useNavigate();
  const [node, setNode] = useState<GraphNode | null>(null);
  const [loadingNode, setLoadingNode] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingNode(true);
    setNode(null);
    graphClient.getNode(summary.node_id).then((n) => {
      if (!cancelled) {
        setNode(n);
        setLoadingNode(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingNode(false);
    });
    return () => { cancelled = true; };
  }, [summary.node_id]);

  // GraphNode is a union — RiskNode/SolutionNode have `summary`, Stakeholder/Milestone have `description`.
  // Risk reels only show risk nodes, so `summary` will be present, but we narrow for TS safety.
  const rawDescription =
    node && "summary" in node && typeof (node as { summary?: string }).summary === "string"
      ? (node as { summary: string }).summary
      : null;
  const description = rawDescription
    ? rawDescription.length > 120 ? rawDescription.slice(0, 118) + "…" : rawDescription
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 mt-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold">{summary.name}</h3>
            {summary.velocity && (
              <span className="text-xs text-gray-400">
                {VELOCITY_ICONS[summary.velocity] ?? ""} {summary.velocity}{" "}
                velocity
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <div className="mb-3 min-h-[2.5rem]">
          {loadingNode ? (
            <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : description ? (
            <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span>
            {summary.signal_count_7d} signal
            {summary.signal_count_7d !== 1 ? "s" : ""} this week
          </span>
          <span
            className={
              summary.trending === "rising"
                ? "text-red-400"
                : summary.trending === "declining"
                  ? "text-green-400"
                  : "text-gray-500"
            }
          >
            {summary.trending === "rising"
              ? "↑ Rising"
              : summary.trending === "declining"
                ? "↓ Declining"
                : "— Stable"}
          </span>
        </div>

        <button
          onClick={() => navigate(`/observatory/${summary.node_id}`)}
          className="text-xs font-medium text-[var(--accent-structural)] hover:underline"
        >
          Explore in Observatory →
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Verify graphClient export**

Check that `graphClient` is exported from `src/data/graph.ts`:

```bash
grep -n "export" /Users/dehakuran/Projects/ai-4-society/src/data/graph.ts | head -10
```

If it exports a class instance differently (e.g. `export const graphClient = new GraphClient()`), adjust the import accordingly.

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/BadgeDrawer.tsx
git commit -m "feat(landing): show node description in badge drawer"
```

---

## Task 4: News Feed — show 5 items, auto-rotate

**Files:**
- Modify: `src/components/landing/NewsFeed.tsx`

Show the top 5 items. Every 5 seconds, advance `offset` by 1 (wrapping around) to cycle through the full ranked list. Items animate in/out with Framer Motion.

- [ ] **Step 1: Rewrite NewsFeed.tsx with rotation logic**

```tsx
import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import FeedCard from "./FeedCard";
import type { FeedItem } from "../../types/graph";

const VISIBLE_COUNT = 5;
const ROTATE_INTERVAL_MS = 5000;

function rankFeedItems(items: FeedItem[], interests: string[]): FeedItem[] {
  const signals = items.filter((item) => item.type === "signal");
  if (interests.length === 0) return signals;
  const interestSet = new Set(interests);
  const BOOST = 1.5;
  return [...signals].sort((a, b) => {
    const aMatch = a.related_node_ids.some((id) => interestSet.has(id));
    const bMatch = b.related_node_ids.some((id) => interestSet.has(id));
    const aScore = a.impact_score * (aMatch ? BOOST : 1);
    const bScore = b.impact_score * (bMatch ? BOOST : 1);
    return bScore - aScore;
  });
}

export default function NewsFeed() {
  const { feedItems, loading } = useGraph();
  const [interests] = useState(() => getLocalPreferences().interests);
  const [offset, setOffset] = useState(0);

  const ranked = useMemo(
    () => rankFeedItems(feedItems, interests),
    [feedItems, interests]
  );

  // Auto-rotate only when there are more items than the visible window
  useEffect(() => {
    if (ranked.length <= VISIBLE_COUNT) return;
    const id = setInterval(() => {
      setOffset((prev) => (prev + 1) % ranked.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ranked.length]);

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs">
        Loading feed...
      </div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs">
        No approved signals yet. Check back soon.
      </div>
    );
  }

  // Circular slice of VISIBLE_COUNT items starting at offset
  const visible = Array.from({ length: Math.min(VISIBLE_COUNT, ranked.length) }, (_, i) => {
    return ranked[(offset + i) % ranked.length]!;
  });

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
        Latest Intelligence
      </h2>
      <div className="space-y-2 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {visible.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35 }}
            >
              <FeedCard item={item} index={i} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/NewsFeed.tsx
git commit -m "feat(landing): show 5 feed items with auto-rotation every 5s"
```

---

## Task 5: Observatory — increase default zoom + auto-select first risk

**Files:**
- Modify: `src/components/observatory/GraphView.tsx`
- Modify: `src/pages/Observatory.tsx`

Two sub-changes:
1. In `GraphView.tsx`, bump the `onEngineStop` zoom from `1.5` to `2.5`.
2. In `Observatory.tsx`, after the graph snapshot loads, if no node is URL-selected, auto-select the first risk node (highest-priority by whatever order the snapshot returns).

- [ ] **Step 1: Bump default zoom in GraphView.tsx**

Find:
```tsx
onEngineStop={() => {
  if (fgRef.current) {
    fgRef.current.zoom(1.5, 400);
  }
}}
```

Replace with:
```tsx
onEngineStop={() => {
  if (fgRef.current) {
    fgRef.current.zoom(2.5, 400);
  }
}}
```

- [ ] **Step 2: Auto-select first risk node in Observatory.tsx**

Add a `useRef` flag so the auto-select fires exactly once regardless of how many times the snapshot reference changes (e.g. Firestore listener re-firing). This avoids the need to suppress the linter and prevents re-triggering if a user navigates away and the snapshot updates again.

Add the import for `useRef` to the existing imports line, then add the ref and effect after the URL-sync effect:

```tsx
const autoSelectedRef = useRef(false);

// Auto-select the first risk node on initial load (no URL node)
useEffect(() => {
  if (autoSelectedRef.current || !snapshot || selectedNodeId || urlNodeId) return;
  const firstRisk = snapshot.nodes.find((n) => n.type === "risk");
  if (firstRisk) {
    autoSelectedRef.current = true;
    setSelectedNodeId(firstRisk.id);
    navigate(`/observatory/${firstRisk.id}`, { replace: true });
  }
}, [snapshot, selectedNodeId, urlNodeId, navigate]);
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/observatory/GraphView.tsx src/pages/Observatory.tsx
git commit -m "feat(observatory): increase default zoom to 2.5, auto-select first risk on load"
```

---

## Task 6: Observatory desktop layout — rebalance graph vs detail panel

**Files:**
- Modify: `src/pages/Observatory.tsx`

Currently the DetailPanel is an overlay (positioned fixed/absolute). On desktop, we can show the graph + panel side-by-side in a two-column layout: graph takes ~60%, panel takes ~40%. On mobile keep the bottom sheet behaviour unchanged.

- [ ] **Step 1: Read DetailPanel to understand its current positioning**

```bash
grep -n "fixed\|absolute\|bottom\|right\|w-full\|max-w" /Users/dehakuran/Projects/ai-4-society/src/components/observatory/DetailPanel.tsx | head -30
```

- [ ] **Step 2: Restructure Observatory.tsx for side-by-side on desktop**

Replace the current layout structure with a responsive two-column grid that activates on `lg` breakpoint:

```tsx
return (
  <Layout>
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold">Observatory</h1>
          {snapshot && (
            <p className="text-xs text-gray-500">
              {snapshot.nodeCount} nodes · {snapshot.edgeCount} edges
            </p>
          )}
        </div>
        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {(["graph", "timeline"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-4 py-1.5 rounded transition-all ${
                activeTab === tab
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {tab === "graph" ? "Graph" : "Timeline"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-96">
          <span className="text-gray-500 text-xs animate-pulse">
            Loading observatory...
          </span>
        </div>
      )}

      {!loading && activeTab === "graph" && (
        <div className={`flex gap-4 ${selectedNodeId ? "lg:grid lg:grid-cols-[3fr_2fr]" : ""}`}>
          <div className="min-w-0">
            <GraphView
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
            />
          </div>

          {/* Desktop inline panel — lg+ only */}
          <AnimatePresence>
            {selectedNodeId && (
              <div className="hidden lg:block min-w-0">
                <DetailPanel
                  key={`inline-${selectedNodeId}`}
                  nodeId={selectedNodeId}
                  onClose={() => handleSelectNode(null)}
                  onNavigate={handleNavigateNode}
                  inline
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!loading && activeTab === "timeline" && (
        <ObservatoryTimeline onSelectNode={handleNavigateNode} />
      )}
    </div>

    {/* Mobile/tablet overlay panel — hidden on lg */}
    <AnimatePresence>
      {selectedNodeId && (
        <div className="lg:hidden">
          <DetailPanel
            key={`overlay-${selectedNodeId}`}
            nodeId={selectedNodeId}
            onClose={() => handleSelectNode(null)}
            onNavigate={handleNavigateNode}
          />
        </div>
      )}
    </AnimatePresence>
  </Layout>
);
```

- [ ] **Step 3: Add `inline` prop support to DetailPanel**

**Important ordering note:** The mobile overlay `DetailPanel` is wrapped in `<div className="lg:hidden">` in the JSX above. However, `DetailPanel` uses `position: fixed` internally — a `fixed` element ignores its DOM parent and is positioned relative to the viewport, so `lg:hidden` alone won't hide it on desktop. The `lg:hidden` wrapper only works correctly once the `inline` prop causes the desktop `DetailPanel` to NOT use `position: fixed`. Both changes (inline panel + lg:hidden overlay) must be applied together before testing.

Read `src/components/observatory/DetailPanel.tsx` first, then add an optional `inline?: boolean` prop. When `inline` is true, the panel renders as a normal flow element (not fixed/bottom-sheet) with `overflow-y-auto h-[calc(100vh-220px)]` so it matches the graph height.

Check the current positioning in DetailPanel:
```bash
grep -n "fixed\|motion\|className\|style" /Users/dehakuran/Projects/ai-4-society/src/components/observatory/DetailPanel.tsx | head -40
```

Add `inline` prop to the interface and switch rendering:
```tsx
interface DetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  inline?: boolean;  // NEW: render as flow element on desktop
}
```

When `inline` is true, wrap content in a `div` with `overflow-y-auto rounded-lg border border-white/10 bg-[var(--bg-primary)] h-[calc(100vh-220px)]` instead of the bottom-sheet/fixed overlay motion div. The inner content stays identical.

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Observatory.tsx src/components/observatory/DetailPanel.tsx
git commit -m "feat(observatory): side-by-side graph+panel layout on desktop (lg+)"
```

---

## Task 7: Release Notes section in About page

**Files:**
- Modify: `src/pages/About.tsx`

Populate a static "Release Notes" section from the git log history above. Group commits into logical versions. No new page needed — add it as the final section in About, reachable from the footer.

**Logical version mapping (from git history):**

| Version | Date | Theme | Key commits |
|---|---|---|---|
| v0.1 | 2026-01 | Foundation | Initial v2 scaffold, routing, auth, graph types |
| v0.2 | 2026-02 | Core Pipeline | Signal Scout, Discovery, Validator, Feed Curator agents |
| v0.3 | 2026-02 | Observatory | GraphView, DetailPanel, Timeline, voting |
| v0.4 | 2026-02 | Landing | RiskBadges, NewsFeed, FeedCard, PreferencePicker |
| v0.5 | 2026-03 | Admin Panel | Agent dashboard, source config, review UI |
| v0.6 | 2026-03 | Polish | Node labels, mobile bottom sheet, source fixes, readme |

- [ ] **Step 1: Read current About.tsx**

```bash
cat /Users/dehakuran/Projects/ai-4-society/src/pages/About.tsx | head -10
```

- [ ] **Step 2: Add RELEASE_NOTES constant and section**

Add before the component:

```tsx
const RELEASE_NOTES = [
  {
    version: "v0.6",
    date: "March 2026",
    title: "Polish & Observability",
    changes: [
      "Node labels on all graph nodes (risk, solution, milestone, stakeholder)",
      "Mobile bottom sheet for Observatory detail panel",
      "7 new signal sources added (Alignment Forum, CAIS, Nature Machine Intelligence, IEEE Spectrum, The Guardian AI, AI Now, Ben's Bites)",
      "Admin source config grouped by tier with toggle fixes",
      "Feed Curator and Data Lifecycle run summaries now visible in admin",
      "README and design spec updated to reflect v2 state",
    ],
  },
  {
    version: "v0.5",
    date: "February–March 2026",
    title: "Admin Panel",
    changes: [
      "Agent dashboard with health cards, run history charts, and manual triggers",
      "Source config table with per-source enable/disable toggles",
      "Unified review list with bulk approve/reject",
      "User management for role assignment",
      "Paused-state checks for all scheduled agents",
    ],
  },
  {
    version: "v0.4",
    date: "February 2026",
    title: "Landing Page",
    changes: [
      "Instagram-style Risk Reels with gradient velocity rings",
      "Personalised news feed with recency-decay scoring",
      "Preference picker with interest tracking",
      "Hamburger nav for mobile",
    ],
  },
  {
    version: "v0.3",
    date: "February 2026",
    title: "Observatory",
    changes: [
      "Interactive force-directed graph (react-force-graph-2d)",
      "Node type filter (risk, solution, stakeholder, milestone)",
      "Detail panel with narrative, voting, evidence list, and connections",
      "Chronological timeline view",
      "Deep-link routing: /observatory/:nodeId",
    ],
  },
  {
    version: "v0.2",
    date: "January–February 2026",
    title: "Agent Pipeline",
    changes: [
      "Signal Scout: 17 RSS/API sources + Gemini 2.5 Flash classification",
      "Discovery Agent: clusters unmatched signals into new node proposals",
      "Validator Agent: proposes score and field updates for existing nodes",
      "Feed Curator: rebuilds ranked feed_items every 6 hours",
      "Data Lifecycle: archives and purges stale data daily",
      "Graph Builder: rebuilds graph_snapshot and node summaries on demand",
    ],
  },
  {
    version: "v0.1",
    date: "January 2026",
    title: "Foundation",
    changes: [
      "React 19 + Vite 7 + TypeScript + Tailwind 3.4 + Firebase",
      "Firebase Auth with Google OAuth and role-based access control",
      "Firestore graph model: nodes, edges, signals, graph_snapshot, feed_items",
      "GraphContext with real-time Firestore listeners",
      "Human-in-the-loop review gates (Gate 1: Signal Review, Gate 2: Proposal Review)",
    ],
  },
];
```

Add the section JSX at the bottom of the About page's content using the existing `Section` component (which renders a `motion.section` matching the page's animation pattern). Add `id="release-notes"` so the footer anchor link works:

```tsx
<Section id="release-notes" title="Release Notes">
  <p className="text-sm text-gray-400 mb-6">
    A record of what's been built and shipped.
  </p>
  <div className="space-y-6">
    {RELEASE_NOTES.map((release) => (
      <div key={release.version} className="flex gap-4">
        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-[var(--accent-structural)] bg-[var(--accent-structural)]/10 px-2 py-0.5 rounded whitespace-nowrap">
            {release.version}
          </span>
          <div className="flex-1 w-px bg-white/10 mt-2" />
        </div>
        <div className="pb-6 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold">{release.title}</span>
            <span className="text-xs text-gray-500">{release.date}</span>
          </div>
          <ul className="space-y-1">
            {release.changes.map((change, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-2">
                <span className="text-gray-600 mt-0.5 shrink-0">–</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    ))}
  </div>
</Section>
```

- [ ] **Step 3: Add "Release Notes" link to footer in Layout.tsx**

In `src/components/shared/Layout.tsx`, add a link to `/about#release-notes` in the footer links div:

```tsx
<Link to="/about" className="hover:text-white transition-colors">Release Notes</Link>
```

Add `id="release-notes"` to the release notes section wrapper in About.tsx so the anchor link works:

```tsx
<section id="release-notes" className="space-y-6">
```

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/About.tsx src/components/shared/Layout.tsx
git commit -m "feat(about): add release notes section with version history"
```

---

## Final: Push and deploy

- [ ] **Step 1: Push feature branch**

```bash
git push origin feat/v2-foundation
```

- [ ] **Step 2: Open PR to main**

```bash
gh pr create --title "feat: landing & observatory improvements" --body "$(cat <<'EOF'
## Summary
- Risk Reels ribbon moved above hero, directly below nav (full-width desktop, scrollable mobile)
- Updated slogan: "AI Observatory / Humanity's window into AI's trajectory"
- BadgeDrawer shows 1-liner node description (async fetch from Firestore)
- News feed shows 5 items and auto-rotates every 5s
- Observatory: default zoom 2.5, auto-selects first risk node on load
- Observatory desktop: side-by-side graph (60%) + detail panel (40%) on lg+
- About page gains Release Notes section with v0.1–v0.6 history

## Test plan
- [ ] Landing: reels visible just below nav on desktop and mobile
- [ ] Landing: clicking a reel shows description (skeleton while loading)
- [ ] Landing: feed rotates through items every 5s
- [ ] Observatory: loads with a node pre-selected and panel open
- [ ] Observatory: desktop shows two-column layout; mobile shows bottom sheet
- [ ] About: Release Notes section renders at /about#release-notes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

CI will deploy to hosting automatically on merge to `main`.
