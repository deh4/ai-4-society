# Signal Scout MVP — Design Document

**Date:** 2026-02-15
**Status:** Approved

## Overview

A vertical MVP slice for the AI 4 Society Observatory: the Signal Scout agent discovers AI risk signals from free data sources, Gemini classifies them, humans approve/reject via an admin UI, and approved signals flow into the existing Dashboard in real-time.

## Architecture

```
Free Data Sources (RSS, APIs)
        │
        ▼
Signal Scout (Cloud Function, every 6h)
  + Gemini API (classify & extract)
        │
        ▼
Firestore `signals` collection
  status: pending | approved | rejected | edited
        │
   ┌────┴────┐
   ▼         ▼
Admin UI    Dashboard
(review)    (shows approved)
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | MVP slice | Prove the full loop before scaling to all 7 agents |
| LLM | Gemini API | User preference; Firebase ecosystem fit |
| Data sources | Free RSS + free-tier APIs | Zero cost for MVP validation |
| Runtime | Cloud Functions 2nd gen | Already on Firebase; generous free tier |
| Auth | Firebase Auth (Google) | Simplest for single-admin MVP |
| Schedule | Every 6 hours | Balances freshness with API limits |

## Data Sources

| Source | Type | Free Tier | Signal Quality |
|--------|------|-----------|----------------|
| NewsAPI | REST API | 100 req/day | Broad AI news |
| GDELT DOC API | REST API | Unlimited | Global events, noisy |
| arXiv RSS | RSS | Unlimited | Research papers |
| MIT Tech Review RSS | RSS | Unlimited | Curated journalism |
| Ars Technica AI RSS | RSS | Unlimited | Tech news |
| The Verge AI RSS | RSS | Unlimited | Consumer AI news |
| EU AI Act feed | RSS | Unlimited | Regulatory signals |
| OECD AI Policy Observatory | RSS | Unlimited | Policy-focused |

## Signal Scout Pipeline

Per scheduled run:

1. **Fetch** — pull latest from all sources, deduplicate by URL
2. **Filter** — Gemini classifies: is this about AI societal impact? (yes/no + confidence)
3. **Extract** — for relevant articles, Gemini extracts structured data:
   - title, summary (2-3 sentences), source_url, source_name, published_date
   - risk_categories[] (maps to R01-R10 taxonomy)
   - severity_hint (Critical/Emerging/Horizon)
   - affected_groups[]
   - confidence_score (0-1)
4. **Store** — write to Firestore `signals` collection with `status: "pending"`
5. **Dedup** — skip URLs already in the collection

Batch articles into single Gemini prompts where possible. ~20-50 articles per run.

Error handling: log failures per-source, continue with remaining sources.

## Data Model

### New: `signals` collection

```typescript
interface Signal {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: Timestamp;
  fetched_at: Timestamp;
  reviewed_at?: Timestamp;
  reviewed_by?: string;
  risk_categories: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  status: "pending" | "approved" | "rejected" | "edited";
  admin_notes?: string;
}
```

### Firestore Security Rules

- `signals` read: public for approved; authenticated admins for pending
- `signals` write: Cloud Functions service account + authenticated admins
- Existing collections unchanged

### Auth Model

- Firebase Auth with Google provider
- Admin gating via `admins` Firestore collection
- No volunteer roles in MVP

## Risk Taxonomy (10 Risks + 10 Solutions)

| ID | Risk | Category | Velocity |
|----|------|----------|----------|
| R01 | Systemic Algorithmic Discrimination | Societal | High |
| R02 | Privacy Erosion via Agentic AI | Technological | Critical |
| R03 | AI-Amplified Disinformation | Geopolitical | Critical |
| R04 | Mass Labor Displacement | Economic | High |
| R05 | Autonomous Weapons & Conflict Escalation | Geopolitical | High |
| R06 | AI Power Concentration & Oligopoly | Economic | High |
| R07 | Environmental Cost of AI Infrastructure | Environmental | Medium |
| R08 | Loss of Human Agency & Cognitive Atrophy | Societal | Emerging |
| R09 | AI in Surveillance & Authoritarian Governance | Geopolitical | Critical |
| R10 | Model Collapse & Data Scarcity Crisis | Technological | Emerging |

Each risk has a matching solution (S01-S10) with implementation_stage, key_players, barriers, and timeline_narrative.

## Admin UI

New `/admin` page with:
- Signal list filtered by status (pending/approved/rejected)
- Detail panel showing Gemini's classification
- Approve / Reject / Edit actions
- Required admin notes for rejections
- Batch approve for high-confidence signals (>0.9)
- Protected by Firebase Auth

## Dashboard Integration

Hybrid approach — keep static seed signals, supplement with live approved signals:
- RiskContext adds Firestore subscription for `signals` where `status == "approved"`
- Merge static + live signals, deduplicate by URL, sort by date
- Live signals get a pulsing dot indicator
- No changes to risk scores, solutions, or other panels

## Project Structure (New/Modified)

```
ai-4-society/
├── functions/                      # NEW
│   ├── src/
│   │   ├── index.ts
│   │   ├── signal-scout/
│   │   │   ├── fetcher.ts
│   │   │   ├── classifier.ts
│   │   │   └── store.ts
│   │   └── config/
│   │       └── sources.ts
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── pages/
│   │   └── Admin.tsx               # NEW
│   ├── components/
│   │   └── ProtectedRoute.tsx      # NEW
│   └── store/
│       └── RiskContext.tsx          # MODIFIED
└── src/scripts/
    ├── seed.ts                     # MODIFIED (10 risks + 10 solutions)
    └── seed-prod.ts                # MODIFIED (same)
```

## New Dependencies

**Cloud Function:** `@google/generative-ai`, `rss-parser`, `firebase-admin`, `firebase-functions`

**Frontend:** None (Firebase Auth already in SDK)

## Out of Scope

- Other 6 agents (Risk Eval, Validation, Topic Tracker, etc.)
- Volunteer role/guild management
- Trust tier system
- Multi-user admin permissions
- Predictive modeling or automated score updates
