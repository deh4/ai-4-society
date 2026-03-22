# AI 4 Society Observatory

A real-time AI risk intelligence platform with a **Human-in-the-Loop (HITL)** agentic pipeline. Automated agents continuously scan, classify, and propose updates — humans approve everything before it reaches the public.

**Live:** [ai4society.io](https://ai4society.io)

---

## What it does

The Observatory tracks the societal risks and solutions emerging from AI acceleration. It ingests articles from 17 curated sources across 5 credibility tiers, uses Gemini to classify them against a structured taxonomy of risks and solutions, and presents the resulting intelligence as:

- **FeaturedStory Carousel** — featured editorial stories on the landing page with article images as full-bleed backgrounds, rendered through an SVG halftone dot mask effect
- **News Feed** — ranked approved signals with recency decay, personalised by interest
- **Observatory** — a 3-column desktop layout: Risk Radar sidebar (240 px, scrollable signal list) | interactive force graph | Detail Panel. On mobile the risk list collapses into a left drawer and the detail panel uses a bottom sheet. Tap any node for a detail sheet with principle tags and harm status indicators
- **Admin Panel** — signal review (with harm status and principle tagging), graph proposal review, agent dashboard with live cost tracking, and user management

---

## Agent Pipeline

Seven agents run automatically. No agent output reaches the public without passing through a human review gate.

```
Signal Scout (every 6h)
    │  fetches 17 sources, classifies with Gemini 2.5 Flash
    │  maps: signal_type, harm_status (incident/hazard), principles (P01-P10)
    ▼
signals/{id}  status: "pending"
    │
    ▼  ── HUMAN GATE 1: Signal Review ──
    │  approve / reject / edit
    ▼
Approved signals
    ├──▶ Discovery Agent (biweekly, 1st & 15th 10:00 UTC)
    │        6-month sliding window, 5-signal minimum
    │        proposes new nodes with full data skeleton
    │        ▼  ── HUMAN GATE 2: Graph Proposal Review ──
    │        approve → Graph Builder creates node with sequential ID
    │        → triggers reclassification of pending signals
    │
    ├──▶ Scoring Agent (monthly, 1st 09:00 UTC)
    │        batched via Cloud Tasks (5 nodes per batch)
    │        proposes score/field updates for existing nodes
    │        ▼  ── HUMAN GATE 2: Scoring Review ──
    │        approve → changelog written, node updated
    │
    ├──▶ Feed Curator (every 6h)
    │        rebuilds feed_items with recency decay, top 100 ranked
    │        generates editorial hooks via Gemini 2.5 Flash
    │        propagates image_url to hooks; onEditorialHookApproved trigger
    │        generates images via Imagen 3 Fast when no image is present
    │
    └──▶ Graph Builder (on demand, triggered by approval)
             rebuilds graph_snapshot + node_summaries + principle edges

Data Lifecycle (daily, 03:00 UTC)
    archives old signals, purges stale proposals, cleans feed items
```

### Agent details

| Agent | Schedule | Model | What it does |
|---|---|---|---|
| **Signal Scout** | Every 6h | Gemini 2.5 Flash | Fetches 17 RSS/API sources → classifies against taxonomy with harm_status + principle tags → stores as `pending`; extracts `image_url` from RSS enclosures and OG meta tags |
| **Discovery Agent** | Biweekly | Gemini 2.5 Pro | 6-month window of signals → proposes new nodes/edges with full data skeleton (scores, deep_dive, principles) |
| **Scoring Agent** | Monthly 1st | Gemini 2.5 Pro | Batched assessment of all nodes → proposes score/velocity/narrative updates; evaluates no-signal relevance decay |
| **Feed Curator** | Every 6h | Gemini 2.5 Flash | Rebuilds feed from approved signals with recency decay; generates editorial hooks for landing page; propagates `image_url` to hooks; Firestore trigger generates Imagen 3 Fast fallback images on approval |
| **Graph Builder** | On demand | None | Rebuilds `graph_snapshot`, `node_summaries`, infers principle edges (10+ signal threshold), updates filter terms |
| **Data Lifecycle** | Daily 03:00 UTC | None | Archives signals >90d, hard-deletes rejected >30d, auto-expires proposals, purges old feed items |

---

## Signal Sources (17)

Sources are organised in five credibility tiers. The admin panel lets you toggle any source on/off without a code deploy.

| Tier | Category | Sources | Credibility |
|---|---|---|---|
| T1 | Research & Safety | arXiv CS.AI, Alignment Forum, AI Safety Newsletter (CAIS), Nature Machine Intelligence, AI Now Institute | 0.85–0.90 |
| T2 | Journalism | MIT Technology Review, Wired AI, Ars Technica AI, IEEE Spectrum AI, The Guardian AI | 0.75–0.80 |
| T3 | Tech / Community | The Verge AI, TechCrunch AI | 0.60–0.65 |
| T4 | Active Search | GDELT DOC API | 0.50 |
| T5 | Newsletter | TLDR AI, Import AI, Last Week in AI, Ben's Bites | 0.65–0.70 |

Credibility scores factor into signal `impact_score` and feed ranking.

---

## Human Gates & Trust Tiers

Every piece of public data passes through at least one human gate:

- **Gate 1 — Signal Review**: reviewers approve/reject/edit each pending signal before it enters the pipeline
- **Gate 2 — Proposal Review**: admins approve graph proposals (new nodes/edges from Discovery) and scoring changes (from Scoring Agent) before they're written

| Role | Access |
|---|---|
| `reviewer` | Signal review tab — approve/reject/edit pending signals |
| `agent_steward` | All review tabs + agent dashboard + source config |
| `admin` | Full access including user management |

**Safety invariant:** if a gate is unattended, data stays quarantined. Signals stay `pending`; proposals auto-expire after 30 days. The public dashboard shows stale-but-correct data rather than unreviewed data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, TypeScript 5.9, Tailwind 3.4, Framer Motion, Three.js |
| Graph | react-force-graph-2d (canvas, force-directed) |
| Backend | Firebase Cloud Functions v2, Node.js 20, TypeScript |
| AI | Gemini 2.5 Flash (classification, hooks) + Gemini 2.5 Pro (discovery, scoring) + Imagen 3 Fast (editorial image generation) |
| Database | Firestore (nodes, edges, signals, graph_snapshot, feed_items, changelogs) |
| Auth | Firebase Auth — Google OAuth + role-based access control |
| Deployment | Firebase Hosting — CI deploys `dev` → dev project, `main` → production |

---

## Development

```bash
npm install
npm run dev              # Dev server — localhost:5173
npm run build            # Production build
npm run lint             # ESLint
npm run emulators        # Firebase emulators (auth, firestore, functions, hosting)
```

**Deploying functions:**
```bash
firebase use             # Verify active project = ai-4-society
firebase deploy --only functions
```

**Deploying rules/indexes** (not handled by CI):
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

CI (`deploy.yml`) handles hosting automatically:
- Push to `dev` → deploys to `ai-4-society-dev` (preview)
- Push to `main` → deploys to `ai-4-society` (production)

Never run `firebase deploy --only hosting` manually unless it's an emergency.

---

## Repository Structure

```
src/
  components/
    admin/          # Admin panel — signal review, agents, users
    landing/        # Landing page — FeaturedStory carousel, NewsFeed, FeedCard, HalftoneMask
    observatory/    # GraphView, RisksSidebar, DetailPanel, EvidenceList, NodeTypeFilter
    shared/         # Layout, nav
  pages/            # HeroPage, Observatory, About, Admin
  store/            # GraphContext (graph_snapshot, node_summaries, feed_items)
  data/             # Firestore DAL clients
  lib/              # Auth, roles, preferences
  types/            # TypeScript types — graph, signal, proposal

functions/src/
  agents/
    signal-scout/   # RSS fetcher + Gemini classifier
    discovery/      # Clustering → new node proposals
    scoring/        # Monthly batched node scoring via Cloud Tasks
    feed-curator/   # Feed rebuild with recency decay; image propagation + Imagen 3 Fast trigger
    graph-builder/  # Snapshot + summary rebuild
    data-lifecycle/ # Archive + cleanup
    approval/       # Proposal approval handlers
  config/
    sources.ts      # All 17 source definitions (single source of truth)
  shared/           # Firestore helpers

docs/
  superpowers/      # Design specs and implementation plans
```

---

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Risk scores and projections are based on published research and news signals. They are illustrative estimates and do not constitute financial, legal, or policy advice.
