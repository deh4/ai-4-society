# AI 4 Society Observatory

A comprehensive monitoring platform designed to visualize, track, and analyze the societal impact of Artificial Intelligence. Built with a **Human-in-the-Loop (HITL) agentic framework** where volunteer oversight roles supervise AI agents at critical workflow gates.

## 🌍 Purpose
The rapid acceleration of AI capabilities brings both unprecedented risks and transformative solutions. The **AI 4 Society Observatory** exists to bridge the gap between technical metrics and societal reality. We aim to:

1.  **Demystify Complex Risks**: Translate abstract technical concepts (like "model collapse" or "algorithmic bias") into tangible, human-centric narratives.
2.  **Connect Systemic Dependencies**: Visualize how a failure in one domain (e.g., Deepfakes) cascades into others (e.g., Political Instability).
3.  **Showcase Actionable Solutions**: Move beyond doomerism by pairing every risk with concrete technical, policy, and governance countermeasures.
4.  **Track Evolution over Time**: Use timeline projections to help policymakers and the public understand urgency and velocity.

## 📱 Responsive Design

The platform is fully responsive with mobile-optimized features:
- **Mobile Drawer Navigation**: Sliding side panel for risk/solution list with smooth animations
- **Auto-collapse on Selection**: Drawer automatically closes when selecting an item
- **Vertical Signal Evidence**: Mobile users see signal evidence stacked below main content
- **Touch-Optimized Controls**: All interactions designed for mobile-first experience

## 🔭 Solution Breakdown

The platform is built as a highly interactive "Weather Station" for the digital age, composed of four interconnected modules:

### 1. The Risk Monitor (Left Panel)
An urgent, ranked interface tracking active threats.
- **Velocity Tracking**: Risks are categorized by speed of onset (High, Medium, Critical).
- **Temporal Grouping**: Risks are organized by time horizon:
    - *Critical (Now)*: Immediate threats requiring action.
    - *Emerging (2030s)*: Risks gathering momentum.
    - *Horizon (2040s)*: Long-term speculative shifts.
- **Systemic Links**: Selecting a risk reveals its dependencies, showing the web of causality (e.g., how Data Scarcity fuels Model Collapse).

### 2. The Analytical Core (Center Panel)
The deep-dive engine for understanding specific issues.
- **Narrative Summaries**: Plain-language explanations of *what* is happening and *why* it matters.
- **Impact Analysis**: Clearly identifies "Who's Affected"—from financial institutions to teenagers.
- **Evolution Timelines**: Projections of how the risk will mutate over the next decade.
- **Mitigation Strategies**: Bulleted lists of specific actions required to blunt the impact.

### 3. The Signal & Perception Engine (Right Panel)
Real-world validation and sentiment analysis.
- **Gap Analysis**: Visualizes the dangerous delta between "Expert Severity" (what scientists know) and "Public Awareness" (what society believes). A large gap indicates a need for education.
- **Signal Evidence**: A live feed of real-world headlines serving as proof points for the risk's progression.

### 4. The Solutions Mode (Toggle View)
A dedicated "Hope" interface. Flipping the top switch transforms the entire dashboard from Red (Warning) to Green (Action).
- **Proactive Countermeasures**: Displays solutions like "Digital Identity Wallets" or "Data Dividends".
- **Adoption Trajectories**: Tracks the implementation progress of these solutions.
- **Barrier Analysis**: Identifies legal, technical, or social blockers preventing adoption.

---

## 🤖 Agent Pipeline

The observatory uses 7 specialized agents organized in a pipeline. Each agent has a distinct role — together they form a chain from raw data discovery to verified dashboard updates.

```
News/Research/APIs → Signal Scout → Topic Tracker → Risk & Solution Eval → Validation → Consolidation → Dashboard
                     (discovers)    (clusters)      (interprets)           (fact-checks)  (writes to DB)
```

### Signal Scout — *"What happened today?"* (DEPLOYED)

Fetches articles from 7 news/research sources every 6 hours, sends them to Gemini 2.0 Flash for classification, and stores relevant ones as pending signals in Firestore.

**Why it exists:** Without a constant stream of real-world evidence, the risk data goes stale. Signal Scout is the eyes and ears of the system.

**Example:** MIT Technology Review publishes an article about a deepfake fraud case. Signal Scout fetches it, Gemini classifies it as R03 (Disinformation) / severity "Critical" / confidence 0.91, and it appears in the admin panel for review.

**Output:** `signals/{id}` — title, summary, risk categories, severity, confidence score, status `pending`

### Topic Tracker — *"What patterns are forming?"*

Analyzes recently approved signals and groups them into named topics with trend velocity scores (rising/stable/declining). Detects emerging patterns that may not fit existing risk categories.

**Why it exists:** Individual signals are noise. Topic Tracker finds the signal in the noise. If Signal Scout captures 15 separate articles about EU AI Act enforcement — Topic Tracker recognizes these as a single trend, names it, and tracks whether it's accelerating.

**What it unlocks for downstream agents:** Risk Evaluation doesn't have to process raw signals one by one. It receives pre-clustered topics with velocity data, making score updates more informed and narratives more coherent.

**Example:** 8 signals about drone bans, 5 about weapons treaties, 3 about missile tests. Topic Tracker creates "Autonomous Weapons Escalation 2026" with velocity "rising", linked to R05.

**Output:** `topics/{id}` — name, description, signal references, trend velocity, risk category mappings

### Risk Evaluation — *"How bad is it now?"*

Takes approved signals and topic clusters, recalculates risk scores using a weighted algorithm (signal frequency 20%, severity 30%, expert consensus 25%, public awareness gap 15%, trend velocity 10%), and updates narratives, timelines, and affected groups.

**Why it exists:** Signals and topics are evidence. Risk Evaluation is the agent that *interprets* that evidence and proposes dashboard updates. Without it, risk scores would remain static seed data.

**Example:** 12 new signals about AI election interference are approved. Risk Evaluation proposes updating R03's score from 80 to 88, velocity from "High" to "Critical", and regenerates the summary.

**Output:** Proposed updates to `risks/{id}` — scores, narratives, evidence links. Requires validation before writing.

### Solution Evaluation — *"Are the fixes working?"*

Monitors solution adoption progress by tracking company announcements, regulatory developments, and pilot programs. Updates implementation stages, adoption scores, key players, and barriers.

**Why it exists:** Every risk has a corresponding solution (S01-S10). While Risk Evaluation tracks how bad things are getting, Solution Evaluation tracks whether the countermeasures are gaining traction.

**Example:** Apple announces C2PA support, EU mandates content provenance. Solution Evaluation proposes bumping S03's adoption score from 35 to 48, changing stage from "Early Adoption" to "Mainstream Push".

**Output:** Proposed updates to `solutions/{id}` — adoption scores, stages, key players, barriers. Requires validation.

### Validation — *"Is this actually true?"*

Fact-checks proposed updates from Risk and Solution Evaluation before they're written to the database. Verifies URLs are accessible, narratives are consistent with sources, scores are within bounds, and there are no hallucinations.

**Why it exists:** LLMs hallucinate. An analysis agent might cite a broken URL, generate text that contradicts its own evidence, or propose a score outside valid range. Validation is the quality gate that prevents bad data from reaching the public dashboard.

**Checks:** Source verification, cross-referencing, temporal consistency, quantitative bounds, relationship integrity.

**Output:** `approved` / `rejected` / `flagged_for_review` verdict. Rejected updates go back to analysis agents; flagged ones go to human review.

### Consolidation — *"Write it safely."*

Merges validated updates from multiple agents, resolves conflicts (confidence-weighted averaging for scores, recency preference for fast-moving data), and performs atomic Firestore writes with version history and changelogs.

**Why it exists:** Multiple agents may propose changes to the same risk document in one cycle. Consolidation ensures these are merged coherently and written atomically, preventing partial or conflicting states.

**Output:** Atomic writes to `risks/` and `solutions/`, plus `changelogs/` entries.

### Orchestrator — *"Who runs when?"*

Master coordinator that schedules agents, manages the task queue, handles cascading triggers (e.g., "5 Critical signals found → immediately trigger Risk Evaluation"), and monitors system health.

**Why it exists:** As more agents come online, coordination becomes necessary. Simple cron schedules won't handle priority-based routing, cascading triggers, or deadlock detection.

### Current Status

| Agent | Status | Schedule |
|-------|--------|----------|
| Signal Scout | **Deployed** | Every 6 hours |
| Topic Tracker | Planned | Daily |
| Risk Evaluation | Planned | Weekly |
| Solution Evaluation | Planned | Bi-weekly |
| Validation | Planned | Event-driven |
| Consolidation | Planned | Event-driven |
| Orchestrator | Planned | Continuous |

---

## 🔄 Full Workflow & Human Gates

This section maps the complete data flow from raw news to public dashboard, showing every agent handoff and every point where human review is required. The core principle: **no data reaches the public dashboard without passing through at least one human gate and one automated quality check.**

### Workflow Diagram

```
                                    RESEARCH PHASE
                                    ══════════════
                          ┌──────────────────────────────┐
                          │        Signal Scout           │
                          │   (every 6h, automated)       │
                          │                               │
                          │  Fetches articles from 7      │
                          │  sources, classifies with     │
                          │  Gemini, stores as signals    │
                          └──────────────┬───────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │   signals/{id}                  │
                        │   status: "pending"             │
                        └────────────────┬───────────────┘
                                         │
                    ╔════════════════════╤╧══════════════════════╗
                    ║  HUMAN GATE 1     │  Source Sentinel (T2)  ║
                    ║                   │                        ║
                    ║  Reviews each pending signal:              ║
                    ║  • Is the source credible?                 ║
                    ║  • Is the classification correct?          ║
                    ║  • Are risk categories appropriate?        ║
                    ║                                            ║
                    ║  Actions: Approve / Reject / Edit          ║
                    ║  SLA: 48 hours                             ║
                    ╚════════════════════╤═══════════════════════╝
                          │              │              │
                       approved       rejected       edited
                          │              │              │
                          │              ▼              │
                          │         (archived          │
                          │          after 30d)        │
                          │                            │
                          └──────────┬─────────────────┘
                                     │
                                     ▼
                                    ANALYSIS PHASE
                                    ══════════════
                          ┌──────────────────────────────┐
                          │        Topic Tracker          │
                          │     (daily, automated)        │
                          │                               │
                          │  Reads approved signals from  │
                          │  last 7 days, clusters into   │
                          │  named topics via Gemini,     │
                          │  assigns trend velocity       │
                          └──────────────┬───────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │   topics/{id}                   │
                        │   (internal, no approval needed │
                        │    — derived from approved      │
                        │    signals only)                 │
                        └────────────────┬───────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                          ▼                             ▼
               ┌─────────────────────┐      ┌─────────────────────┐
               │   Risk Evaluation   │      │ Solution Evaluation │
               │  (weekly, automated)│      │(bi-weekly, automated)│
               │                     │      │                     │
               │  Reads topics +     │      │  Reads topics +     │
               │  approved signals,  │      │  approved signals,  │
               │  proposes updates   │      │  proposes updates   │
               │  to risk scores,    │      │  to adoption scores,│
               │  narratives,        │      │  stages, key        │
               │  timelines          │      │  players, barriers  │
               └────────┬────────────┘      └────────┬────────────┘
                        │                             │
                        ▼                             ▼
               ┌────────────────────────────────────────────────┐
               │              PROPOSED UPDATES                   │
               │  (stored in agent_outputs, not yet applied)     │
               └────────────────────────┬───────────────────────┘
                                        │
                                        ▼
                                    QUALITY PHASE
                                    ═════════════
                          ┌──────────────────────────────┐
                          │      Validation Agent         │
                          │   (event-driven, automated)   │
                          │                               │
                          │  Fact-checks each proposal:   │
                          │  • URLs accessible?           │
                          │  • Narratives consistent?     │
                          │  • Scores within bounds?      │
                          │  • No hallucinations?         │
                          │  • Cross-references valid?    │
                          └──────────────┬───────────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          │              │              │
                       approved     flagged_for     rejected
                          │           _review          │
                          │              │              │
                          │              │              ▼
                          │              │        (back to analysis
                          │              │         agent for retry)
                          │              │
                          │              ▼
                    ╔═════╧══════════════════════════════════════╗
                    ║  HUMAN GATE 2     Role depends on content: ║
                    ║                                            ║
                    ║  Risk score changes:                       ║
                    ║  ├─ Small (< 5 pts): Severity Steward (T3)║
                    ║  └─ Large (≥ 5 pts): Observatory           ║
                    ║                      Steward (T4) required ║
                    ║                                            ║
                    ║  Narrative updates:                        ║
                    ║  └─ Forecast Scribe (T3)                   ║
                    ║     Checks clarity, no overclaiming        ║
                    ║                                            ║
                    ║  Solution updates:                         ║
                    ║  └─ Greenlight Gardener (T2-T3)            ║
                    ║     Requires evidence of deployment        ║
                    ║                                            ║
                    ║  Perception/gap metrics:                   ║
                    ║  └─ Gap Engineer (T2-T3)                   ║
                    ║     Prevents single-platform bias          ║
                    ║                                            ║
                    ║  New risk categories (rare):               ║
                    ║  └─ Causality Cartographer (T2-T3)         ║
                    ║     + Observatory Steward (T4) sign-off    ║
                    ║                                            ║
                    ║  SLA: Critical 24-48h, Others 7-14 days   ║
                    ╚════════════════════╤═══════════════════════╝
                                        │
                                     approved
                                        │
                                        ▼
                          ┌──────────────────────────────┐
                          │     Consolidation Agent       │
                          │   (event-driven, automated)   │
                          │                               │
                          │  Merges validated updates:    │
                          │  • Conflict resolution        │
                          │  • Atomic Firestore writes    │
                          │  • Version history            │
                          │  • Changelog entries          │
                          └──────────────┬───────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │    PUBLIC DASHBOARD UPDATED     │
                        │                                 │
                        │  risks/{id}    — new scores,    │
                        │                  narratives     │
                        │  solutions/{id} — new adoption  │
                        │                  data           │
                        │  changelogs/{id} — audit trail  │
                        └────────────────────────────────┘
```

### Human Gate Summary

| Gate | When | Who Reviews | What They Check | If Unreviewed |
|------|------|-------------|-----------------|---------------|
| **Gate 1: Signal Approval** | After Signal Scout stores a new signal | Source Sentinel (T2) | Source credibility, classification accuracy, risk category mapping | Signal stays `pending` — never reaches analysis agents |
| **Gate 2: Update Approval** | After Validation Agent flags a proposed update | Depends on content (see below) | Varies by role — see details | Proposal expires or escalates — never written to DB |

**Gate 2 role routing:**

| Content Type | Primary Reviewer | Escalation |
|-------------|-----------------|------------|
| Risk score change < 5 points | Severity Steward (T3) | — |
| Risk score change ≥ 5 points | Severity Steward (T3) | Observatory Steward (T4) must co-sign |
| Narrative text (summary, deep_dive) | Forecast Scribe (T3) | — |
| Solution adoption updates | Greenlight Gardener (T2-T3) | — |
| Perception/gap metric changes | Gap Engineer (T2-T3) | — |
| New risk category proposal | Causality Cartographer (T2-T3) | Observatory Steward (T4) must co-sign |
| Emergency override / rollback | Observatory Steward (T4) | — |

### Safety Invariants

1. **No silent mutation:** If a human gate is unattended, data stays quarantined. Signals stay `pending`, proposals expire. The dashboard shows stale-but-correct data rather than unreviewed data.
2. **Two checks minimum:** Every piece of data that reaches the public dashboard has passed through at least one automated check (Validation Agent) and one human check (Gate 1 or Gate 2).
3. **Audit trail:** Every change to `risks/` or `solutions/` produces a `changelogs/` entry recording what changed, why, which agents contributed, and which human approved it.
4. **Rollback capability:** Observatory Steward (T4) can revert any change using the changelog history.

### Trust Tiers

| Tier | Role | Capabilities |
|------|------|-------------|
| **T1 (Observer)** | New volunteers | View-only access, learning phase |
| **T2 (Validator)** | Source Sentinel, Gap Engineer, Greenlight Gardener, Causality Cartographer | Approve/reject agent proposals within their domain |
| **T3 (Steward)** | Severity Steward, Forecast Scribe | Edit content, escalate decisions, approve within domain |
| **T4 (Architect)** | Observatory Steward | Governance, policy changes, final authority, emergency overrides |

---

## 🛠 Tech Stack
- **Frontend**: Vite 7, React 19, TypeScript 5.9, Tailwind 3.4, Framer Motion
- **Backend**: Firebase Cloud Functions v2 (Node.js/TypeScript)
- **AI**: Gemini 2.0 Flash (classification, analysis)
- **Database**: Firebase Firestore (risks, solutions, signals, agents, topics)
- **Auth**: Firebase Auth (Google OAuth) with admin whitelist
- **Deployment**: Firebase Hosting

## 🚀 Development

```bash
npm install
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run emulators        # Start Firebase emulators
npm run functions:build  # Build Cloud Functions
firebase deploy          # Deploy to production (check `firebase use` first!)
```

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚖️ Disclaimer
This dashboard is for educational and simulation purposes. Risk scores and projections are illustrative estimates based on current research trends and do not constitute financial or legal advice.
