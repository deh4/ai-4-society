# Landing Page & Observatory Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove TheRadar from the landing page, add it as a sidebar in Observatory with responsive 3-column layout, and add featured images with halftone masking to the FeaturedStory carousel.

**Architecture:** Two independent features sharing the `dev` branch. Feature 1 is frontend-only (move risk list from landing to Observatory). Feature 2 spans the full stack — backend image extraction in Signal Scout, propagation through Feed Curator, Imagen 3 Fast fallback on approval, and frontend halftone-masked carousel backgrounds.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4, Framer Motion, Firebase Cloud Functions, Vertex AI (Imagen 3 Fast), Firebase Storage, `rss-parser`, SVG masks.

**Spec:** `docs/superpowers/specs/2026-03-22-landing-observatory-optimization-design.md`

---

## File Map

### Feature 1: Observatory Risks Sidebar

| File | Action | Responsibility |
|---|---|---|
| `src/components/landing/TheRadar.tsx` | Delete | No longer used anywhere |
| `src/pages/HeroPage.tsx` | Edit | Remove TheRadar import and render |
| `src/components/observatory/RisksSidebar.tsx` | Create | Ranked node list for Observatory sidebar |
| `src/pages/Observatory.tsx` | Edit | 3-column desktop, drawer + bottom sheet mobile |
| `src/components/observatory/DetailPanel.tsx` | Edit | Add `mode` prop for bottom sheet rendering |

### Feature 2: Featured Images with Halftone Masking

| File | Action | Responsibility |
|---|---|---|
| `functions/src/signal-scout/fetcher.ts` | Edit | Add `image_url` to `RawArticle`, extract from RSS enclosure + OG meta |
| `functions/src/agents/signal-scout/classifier.ts` | Edit | Thread `image_url` through `ClassifiedSignal` (v2 agent classifier) |
| `functions/src/agents/signal-scout/store.ts` | Edit | Persist `image_url` to Firestore (v2 agent store) |
| `functions/src/agents/feed-curator/index.ts` | Edit | Copy `image_url` to editorial hooks + add Firestore trigger |
| `functions/src/agents/feed-curator/generateImage.ts` | Create | Imagen 3 Fast fallback via Vertex AI REST API |
| `src/types/editorial.ts` | Edit | Add `image_url?: string` to `EditorialHook` |
| `src/components/landing/HalftoneMask.tsx` | Create | Reusable SVG halftone dot mask |
| `src/components/landing/FeaturedStory.tsx` | Edit | Background image layer with halftone mask |
| `README.md` | Edit | Update to reflect new features |

> **Note on legacy files:** `functions/src/signal-scout/store.ts` and its sibling `classifier.ts` are legacy files from the v1 pipeline. The active v2 pipeline uses `functions/src/agents/signal-scout/store.ts` and `functions/src/agents/signal-scout/classifier.ts`. The spec incorrectly references the legacy store path — this plan targets the correct v2 files. Legacy files are left as-is (unused by active pipeline).


---

## Task 1: Remove TheRadar from Landing Page

**Files:**
- Edit: `src/pages/HeroPage.tsx`
- Delete: `src/components/landing/TheRadar.tsx`

- [ ] **Step 1: Edit HeroPage.tsx — remove TheRadar**

Remove the import on line 5 and the `<TheRadar />` render on line 31:

```tsx
// src/pages/HeroPage.tsx
import { Helmet } from "react-helmet-async";
import Layout from "../components/shared/Layout";
import FeaturedStory from "../components/landing/FeaturedStory";
import TrustFooter from "../components/landing/TrustFooter";

export default function HeroPage() {
  return (
    <Layout>
      <Helmet>
        {/* ... existing meta tags unchanged ... */}
      </Helmet>

      <div className="max-w-2xl mx-auto px-4">
        <FeaturedStory />
        <TrustFooter />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Delete TheRadar.tsx**

```bash
rm src/components/landing/TheRadar.tsx
```

- [ ] **Step 3: Verify no other imports of TheRadar exist**

```bash
grep -r "TheRadar" src/ --include="*.tsx" --include="*.ts"
```

Expected: no results.

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HeroPage.tsx
git add src/components/landing/TheRadar.tsx  # stages deletion
git commit -m "feat: remove TheRadar from landing page

Prepares for Observatory sidebar migration.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create RisksSidebar Component

**Files:**
- Create: `src/components/observatory/RisksSidebar.tsx`

Data pattern from the deleted TheRadar: use `useGraph()` to get `snapshot` + `summaries`, filter for risk/solution nodes, sort by `score_2026` descending, show top 10 with signal count and trending indicator from summaries.

- [ ] **Step 1: Create RisksSidebar.tsx**

```tsx
// src/components/observatory/RisksSidebar.tsx
import { useGraph } from "../../store/GraphContext";

const SCORE_GRADIENT: Record<string, string> = {
  Critical: "from-red-600 to-red-500",
  High: "from-orange-600 to-orange-500",
  Medium: "from-blue-600 to-blue-500",
  Low: "from-gray-600 to-gray-500",
};

interface RisksSidebarProps {
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

export default function RisksSidebar({ selectedNodeId, onSelectNode }: RisksSidebarProps) {
  const { snapshot, summaries } = useGraph();
  if (!snapshot) return null;

  const nodes = snapshot.nodes
    .filter((n) => n.type === "risk" || n.type === "solution")
    .sort((a, b) => (b.score_2026 ?? 0) - (a.score_2026 ?? 0))
    .slice(0, 20);

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="text-[10px] uppercase tracking-[3px] text-gray-500 px-3 py-3 sticky top-0 bg-[var(--bg-primary)] z-10">
        Risk Radar
      </h3>
      <div className="flex flex-col gap-0.5 px-1">
        {nodes.map((node) => {
          const score = node.score_2026 ?? 0;
          const velocity = node.velocity ?? node.implementation_stage ?? "Medium";
          const summary = summaries.find((s) => s.node_id === node.id);
          const signalCount = summary?.signal_count_7d ?? 0;
          const trending = summary?.trending ?? "stable";
          const gradient = SCORE_GRADIENT[velocity] ?? SCORE_GRADIENT.Medium;
          const isSelected = selectedNodeId === node.id;

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                isSelected
                  ? "bg-white/10 ring-1 ring-white/20"
                  : "hover:bg-white/5"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}
              >
                {Math.round(score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-200 truncate">
                  {node.name}
                </div>
                <div className="text-[9px] text-gray-600">
                  {signalCount}sig · {velocity}
                </div>
              </div>
              <div className="text-[9px] shrink-0">
                {trending === "rising" && <span className="text-red-400">↑</span>}
                {trending === "stable" && <span className="text-gray-600">→</span>}
                {trending === "declining" && <span className="text-green-400">↓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: clean build (component created but not yet imported).

- [ ] **Step 3: Commit**

```bash
git add src/components/observatory/RisksSidebar.tsx
git commit -m "feat: create RisksSidebar component for Observatory

Ranked node list with score badges, signal counts, and trending indicators.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add Bottom Sheet Mode to DetailPanel

**Files:**
- Edit: `src/components/observatory/DetailPanel.tsx`

The current DetailPanel has two modes: `inline` (desktop side panel) and overlay (mobile full slide-in). Add a `mode` prop to support a third mode: `bottomSheet` — a Framer Motion slide-up from bottom with drag-to-dismiss.

- [ ] **Step 1: Update DetailPanel props interface**

In `src/components/observatory/DetailPanel.tsx`, replace the current interface (line 23-28):

```tsx
interface DetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  mode?: "overlay" | "inline" | "bottomSheet";
}
```

- [ ] **Step 2: Update the component signature and logic**

Replace `inline = false` destructuring (line 38-43) with:

```tsx
export default function DetailPanel({
  nodeId,
  onClose,
  onNavigate,
  mode = "overlay",
}: DetailPanelProps) {
  const isMobile = useIsMobile();
  const { summaries, snapshot } = useGraph();
```

- [ ] **Step 3: Update panelClass and panelAnim for all three modes**

Replace the panelClass/panelAnim logic (lines 52-58) with:

```tsx
  const panelClass =
    mode === "inline"
      ? "" // inline has its own wrapper
      : mode === "bottomSheet"
        ? "fixed bottom-0 left-0 right-0 h-[58vh] bg-[var(--bg-primary)] border-t border-white/10 z-40 overflow-y-auto rounded-t-2xl"
        : isMobile
          ? "fixed bottom-0 left-0 right-0 h-[58vh] bg-[var(--bg-primary)] border-t border-white/10 z-40 overflow-y-auto rounded-t-2xl"
          : "fixed right-0 top-14 h-[calc(100vh-3.5rem)] w-full sm:w-[420px] bg-[var(--bg-primary)] border-l border-white/10 z-40 overflow-y-auto";

  const panelAnim =
    mode === "bottomSheet" || isMobile
      ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
      : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } };
```

- [ ] **Step 4: Replace all `inline` references with `mode === "inline"`**

In the component body, replace every occurrence of `if (inline)` with `if (mode === "inline")`. There are 3 locations:
- Loading state (line 87): `if (inline)` → `if (mode === "inline")`
- Not-found state (line 115): `if (inline)` → `if (mode === "inline")`
- Main content render (line 332): `if (inline)` → `if (mode === "inline")`

- [ ] **Step 5: Add drag handle for bottomSheet mode**

Update the drag handle rendering (line 347-349). Replace `{isMobile && (` with:

```tsx
      {(mode === "bottomSheet" || isMobile) && (
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-1 mb-1" />
      )}
```

Also update the loading state drag handle (line 100).

- [ ] **Step 6: Update Observatory.tsx to use `mode` instead of `inline`**

In `src/pages/Observatory.tsx`, update the desktop DetailPanel (line 264-270):

```tsx
                  <DetailPanel
                    key={`inline-${selectedNodeId}`}
                    nodeId={selectedNodeId}
                    onClose={() => handleSelectNode(null)}
                    onNavigate={handleNavigateNode}
                    mode="inline"
                  />
```

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/observatory/DetailPanel.tsx src/pages/Observatory.tsx
git commit -m "feat: add mode prop to DetailPanel (overlay/inline/bottomSheet)

Replaces boolean inline prop with explicit mode for Observatory responsive layout.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Observatory 3-Column Desktop + Mobile Drawer/Bottom Sheet

**Files:**
- Edit: `src/pages/Observatory.tsx`

Convert the current 2-column `[3fr_2fr]` layout to 3-column `[240px_1fr_2fr]` with RisksSidebar on the left. On mobile: RisksSidebar in a left drawer, DetailPanel as bottom sheet.

- [ ] **Step 1: Add imports**

At the top of `src/pages/Observatory.tsx`, add:

```tsx
import { motion, AnimatePresence } from "framer-motion";  // already imported, just add motion if missing
import RisksSidebar from "../components/observatory/RisksSidebar";
```

Note: `AnimatePresence` is already imported. Add `motion` to the existing import if not present.

- [ ] **Step 2: Add drawer state**

After the existing state declarations (around line 30-32), add:

```tsx
  const [drawerOpen, setDrawerOpen] = useState(false);
```

- [ ] **Step 3: Create handleSidebarSelect callback**

After the existing `handleNavigateNode` callback (around line 81), add:

```tsx
  const handleSidebarSelect = useCallback((id: string) => {
    handleSelectNode(id);
    setDrawerOpen(false); // auto-close drawer on mobile
  }, [handleSelectNode]);
```

- [ ] **Step 4: Add hamburger button to header (mobile only)**

In the header section (around line 201-210), add a drawer toggle button before the Observatory title:

```tsx
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              {/* Mobile drawer toggle */}
              <button
                onClick={() => setDrawerOpen((o) => !o)}
                className="lg:hidden p-1.5 rounded hover:bg-white/10 transition-colors"
                aria-label="Toggle risk list"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold">Observatory</h1>
                {snapshot && (
                  <p className="text-xs text-gray-500">
                    {snapshot.nodeCount} nodes · {snapshot.edgeCount} edges
                  </p>
                )}
              </div>
            </div>
```

- [ ] **Step 5: Replace the graph tab content with 3-column layout**

Replace the current graph tab content (lines 249-274 — the `lg:grid lg:grid-cols-[3fr_2fr]` block) with:

```tsx
        {!loading && activeTab === "graph" && (
          <div className="lg:grid lg:grid-cols-[240px_1fr_2fr] gap-4">
            {/* Desktop sidebar — hidden on mobile (uses drawer instead) */}
            <div className="hidden lg:block border-r border-white/10 -mr-4 pr-0">
              <div className="h-[calc(100vh-180px)] sticky top-4">
                <RisksSidebar
                  selectedNodeId={selectedNodeId}
                  onSelectNode={handleSidebarSelect}
                />
              </div>
            </div>

            <div className="min-w-0">
              <GraphView
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                activeTypes={activeTypes}
                activePrinciples={activePrinciples}
              />
            </div>

            {/* Desktop inline panel — lg+ only */}
            <div className="hidden lg:block min-w-0">
              <AnimatePresence>
                {selectedNodeId && (
                  <DetailPanel
                    key={`inline-${selectedNodeId}`}
                    nodeId={selectedNodeId}
                    onClose={() => handleSelectNode(null)}
                    onNavigate={handleNavigateNode}
                    mode="inline"
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Replace mobile overlay with drawer + bottom sheet**

Replace the mobile overlay section at the bottom of the component (lines 282-294) with:

```tsx
      {/* Mobile left drawer — risks sidebar */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-[var(--bg-primary)] border-r border-white/10 z-40"
            >
              <RisksSidebar
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSidebarSelect}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile bottom sheet — detail panel */}
      <AnimatePresence>
        {selectedNodeId && (
          <div className="lg:hidden">
            <DetailPanel
              key={`bottomSheet-${selectedNodeId}`}
              nodeId={selectedNodeId}
              onClose={() => handleSelectNode(null)}
              onNavigate={handleNavigateNode}
              mode="bottomSheet"
            />
          </div>
        )}
      </AnimatePresence>
```

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 8: Manual test**

```bash
npm run dev
```

Verify:
- Desktop: 3-column layout with sidebar, graph, detail panel
- Mobile (resize to <1024px): drawer toggle visible, graph fills screen, bottom sheet on node tap

- [ ] **Step 9: Commit**

```bash
git add src/pages/Observatory.tsx
git commit -m "feat: Observatory 3-column layout with sidebar drawer and bottom sheet

Desktop: 240px sidebar | graph | detail panel.
Mobile: left drawer for risks, bottom sheet for details.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Add `image_url` to Signal Scout Fetcher

**Files:**
- Edit: `functions/src/signal-scout/fetcher.ts`

Add `image_url` extraction from RSS enclosure and OG meta tags.

- [ ] **Step 1: Add `image_url` to `RawArticle` interface**

In `functions/src/signal-scout/fetcher.ts`, add to the `RawArticle` interface (after line 11):

```tsx
export interface RawArticle {
  title: string;
  url: string;
  source_name: string;
  source_id: string;
  published_date: string;
  snippet?: string;
  image_url?: string;
}
```

- [ ] **Step 2: Create `extractOgImage` helper function**

Add after the `rssParser` declaration (after line 19):

```tsx
async function extractOgImage(articleUrl: string): Promise<string | undefined> {
  if (!articleUrl) return undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(articleUrl, {
      headers: { "User-Agent": "AI4Society-SignalScout/2.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return undefined;

    // Only read first 50KB to find OG tags in <head>
    const reader = res.body?.getReader();
    if (!reader) return undefined;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    // Match og:image or og:image:secure_url
    const match = html.match(
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i
    );

    if (!match?.[1]) return undefined;

    // Resolve relative URLs
    let imageUrl = match[1];
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      const base = new URL(articleUrl);
      imageUrl = `${base.origin}${imageUrl}`;
    }

    return imageUrl;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3: Update `fetchRSS` to extract enclosure + OG fallback**

Replace the `fetchRSS` function (lines 21-31):

```tsx
async function fetchRSS(source: DataSource): Promise<RawArticle[]> {
  const feed = await rssParser.parseURL(source.url);
  const articles: RawArticle[] = [];

  for (const item of feed.items ?? []) {
    // Try RSS enclosure first (common for media-rich feeds)
    let image_url = (item.enclosure as { url?: string } | undefined)?.url;

    // Fall back to OG meta tag extraction
    if (!image_url && item.link) {
      image_url = await extractOgImage(item.link);
    }

    articles.push({
      title: item.title ?? "Untitled",
      url: item.link ?? "",
      source_name: source.name,
      source_id: source.id,
      published_date: item.isoDate ?? new Date().toISOString(),
      snippet: item.contentSnippet?.slice(0, 500),
      image_url,
    });
  }

  return articles;
}
```

Note: OG extraction runs per-article sequentially to avoid overwhelming source servers. For API sources (`fetchAPI`), skip OG extraction (API results rarely have useful OG images and the volume is higher). With 5s timeouts, worst case ~50 articles × 5s = 250s, but most resolve in <1s or fail fast. The Signal Scout function has a 300s timeout, so this is acceptable.

- [ ] **Step 4: Build functions**

```bash
cd functions && npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add functions/src/signal-scout/fetcher.ts
git commit -m "feat: extract image_url from RSS enclosure and OG meta tags

Signal Scout fetcher now captures article images for downstream use.
RSS enclosure checked first, OG meta scraped as fallback (5s timeout).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Thread `image_url` Through Classifier and Store

**Files:**
- Edit: `functions/src/agents/signal-scout/classifier.ts`
- Edit: `functions/src/agents/signal-scout/store.ts`

The classifier receives `RawArticle[]` and outputs `ClassifiedSignal[]`. We need to pass `image_url` through without involving the LLM (it's metadata, not classification).

- [ ] **Step 1: Add `image_url` to `ClassifiedSignal` interface**

In `functions/src/agents/signal-scout/classifier.ts`, add to the `ClassifiedSignal` interface (after line 24):

```tsx
export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both" | "unmatched";
  related_nodes: RelatedNode[];
  related_node_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  proposed_topic?: string;
  harm_status: "incident" | "hazard" | null;
  principles: string[];
  image_url?: string;
}
```

- [ ] **Step 2: Pass `image_url` through in the classification results**

In the `classifyArticles` function, where `ClassifiedSignal` objects are constructed (two locations — unmatched signals around line 229-245 and matched signals around line 257-271), add `image_url: article.image_url` to both:

For unmatched signals (around line 229):
```tsx
          results.push({
            // ... existing fields ...
            harm_status: harmStatus,
            principles,
            image_url: article.image_url,
          });
```

For matched signals (around line 257):
```tsx
        results.push({
          // ... existing fields ...
          harm_status: harmStatus,
          principles,
          image_url: article.image_url,
        });
```

- [ ] **Step 3: Persist `image_url` in store**

In `functions/src/agents/signal-scout/store.ts`, add `image_url` to the document write (around line 66, after `doc.discovery_locked`):

```tsx
      if (signal.image_url) {
        doc.image_url = signal.image_url;
      }
```

- [ ] **Step 4: Build functions**

```bash
cd functions && npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add functions/src/agents/signal-scout/classifier.ts functions/src/agents/signal-scout/store.ts
git commit -m "feat: thread image_url through classifier and store

image_url passes from RawArticle through ClassifiedSignal to Firestore
without involving the LLM — it's metadata, not classification output.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Propagate `image_url` to Editorial Hooks

**Files:**
- Edit: `functions/src/agents/feed-curator/index.ts`
- Edit: `src/types/editorial.ts`

When the Feed Curator generates editorial hooks, copy `image_url` from the source signal.

- [ ] **Step 1: Update editorial hook generation in Feed Curator**

In `functions/src/agents/feed-curator/index.ts`, in the `generateEditorialHooks` function, add `image_url` to the `hookRef.set()` call (around line 47-60):

```tsx
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
        image_url: item.image_url ?? null,
        generated_at: FieldValue.serverTimestamp(),
        reviewed_by: null,
        reviewed_at: null,
      });
```

- [ ] **Step 2: Thread `image_url` through the feed items**

In the `buildFeed` function, where feed items are constructed from signals (around line 150-161), add `image_url`:

```tsx
    feedItems.push({
      id: d.id,
      type: "signal",
      title: data.title,
      summary: data.summary,
      source_name: data.source_name,
      source_credibility: data.source_credibility ?? 0.5,
      impact_score: rankedScore,
      related_node_ids: data.related_node_ids ?? [],
      published_date: data.published_date,
      image_url: data.image_url ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
```

- [ ] **Step 3: Update `EditorialHook` TypeScript interface**

In `src/types/editorial.ts`, add `image_url` field:

```tsx
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
  image_url?: string;
  generated_at: Timestamp | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Timestamp | null;
}
```

- [ ] **Step 4: Build both frontend and functions**

```bash
cd functions && npm run build && cd .. && npm run build
```

Expected: clean builds.

- [ ] **Step 5: Commit**

```bash
git add functions/src/agents/feed-curator/index.ts src/types/editorial.ts
git commit -m "feat: propagate image_url from signals to editorial hooks

Feed Curator copies image_url when generating hooks.
EditorialHook TypeScript interface updated.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create HalftoneMask SVG Component

**Files:**
- Create: `src/components/landing/HalftoneMask.tsx`

SVG `<defs>` block with a mask of programmatic dots. Dense at bottom, fading to transparent at top.

- [ ] **Step 1: Create HalftoneMask.tsx**

```tsx
// src/components/landing/HalftoneMask.tsx

interface HalftoneMaskProps {
  id?: string;
  rows?: number;
  cols?: number;
}

export default function HalftoneMask({
  id = "halftone-mask",
  rows = 30,
  cols = 40,
}: HalftoneMaskProps) {
  const dots: Array<{ cx: number; cy: number; r: number; opacity: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = ((col + 0.5) / cols) * 100;
      const y = ((row + 0.5) / rows) * 100;

      // Progress from top (0) to bottom (1)
      const progress = row / (rows - 1);

      // Non-linear: stay dense through bottom 60%, fade rapidly above
      // Using a power curve that gives ~1.0 from 40-100% and fades 0-40%
      const t = Math.min(1, progress / 0.6);
      const factor = t * t; // quadratic ease-in

      const maxRadius = (100 / cols) * 0.45;
      const r = maxRadius * factor;
      const opacity = factor;

      if (r > 0.05) {
        dots.push({ cx: x, cy: y, r, opacity });
      }
    }
  }

  return (
    <svg
      className="absolute inset-0 w-0 h-0"
      aria-hidden="true"
    >
      <defs>
        <mask id={id} maskContentUnits="objectBoundingBox">
          {/* Black background = fully transparent */}
          <rect width="1" height="1" fill="black" />
          {/* White circles = visible areas */}
          {dots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.cx / 100}
              cy={dot.cy / 100}
              r={dot.r / 100}
              fill="white"
              fillOpacity={dot.opacity}
            />
          ))}
        </mask>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HalftoneMask.tsx
git commit -m "feat: create HalftoneMask SVG component

Programmatic dot grid mask: dense at bottom, fading to transparent at top.
Uses maskContentUnits=objectBoundingBox for responsive scaling.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Add Background Images to FeaturedStory Carousel

**Files:**
- Edit: `src/components/landing/FeaturedStory.tsx`

Add background image layer with halftone mask to each carousel slide.

- [ ] **Step 1: Import HalftoneMask and add image error state**

At the top of `src/components/landing/FeaturedStory.tsx`, add the import:

```tsx
import HalftoneMask from "./HalftoneMask";
```

- [ ] **Step 2: Add image error tracking state**

After the `activeIndex` state (line 13), add:

```tsx
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Add the HalftoneMask SVG defs before the section**

Update the return statement. Wrap the section content. Insert `<HalftoneMask />` before the `<AnimatePresence>`:

```tsx
  const hasImage = hook.image_url && !imgErrors.has(hook.id);

  return (
    <section className="py-8 relative">
      <HalftoneMask />

      <AnimatePresence mode="wait">
        <motion.div
          key={hook.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          {/* Background image with halftone mask */}
          {hasImage && (
            <div className="absolute inset-0 -mx-4 -my-2 overflow-hidden rounded-xl">
              <img
                src={hook.image_url!}
                alt=""
                onError={() => setImgErrors((s) => new Set(s).add(hook.id))}
                className="w-full h-full object-cover"
                style={{
                  mask: "url(#halftone-mask)",
                  WebkitMask: "url(#halftone-mask)",
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                }}
              />
              {/* Dark gradient overlay for text contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent" />
            </div>
          )}

          {/* Existing content (positioned above image) */}
          <div className="relative z-10">
            {/* ... all existing content from velocity tag through CTAs ... */}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Swipe dots (unchanged) */}
```

- [ ] **Step 4: Wrap all existing content inside the `relative z-10` div**

Move all content between `<motion.div>` and `</motion.div>` (velocity tag, headline, editorial hook, evidence cards, share strip, CTAs) inside the `<div className="relative z-10">` wrapper.

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 6: Manual test**

```bash
npm run dev
```

Verify:
- Carousel slides with `image_url` show the background image with halftone dot effect
- Slides without `image_url` render as before (solid background)
- Text is readable over the masked image

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/FeaturedStory.tsx
git commit -m "feat: add halftone-masked background images to FeaturedStory carousel

Editorial hooks with image_url display as carousel backgrounds through
an SVG halftone dot mask. Falls back to solid background on missing/broken images.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Imagen 3 Fast Fallback Function

**Files:**
- Create: `functions/src/agents/feed-curator/generateImage.ts`
- Edit: `functions/src/agents/feed-curator/index.ts` (add Firestore trigger + import)
- Edit: `functions/src/index.ts` (export new trigger)

This function is called when an admin approves an editorial hook that has no `image_url`. Uses Vertex AI REST API (no new npm dependencies — `google-auth-library` is already available via `firebase-admin`).

- [ ] **Step 1: No new dependencies needed**

Imagen 3 is called via Vertex AI REST API using `google-auth-library` (already available via `firebase-admin`). No additional npm packages required.

- [ ] **Step 2: Create generateImage.ts**

Imagen 3 is NOT a generative text model — it uses the Vertex AI `predict` endpoint, not `generateContent`. Use the REST API directly.

```tsx
// functions/src/agents/feed-curator/generateImage.ts
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const LOCATION = "us-central1";
const MODEL = "imagen-3.0-fast-generate-001";
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export async function generateEditorialImage(
  hookId: string,
  title: string,
  hookText: string,
): Promise<string | null> {
  try {
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    const prompt = `Editorial illustration for a news article about AI and society: "${title}". ${hookText}. Style: abstract, modern, dark moody color palette.`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          outputOptions: { mimeType: "image/webp" },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`Imagen API error (${res.status}): ${errText}`);
      return null;
    }

    const data = await res.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
    };

    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!imageBase64) {
      logger.warn(`No image generated for hook ${hookId}`);
      return null;
    }

    // Upload to Firebase Storage
    const bucket = getStorage().bucket();
    const filePath = `editorial-images/${hookId}.webp`;
    const file = bucket.file(filePath);

    const buffer = Buffer.from(imageBase64, "base64");
    await file.save(buffer, {
      contentType: "image/webp",
      metadata: { cacheControl: "public, max-age=31536000" },
    });

    // Make file publicly readable for a permanent URL (no expiry)
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Write back to editorial hook
    const db = getFirestore();
    await db.collection("editorial_hooks").doc(hookId).update({
      image_url: url,
    });

    logger.info(`Generated and stored image for hook ${hookId}`);
    return url;
  } catch (err) {
    logger.error(`Failed to generate image for hook ${hookId}:`, err);
    return null;
  }
}
```

- [ ] **Step 3: Wire into editorial hook approval**

Find the editorial hook approval flow. Check `src/data/editorial.ts` — the `updateEditorialStatus` function updates status to "approved". The Imagen generation should be triggered server-side. Add a call in the approval function or create a Firestore trigger.

The simplest approach: add a Firestore `onDocumentUpdated` trigger in `functions/src/agents/feed-curator/index.ts`:

```tsx
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { generateEditorialImage } from "./generateImage.js";

export const onEditorialHookApproved = onDocumentUpdated(
  {
    document: "editorial_hooks/{hookId}",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only trigger when status changes to "approved" and no image_url exists
    if (before.status !== "approved" && after.status === "approved" && !after.image_url) {
      logger.info(`Editorial hook ${event.params.hookId} approved without image, generating...`);
      await generateEditorialImage(
        event.params.hookId,
        after.signal_title as string,
        after.hook_text as string,
      );
    }
  }
);
```

- [ ] **Step 4: Export the new trigger from functions/src/index.ts**

Add the export for `onEditorialHookApproved` in `functions/src/index.ts`:

```tsx
export { scheduledFeedCurator, triggerFeedCurator, onEditorialHookApproved } from "./agents/feed-curator/index.js";
```

- [ ] **Step 5: Build functions**

```bash
cd functions && npm run build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add functions/src/agents/feed-curator/generateImage.ts functions/src/agents/feed-curator/index.ts functions/src/index.ts
git commit -m "feat: add Imagen 3 Fast fallback for editorial hook images

Generates images via Vertex AI REST API when editorial hooks are approved
without an image_url. Stores in Firebase Storage, writes URL back to hook.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Update README + Final Build, Lint, and Deploy Check

**Files:**
- Edit: `README.md` (per CLAUDE.md docs rule — new features must be reflected)

- [ ] **Step 1: Update README.md**

Update to reflect:
- Observatory now has 3-column layout with Risk Radar sidebar
- Landing page simplified to FeaturedStory carousel + TrustFooter
- Signal Scout extracts article images (RSS enclosure + OG meta)
- Imagen 3 Fast generates fallback images for editorial hooks
- FeaturedStory carousel uses halftone-masked background images

- [ ] **Step 2: Full frontend build**

```bash
npm run build
```

- [ ] **Step 2: Full functions build**

```bash
cd functions && npm run build
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Verify:
- Landing page shows only FeaturedStory + TrustFooter (no TheRadar)
- Observatory desktop: 3-column with RisksSidebar, graph, detail panel
- Observatory mobile: hamburger opens left drawer, node tap opens bottom sheet
- FeaturedStory carousel shows halftone-masked images (if image_url available on hooks)

- [ ] **Step 5: Commit any final fixes**

- [ ] **Step 7: Set up Storage rules for editorial-images/**

Ensure Firebase Storage has a rule allowing public read for `editorial-images/`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /editorial-images/{imageId} {
      allow read;  // public images
      allow write: if false;  // only admin SDK writes
    }
  }
}
```

- [ ] **Step 8: Deploy functions (if approved by user)**

```bash
firebase use dev && firebase deploy --only functions,storage
```

Note: Frontend deployment happens automatically via CI on push to `dev`.
