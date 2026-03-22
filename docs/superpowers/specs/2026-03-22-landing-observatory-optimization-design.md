# Landing Page & Observatory Optimization Design

**Date:** 2026-03-22
**Status:** Draft
**Branch:** dev

## Summary

Two features to improve the landing page and Observatory:

1. **Remove TheRadar from landing page, add as Observatory sidebar** — The ranked risk/solution list moves to the Observatory as a persistent sidebar (desktop) or left drawer (mobile), creating a 3-column Observatory layout.
2. **Add featured images to FeaturedStory carousel** — Extract images from article sources during signal ingestion, with Imagen 3 Fast as a last-resort fallback for approved editorial hooks only. Display as masked carousel backgrounds using an SVG halftone dot gradient effect.

## Feature 1: Observatory Risks Sidebar

### Landing Page Changes

- Remove `TheRadar` component import and rendering from `HeroPage.tsx`
- Landing page becomes: `FeaturedStory` carousel + `TrustFooter`
- Delete `src/components/landing/TheRadar.tsx` entirely (no longer used)

### New Observatory Layout — Desktop

3-column layout: `240px 1fr 2fr` (fixed sidebar width for readability):

| RisksSidebar | GraphView | DetailPanel |
|---|---|---|
| Ranked list of top nodes by score | Force-directed canvas graph | Node inspector |
| Compact styling for sidebar | Existing component | Existing component |

- New `RisksSidebar` component — ranked node list using same data pattern as TheRadar (`useGraph()` for `snapshot` + `summaries`, filter risk/solution nodes, sort by `score_2026`, use `signal_count_7d` and `trending` from summaries)
- `GraphView` remains the center focus
- `DetailPanel` remains on the right

### New Observatory Layout — Mobile

- `RisksSidebar` in a **left-edge drawer** (swipe gesture or hamburger toggle)
- `GraphView` fills the top portion of the screen
- `DetailPanel` as a **bottom sheet** (slides up on node tap) — requires a new rendering mode for `DetailPanel` beyond the current `inline` prop. Add a `mode: "panel" | "bottomSheet"` prop, where `bottomSheet` renders as a Framer Motion slide-up overlay with drag-to-dismiss
- Tapping a node in the drawer: auto-closes drawer, selects node on graph, opens bottom sheet

### Components

| Component | Action | Notes |
|---|---|---|
| `src/components/landing/TheRadar.tsx` | Delete | No longer used |
| `src/pages/HeroPage.tsx` | Edit | Remove TheRadar import/render |
| `src/components/observatory/RisksSidebar.tsx` | Create | Ranked node list, compact sidebar layout |
| `src/pages/Observatory.tsx` | Edit | 3-column desktop layout, drawer/bottom-sheet mobile |
| `src/components/observatory/DetailPanel.tsx` | Edit | Add `mode: "panel" \| "bottomSheet"` prop for mobile bottom sheet rendering |

## Feature 2: Featured Images with Halftone Masking

### Pipeline — Image Extraction

**Signal Scout fetcher (`functions/src/signal-scout/fetcher.ts`):**
- After RSS parsing, check `item.enclosure.url` for an image (`rss-parser` exposes `enclosure: { url?, type?, length? }`)
- If no enclosure, make a lightweight HTTP GET to the article URL (follow redirects) and extract OG image from `<meta property="og:image">` or `<meta property="og:image:secure_url">`. Resolve relative URLs against the page base URL.
- Add `image_url?: string` to the `RawArticle` interface
- Store extracted URL as `image_url` on the signal document
- Thread `image_url` through the pipeline: `RawArticle` → `ClassifiedSignal` (update interface in `functions/src/agents/signal-scout/classifier.ts`) → `storeSignals()` in `functions/src/signal-scout/store.ts`

**Feed Curator (`functions/src/agents/feed-curator/index.ts`):**
- When creating/updating editorial hooks, copy `image_url` from the source signal
- New field on editorial hook documents: `image_url: string | null`

### Pipeline — Imagen 3 Fast Fallback

- **Triggered only** when an admin approves an editorial hook for the hero carousel AND `image_url` is null
- NOT during ingestion or feed curation
- Uses `imagen-3.0-fast-generate-001` via **Vertex AI API** (requires `@google-cloud/vertexai` SDK — new dependency for functions)
- Lower resolution, ~$0.01/image — sufficient since the halftone mask degrades detail
- Prompt derived from signal title + summary (e.g., `"Editorial illustration about: {title}"`)
- Generated image stored in **Firebase Storage** at `editorial-images/{hook_id}.webp` (requires Storage bucket initialization and security rules)
- Download URL written back to the editorial hook's `image_url` field
- Expected volume: 0-2 generations per curation cycle (most articles have OG images)
- Function location: `functions/src/agents/feed-curator/generateImage.ts` (co-located with feed curation, not a separate editorial agent)

### Halftone Dot Mask Effect

**Implementation — reusable SVG `<defs>` block:**
- Pattern of circles in an SVG `<mask>` element
- Dots arranged in a grid; radius and opacity vary by vertical position
- Bottom: large, fully opaque dots (dense coverage, image visible through dots)
- Top: dots shrink to zero (fully transparent, image hidden)
- Non-linear gradient — stays dense through bottom ~60%, fades rapidly above

**Visual layers per carousel slide (bottom to top):**
1. Solid background color (theme color or derived from image)
2. Background image `<div>` with halftone SVG mask applied
3. Subtle dark gradient overlay for text contrast
4. Text content (headline, summary, score cards, share strip)

**Responsiveness:**
- Dot grid scales with viewport — fewer, proportionally larger dots on mobile
- Pure SVG, no JS rendering overhead

### Firestore Schema Additions

| Collection | Field | Type |
|---|---|---|
| `signals` | `image_url` | `string \| null` (optional) |
| `editorial_hooks` | `image_url` | `string \| null` (optional) |

### Components

| Component | Action | Notes |
|---|---|---|
| `functions/src/signal-scout/fetcher.ts` | Edit | Add `image_url` to `RawArticle`, extract enclosure URL, OG meta fallback |
| `functions/src/agents/signal-scout/classifier.ts` | Edit | Thread `image_url` through `ClassifiedSignal` interface |
| `functions/src/signal-scout/store.ts` | Edit | Persist `image_url` field |
| `functions/src/agents/feed-curator/index.ts` | Edit | Propagate `image_url` to editorial hooks |
| `functions/src/agents/feed-curator/generateImage.ts` | Create | Imagen 3 Fast via Vertex AI, triggered on editorial hook approval |
| `src/types/editorial.ts` | Edit | Add `image_url?: string` to `EditorialHook` interface |
| `src/components/landing/FeaturedStory.tsx` | Edit | Add background image layer with halftone mask, consume `image_url` |
| `src/components/landing/HalftoneMask.tsx` | Create | Reusable SVG halftone mask `<defs>` block |

## Error Handling

- OG scrape failures (redirects, missing tags): log warning, continue with `image_url: null`
- OG scrape timeout: 5-second limit with redirect following to avoid blocking signal ingestion
- Imagen 3 API failure: log error, editorial hook remains without image (carousel renders solid background fallback)
- Invalid/broken image URLs: CSS fallback to solid background color via `onerror` handler

## Cost Estimate

- OG image extraction: free (HTTP request during existing ingestion)
- Imagen 3 Fast: ~$0.01/image, estimated 0-2 per cycle → negligible
- Firebase Storage: images stored as compressed webp, minimal storage cost
