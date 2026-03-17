# Frontend Public Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public-facing v2 frontend — landing page with risk badges and news feed, About page, and Observatory with interactive graph visualization, detail panel, timeline view, and voting.

**Architecture:** Replace the v1 RiskContext with a new GraphContext that reads from v2 collections (graph_snapshot, node_summaries, feed_items). The Observatory uses react-force-graph-2d for interactive graph visualization powered by the pre-computed graph_snapshot document. All public pages are accessible without authentication; voting requires Member sign-in. The existing v1 Dashboard and Contribute pages remain accessible but are not modified.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4, Framer Motion 12, react-force-graph-2d, Firebase/Firestore (client SDK), Three.js (hero globe — existing)

**Dependencies completed:**
- Plan 1: Types (`src/types/graph.ts`, `signal.ts`, `proposal.ts`, `user.ts`), data clients (`src/data/graph.ts`, `feed.ts`, `votes.ts`, `signals.ts`), `roles-v2.ts`, `preferences.ts`
- Plan 2: Backend agents write to `graph_snapshot`, `node_summaries`, `feed_items`, `graph_proposals`

**Deferred to later plans:**
- Plan 4: Preference migration from localStorage to Firestore on sign-in (spec section 5.6)
- Plan 4: Admin panel overhaul (spec section 5.5) — the v1 Observatory agent diagnostics view moves to Admin
- Plan 5: SEO/GEO, pre-rendering, RSS feeds (spec section 5.7)

**Existing v1 pages preserved (not touched):**
- `/dashboard` — v1 timeline view (CRT-style frequency scanner)
- `/contribute` — v1 contribution flow
- `/help` — v1 help page

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/store/GraphContext.tsx` | v2 app state: graph snapshot, node summaries, feed items, loading/error |
| `src/components/shared/Layout.tsx` | Shared page shell: top nav bar + footer |
| `src/components/shared/PreferencePicker.tsx` | Interest selection UI (node type pills) |
| `src/components/shared/AuthGate.tsx` | Conditional content based on auth state |
| `src/pages/About.tsx` | About page — mission, methodology, sources |
| `src/components/landing/RiskBadges.tsx` | Trending risk badges row (Instagram stories style) |
| `src/components/landing/BadgeDrawer.tsx` | Slide-down drawer for a selected badge |
| `src/components/landing/NewsFeed.tsx` | Vertically scrollable feed_items cards |
| `src/components/landing/FeedCard.tsx` | Individual feed item card (signal or milestone) |
| `src/components/observatory/GraphView.tsx` | react-force-graph-2d interactive visualization |
| `src/components/observatory/DetailPanel.tsx` | Side panel: node detail, evidence, voting |
| `src/components/observatory/EvidenceList.tsx` | Approved signals for a node, sorted by impact |
| `src/components/observatory/PerceptionGap.tsx` | Expert severity vs. community vote bar |
| `src/components/observatory/VoteButton.tsx` | Upvote/downvote UI with auth gate |
| `src/components/observatory/ObservatoryTimeline.tsx` | Chronological milestones + signals view |
| `src/components/observatory/NodeTypeFilter.tsx` | Toggle checkboxes to filter graph by node type |

### Modified files

| File | Changes |
|------|---------|
| `src/App.tsx` | Add GraphContext provider, add `/about` and `/observatory/:nodeId` routes, make Observatory public |
| `src/pages/HeroPage.tsx` | Add RiskBadges row and NewsFeed below hero section |
| `src/pages/Observatory.tsx` | Complete rewrite: graph view + detail panel + timeline tabs |
| `package.json` | Add `react-force-graph-2d` dependency |

### Unchanged files (reused from Plan 1)

| File | Purpose |
|------|---------|
| `src/data/graph.ts` | Firestore client: getGraphSnapshot, getNodeSummaries, getNode, getEdges |
| `src/data/feed.ts` | Firestore client: getFeedItems |
| `src/data/votes.ts` | Firestore client: castVote, getUserVote, getVoteCounts |
| `src/data/signals.ts` | Firestore client: getSignals (used by EvidenceList) |
| `src/types/graph.ts` | GraphSnapshot, NodeSummary, FeedItem, Vote types |
| `src/lib/preferences.ts` | localStorage get/set for UserPreferences |
| `src/lib/roles-v2.ts` | isMember, canVote, isReviewer, isAdmin |
| `src/store/AuthContext.tsx` | useAuth hook (user, userDoc, signIn, logOut) |

---

## Chunk 1: Foundation — GraphContext, Shared Components, Routing

### Task 1: Install react-force-graph-2d

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

```bash
cd /Users/dehakuran/Projects/ai-4-society && npm install react-force-graph-2d
```

Note: `react-force-graph-2d` has peer dependencies on `react` and `react-dom` which are already installed. It uses HTML5 Canvas (not WebGL), so there are no conflicts with the Three.js hero globe.

- [ ] **Step 2: Verify install**

Run: `npm ls react-force-graph-2d`
Expected: Shows version installed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-force-graph-2d for observatory graph visualization"
```

---

### Task 2: Create GraphContext

**Files:**
- Create: `src/store/GraphContext.tsx`

The v2 equivalent of RiskContext. Reads from pre-computed Firestore collections: `graph_snapshot` (single doc), `node_summaries`, and `feed_items`. Uses real-time listeners for node_summaries (vote counts update in real time via the vote aggregation trigger).

- [ ] **Step 1: Create GraphContext**

```typescript
// src/store/GraphContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GraphSnapshot, NodeSummary, FeedItem } from "../types/graph";

interface GraphContextType {
  snapshot: GraphSnapshot | null;
  summaries: NodeSummary[];
  feedItems: FeedItem[];
  loading: boolean;
  error: string | null;
}

const GraphContext = createContext<GraphContextType | undefined>(undefined);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [summaries, setSummaries] = useState<NodeSummary[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to graph_snapshot (single document, real-time)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "graph_snapshot", "current"),
      (snap) => {
        if (snap.exists()) {
          setSnapshot(snap.data() as GraphSnapshot);
        }
        setLoading(false);
      },
      (err) => {
        console.error("GraphContext: snapshot error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // Subscribe to node_summaries (real-time for vote updates)
  useEffect(() => {
    const q = query(
      collection(db, "node_summaries"),
      orderBy("signal_count_7d", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setSummaries(
          snap.docs.map((d) => ({ ...d.data() } as NodeSummary))
        );
      },
      (err) => {
        console.error("GraphContext: summaries error:", err);
      }
    );
    return unsubscribe;
  }, []);

  // Subscribe to feed_items (top 30, real-time)
  useEffect(() => {
    const q = query(
      collection(db, "feed_items"),
      orderBy("impact_score", "desc"),
      firestoreLimit(30)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setFeedItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedItem))
        );
      },
      (err) => {
        console.error("GraphContext: feed error:", err);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <GraphContext.Provider
      value={{ snapshot, summaries, feedItems, loading, error }}
    >
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph() {
  const context = useContext(GraphContext);
  if (context === undefined) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return context;
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/GraphContext.tsx
git commit -m "feat(store): add GraphContext with real-time graph snapshot, summaries, and feed"
```

---

### Task 3: Create shared Layout component

**Files:**
- Create: `src/components/shared/Layout.tsx`

Shared page shell with a top navigation bar and footer. Used by all v2 public pages (Landing, About, Observatory). The nav bar has the site title, navigation links, and sign-in/sign-out button.

- [ ] **Step 1: Create Layout**

```typescript
// src/components/shared/Layout.tsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  /** Hide nav and footer (e.g., for hero page) */
  bare?: boolean;
}

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/observatory", label: "Observatory" },
  { to: "/about", label: "About" },
];

export default function Layout({ children, bare }: LayoutProps) {
  const { user, userDoc, signIn, logOut } = useAuth();
  const location = useLocation();

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Nav Bar */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[var(--bg-primary)]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-bold tracking-wider uppercase"
            >
              AI 4 Society
            </Link>
            <div className="hidden sm:flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-xs tracking-wide transition-colors ${
                    location.pathname === link.to
                      ? "text-[var(--accent-structural)]"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {userDoc && (
                  <Link
                    to="/admin"
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <span className="text-xs text-gray-500 hidden sm:inline truncate max-w-[120px]">
                  {user.displayName ?? user.email}
                </span>
                <button
                  onClick={logOut}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={signIn}
                className="text-xs px-3 py-1.5 rounded border border-white/20 text-gray-300 hover:bg-white/10 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1"
      >
        {children}
      </motion.main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-white transition-colors">
              About
            </Link>
            <Link
              to="/observatory"
              className="hover:text-white transition-colors"
            >
              Observatory
            </Link>
            <a
              href="https://github.com/ai-4-society"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
          <span>&copy; {new Date().getFullYear()} AI 4 Society</span>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/Layout.tsx
git commit -m "feat(shared): add Layout component with nav bar and footer"
```

---

### Task 4: Create PreferencePicker and AuthGate

**Files:**
- Create: `src/components/shared/PreferencePicker.tsx`
- Create: `src/components/shared/AuthGate.tsx`

PreferencePicker allows visitors to select interest areas (risk/solution nodes) from the graph. Stores in localStorage via `preferences.ts`. AuthGate conditionally renders children based on authentication state.

- [ ] **Step 1: Create PreferencePicker**

```typescript
// src/components/shared/PreferencePicker.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import {
  getLocalPreferences,
  setLocalPreferences,
  hasPreferences,
} from "../../lib/preferences";

const TYPE_COLORS: Record<string, string> = {
  risk: "border-red-500/50 bg-red-500/10 text-red-400",
  solution: "border-green-500/50 bg-green-500/10 text-green-400",
};

const DISMISSED_KEY = "ai4s_prefs_dismissed";

export default function PreferencePicker() {
  const { snapshot } = useGraph();
  const [visible, setVisible] = useState(
    () => !hasPreferences() && localStorage.getItem(DISMISSED_KEY) !== "1"
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(getLocalPreferences().interests)
  );

  if (!visible || !snapshot) return null;

  // Show only risk and solution nodes (not stakeholder/milestone)
  const nodes = snapshot.nodes.filter(
    (n) => n.type === "risk" || n.type === "solution"
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    setLocalPreferences({ interests: [...selected] });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="bg-white/5 border border-white/10 rounded-lg p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pick your interests</h3>
          <button
            onClick={() => {
              localStorage.setItem(DISMISSED_KEY, "1");
              setVisible(false);
            }}
            className="text-xs text-gray-500 hover:text-white"
          >
            Skip
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Select topics you care about to personalize your feed.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => toggle(node.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                selected.has(node.id)
                  ? TYPE_COLORS[node.type] ?? "border-white/30 bg-white/10"
                  : "border-white/10 text-gray-500 hover:border-white/30"
              }`}
            >
              {node.name}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button
            onClick={save}
            className="text-xs px-4 py-2 rounded bg-[var(--accent-structural)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Save ({selected.size} selected)
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Create AuthGate**

```typescript
// src/components/shared/AuthGate.tsx
import { useAuth } from "../../store/AuthContext";
import type { ReactNode } from "react";

interface AuthGateProps {
  children: ReactNode;
  /** Shown to non-authenticated users */
  fallback?: ReactNode;
}

export default function AuthGate({ children, fallback }: AuthGateProps) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <>{fallback ?? null}</>;

  return <>{children}</>;
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/PreferencePicker.tsx src/components/shared/AuthGate.tsx
git commit -m "feat(shared): add PreferencePicker and AuthGate components"
```

---

### Task 5: Update App.tsx routing

**Files:**
- Modify: `src/App.tsx`

Add GraphProvider, new routes (`/about`, `/observatory/:nodeId`), and make Observatory public (remove ProtectedRoute wrapper). Keep v1 routes intact.

- [ ] **Step 1: Update App.tsx**

Replace the entire file with:

```typescript
// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HeroPage from "./pages/HeroPage";
import Dashboard from "./pages/Dashboard";
import Contribute from "./pages/Contribute";
import Admin from "./pages/Admin";
import Observatory from "./pages/Observatory";
import About from "./pages/About";
import Help from "./pages/Help";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RiskProvider } from "./store/RiskContext";
import { GraphProvider } from "./store/GraphContext";
import { AuthProvider } from "./store/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <RiskProvider>
        <AuthProvider>
          <GraphProvider>
            <Router>
              <Routes>
                {/* v2 public pages */}
                <Route path="/" element={<HeroPage />} />
                <Route path="/about" element={<About />} />
                <Route path="/observatory" element={<Observatory />} />
                <Route path="/observatory/:nodeId" element={<Observatory />} />

                {/* v1 pages (preserved) */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/:riskId" element={<Dashboard />} />
                <Route path="/contribute" element={<Contribute />} />
                <Route path="/help" element={
                  <ProtectedRoute>
                    <Help />
                  </ProtectedRoute>
                } />

                {/* Admin (protected) */}
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } />
              </Routes>
            </Router>
          </GraphProvider>
        </AuthProvider>
      </RiskProvider>
    </ErrorBoundary>
  );
}
```

**Key changes:**
- Added `GraphProvider` wrapping all routes
- Added `/about` route pointing to new About page
- Added `/observatory/:nodeId` for deep linking
- Removed `ProtectedRoute` from Observatory (now public per spec)
- Removed `requiredRoles={['lead']}` from Observatory

- [ ] **Step 2: Create placeholder About page** (so build passes)

```typescript
// src/pages/About.tsx
export default function About() {
  return <div>About (placeholder)</div>;
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/pages/About.tsx
git commit -m "feat(routing): add GraphProvider, /about route, make Observatory public"
```

---

## Chunk 2: Landing Page — Risk Badges, News Feed, Hero Update

### Task 6: Create FeedCard component

**Files:**
- Create: `src/components/landing/FeedCard.tsx`

Individual card for a feed item. Signal cards show source credibility indicator. Milestone cards get distinct styling.

- [ ] **Step 1: Create FeedCard**

```typescript
// src/components/landing/FeedCard.tsx
import { motion } from "framer-motion";
import type { FeedItem } from "../../types/graph";

interface FeedCardProps {
  item: FeedItem;
  index: number;
}

function credibilityLabel(score: number): { text: string; color: string } {
  if (score >= 0.8) return { text: "High", color: "text-green-400" };
  if (score >= 0.6) return { text: "Med", color: "text-yellow-400" };
  return { text: "Low", color: "text-gray-500" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function FeedCard({ item, index }: FeedCardProps) {
  const isMilestone = item.type === "milestone";
  const cred = item.source_credibility
    ? credibilityLabel(item.source_credibility)
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`rounded-lg border p-4 transition-colors ${
        isMilestone
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
      }`}
    >
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[10px] uppercase tracking-wider font-medium ${
            isMilestone ? "text-yellow-400" : "text-[var(--accent-structural)]"
          }`}
        >
          {isMilestone ? "⬢ Milestone" : "Signal"}
        </span>
        {item.published_date && (
          <span className="text-[10px] text-gray-600">
            {timeAgo(item.published_date)}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold mb-1 leading-snug">{item.title}</h3>

      {/* Summary */}
      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{item.summary}</p>

      {/* Footer: source + credibility */}
      <div className="flex items-center justify-between">
        {item.source_name && (
          <span className="text-[10px] text-gray-500">{item.source_name}</span>
        )}
        {cred && (
          <span className={`text-[10px] ${cred.color}`}>{cred.text}</span>
        )}
      </div>
    </motion.article>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/FeedCard.tsx
git commit -m "feat(landing): add FeedCard component for signal and milestone items"
```

---

### Task 7: Create NewsFeed component

**Files:**
- Create: `src/components/landing/NewsFeed.tsx`

Vertically scrollable list of FeedCards. Reads from GraphContext. Applies soft personalization: if preferences set, matching items get a boost (sorted higher).

- [ ] **Step 1: Create NewsFeed**

```typescript
// src/components/landing/NewsFeed.tsx
import { useMemo, useState } from "react";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import FeedCard from "./FeedCard";
import type { FeedItem } from "../../types/graph";

function rankFeedItems(items: FeedItem[], interests: string[]): FeedItem[] {
  if (interests.length === 0) return items;

  const interestSet = new Set(interests);
  const BOOST = 1.5;

  return [...items].sort((a, b) => {
    const aMatch = a.related_node_ids.some((id) => interestSet.has(id));
    const bMatch = b.related_node_ids.some((id) => interestSet.has(id));
    const aScore = a.impact_score * (aMatch ? BOOST : 1);
    const bScore = b.impact_score * (bMatch ? BOOST : 1);
    return bScore - aScore;
  });
}

export default function NewsFeed() {
  const { feedItems, loading } = useGraph();
  // Read preferences once on mount (stable reference for useMemo)
  const [interests] = useState(() => getLocalPreferences().interests);

  const ranked = useMemo(
    () => rankFeedItems(feedItems, interests),
    [feedItems, interests]
  );

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
        No feed items yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
        Latest Intelligence
      </h2>
      <div className="space-y-2">
        {ranked.map((item, i) => (
          <FeedCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/NewsFeed.tsx
git commit -m "feat(landing): add NewsFeed component with personalized ranking"
```

---

### Task 8: Create RiskBadges and BadgeDrawer

**Files:**
- Create: `src/components/landing/BadgeDrawer.tsx`
- Create: `src/components/landing/RiskBadges.tsx`

RiskBadges: horizontal row of trending risk pills from node_summaries. BadgeDrawer: slides down on tap with risk name, velocity, signal count, and CTA to Observatory.

- [ ] **Step 1: Create BadgeDrawer**

```typescript
// src/components/landing/BadgeDrawer.tsx
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { NodeSummary } from "../../types/graph";

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

- [ ] **Step 2: Create RiskBadges**

```typescript
// src/components/landing/RiskBadges.tsx
import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import BadgeDrawer from "./BadgeDrawer";
import type { NodeSummary } from "../../types/graph";

/** Select top 5 trending risks by signal_count_7d + velocity weight + preference boost */
function selectTrendingRisks(
  summaries: NodeSummary[],
  preferenceIds: Set<string>
): NodeSummary[] {
  const velocityWeight: Record<string, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };
  const PREF_BOOST = 3;

  return summaries
    .filter((s) => s.node_type === "risk")
    .sort((a, b) => {
      const aScore =
        a.signal_count_7d * 2 +
        (velocityWeight[a.velocity ?? "Medium"] ?? 2) +
        (preferenceIds.has(a.node_id) ? PREF_BOOST : 0);
      const bScore =
        b.signal_count_7d * 2 +
        (velocityWeight[b.velocity ?? "Medium"] ?? 2) +
        (preferenceIds.has(b.node_id) ? PREF_BOOST : 0);
      return bScore - aScore;
    })
    .slice(0, 5);
}

export default function RiskBadges() {
  const { summaries, loading } = useGraph();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefIds] = useState(
    () => new Set(getLocalPreferences().interests)
  );

  const trending = useMemo(
    () => selectTrendingRisks(summaries, prefIds),
    [summaries, prefIds]
  );

  if (loading || trending.length === 0) return null;

  const selected = trending.find((s) => s.node_id === selectedId) ?? null;

  const toggle = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="w-full">
      {/* Badges row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {trending.map((summary) => {
          const isActive = summary.node_id === selectedId;
          const isMostActive =
            summary.node_id === trending[0]?.node_id && !selectedId;

          return (
            <button
              key={summary.node_id}
              onClick={() => toggle(summary.node_id)}
              className={`shrink-0 text-xs px-4 py-2 rounded-full border transition-all ${
                isActive
                  ? "border-red-500/60 bg-red-500/15 text-red-400"
                  : "border-white/15 text-gray-400 hover:border-white/30 hover:text-white"
              } ${isMostActive ? "animate-pulse-subtle" : ""}`}
            >
              {summary.name}
              {summary.signal_count_7d > 0 && (
                <span className="ml-1.5 text-[10px] text-gray-600">
                  {summary.signal_count_7d}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {selected && (
          <BadgeDrawer
            key={selected.node_id}
            summary={selected}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/BadgeDrawer.tsx src/components/landing/RiskBadges.tsx
git commit -m "feat(landing): add RiskBadges row with BadgeDrawer for trending risks"
```

---

### Task 9: Update HeroPage with badges, feed, and footer

**Files:**
- Modify: `src/pages/HeroPage.tsx`

Add RiskBadges row below hero CTAs, NewsFeed section, and a PreferencePicker + footer at the bottom. Wrap in Layout (bare mode for the hero area, showing footer).

- [ ] **Step 1: Rewrite HeroPage**

Replace `src/pages/HeroPage.tsx` with:

```typescript
// src/pages/HeroPage.tsx
import { useNavigate, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Globe } from "../components/Globe";
import { Suspense, useState } from "react";
import { PrivacyModal } from "../components/PrivacyModal";
import Layout from "../components/shared/Layout";
import RiskBadges from "../components/landing/RiskBadges";
import NewsFeed from "../components/landing/NewsFeed";
import PreferencePicker from "../components/shared/PreferencePicker";

export default function HeroPage() {
  const navigate = useNavigate();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleEnter = () => {
    navigate("/observatory");
  };

  return (
    <Layout bare>
      <div className="relative w-full min-h-screen overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0 opacity-60 h-screen">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <Suspense fallback={null}>
              <Globe />
            </Suspense>
          </Canvas>
        </div>

        {/* Hero Section */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4 py-12">
          <h1
            className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Are we shaping AI, <br />
            or is it shaping us?
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-8 md:mb-12 max-w-2xl font-light">
            Real-time tracking of the 40+ existential shifts redefining human
            society.
          </p>

          {/* CTAs */}
          <div className="flex flex-col md:flex-row gap-4 w-full max-w-md md:max-w-4xl mb-8">
            <button
              onClick={() => setShowDisclaimer(true)}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.3)] rounded"
            >
              [ Enter Observatory ]
            </button>
            <button
              onClick={() => navigate("/about")}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-cyan-600 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all duration-300 rounded"
            >
              What is AI-4-Society?
            </button>
            <button
              onClick={() => navigate("/contribute")}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-green-600 text-green-400 hover:bg-green-600 hover:text-white transition-all duration-300 rounded"
            >
              I want to contribute
            </button>
          </div>

          {/* Risk Badges */}
          <div className="w-full max-w-2xl">
            <RiskBadges />
          </div>
        </div>

        {/* Below the fold: News Feed */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 pb-12 space-y-8">
          <NewsFeed />
          <PreferencePicker />
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/10 py-6 px-4 text-center text-xs text-gray-500">
          <Link to="/about" className="hover:text-white transition-colors mr-4">
            About
          </Link>
          <Link
            to="/observatory"
            className="hover:text-white transition-colors mr-4"
          >
            Observatory
          </Link>
          <span>&copy; {new Date().getFullYear()} AI 4 Society</span>
        </footer>
      </div>

      {showDisclaimer && (
        <PrivacyModal
          onClose={() => setShowDisclaimer(false)}
          onConfirm={handleEnter}
        />
      )}
    </Layout>
  );
}
```

**Key changes from v1:**
- "What is AI-4-Society?" CTA now navigates to `/about` instead of opening a modal
- Added RiskBadges row below CTAs
- Added NewsFeed section below the fold
- Added PreferencePicker for new visitors
- Added inline footer
- Wrapped in `Layout bare` for consistency
- "Enter Observatory" now navigates to `/observatory` instead of `/dashboard`

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/HeroPage.tsx
git commit -m "feat(landing): add risk badges, news feed, and preference picker to hero page"
```

---

## Chunk 3: About Page

### Task 10: Create About page

**Files:**
- Modify: `src/pages/About.tsx` (replace placeholder)

Long-scroll page with 7 content sections as specified: Mission, How It Works, What We Track, Our Sources, Human-in-the-Loop, Get Involved, Data & Privacy.

- [ ] **Step 1: Write About page**

```typescript
// src/pages/About.tsx
import Layout from "../components/shared/Layout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { motion } from "framer-motion";

const SOURCE_TIERS = [
  {
    tier: "T1 — Institutional",
    examples: "OECD AI Observatory, EU AI Office, Nature, Science",
    credibility: "0.85–0.95",
  },
  {
    tier: "T2 — Quality Journalism",
    examples: "MIT Tech Review, Ars Technica, Wired, Reuters",
    credibility: "0.70–0.85",
  },
  {
    tier: "T3 — Tech / Community",
    examples: "TechCrunch, The Verge, Hacker News",
    credibility: "0.50–0.70",
  },
  {
    tier: "T4 — Active Search",
    examples: "Google Custom Search, GDELT",
    credibility: "0.40–0.70",
  },
  {
    tier: "T5 — Newsletters",
    examples: "TLDR AI, Import AI, Last Week in AI",
    credibility: "0.60–0.75",
  },
];

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
      className="py-12 border-b border-white/5 last:border-b-0"
    >
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="text-sm text-gray-300 leading-relaxed space-y-4">
        {children}
      </div>
    </motion.section>
  );
}

export default function About() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page header */}
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          What is AI 4 Society?
        </h1>
        <p className="text-gray-400 text-sm mb-8">
          An open intelligence platform tracking how artificial intelligence is
          reshaping society — powered by AI, guided by humans.
        </p>

        {/* === Mission === */}
        <Section title="Mission" id="mission">
          <p>
            Artificial intelligence is transforming every aspect of human
            society — from employment and education to governance and warfare —
            faster than any institution can track. Most people hear about AI
            through hype cycles or fear headlines, not through structured,
            evidence-based analysis.
          </p>
          <p>
            AI 4 Society exists to close that gap. We operate a real-time
            observatory that continuously scans hundreds of sources, classifies
            signals by risk category, and connects them to an evolving knowledge
            graph of risks, solutions, stakeholders, and milestones.
          </p>
          <p>
            Our goal is to democratize AI risk intelligence — making it
            accessible enough for the general public yet rigorous enough for
            researchers and journalists to cite.
          </p>
        </Section>

        {/* === How It Works === */}
        <Section title="How It Works" id="how-it-works">
          <p>
            Every 12 hours, our Signal Scout agent scans news sources, research
            papers, and policy documents for AI-related developments. Each
            article passes through a two-stage filter:
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>
              <strong>Cheap filter</strong> — checks source credibility,
              recency, deduplication, and keyword relevance. Cuts irrelevant
              articles before any AI processing.
            </li>
            <li>
              <strong>AI classification</strong> — Gemini analyzes surviving
              articles, classifies them against our risk/solution taxonomy, and
              assigns confidence and impact scores.
            </li>
          </ol>
          <p>
            Every classified signal then enters human review. Our volunteer
            reviewers approve, reject, or edit each signal before it appears in
            the public observatory. Nothing reaches the public without a human
            check.
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-500 bg-white/5 rounded-lg p-3 mt-4">
            <span className="shrink-0">Sources</span>
            <span>→</span>
            <span className="shrink-0">Signal Scout</span>
            <span>→</span>
            <span className="shrink-0">Human Review</span>
            <span>→</span>
            <span className="shrink-0 text-[var(--accent-structural)]">
              Observatory
            </span>
          </div>
        </Section>

        {/* === What We Track === */}
        <Section title="What We Track" id="what-we-track">
          <p>
            Our knowledge graph organizes AI developments into four connected
            types:
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              {
                type: "Risks",
                color: "text-red-400 border-red-500/30",
                desc: "Societal threats from AI — bias, job displacement, surveillance, autonomous weapons",
              },
              {
                type: "Solutions",
                color: "text-green-400 border-green-500/30",
                desc: "Governance frameworks, technical safeguards, policy proposals, industry standards",
              },
              {
                type: "Stakeholders",
                color: "text-blue-400 border-blue-500/30",
                desc: "Groups affected by or shaping AI — workers, regulators, researchers, communities",
              },
              {
                type: "Milestones",
                color: "text-yellow-400 border-yellow-500/30",
                desc: "Key events — breakthroughs, regulations passed, incidents, deployments",
              },
            ].map((item) => (
              <div
                key={item.type}
                className={`border rounded-lg p-3 ${item.color}`}
              >
                <div className="font-semibold text-xs mb-1">{item.type}</div>
                <div className="text-[10px] text-gray-400">{item.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-3">
            These nodes are connected by typed edges — risks are linked to
            solutions that address them, stakeholders impacted by risks, and
            milestones that escalate or de-escalate threats. The graph evolves
            weekly as our Discovery Agent proposes new connections.
          </p>
        </Section>

        {/* === Our Sources === */}
        <Section title="Our Sources" id="sources">
          <p>
            We scan sources across five tiers, each assigned a credibility score
            that directly affects how signals are ranked:
          </p>
          <div className="mt-3 space-y-2">
            {SOURCE_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="flex items-start gap-3 text-xs bg-white/5 rounded p-2"
              >
                <span className="shrink-0 font-medium w-36">{tier.tier}</span>
                <span className="text-gray-400 flex-1">{tier.examples}</span>
                <span className="shrink-0 text-gray-500 font-mono">
                  {tier.credibility}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Source credibility scores are configurable and reviewed regularly.
            Diverse sourcing helps counter individual source biases.
          </p>
        </Section>

        {/* === Human-in-the-Loop === */}
        <Section title="Human-in-the-Loop" id="human-review">
          <p>
            AI is powerful at pattern detection but unreliable at judgment. Every
            signal classified by our AI agents passes through human review
            before reaching the public:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              <strong>Signal review</strong> — Volunteer reviewers verify that
              each classified signal is relevant and correctly categorized.
            </li>
            <li>
              <strong>Graph review</strong> — Admins approve or reject proposals
              to add new risks, solutions, or connections to the knowledge
              graph.
            </li>
            <li>
              <strong>Score validation</strong> — Proposed changes to risk
              scores and narratives are reviewed before applying.
            </li>
          </ul>
          <p>
            This human-in-the-loop approach ensures that our observatory is more
            than AI-generated noise — it is curated intelligence.
          </p>
        </Section>

        {/* === Get Involved === */}
        <Section title="Get Involved" id="get-involved">
          <p>AI 4 Society is a volunteer-driven project. Here is how to help:</p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>
              <strong>Browse and vote</strong> — Visit the{" "}
              <button
                onClick={() => navigate("/observatory")}
                className="text-[var(--accent-structural)] hover:underline"
              >
                Observatory
              </button>{" "}
              and upvote or downvote risks and solutions to shape community
              perception scores.
            </li>
            <li>
              <strong>Sign in</strong> —{" "}
              {user ? (
                <span className="text-green-400">
                  You are signed in. You can vote.
                </span>
              ) : (
                <button
                  onClick={signIn}
                  className="text-[var(--accent-structural)] hover:underline"
                >
                  Sign in with Google
                </button>
              )}{" "}
              to become a Member and unlock voting.
            </li>
            <li>
              <strong>Apply to review</strong> — Members can request reviewer
              access to help verify AI-classified signals.
            </li>
          </ol>
        </Section>

        {/* === Data & Privacy === */}
        <Section title="Data & Privacy" id="privacy">
          <p>
            We take data responsibility seriously:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              Approved signals are retained for 90 days, then archived. Archived
              signals are deleted after 1 year.
            </li>
            <li>Rejected signals are deleted within 30 days.</li>
            <li>
              Individual votes are private — only aggregate counts are shown
              publicly.
            </li>
            <li>
              We collect only what Google OAuth provides (name, email, photo). No
              tracking pixels, no analytics beyond basic Firebase usage.
            </li>
            <li>
              All source data is publicly available — we surface and classify it,
              we do not create it.
            </li>
          </ul>
        </Section>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/About.tsx
git commit -m "feat(about): add About page with mission, methodology, sources, and privacy sections"
```

---

## Chunk 4: Observatory — Graph View, Detail Panel, Voting

### Task 11: Create NodeTypeFilter

**Files:**
- Create: `src/components/observatory/NodeTypeFilter.tsx`

Toggle filter for graph node types (risk, solution, stakeholder, milestone). Used by GraphView and TimelineView.

- [ ] **Step 1: Create NodeTypeFilter**

```typescript
// src/components/observatory/NodeTypeFilter.tsx
import type { NodeType } from "../../types/graph";

interface NodeTypeFilterProps {
  active: Set<NodeType>;
  onChange: (types: Set<NodeType>) => void;
}

const NODE_TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: "risk", label: "Risks", color: "bg-red-500" },
  { type: "solution", label: "Solutions", color: "bg-green-500" },
  { type: "stakeholder", label: "Stakeholders", color: "bg-blue-500" },
  { type: "milestone", label: "Milestones", color: "bg-yellow-500" },
];

export default function NodeTypeFilter({
  active,
  onChange,
}: NodeTypeFilterProps) {
  const toggle = (type: NodeType) => {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      {NODE_TYPES.map(({ type, label, color }) => (
        <button
          key={type}
          onClick={() => toggle(type)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
            active.has(type)
              ? "border-white/30 text-white"
              : "border-white/10 text-gray-600"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${color} ${
              active.has(type) ? "opacity-100" : "opacity-30"
            }`}
          />
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/NodeTypeFilter.tsx
git commit -m "feat(observatory): add NodeTypeFilter toggle component"
```

---

### Task 12: Create GraphView

**Files:**
- Create: `src/components/observatory/GraphView.tsx`

Interactive node-edge visualization using react-force-graph-2d. Reads from GraphContext's snapshot. Color-coded by node type. Click a node to select it (triggers parent callback). Highlights user's preference nodes.

- [ ] **Step 1: Create GraphView**

```typescript
// src/components/observatory/GraphView.tsx
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import NodeTypeFilter from "./NodeTypeFilter";
import type { NodeType, GraphSnapshot } from "../../types/graph";

interface GraphViewProps {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

interface ForceNode {
  id: string;
  name: string;
  type: NodeType;
  val: number;
  color: string;
  isPreference: boolean;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

const TYPE_COLORS: Record<NodeType, string> = {
  risk: "#ef4444",
  solution: "#22c55e",
  stakeholder: "#3b82f6",
  milestone: "#eab308",
};

function buildGraphData(
  snapshot: GraphSnapshot,
  activeTypes: Set<NodeType>,
  preferenceIds: Set<string>
): { nodes: ForceNode[]; links: GraphLink[] } {
  const nodeIds = new Set<string>();

  const nodes: ForceNode[] = snapshot.nodes
    .filter((n) => activeTypes.has(n.type))
    .map((n) => {
      nodeIds.add(n.id);
      const isPreference = preferenceIds.has(n.id);
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        val: isPreference ? 6 : 3,
        color: TYPE_COLORS[n.type],
        isPreference,
      };
    });

  const links: GraphLink[] = snapshot.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      source: e.from,
      target: e.to,
      relationship: e.relationship,
    }));

  return { nodes, links };
}

export default function GraphView({
  selectedNodeId,
  onSelectNode,
}: GraphViewProps) {
  const { snapshot, loading } = useGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ centerAt: (x: number, y: number, ms: number) => void; zoom: (z: number, ms: number) => void }>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    () => new Set<NodeType>(["risk", "solution", "stakeholder", "milestone"])
  );

  const prefs = getLocalPreferences();
  const preferenceIds = useMemo(
    () => new Set(prefs.interests),
    [prefs.interests]
  );

  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [], links: [] };
    return buildGraphData(snapshot, activeTypes, preferenceIds);
  }, [snapshot, activeTypes, preferenceIds]);

  // Resize observer for responsive canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id) onSelectNode(String(node.id));
    },
    [onSelectNode]
  );

  const paintNode = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D) => {
      const { x, y } = node as ForceNode & { x: number; y: number };
      const isSelected = node.id === selectedNodeId;
      const radius = node.isPreference ? 6 : isSelected ? 7 : 4;

      // Glow for selected/preference nodes
      if (isSelected || node.isPreference) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle =
          node.color + (isSelected ? "60" : "30");
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? "#ffffff" : node.color;
      ctx.fill();

      // Label for selected node
      if (isSelected) {
        ctx.font = "3px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(node.name, x, y + radius + 5);
      }
    },
    [selectedNodeId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-gray-500 text-xs animate-pulse">
          Loading graph...
        </span>
      </div>
    );
  }

  if (!snapshot || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-gray-500 text-xs">
          No graph data available yet.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <NodeTypeFilter active={activeTypes} onChange={setActiveTypes} />
      <div
        ref={containerRef}
        className="relative rounded-lg border border-white/10 bg-black/50 overflow-hidden"
        style={{ height: "calc(100vh - 220px)", minHeight: 400 }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={paintNode as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
          nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
            const { x, y } = node as { x: number; y: number };
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={handleNodeClick as (node: object) => void}
          linkColor={() => "rgba(255,255,255,0.08)"}
          linkWidth={0.5}
          linkLabel={(link: object) => (link as GraphLink).relationship}
          backgroundColor="transparent"
          cooldownTicks={100}
          onEngineStop={() => {
            if (fgRef.current) {
              fgRef.current.zoom(1.5, 400);
            }
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS (may need type adjustments for react-force-graph-2d — if `ForceGraph2D` types are missing, add `// @ts-expect-error no types` before the import or install `@types/react-force-graph-2d` if available)

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/GraphView.tsx
git commit -m "feat(observatory): add GraphView with react-force-graph-2d visualization"
```

---

### Task 13: Create VoteButton and PerceptionGap

**Files:**
- Create: `src/components/observatory/VoteButton.tsx`
- Create: `src/components/observatory/PerceptionGap.tsx`

VoteButton: upvote/downvote UI that calls voteClient.castVote. Shows current user's vote state. Requires authentication. PerceptionGap: visual bar comparing expert severity vs community vote ratio.

- [ ] **Step 1: Create VoteButton**

```typescript
// src/components/observatory/VoteButton.tsx
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";
import { voteClient } from "../../data";

interface VoteButtonProps {
  nodeId: string;
  voteUp: number;
  voteDown: number;
}

export default function VoteButton({
  nodeId,
  voteUp,
  voteDown,
}: VoteButtonProps) {
  const { user, signIn } = useAuth();
  const [userVote, setUserVote] = useState<1 | -1 | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setUserVote(null);
      return;
    }
    voteClient.getUserVote(nodeId).then((v) => {
      setUserVote(v?.value ?? null);
    });
  }, [user, nodeId]);

  const cast = useCallback(
    async (value: 1 | -1) => {
      if (!user) {
        signIn();
        return;
      }
      setSubmitting(true);
      try {
        await voteClient.castVote(nodeId, value);
        setUserVote(value);
      } catch (err) {
        console.error("Vote failed:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [user, nodeId, signIn]
  );

  const total = voteUp + voteDown;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => cast(1)}
        disabled={submitting}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
          userVote === 1
            ? "border-green-500/50 bg-green-500/10 text-green-400"
            : "border-white/10 text-gray-500 hover:border-white/30"
        }`}
      >
        ▲ {voteUp}
      </button>
      <button
        onClick={() => cast(-1)}
        disabled={submitting}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
          userVote === -1
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-white/10 text-gray-500 hover:border-white/30"
        }`}
      >
        ▼ {voteDown}
      </button>
      {!user && (
        <span className="text-[10px] text-gray-600">Sign in to vote</span>
      )}
      {total > 0 && (
        <span className="text-[10px] text-gray-600">{total} votes</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PerceptionGap**

```typescript
// src/components/observatory/PerceptionGap.tsx

interface PerceptionGapProps {
  expertSeverity: number; // 0-100
  voteUp: number;
  voteDown: number;
}

export default function PerceptionGap({
  expertSeverity,
  voteUp,
  voteDown,
}: PerceptionGapProps) {
  const total = voteUp + voteDown;
  // Community sentiment: ratio of upvotes as 0-100 scale
  const communityScore = total > 0 ? Math.round((voteUp / total) * 100) : 50;
  const gap = Math.abs(expertSeverity - communityScore);

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
        Perception Gap
      </h4>

      {/* Expert bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 shrink-0">Expert</span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${expertSeverity}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">
          {expertSeverity}
        </span>
      </div>

      {/* Community bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 shrink-0">
          Community
        </span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent-structural)] rounded-full transition-all"
            style={{ width: `${communityScore}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">
          {communityScore}
        </span>
      </div>

      {gap > 20 && (
        <p className="text-[10px] text-yellow-500">
          {gap}-point gap between expert assessment and community perception
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/observatory/VoteButton.tsx src/components/observatory/PerceptionGap.tsx
git commit -m "feat(observatory): add VoteButton and PerceptionGap components"
```

---

### Task 14: Create EvidenceList

**Files:**
- Create: `src/components/observatory/EvidenceList.tsx`

Shows approved signals related to a specific node, sorted by impact_score. Uses signalClient to fetch.

- [ ] **Step 1: Create EvidenceList**

```typescript
// src/components/observatory/EvidenceList.tsx
import { useEffect, useState } from "react";
import { signalClient } from "../../data";
import type { Signal } from "../../types/signal";

interface EvidenceListProps {
  nodeId: string;
}

export default function EvidenceList({ nodeId }: EvidenceListProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    signalClient
      .getSignals({
        nodeId,
        status: "approved",
        orderBy: "impact_score",
        limit: 10,
      })
      .then(setSignals)
      .catch((err) => console.error("EvidenceList error:", err))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading) {
    return (
      <div className="text-[10px] text-gray-600 py-2">Loading evidence...</div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 py-2">
        No approved signals yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
        Evidence ({signals.length})
      </h4>
      {signals.map((s) => (
        <a
          key={s.id}
          href={s.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white/5 border border-white/10 rounded p-2 hover:bg-white/[0.08] transition-colors"
        >
          <div className="text-xs font-medium leading-snug mb-1">
            {s.title}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{s.source_name}</span>
            {s.published_date && (
              <span>{new Date(s.published_date).toLocaleDateString()}</span>
            )}
            <span className="ml-auto font-mono">
              {(s.impact_score * 100).toFixed(0)}%
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/EvidenceList.tsx
git commit -m "feat(observatory): add EvidenceList showing approved signals for a node"
```

---

### Task 15: Create DetailPanel

**Files:**
- Create: `src/components/observatory/DetailPanel.tsx`

Side panel that opens when a node is clicked. Shows node name, type badge, narrative summary with deep dive toggle, connected nodes (clickable), evidence feed, timeline projection, perception gap, and vote button.

- [ ] **Step 1: Create DetailPanel**

```typescript
// src/components/observatory/DetailPanel.tsx
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { graphClient } from "../../data";
import { useGraph } from "../../store/GraphContext";
import EvidenceList from "./EvidenceList";
import PerceptionGap from "./PerceptionGap";
import VoteButton from "./VoteButton";
import type { GraphNode, Edge, NodeType } from "../../types/graph";

interface DetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

const TYPE_BADGES: Record<NodeType, { label: string; color: string }> = {
  risk: { label: "Risk", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  solution: { label: "Solution", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  stakeholder: { label: "Stakeholder", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  milestone: { label: "Milestone", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

export default function DetailPanel({
  nodeId,
  onClose,
  onNavigate,
}: DetailPanelProps) {
  const { summaries, snapshot } = useGraph();
  const [node, setNode] = useState<GraphNode | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeepDive, setShowDeepDive] = useState(false);

  const summary = summaries.find((s) => s.node_id === nodeId);

  useEffect(() => {
    setLoading(true);
    setShowDeepDive(false);
    Promise.all([graphClient.getNode(nodeId), graphClient.getEdges(nodeId)])
      .then(([n, e]) => {
        setNode(n);
        setEdges(e);
      })
      .catch((err) => console.error("DetailPanel error:", err))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading) {
    return (
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto p-4"
      >
        <div className="text-gray-500 text-xs animate-pulse">Loading...</div>
      </motion.div>
    );
  }

  if (!node) {
    return (
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto p-4"
      >
        <button onClick={onClose} className="text-xs text-gray-400 mb-4">
          ← Back
        </button>
        <div className="text-gray-500 text-xs">Node not found.</div>
      </motion.div>
    );
  }

  const badge = TYPE_BADGES[node.type];
  const hasNarrative = "summary" in node && (node as { summary?: string }).summary;
  const nodeData = node as Record<string, unknown>;
  const deepDive = (nodeData.deep_dive as string) ?? "";
  const narrativeSummary = (nodeData.summary as string) ?? "";
  const timelineNarrative = nodeData.timeline_narrative as
    | { near_term: string; mid_term: string; long_term: string }
    | undefined;

  // Connected nodes from edges, with names resolved from snapshot
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (snapshot) {
      for (const n of snapshot.nodes) map.set(n.id, n.name);
    }
    return map;
  }, [snapshot]);

  const connectedNodes = edges.map((e) => {
    const isOutgoing = e.from_node === nodeId;
    const otherId = isOutgoing ? e.to_node : e.from_node;
    return {
      id: otherId,
      name: nodeNameMap.get(otherId) ?? otherId,
      relationship: e.relationship,
      direction: isOutgoing ? "out" : "in",
    };
  });

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto"
    >
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-white mb-2 block"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold leading-tight">{node.name}</h2>
            <span
              className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${badge.color}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Summary */}
        {hasNarrative && (
          <div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {narrativeSummary}
            </p>
            {deepDive && (
              <div className="mt-2">
                <button
                  onClick={() => setShowDeepDive(!showDeepDive)}
                  className="text-[10px] text-[var(--accent-structural)] hover:underline"
                >
                  {showDeepDive ? "Hide deep dive ▲" : "Show deep dive ▼"}
                </button>
                {showDeepDive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-line"
                  >
                    {deepDive}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Voting (risks and solutions only) */}
        {(node.type === "risk" || node.type === "solution") && summary && (
          <VoteButton
            nodeId={nodeId}
            voteUp={summary.vote_up}
            voteDown={summary.vote_down}
          />
        )}

        {/* Perception Gap (risks only) */}
        {node.type === "risk" && summary && (
          <PerceptionGap
            expertSeverity={(nodeData.expert_severity as number) ?? 50}
            voteUp={summary.vote_up}
            voteDown={summary.vote_down}
          />
        )}

        {/* Timeline Projection */}
        {timelineNarrative && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Timeline Projection
            </h4>
            {(["near_term", "mid_term", "long_term"] as const).map((period) => {
              const text = timelineNarrative[period];
              if (!text) return null;
              const labels = {
                near_term: "Near Term",
                mid_term: "Mid Term",
                long_term: "Long Term",
              };
              return (
                <div key={period} className="bg-white/5 rounded p-2">
                  <span className="text-[10px] text-gray-500 font-medium">
                    {labels[period]}
                  </span>
                  <p className="text-xs text-gray-300 mt-0.5">{text}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Connected Nodes */}
        {/* Connected Nodes */}
        {connectedNodes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Connected ({connectedNodes.length})
            </h4>
            <div className="space-y-1">
              {connectedNodes.map((cn) => (
                <button
                  key={`${cn.id}-${cn.relationship}`}
                  onClick={() => onNavigate(cn.id)}
                  className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-white/5 hover:bg-white/[0.08] transition-colors"
                >
                  <span className="text-gray-500 text-[10px] italic shrink-0">
                    {cn.direction === "out" ? cn.relationship : `← ${cn.relationship}`}
                  </span>
                  <span className="text-[var(--accent-structural)] truncate">
                    {cn.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Related Milestones (highlighted separately) */}
        {connectedNodes.filter((cn) => {
          const snapshotNode = snapshot?.nodes.find((n) => n.id === cn.id);
          return snapshotNode?.type === "milestone";
        }).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Related Milestones
            </h4>
            <div className="space-y-1">
              {connectedNodes
                .filter((cn) => {
                  const snapshotNode = snapshot?.nodes.find((n) => n.id === cn.id);
                  return snapshotNode?.type === "milestone";
                })
                .map((cn) => (
                  <button
                    key={cn.id}
                    onClick={() => onNavigate(cn.id)}
                    className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-yellow-500/5 border border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                  >
                    <span className="text-yellow-400">⬢</span>
                    <span className="text-yellow-300">{cn.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        {(node.type === "risk" || node.type === "solution") && (
          <EvidenceList nodeId={nodeId} />
        )}

        {/* Signal count summary */}
        {summary && (
          <div className="text-[10px] text-gray-600 pt-2 border-t border-white/5">
            {summary.signal_count_7d} signals this week ·{" "}
            {summary.signal_count_30d} this month ·{" "}
            <span
              className={
                summary.trending === "rising"
                  ? "text-red-400"
                  : summary.trending === "declining"
                    ? "text-green-400"
                    : ""
              }
            >
              {summary.trending}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/DetailPanel.tsx
git commit -m "feat(observatory): add DetailPanel with narrative, voting, evidence, and connections"
```

---

## Chunk 5: Observatory — Timeline, Assembly, Build Verification

### Task 16: Create ObservatoryTimeline

**Files:**
- Create: `src/components/observatory/ObservatoryTimeline.tsx`

Chronological view of milestones + high-impact signals. Filterable by node type. This is a new v2 timeline — distinct from the v1 CRT-style `dashboard/TimelineView.tsx`.

- [ ] **Step 1: Create ObservatoryTimeline**

```typescript
// src/components/observatory/ObservatoryTimeline.tsx
import { useMemo, useState } from "react";
import { useGraph } from "../../store/GraphContext";
import NodeTypeFilter from "./NodeTypeFilter";
import type { NodeType, FeedItem } from "../../types/graph";

interface ObservatoryTimelineProps {
  onSelectNode: (nodeId: string) => void;
}

function groupByMonth(items: FeedItem[]): Map<string, FeedItem[]> {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const key = item.published_date
      ? item.published_date.slice(0, 7)
      : "Unknown";
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  return groups;
}

function formatMonth(key: string): string {
  if (key === "Unknown") return "Unknown Date";
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ObservatoryTimeline({
  onSelectNode,
}: ObservatoryTimelineProps) {
  const { feedItems, loading } = useGraph();
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    () => new Set<NodeType>(["risk", "solution", "milestone"])
  );

  // Filter feed items: milestones always shown, signals filtered by related node types
  const filtered = useMemo(() => {
    return [...feedItems]
      .filter((item) => {
        if (item.type === "milestone") return activeTypes.has("milestone");
        // For signals, we show them if "risk" or "solution" is active
        return activeTypes.has("risk") || activeTypes.has("solution");
      })
      .sort(
        (a, b) =>
          new Date(b.published_date).getTime() -
          new Date(a.published_date).getTime()
      );
  }, [feedItems, activeTypes]);

  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs animate-pulse">
        Loading timeline...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NodeTypeFilter active={activeTypes} onChange={setActiveTypes} />

      {filtered.length === 0 && (
        <div className="py-8 text-center text-gray-500 text-xs">
          No timeline items match your filters.
        </div>
      )}

      <div className="space-y-6">
        {[...grouped.entries()].map(([month, items]) => (
          <div key={month}>
            <h3 className="text-xs font-semibold text-gray-400 mb-2 sticky top-14 bg-[var(--bg-primary)] py-1 z-10">
              {formatMonth(month)}
            </h3>
            <div className="space-y-2 pl-4 border-l border-white/10">
              {items.map((item) => {
                const isMilestone = item.type === "milestone";
                return (
                  <div
                    key={item.id}
                    className={`relative pl-4 py-2 ${
                      isMilestone ? "bg-yellow-500/5 rounded" : ""
                    }`}
                  >
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-[21px] top-3 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-primary)] ${
                        isMilestone ? "bg-yellow-500" : "bg-white/30"
                      }`}
                    />

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-[10px] uppercase tracking-wider ${
                            isMilestone ? "text-yellow-400" : "text-gray-600"
                          }`}
                        >
                          {isMilestone ? "Milestone" : "Signal"}
                        </span>
                        <h4 className="text-sm font-medium leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                          {item.summary}
                        </p>
                        {item.related_node_ids.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {item.related_node_ids.slice(0, 3).map((id) => (
                              <button
                                key={id}
                                onClick={() => onSelectNode(id)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--accent-structural)] hover:bg-white/10"
                              >
                                {id}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-600 shrink-0">
                        {item.published_date
                          ? new Date(item.published_date).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/ObservatoryTimeline.tsx
git commit -m "feat(observatory): add ObservatoryTimeline chronological view"
```

---

### Task 17: Rewrite Observatory page

**Files:**
- Modify: `src/pages/Observatory.tsx`

Complete rewrite: three-tab layout (Graph / Timeline / v1 Agents), graph visualization with detail panel, deep linking via `:nodeId` URL param. The v1 agent dashboard is preserved as a third tab for admin users.

- [ ] **Step 1: Rewrite Observatory page**

Replace `src/pages/Observatory.tsx` with:

```typescript
// src/pages/Observatory.tsx
import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "../components/shared/Layout";
import GraphView from "../components/observatory/GraphView";
import DetailPanel from "../components/observatory/DetailPanel";
import ObservatoryTimeline from "../components/observatory/ObservatoryTimeline";
import { useGraph } from "../store/GraphContext";

type Tab = "graph" | "timeline";

export default function Observatory() {
  const { nodeId: urlNodeId } = useParams<{ nodeId?: string }>();
  const navigate = useNavigate();
  const { snapshot, loading } = useGraph();
  const [activeTab, setActiveTab] = useState<Tab>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    urlNodeId ?? null
  );

  // Sync URL param to state
  useEffect(() => {
    if (urlNodeId) setSelectedNodeId(urlNodeId);
  }, [urlNodeId]);

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      // Update URL for deep linking (without full navigation)
      if (id) {
        navigate(`/observatory/${id}`, { replace: true });
      } else {
        navigate("/observatory", { replace: true });
      }
    },
    [navigate]
  );

  const handleNavigateNode = useCallback(
    (id: string) => {
      setSelectedNodeId(id);
      navigate(`/observatory/${id}`, { replace: true });
    },
    [navigate]
  );

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

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-96">
            <span className="text-gray-500 text-xs animate-pulse">
              Loading observatory...
            </span>
          </div>
        )}

        {/* Tab content */}
        {!loading && activeTab === "graph" && (
          <GraphView
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        )}

        {!loading && activeTab === "timeline" && (
          <ObservatoryTimeline onSelectNode={handleNavigateNode} />
        )}
      </div>

      {/* Detail Panel (overlay) */}
      <AnimatePresence>
        {selectedNodeId && (
          <DetailPanel
            key={selectedNodeId}
            nodeId={selectedNodeId}
            onClose={() => handleSelectNode(null)}
            onNavigate={handleNavigateNode}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
```

**Key design decisions:**
- Two tabs: Graph and Timeline. The v1 agent diagnostics view is being moved to the Admin panel in Plan 4 — it was incorrectly placed in the public Observatory in v1.
- Deep linking via `/observatory/:nodeId` — URL updates when a node is selected.
- Detail panel is a right-side overlay, not a separate page.
- No authentication required for browsing. Voting requires sign-in (handled by VoteButton internally).

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/Observatory.tsx
git commit -m "feat(observatory): rewrite with graph visualization, detail panel, and timeline tabs"
```

---

### Task 18: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`
Expected: PASS — no TypeScript errors

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`

Manual verification:
1. `/` — hero page loads with globe, risk badges row visible, news feed section below
2. `/about` — all 7 sections render
3. `/observatory` — graph visualization loads with colored nodes, can click nodes
4. `/observatory/R01` — deep link opens with R01 selected and detail panel open
5. `/dashboard` — v1 timeline still works
6. Navigation between pages works, auth sign-in/out works

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src/
git commit -m "fix: resolve build issues from v2 frontend public integration"
```

---

## Summary

| Chunk | Tasks | What it builds |
|-------|-------|---------------|
| 1: Foundation | 1-5 | react-force-graph-2d, GraphContext, Layout, PreferencePicker, AuthGate, routing |
| 2: Landing | 6-9 | FeedCard, NewsFeed, RiskBadges, BadgeDrawer, HeroPage update |
| 3: About | 10 | About page with 7 content sections |
| 4: Observatory core | 11-15 | NodeTypeFilter, GraphView, VoteButton, PerceptionGap, EvidenceList, DetailPanel |
| 5: Observatory assembly | 16-18 | ObservatoryTimeline, Observatory page rewrite, build verification |
