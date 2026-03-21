# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current landing page with a story-first design that maximizes emotional engagement and viral shareability — real signal headlines with editorial hooks, a compact risk radar, and a mini spinning globe nav logo.

**Architecture:** New `editorial_hooks` Firestore collection (keyed by signal doc ID) survives feed_items rebuild cycles. Feed Curator generates hooks; reviewers approve via a new admin tab. Landing page assembles stories client-side by joining editorial_hooks with graph_snapshot. Globe shrinks from fullscreen Three.js to a 28px nav logo.

**Tech Stack:** React 19, TypeScript, Vite, Firebase/Firestore, Three.js (miniaturized), Framer Motion, Tailwind 3.4, Gemini 2.5 Flash (editorial generation)

**Spec:** `docs/superpowers/specs/2026-03-21-landing-page-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/types/editorial.ts` | `EditorialHook` interface |
| `src/data/editorial.ts` | Firestore read/write helpers for editorial_hooks collection |
| `src/components/shared/MiniGlobe.tsx` | 28px Three.js globe logo — sphere, blips, rotation. Lazy-loaded with SVG fallback. |
| `src/components/shared/DisclaimerBanner.tsx` | First-visit dismissible banner, localStorage persistence |
| `src/components/landing/FeaturedStory.tsx` | Swipeable story cards — headline, editorial hook, evidence cards, share strip |
| `src/components/landing/ShareStrip.tsx` | Twitter/X, LinkedIn, copy-link buttons |
| `src/components/landing/TheRadar.tsx` | Ranked risk/solution list with score circles and velocity |
| `src/components/landing/TrustFooter.tsx` | Source count, methodology, cadence |
| `src/components/admin/EditorialReviewTab.tsx` | Admin tab for reviewing pending editorial hooks |
| `src/scripts/seed-editorial-hooks.ts` | One-time seed script for initial editorial content |

### Modified Files
| File | Change |
|------|--------|
| `src/pages/HeroPage.tsx` | Full rewrite — FeaturedStory + TheRadar + TrustFooter |
| `src/components/shared/Layout.tsx` | Add MiniGlobe to nav, add DisclaimerBanner |
| `src/pages/Admin.tsx` | Add `"editorial"` section to AdminSection type, SECTION_CONFIG, ROLE_TAB_ACCESS |
| `src/lib/roles.ts` | Add `'editorial'` to ROLE_TAB_ACCESS |
| `src/store/GraphContext.tsx` | Add real-time subscription for `editorial_hooks` |
| `src/types/graph.ts` | No changes needed (editorial has own type file) |
| `functions/src/agents/feed-curator/index.ts` | After writing feed items, generate editorial hooks for top 5 |
| `firestore.rules` | Add rules for `editorial_hooks` collection |

### Removed Files
| File | Reason |
|------|--------|
| `src/components/landing/RiskBadges.tsx` | Replaced by FeaturedStory |
| `src/components/landing/BadgeDrawer.tsx` | No longer needed |
| `src/components/landing/NewsFeed.tsx` | Replaced by TheRadar |
| `src/components/landing/FeedCard.tsx` | No longer used |

---

## Task 1: Editorial Hooks Type & Data Layer

**Files:**
- Create: `src/types/editorial.ts`
- Create: `src/data/editorial.ts`

- [ ] **Step 1: Create EditorialHook interface**

```typescript
// src/types/editorial.ts
import type { Timestamp } from "firebase/firestore";

export interface EditorialHook {
  id: string;
  signal_id: string;
  signal_title: string;
  hook_text: string;
  status: "pending" | "approved" | "rejected";
  related_node_ids: string[];
  impact_score: number;
  source_name: string;
  source_credibility: number;
  published_date: string;
  generated_at: Timestamp | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
}
```

- [ ] **Step 2: Create Firestore data helpers**

```typescript
// src/data/editorial.ts
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { EditorialHook } from "../types/editorial";

export function subscribeEditorialHooks(
  status: "pending" | "approved" | "rejected" | "all",
  callback: (hooks: EditorialHook[]) => void,
) {
  const constraints = [orderBy("impact_score", "desc")];
  if (status !== "all") {
    constraints.unshift(where("status", "==", status));
  }
  const q = query(collection(db, "editorial_hooks"), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EditorialHook)));
  });
}

export async function updateEditorialStatus(
  hookId: string,
  status: "approved" | "rejected",
  reviewerUid: string,
  hookText?: string,
) {
  const updates: Record<string, unknown> = {
    status,
    reviewed_by: reviewerUid,
    reviewed_at: serverTimestamp(),
  };
  if (hookText !== undefined) updates.hook_text = hookText;
  await updateDoc(doc(db, "editorial_hooks", hookId), updates);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/editorial.ts src/data/editorial.ts
git commit -m "feat(editorial): add EditorialHook type and Firestore data helpers"
```

---

## Task 2: Firestore Rules for editorial_hooks

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add editorial_hooks rules**

Add after the existing `feed_items` rule block (around line 223):

```
match /editorial_hooks/{hookId} {
  allow read: if true;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.hasAny(['editor', 'lead']);
}
```

- [ ] **Step 2: Validate rules**

Run: `firebase emulators:start --only firestore` and verify no rule syntax errors in logs.

- [ ] **Step 3: Deploy rules**

Run: `firebase deploy --only firestore:rules`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): add editorial_hooks collection with editor/lead write access"
```

---

## Task 3: GraphContext — Subscribe to Editorial Hooks

**Files:**
- Modify: `src/store/GraphContext.tsx`

- [ ] **Step 1: Add editorial hooks state and subscription**

The existing GraphContext uses separate `useEffect` hooks for each subscription. Follow the same pattern:

```typescript
// Add imports at top of file
import { subscribeEditorialHooks } from "../data/editorial";
import type { EditorialHook } from "../types/editorial";

// Add state alongside existing feedItems state
const [editorialHooks, setEditorialHooks] = useState<EditorialHook[]>([]);

// Add a NEW useEffect (do NOT merge with existing ones — each subscription has its own effect)
useEffect(() => {
  const unsub = subscribeEditorialHooks("approved", setEditorialHooks);
  return unsub;
}, []);
```

- [ ] **Step 2: Expose editorialHooks through context value**

Add `editorialHooks` to the context value object and the `useGraph()` return type.

- [ ] **Step 3: Verify dev server compiles**

Run: `npm run dev`
Expected: No TypeScript errors, app loads normally. Console may show empty editorial hooks array.

- [ ] **Step 4: Commit**

```bash
git add src/store/GraphContext.tsx
git commit -m "feat(context): subscribe to approved editorial hooks in GraphContext"
```

---

## Task 4: MiniGlobe Nav Logo

**Files:**
- Create: `src/components/shared/MiniGlobe.tsx`
- Modify: `src/components/shared/Layout.tsx`

- [ ] **Step 1: Create MiniGlobe component**

Extract and miniaturize from existing `src/components/Globe.tsx`. Key changes:
- Canvas size: 28x28px
- Sphere radius: 0.8 (instead of 2)
- Only 200 particles (instead of 1500)
- 3 signal ripples (instead of 10)
- Rotation speed unchanged (`delta * 0.1`)
- Wrap in `React.lazy()` for lazy loading
- SVG fallback for no-WebGL:

```typescript
// src/components/shared/MiniGlobe.tsx
import { Suspense, lazy } from "react";

const GlobeCanvas = lazy(() => import("./MiniGlobeCanvas"));

function GlobeFallback() {
  return (
    <div className="w-7 h-7 rounded-full border border-blue-500/20 bg-gradient-radial from-blue-500/10 to-transparent" />
  );
}

export default function MiniGlobe() {
  return (
    <Suspense fallback={<GlobeFallback />}>
      <div className="w-7 h-7">
        <GlobeCanvas />
      </div>
    </Suspense>
  );
}
```

Create `src/components/shared/MiniGlobeCanvas.tsx` — extract and adapt from `src/components/Globe.tsx`:
- Copy the `Globe` component from `src/components/Globe.tsx` (lines 1-185)
- Wrap in `<Canvas style={{ width: 28, height: 28 }}  gl={{ alpha: true }}>` with transparent background
- Sphere: reduce radius from 2 → 0.8, keep wireframe
- Particles: reduce from 1500 → 200 points
- Signal ripples: reduce from 10 → 3 concurrent rings
- Keep rotation speeds unchanged (`delta * 0.1` for sphere, `delta * 0.05` for particles)
- Camera position: `[0, 0, 2.5]` (closer to compensate for smaller sphere)
- Export as default for lazy loading

- [ ] **Step 2: Add MiniGlobe to Layout nav**

In `src/components/shared/Layout.tsx`, replace the text-only logo with MiniGlobe + text:

```tsx
{/* Replace existing logo link */}
<Link to="/" className="flex items-center gap-2">
  <MiniGlobe />
  <span className="text-xs tracking-widest uppercase text-white/80">
    AI 4 Society
  </span>
</Link>
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Expected: Spinning mini globe visible in top-left nav on all pages. Falls back to static circle if WebGL unavailable.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/MiniGlobe.tsx src/components/shared/MiniGlobeCanvas.tsx src/components/shared/Layout.tsx
git commit -m "feat(nav): add 28px spinning MiniGlobe logo to navigation"
```

---

## Task 5: DisclaimerBanner

**Files:**
- Create: `src/components/shared/DisclaimerBanner.tsx`
- Modify: `src/components/shared/Layout.tsx`

- [ ] **Step 1: Create DisclaimerBanner component**

```typescript
// src/components/shared/DisclaimerBanner.tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "ai4s_disclaimer_acknowledged";

export default function DisclaimerBanner() {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY)
  );

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-blue-500/5 border-b border-blue-500/10 px-4 py-2 flex items-center justify-between gap-4"
        >
          <p className="text-[10px] text-gray-400">
            This platform is for awareness and transparency. Not financial or legal advice.
          </p>
          <button
            onClick={dismiss}
            className="text-[10px] text-gray-500 hover:text-white shrink-0"
          >
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add to Layout below nav**

In `Layout.tsx`, render `<DisclaimerBanner />` immediately after the `<nav>` closing tag, before `{children}`.

- [ ] **Step 3: Verify in browser**

Expected: Banner visible on first load. Click Dismiss → gone. Refresh → still gone (localStorage).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/DisclaimerBanner.tsx src/components/shared/Layout.tsx
git commit -m "feat(disclaimer): add first-visit dismissible banner to nav"
```

---

## Task 6: ShareStrip Component

**Files:**
- Create: `src/components/landing/ShareStrip.tsx`

- [ ] **Step 1: Create ShareStrip component**

```typescript
// src/components/landing/ShareStrip.tsx
import { useState } from "react";

interface Props {
  headline: string;
  url: string;
}

export default function ShareStrip({ headline, url }: Props) {
  const [copied, setCopied] = useState(false);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(headline)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const linkClass = "text-[10px] text-gray-500 hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-4">
      <span className="text-[9px] text-gray-600 uppercase tracking-wider">Share</span>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        X / Twitter
      </a>
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        LinkedIn
      </a>
      <button onClick={copyLink} className={linkClass}>
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/ShareStrip.tsx
git commit -m "feat(landing): add ShareStrip component for social sharing"
```

---

## Task 7: TrustFooter Component

**Files:**
- Create: `src/components/landing/TrustFooter.tsx`

- [ ] **Step 1: Create TrustFooter component**

```typescript
// src/components/landing/TrustFooter.tsx
import { Link } from "react-router-dom";

export default function TrustFooter() {
  return (
    <footer className="border-t border-white/5 py-8 text-center">
      <p className="text-[10px] text-gray-500 leading-relaxed">
        47 sources across 7 tiers · Human-reviewed signals
        <br />
        Updated every 6 hours · Open methodology
      </p>
      <div className="flex justify-center gap-6 mt-4 text-[10px] text-gray-600">
        <Link to="/about" className="hover:text-white transition-colors">About</Link>
        <Link to="/about#methodology" className="hover:text-white transition-colors">Methodology</Link>
        <Link to="/about#contribute" className="hover:text-white transition-colors">Contribute</Link>
      </div>
      <p className="text-[9px] text-gray-700 mt-4">Not financial or legal advice</p>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/TrustFooter.tsx
git commit -m "feat(landing): add TrustFooter component"
```

---

## Task 8: TheRadar Component

**Files:**
- Create: `src/components/landing/TheRadar.tsx`

- [ ] **Step 1: Create TheRadar component**

Reads from `graph_snapshot` (nodes) and `node_summaries` via `useGraph()`. Displays top risks and solutions sorted by score, with velocity indicators.

```typescript
// src/components/landing/TheRadar.tsx
import { Link } from "react-router-dom";
import { useGraph } from "../../store/GraphContext";
import { toSlug } from "../../lib/slugs";

const VELOCITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-500",
  Medium: "bg-blue-500",
  Low: "bg-gray-500",
};

const SCORE_GRADIENT: Record<string, string> = {
  Critical: "from-red-600 to-red-500",
  High: "from-orange-600 to-orange-500",
  Medium: "from-blue-600 to-blue-500",
  Low: "from-gray-600 to-gray-500",
};

export default function TheRadar() {
  const { snapshot, summaries } = useGraph();
  if (!snapshot) return null;

  // Get risk + solution nodes, sorted by score descending
  // Note: GraphSnapshot uses score_2026 for both risk and solution nodes
  const nodes = snapshot.nodes
    .filter((n) => n.type === "risk" || n.type === "solution")
    .sort((a, b) => (b.score_2026 ?? 0) - (a.score_2026 ?? 0))
    .slice(0, 10);

  return (
    <section className="py-8">
      <h2 className="text-[10px] uppercase tracking-[3px] text-gray-500 mb-4">
        The Radar
      </h2>
      <div className="flex flex-col gap-2">
        {nodes.map((node) => {
          const score = node.score_2026 ?? 0;
          const velocity = node.velocity ?? node.implementation_stage ?? "Medium";
          const summary = summaries.find((s) => s.node_id === node.id);
          const signalCount = summary?.signal_count_7d ?? 0;
          const trending = summary?.trending ?? "stable";
          const gradient = SCORE_GRADIENT[velocity] ?? SCORE_GRADIENT.Medium;

          return (
            <Link
              key={node.id}
              to={`/observatory/${toSlug(node.name)}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
              >
                {Math.round(score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 truncate group-hover:text-white transition-colors">
                  {node.name}
                </div>
                <div className="text-[9px] text-gray-600">
                  {velocity} · {signalCount} signals
                </div>
              </div>
              <div className="text-[10px] shrink-0">
                {trending === "rising" && <span className="text-red-400">↑</span>}
                {trending === "stable" && <span className="text-gray-600">→</span>}
                {trending === "declining" && <span className="text-green-400">↓</span>}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="text-center mt-6">
        <Link
          to="/observatory"
          className="inline-block text-xs px-6 py-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
        >
          Enter the Observatory
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify in dev server**

Run: `npm run dev`, navigate to `/`. TheRadar won't show yet (HeroPage not rewritten), but import it temporarily to test.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/TheRadar.tsx
git commit -m "feat(landing): add TheRadar ranked risk/solution list component"
```

---

## Task 9: FeaturedStory Component

**Files:**
- Create: `src/components/landing/FeaturedStory.tsx`

- [ ] **Step 1: Create FeaturedStory component**

This is the main above-fold component. It reads approved editorial hooks from context, joins with graph snapshot for evidence data, and renders swipeable story cards.

```typescript
// src/components/landing/FeaturedStory.tsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { toSlug } from "../../lib/slugs";
import ShareStrip from "./ShareStrip";

const AUTO_ADVANCE_MS = 8000;

export default function FeaturedStory() {
  const { snapshot, editorialHooks } = useGraph();
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-advance
  useEffect(() => {
    if (editorialHooks.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % editorialHooks.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [editorialHooks.length]);

  const goTo = useCallback((i: number) => setActiveIndex(i), []);

  if (!snapshot || editorialHooks.length === 0) return null;

  const hook = editorialHooks[activeIndex];
  if (!hook) return null;

  // Join with graph snapshot for evidence
  const parentNodeId = hook.related_node_ids[0];
  const parentNode = parentNodeId
    ? snapshot.nodes.find((n) => n.id === parentNodeId)
    : null;

  // GraphSnapshot uses score_2026 for both risk and solution nodes
  const score = parentNode?.score_2026 ?? 0;

  const velocity = parentNode?.velocity ?? parentNode?.implementation_stage ?? null;

  // Count solutions connected to this risk
  const solutionCount = parentNode?.type === "risk"
    ? snapshot.edges.filter(
        (e) =>
          (e.from === parentNodeId || e.to === parentNodeId) &&
          snapshot.nodes.find(
            (n) => n.id === (e.from === parentNodeId ? e.to : e.from) && n.type === "solution"
          )
      ).length
    : 0;

  const observatoryUrl = parentNode
    ? `/observatory/${toSlug(parentNode.name)}`
    : "/observatory";

  const shareUrl = parentNode
    ? `https://ai4society.io/observatory/${toSlug(parentNode.name)}`
    : "https://ai4society.io";

  return (
    <section className="py-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={hook.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {/* Velocity tag + signal freshness */}
          <div className="flex items-center gap-2 mb-4">
            {velocity && (
              <span className="text-[9px] uppercase tracking-widest text-red-400 border border-red-400/30 px-2 py-0.5 rounded">
                {velocity}
              </span>
            )}
            <span className="text-[9px] text-gray-600">
              · {hook.source_name} · Credibility: {(hook.source_credibility * 100).toFixed(0)}%
            </span>
          </div>

          {/* Real signal headline */}
          <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-3">
            {hook.signal_title}
          </h1>

          {/* Editorial hook */}
          <div className="text-sm text-gray-400 leading-relaxed mb-6">
            <span className="text-gray-500 font-medium">What this means: </span>
            {hook.hook_text}
          </div>

          {/* Evidence cards */}
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
              {velocity && (
                <div className="flex-1 p-3 bg-blue-500/5 rounded-lg border-l-2 border-blue-500">
                  <div className="text-[8px] text-gray-600 uppercase tracking-wider">Velocity</div>
                  <div className="text-xl font-bold text-blue-400 mt-1">{velocity}</div>
                </div>
              )}
              {solutionCount > 0 && (
                <div className="flex-1 p-3 bg-green-500/5 rounded-lg border-l-2 border-green-500">
                  <div className="text-[8px] text-gray-600 uppercase tracking-wider">Solutions</div>
                  <div className="text-xl font-bold text-green-400 mt-1">{solutionCount}</div>
                  <div className="text-[8px] text-gray-600">Being tracked</div>
                </div>
              )}
            </div>
          )}

          {/* Share strip */}
          <div className="mb-6">
            <ShareStrip headline={hook.signal_title} url={shareUrl} />
          </div>

          {/* CTAs */}
          <div className="flex gap-3">
            <Link
              to={observatoryUrl}
              className="text-sm px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors"
            >
              Read the full picture
            </Link>
            <Link
              to="/observatory"
              className="text-sm px-5 py-2.5 border border-white/10 text-gray-400 rounded-lg hover:text-white hover:border-white/20 transition-colors"
            >
              All risks →
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Swipe dots */}
      {editorialHooks.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {editorialHooks.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-[3px] rounded-full transition-all ${
                i === activeIndex
                  ? "w-5 bg-blue-500"
                  : "w-2 bg-white/15 hover:bg-white/30"
              }`}
              aria-label={`Story ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/FeaturedStory.tsx
git commit -m "feat(landing): add FeaturedStory swipeable story cards component"
```

---

## Task 10: Rewrite HeroPage

**Files:**
- Modify: `src/pages/HeroPage.tsx`

- [ ] **Step 1: Rewrite HeroPage with new layout**

Replace the entire file. Remove Globe, RiskBadges, NewsFeed, PreferencePicker imports. New structure:

```typescript
// src/pages/HeroPage.tsx
import { Helmet } from "react-helmet-async";
import Layout from "../components/shared/Layout";
import FeaturedStory from "../components/landing/FeaturedStory";
import TheRadar from "../components/landing/TheRadar";
import TrustFooter from "../components/landing/TrustFooter";

export default function HeroPage() {
  return (
    <Layout>
      <Helmet>
        <title>AI 4 Society — Humanity's Window Into AI's Trajectory</title>
        <meta
          name="description"
          content="Real-time AI risk intelligence. 47 sources, human-reviewed signals, tracking 40+ risks and solutions as AI reshapes society."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4">
        <FeaturedStory />
        <TheRadar />
        <TrustFooter />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Remove old landing components**

Delete:
- `src/components/landing/RiskBadges.tsx`
- `src/components/landing/BadgeDrawer.tsx`
- `src/components/landing/NewsFeed.tsx`
- `src/components/landing/FeedCard.tsx`

- [ ] **Step 3: Verify no broken imports**

Run: `npm run build`
Expected: Clean build. No references to removed components.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, navigate to `/`.
Expected: New landing page renders. FeaturedStory may be empty (no editorial hooks yet). TheRadar shows risk/solution list from graph snapshot. TrustFooter visible at bottom.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HeroPage.tsx
git rm src/components/landing/RiskBadges.tsx src/components/landing/BadgeDrawer.tsx src/components/landing/NewsFeed.tsx src/components/landing/FeedCard.tsx
git commit -m "feat(landing): rewrite HeroPage with story-first layout, remove old components"
```

---

## Task 11: Editorial Review Admin Tab

**Files:**
- Create: `src/components/admin/EditorialReviewTab.tsx`
- Modify: `src/pages/Admin.tsx`
- Modify: `src/lib/roles.ts`

- [ ] **Step 1: Add editorial to ROLE_TAB_ACCESS**

In `src/lib/roles.ts`, add to the `ROLE_TAB_ACCESS` map:

```typescript
'editorial': ['editor', 'lead'],
```

- [ ] **Step 2: Add editorial section to Admin.tsx**

In `src/pages/Admin.tsx`:

1. Extend type: `type AdminSection = "review" | "agents" | "users" | "editorial";`

2. Add to `SECTION_CONFIG`:
```typescript
editorial: { label: "Editorial", accent: "border-amber-400" },
```

3. Add `"editorial"` to the `ALL_SECTIONS` array (around line 35) — without this, the tab will never render:
```typescript
const ALL_SECTIONS: AdminSection[] = ["review", "agents", "users", "editorial"];
```

4. Add render case in the section content area:
```typescript
{activeSection === "editorial" && <EditorialReviewTab />}
```

5. Add import: `import EditorialReviewTab from "../components/admin/EditorialReviewTab";`

- [ ] **Step 3: Create EditorialReviewTab component**

```typescript
// src/components/admin/EditorialReviewTab.tsx
import { useState, useEffect } from "react";
import { subscribeEditorialHooks, updateEditorialStatus } from "../../data/editorial";
import { useAuth } from "../../store/AuthContext";
import type { EditorialHook } from "../../types/editorial";

export default function EditorialReviewTab() {
  const { user } = useAuth();
  const [hooks, setHooks] = useState<EditorialHook[]>([]);
  const [selected, setSelected] = useState<EditorialHook | null>(null);
  const [editText, setEditText] = useState("");
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  useEffect(() => {
    return subscribeEditorialHooks(filter, setHooks);
  }, [filter]);

  const handleSelect = (h: EditorialHook) => {
    setSelected(h);
    setEditText(h.hook_text);
  };

  const handleAction = async (status: "approved" | "rejected") => {
    if (!selected || !user) return;
    setUpdating(true);
    try {
      await updateEditorialStatus(
        selected.id,
        status,
        user.uid,
        status === "approved" ? editText : undefined,
      );
      setSelected(null);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-10rem)]">
      {/* Left: List */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto shrink-0">
        <div className="flex gap-2 p-3 border-b border-white/10">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                filter === s ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {hooks.map((h) => (
          <button
            key={h.id}
            onClick={() => handleSelect(h)}
            className={`w-full px-3 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 ${
              selected?.id === h.id ? "bg-white/10" : ""
            }`}
          >
            <div className="text-xs text-white/80 line-clamp-2">{h.signal_title}</div>
            <div className="text-[9px] text-gray-600 mt-1">
              {h.source_name} · Score: {h.impact_score.toFixed(1)}
            </div>
          </button>
        ))}
        {hooks.length === 0 && (
          <div className="p-6 text-center text-gray-600 text-sm">No hooks found</div>
        )}
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Select a hook to review
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Signal Headline</div>
              <h3 className="text-lg text-white font-semibold">{selected.signal_title}</h3>
              <div className="text-[10px] text-gray-600 mt-1">
                {selected.source_name} · Credibility: {(selected.source_credibility * 100).toFixed(0)}%
              </div>
            </div>

            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Editorial Hook</div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white resize-none"
                rows={4}
              />
            </div>

            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Linked Nodes</div>
              <div className="text-xs text-gray-400">
                {selected.related_node_ids.join(", ") || "None"}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleAction("approved")}
                disabled={updating}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {updating ? "Saving..." : "Approve"}
              </button>
              <button
                onClick={() => handleAction("rejected")}
                disabled={updating}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm rounded transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build and admin panel**

Run: `npm run build`
Expected: Clean build. Navigate to `/admin` → "Editorial" tab visible for lead/editor roles.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/pages/Admin.tsx src/components/admin/EditorialReviewTab.tsx
git commit -m "feat(admin): add Editorial review tab for approving editorial hooks"
```

---

## Task 12: Feed Curator — Generate Editorial Hooks

**Files:**
- Modify: `functions/src/agents/feed-curator/index.ts`

- [ ] **Step 1: Add editorial hook generation after feed rebuild**

After `writeFeedItems(sorted)` (around line 79), add a new function call:

```typescript
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

async function generateEditorialHooks(
  topItems: Array<{ id: string } & Record<string, unknown>>,
  apiKey: string,
) {
  const db = getDb();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  for (const item of topItems.slice(0, 5)) {
    const hookRef = db.collection("editorial_hooks").doc(item.id as string);
    const existing = await hookRef.get();
    if (existing.exists) continue; // Never overwrite existing hooks

    const prompt = `You are writing a one-sentence editorial hook for a general audience. Given this news signal about AI risks or solutions, explain what it means for ordinary people in plain, urgent language. No jargon. No hedging.

Signal: "${item.title as string}"
Source: ${item.source_name as string}

Respond with ONLY the one-sentence hook. No quotes, no prefix.`;

    try {
      const result = await model.generateContent(prompt);
      const hookText = result.response.text().trim();

      await hookRef.set({
        signal_id: item.id,
        signal_title: item.title,
        hook_text: hookText,
        status: "pending",
        related_node_ids: item.related_node_ids ?? [],
        impact_score: item.impact_score ?? 0,
        source_name: item.source_name ?? "",
        source_credibility: item.source_credibility ?? 0.5,
        published_date: item.published_date ?? "",
        generated_at: FieldValue.serverTimestamp(),
        reviewed_by: null,
        reviewed_at: null,
      });

      logger.info(`Editorial hook generated for: ${item.title}`);
    } catch (err) {
      logger.warn(`Failed to generate editorial hook for ${item.id}:`, err);
    }
  }
}
```

- [ ] **Step 2: Call from buildFeed**

After `writeFeedItems(sorted)`, add:

```typescript
await generateEditorialHooks(sorted, geminiApiKey.value());
```

Update the function configs to include `secrets: [geminiApiKey]` and pass the key to `buildFeed`:

```typescript
// scheduledFeedCurator — add secrets and increase memory for Gemini calls
export const scheduledFeedCurator = onSchedule(
  { schedule: "every 6 hours", memory: "512MiB", timeoutSeconds: 120, secrets: [geminiApiKey] },
  async () => { await buildFeed(geminiApiKey.value()); }
);

// triggerFeedCurator — same changes
export const triggerFeedCurator = onCall(
  { memory: "512MiB", timeoutSeconds: 120, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    return await buildFeed(geminiApiKey.value());
  }
);
```

Update `buildFeed` signature to accept `apiKey: string` and pass it to `generateEditorialHooks`.
Note: `FieldValue` is already imported via `../../shared/firestore.js` — no new import needed.

- [ ] **Step 3: Build functions**

Run: `npm run functions:build`
Expected: Clean TypeScript compilation.

- [ ] **Step 4: Commit**

```bash
git add functions/src/agents/feed-curator/index.ts
git commit -m "feat(feed-curator): generate editorial hooks for top 5 feed items via Gemini"
```

---

## Task 13: Seed Script for Initial Content

**Files:**
- Create: `src/scripts/seed-editorial-hooks.ts`

- [ ] **Step 1: Create seed script**

```typescript
// src/scripts/seed-editorial-hooks.ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

initializeApp({ projectId: "ai-4-society", credential: applicationDefault() });
const db = getFirestore();

async function seedEditorialHooks() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Set GEMINI_API_KEY env var");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Read top 10 feed items
  const feedSnap = await db.collection("feed_items")
    .orderBy("impact_score", "desc")
    .limit(10)
    .get();

  console.log(`Found ${feedSnap.size} feed items to seed.`);

  for (const feedDoc of feedSnap.docs) {
    const data = feedDoc.data();
    const hookRef = db.collection("editorial_hooks").doc(feedDoc.id);
    const existing = await hookRef.get();
    if (existing.exists) {
      console.log(`  ${feedDoc.id}: hook already exists, skipping.`);
      continue;
    }

    const prompt = `You are writing a one-sentence editorial hook for a general audience. Given this news signal about AI risks or solutions, explain what it means for ordinary people in plain, urgent language. No jargon. No hedging.

Signal: "${data.title}"
Source: ${data.source_name}

Respond with ONLY the one-sentence hook. No quotes, no prefix.`;

    const result = await model.generateContent(prompt);
    const hookText = result.response.text().trim();

    await hookRef.set({
      signal_id: feedDoc.id,
      signal_title: data.title ?? "",
      hook_text: hookText,
      status: "pending",
      related_node_ids: data.related_node_ids ?? [],
      impact_score: data.impact_score ?? 0,
      source_name: data.source_name ?? "",
      source_credibility: data.source_credibility ?? 0.5,
      published_date: data.published_date ?? "",
      generated_at: FieldValue.serverTimestamp(),
      reviewed_by: null,
      reviewed_at: null,
    });

    console.log(`  ${feedDoc.id}: "${data.title}" → hook generated`);
  }

  console.log("Seed complete. Review hooks in admin panel before deploying new landing page.");
}

seedEditorialHooks()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Error:", e); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/seed-editorial-hooks.ts
git commit -m "feat(scripts): add seed script for initial editorial hooks"
```

---

## Task 14: Deploy & Verify End-to-End

- [ ] **Step 1: Deploy Firestore rules**

Run: `firebase deploy --only firestore:rules`

- [ ] **Step 2: Deploy functions**

Run: `firebase deploy --only functions`

- [ ] **Step 3: Run seed script**

```bash
cd functions && GEMINI_API_KEY=<key> npx tsx ../src/scripts/seed-editorial-hooks.ts
```

Expected: 10 editorial hooks generated and written to Firestore.

- [ ] **Step 4: Approve hooks in admin**

Navigate to `/admin` → Editorial tab → review and approve hooks.

- [ ] **Step 5: Verify landing page**

Navigate to `/` — FeaturedStory should display approved hooks with evidence cards and share links. TheRadar shows risk list. TrustFooter at bottom. MiniGlobe spinning in nav.

- [ ] **Step 6: Verify Observatory unchanged**

Navigate to `/observatory` — force graph, detail panel, timeline all work exactly as before.

- [ ] **Step 7: Push to main**

```bash
git push origin main
```

CI deploys hosting automatically.
