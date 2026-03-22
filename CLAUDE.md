# CLAUDE.md

Project-specific instructions for Claude Code working in ai-4-society.

## Overview

AI 4 Society Observatory — a real-time AI risk intelligence platform with human-in-the-loop review. Built with React 19 + TypeScript + Vite + Firebase.

## Commands

- `npm run dev` — local dev server (port 5173)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run emulators` — start Firebase emulators

## Branching & Deployment

**Two environments:**
- **`dev` branch** → deploys to `ai-4-society-dev` Firebase project (preview)
- **`main` branch** → deploys to `ai-4-society` Firebase project (production)

**Workflow:** All development happens on `dev`. When ready, merge `dev` → `main` to promote to production.

**Never run `firebase deploy --only hosting` manually.** Hosting is deployed automatically via GitHub Actions (`.github/workflows/deploy.yml`) on push to `dev` or `main`. CI injects the correct Firebase config from GitHub Secrets per environment.

- `firebase deploy --only functions` is still done manually when Cloud Functions change.
  - **Always check `firebase use` before deploying functions** — use `dev` for testing, `prod` for production.
- If CI is broken and an emergency hotfix is needed, manual hosting deploy is acceptable as a last resort.

## Firebase

- **Production:** `ai-4-society` (alias: `prod`, `default`)
- **Development:** `ai-4-society-dev` (alias: `dev`)
- **Before any `firebase deploy`:** run `firebase use` to verify the active project.
- **Switch projects:** `firebase use dev` or `firebase use prod`
- **Environment variables:** `.env` / `.env.development` are gitignored. CI uses GitHub Secrets. Never commit real API keys.

## Architecture

- **Frontend:** `src/` — React 19, Tailwind 3.4, Framer Motion, Three.js
- **Cloud Functions:** `functions/src/` — Signal Scout (6h), Discovery Agent (biweekly), Scoring Agent (monthly), Feed Curator (6h), Graph Builder (on demand), Data Lifecycle (daily)
- **Auth:** Firebase Auth with Google OAuth + role-based access control (`src/lib/roles.ts`)
- **State:** `GraphContext` (graph_snapshot, node_summaries, feed_items), `AuthContext` (user/roles)

## Documentation Rule

**After any change that affects the system's architecture, agent pipeline, sources, features, or deployment process — update `README.md` to reflect the current implemented state.** The README is the authoritative public description of the project; it must never describe planned or removed features as if they exist.

What counts as a doc-worthy change:
- Adding, removing, or renaming an agent or its schedule
- Adding or removing signal sources
- Changing the pipeline flow or human review gates
- Changing roles/permissions
- Changing deployment process
- Adding or removing major UI features (pages, views, components)

When in doubt: if someone reading the README would be misled about how the system actually works, update it.

## Key Conventions

- All signals start as `status: "pending"` and require human approval
- Signal types: `"risk"`, `"solution"`, `"both"`, or `"unmatched"`
- Signals carry `harm_status` (incident/hazard/null) and `principles[]` (P01-P10 OECD tags)
- Anti-recursion: `classification_version` capped at 2, `discovery_locked` prevents re-discovery
- Node IDs: sequential `{TYPE}{NN}` format (R01, S01, P01, SH01, M01)
- Firestore security rules enforce RBAC — public can only read approved data

## Pipeline Flow

```
Signal Scout (6h) → classifies articles with harm_status + principles
    ↓
Admin review → Risk Signals / Solution Signals tabs
    ↓
Discovery Agent (biweekly) → 6-month window, proposes new nodes with full skeleton
    ↓
Discovery review → approve → Graph Builder creates node → reclassifies pending signals
    ↓
Scoring Agent (monthly 1st) → batched assessment, proposes score/field updates
    ↓
Scoring review → approve changes, creates changelog
```

### Signal Classification

- **Matched signals** (`risk`/`solution`/`both`): mapped to existing node codes, shown in Risk/Solution Signals tabs for human review
- **Unmatched signals** (`unmatched`): relevant but outside taxonomy, stored with `proposed_topic` label — flow to Discovery Agent
- Discovery Agent: 5-signal minimum per node proposal, 3-signal minimum per edge, excludes `discovery_locked` signals
- Scoring Agent: monthly cadence for score stability, evaluates no-signal relevance decay
