# AI 4 Society Observatory

A real-time AI risk intelligence platform with a **Human-in-the-Loop (HITL)** agentic pipeline. Automated agents continuously scan, classify, and propose updates — humans approve everything before it reaches the public.

**Live:** [ai-4-society.web.app](https://ai-4-society.web.app)

---

## What it does

The Observatory tracks the societal risks and solutions emerging from AI acceleration. It ingests articles from 17 curated sources across 5 credibility tiers, uses Gemini to classify them against a structured taxonomy of risks (R01–R10) and solutions (S01–S10), and presents the resulting intelligence as:

- **Risk Reels** — Instagram-style horizontally scrollable circles on the landing page, color-coded by velocity (Critical/High/Medium/Low), each opening a detail drawer
- **News Feed** — ranked approved signals with recency decay, personalised by interest
- **Observatory** — an interactive force graph of nodes (risks, solutions, stakeholders, milestones) and their relationships; tap any node for a detail sheet (bottom sheet on mobile, side panel on desktop)
- **Admin Panel** — signal review, graph proposal review, agent dashboard with live cost tracking, and user management

---

## Agent Pipeline

Six agents run automatically. No agent output reaches the public without passing through a human review gate.

```
Signal Scout (every 6h)
    │  fetches 17 sources, classifies with Gemini
    ▼
signals/{id}  status: "pending"
    │
    ▼  ── HUMAN GATE 1: Signal Review ──
    │  approve / reject / edit
    ▼
Approved signals
    ├──▶ Discovery Agent (weekly, Sun 10:00 UTC)
    │        clusters unmatched signals into proposals for new nodes
    │        ▼  ── HUMAN GATE 2: Graph Proposal Review ──
    │        approve → new node/edge written to graph
    │
    ├──▶ Validator Agent (weekly, Mon 09:00 UTC)
    │        proposes score/field updates for existing nodes
    │        ▼  ── HUMAN GATE 2: Scoring Review ──
    │        approve → changelog written, node updated
    │
    ├──▶ Feed Curator (every 6h)
    │        rebuilds feed_items with recency decay, top 100 ranked
    │
    └──▶ Graph Builder (on demand)
             rebuilds graph_snapshot + node_summaries + filter terms

Data Lifecycle (daily, 03:00 UTC)
    archives old signals, purges stale proposals, cleans feed items
```

### Agent details

| Agent | Schedule | What it does |
|---|---|---|
| **Signal Scout** | Every 6h | Fetches all 17 RSS/API sources → Gemini 2.5 Flash classifies each article against R/S taxonomy → stores as `pending` signals |
| **Discovery Agent** | Sun 10:00 UTC | Clusters unmatched + approved signals → proposes new risk/solution/stakeholder nodes and edges |
| **Validator Agent** | Mon 09:00 UTC | Reviews existing nodes → proposes score, velocity, and narrative updates; creates changelogs on approval |
| **Feed Curator** | Every 6h | Rebuilds `feed_items` from last 30 days of approved signals with recency decay applied to impact score |
| **Graph Builder** | On demand | Rebuilds `graph_snapshot`, `node_summaries`, vote tallies, and Signal Scout filter terms |
| **Data Lifecycle** | Daily 03:00 UTC | Archives approved signals >90d, hard-deletes rejected >30d, auto-expires stale proposals, purges old feed items |

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
- **Gate 2 — Proposal Review**: admins approve graph proposals (new nodes/edges from Discovery) and scoring changes (from Validator) before they're written

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
| AI | Gemini 2.5 Flash (classification + analysis) |
| Database | Firestore (nodes, edges, signals, graph_snapshot, feed_items, changelogs) |
| Auth | Firebase Auth — Google OAuth + role-based access control |
| Deployment | Firebase Hosting (CI via GitHub Actions on push to `main`) |

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

CI (`deploy.yml`) handles hosting automatically on every push to `main`. Never run `firebase deploy --only hosting` manually unless it's an emergency.

---

## Repository Structure

```
src/
  components/
    admin/          # Admin panel — signal review, agents, users
    landing/        # Landing page — RiskReels, NewsFeed, FeedCard
    observatory/    # GraphView, DetailPanel, EvidenceList, NodeTypeFilter
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
    validator/      # Score/field update proposals
    feed-curator/   # Feed rebuild with recency decay
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
