# Landing Page Redesign — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Goal:** Redesign the landing page to maximize emotional engagement and viral shareability for a general audience, while maintaining evidence-based credibility.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Emotional tone | Story + Pulse hybrid (C+B) | Human story hook with live urgency indicators. Simulated A/B/C showed highest scroll-stop power and shareability for general audience. |
| 3D globe | Shrink to 28px spinning nav logo | Brand identity on every page. Keeps the "alive" feeling (rotation + blips) without dominating layout or slowing load. |
| Disclaimer modal | First-visit dismissible banner | Users already see risk data on landing. Modal is a speed bump; banner is a one-time notice. localStorage persistence. |
| Desktop layout | Centered column (~700px max) | Viral path is mobile-first. Centered column looks identical on both. Avoids split-attention sidebars. |
| Preference picker | Removed from landing, moves to post-registration onboarding | Not in scope for this spec. Landing page is editorially driven, not personalized. |
| Featured story content | Real signal headline + agent-generated, reviewer-approved editorial hook | Preserves evidence chain. No fabricated narratives. Editorial hook adds accessibility without breaking trust. |
| Latest Signals section | Dropped | The Radar (ranked risk list) is more compelling and less redundant with the Featured Story. |
| Admin review | New dedicated "Editorial" tab | Avoids burying editorial hooks in the existing unified review tab. |

---

## Page Architecture

Four sections, vertically stacked, centered column (max-width ~700px):

### 1. Nav Bar
- Mini spinning 3D globe (28px Three.js canvas) as logo — sphere + blip particles, slow rotation
- "AI 4 Society" text
- Observatory / About links
- Sign In button
- **First visit only:** dismissible disclaimer banner below nav ("This platform is for awareness and transparency. Not financial or legal advice."). Persists dismissal to `localStorage` key `ai4s_disclaimer_acknowledged`.

### 2. Featured Story (above fold)
The primary hook. One swipeable story per top risk.

**Content per story card:**
- Velocity tag ("Accelerating" / "Critical") + signal count this week
- **Real signal headline** (from the highest-impact approved `feed_item` linked to this risk)
- **Editorial hook** ("What this means:") — agent-generated, reviewer-approved blurb explaining the signal's significance in plain language
- **Evidence cards** (3-column row): Risk Score (with delta), Velocity, Solutions being tracked
- **Share strip:** Twitter/X, LinkedIn, Copy Link — pre-fills with signal headline + observatory deep-link URL
- **CTA buttons:** "Read the full picture" (navigates to `/observatory/:nodeId` using `related_node_ids[0]`, which the Observatory resolves via slug lookup) + "All risks"
- **Swipe dots** at bottom — top 5 stories, auto-advances every 8s, swipeable on mobile

**Data assembly (client-side):**
1. Read `editorial_hooks` where `status === "approved"`
2. Sort by `impact_score`
3. Join with `graph_snapshot` nodes via `related_node_ids[0]` to get parent node's score, velocity, and type. If `related_node_ids` is empty, skip evidence cards for that story.
4. Solution count per story: count edges from the parent risk node to solution nodes in `graph_snapshot.edges`
5. Top 5 become swipeable stories

### 3. The Radar (below fold)
Compact ranked list of top risks and solutions.

**Per row:**
- Score circle (color-coded: red for critical, orange for high, blue for medium)
- Risk/solution name
- Velocity indicator + signal count + delta
- Arrow indicating direction (up/stable/down)

**Bottom CTA:** "Enter the Observatory" → navigates to `/observatory`

### 4. Trust Footer
- "47 sources across 7 tiers · Human-reviewed signals · Updated every 6h · Open methodology"
- Links: About, Methodology, Contribute
- "Not financial or legal advice" note

---

## Data Flow

### Existing data (no changes needed)
- **`graph_snapshot/current`** — all nodes with scores, velocity, types (public read)
- **`node_summaries/{nodeId}`** — signal counts, trending direction (public read)
- **`feed_items/{id}`** — top 30 ranked signals with source, credibility, related nodes (public read)

### New: `editorial_hooks` collection (separate from `feed_items`)

The Feed Curator deletes and rebuilds `feed_items` every 6 hours. Storing editorial fields directly on `feed_items` would destroy approved hooks on every cycle. Instead, editorial hooks live in a **separate collection** keyed by signal document ID (stable across rebuilds — the feed item ID is the signal doc ID).

**Collection:** `editorial_hooks/{signal_doc_id}`

| Field | Type | Description |
|-------|------|-------------|
| `signal_id` | `string` | Signal document ID — stable join key (matches `feed_items` doc ID) |
| `signal_title` | `string` | Snapshot of the signal headline at generation time |
| `hook_text` | `string` | Plain-language "What this means" blurb |
| `status` | `"pending" \| "approved" \| "rejected"` | Review status |
| `related_node_ids` | `string[]` | Copied from feed item for client-side join |
| `impact_score` | `number` | Copied from feed item for ranking |
| `source_name` | `string` | Copied from feed item for display |
| `source_credibility` | `number` | Copied from feed item for display |
| `published_date` | `string` | Copied from feed item for display |
| `generated_at` | `Timestamp` | When the hook was generated |
| `reviewed_by` | `string \| null` | UID of reviewer who approved/rejected |
| `reviewed_at` | `Timestamp \| null` | When the review happened |

**Generation:** Feed Curator, after ranking and writing `feed_items`, checks if the top 5 items already have hooks in `editorial_hooks` (matched by signal doc ID). For any missing, calls Gemini to generate a hook and writes with `status: "pending"`. Existing hooks (pending or approved) are never overwritten.

**Review:** Admin "Editorial" tab shows pending hooks. Reviewer can approve, edit+approve, or reject.

**Display:** Landing page reads `editorial_hooks` where `status === "approved"`, sorted by `impact_score`. Joins with `graph_snapshot` nodes via `related_node_ids[0]` to get the parent node's score, velocity, and type. Falls back gracefully if `related_node_ids` is empty (skips the evidence cards row).

**Firestore rules:** Add public read for `editorial_hooks`. Write restricted to Cloud Functions (server-only) and reviewers (for status updates).

### No changes to:
- `feed_items` collection or its rebuild cycle
- Routing (`/` stays HeroPage, `/observatory` stays Observatory)
- Observatory data flow (uses `graph_snapshot`, `nodes`, `edges` — not `feed_items` or `editorial_hooks`)

---

## Component Breakdown

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `MiniGlobe` | `src/components/shared/MiniGlobe.tsx` | 28px Three.js canvas — sphere + blip particles, slow rotation. Rendered in nav. Lazy-loaded, pauses when offscreen. Falls back to static SVG globe on devices without WebGL. |
| `FeaturedStory` | `src/components/landing/FeaturedStory.tsx` | Swipeable story cards with real headline, editorial hook, evidence cards, share strip. Auto-advances 8s. |
| `TheRadar` | `src/components/landing/TheRadar.tsx` | Ranked risk/solution list with score circles, velocity, signal counts. CTA to Observatory. |
| `TrustFooter` | `src/components/landing/TrustFooter.tsx` | Source count, methodology, cadence, disclaimer text. |
| `DisclaimerBanner` | `src/components/shared/DisclaimerBanner.tsx` | First-visit dismissible banner. Reads/writes `localStorage`. |
| `ShareStrip` | `src/components/landing/ShareStrip.tsx` | Twitter/X, LinkedIn, copy-link buttons. Props: `headline`, `url`. |
| `EditorialReviewTab` | `src/components/admin/EditorialReviewTab.tsx` | Admin tab: list pending editorial hooks, approve/edit/reject. Accessible by `editor` and `lead` roles. |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/HeroPage.tsx` | Full rewrite — new 3-section layout using FeaturedStory, TheRadar, TrustFooter |
| `src/components/shared/Layout.tsx` | Add MiniGlobe to nav, add DisclaimerBanner slot |
| `src/types/graph.ts` | Add `EditorialHook` interface for the new collection |
| `functions/src/agents/feed-curator/index.ts` | After ranking, check for missing editorial hooks in `editorial_hooks` collection, generate via Gemini for top 5, write as `pending`. Never overwrite existing hooks. |
| `src/pages/Admin.tsx` | Add `"editorial"` to `AdminSection` type, add entry to `SECTION_CONFIG` and `ROLE_TAB_ACCESS` (accessible by `editor` and `lead` roles) |
| `firestore.rules` | Add public read rule for `editorial_hooks`; write restricted to Cloud Functions + `editor`/`lead` roles for status updates |

### Removed Components

| Component | Reason |
|-----------|--------|
| `src/components/landing/RiskBadges.tsx` | Replaced by FeaturedStory swipe |
| `src/components/landing/BadgeDrawer.tsx` | No longer needed |
| `src/components/landing/NewsFeed.tsx` | Replaced by TheRadar |
| `src/components/landing/FeedCard.tsx` | No longer used on landing |

### Deferred (not in scope)

| Component | Reason |
|-----------|--------|
| `PreferencePicker.tsx` | Moves to post-registration onboarding flow — separate spec |

---

## Seed Script

**File:** `src/scripts/seed-editorial-hooks.ts`

One-time script to populate initial editorial hooks so the landing page launches with content:

1. Read top 10 `feed_items` by `impact_score`
2. For each, call Gemini to generate a 1-2 sentence editorial hook
3. Write to `editorial_hooks/{signal_doc_id}` with `status: "pending"`, copying `signal_title`, `related_node_ids`, `impact_score`, `source_name`, `source_credibility`, `published_date` from the feed item
4. Reviewer approves in admin before launch

Run once before deploying the new landing page.

---

## What This Does NOT Change

- **Observatory** — no changes to GraphView, DetailPanel, or any Observatory components
- **Routing** — `/` and `/observatory` unchanged
- **Agent pipeline** — Signal Scout, Discovery, Validator untouched. Feed Curator is modified only to generate editorial hooks (its existing ranking/rebuild cycle is unchanged).
- **Existing admin tabs** — Signals, Discovery, Scoring tabs remain as-is
