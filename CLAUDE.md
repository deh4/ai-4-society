# CLAUDE.md

Project-specific instructions for Claude Code working in ai-4-society.

## Overview

AI 4 Society Observatory — a real-time AI risk intelligence platform with human-in-the-loop review. Built with React 19 + TypeScript + Vite + Firebase.

## Commands

- `npm run dev` — local dev server (port 5173)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run functions:build` — build Cloud Functions
- `npm run emulators` — start Firebase emulators

## Deployment

**Never run `firebase deploy --only hosting` manually.** Hosting is deployed automatically via GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`. The CI pipeline injects Firebase config from GitHub Secrets at build time.

- To deploy: commit, push to `main`, and let CI handle it.
- `firebase deploy --only functions` is still done manually when Cloud Functions change.
- If CI is broken and an emergency hotfix is needed, manual hosting deploy is acceptable as a last resort.

## Firebase

- **Project ID:** ai-4-society
- **Before any `firebase deploy`:** run `firebase use` to verify the active project.
- **Environment variables:** `.env` is gitignored. CI uses GitHub Secrets (`VITE_FIREBASE_*`). Never commit real API keys.

## Architecture

- **Frontend:** `src/` — React 19, Tailwind 3.4, Framer Motion, Three.js
- **Cloud Functions:** `functions/src/` — Signal Scout (6h), Discovery Agent (weekly), Validator Agent (weekly), Data Lifecycle (daily)
- **Auth:** Firebase Auth with Google OAuth + role-based access control (`src/lib/roles.ts`)
- **State:** `RiskContext` (risks/solutions/signals), `AuthContext` (user/roles)

## Key Conventions

- All signals start as `status: "pending"` and require human approval
- Signal types: `"risk"`, `"solution"`, `"both"`, or `"unmatched"`
- Unmatched signals are articles Gemini deems relevant but can't map to the R01-R10/S01-S10 taxonomy — they carry a `proposed_topic` field instead of category codes
- Firestore security rules enforce RBAC — public can only read approved data

## Pipeline Flow

```
Signal Scout (6h) → classifies articles into R/S codes or "unmatched"
    ↓
Admin review → Risk Signals / Solution Signals tabs (matched signals only)
    ↓
Discovery Agent (weekly Sun 10 UTC) → clusters unmatched + approved signals into new risk/solution proposals
    ↓
Discovery review → approve proposals to create new registry entries
    ↓
Validator Agent (weekly Mon 09 UTC) → proposes score/field updates for existing risks/solutions
    ↓
Scoring review → approve changes, creates changelog
```

### Signal Classification

- **Matched signals** (`risk`/`solution`/`both`): mapped to existing R01-R10/S01-S10 codes, shown in Risk/Solution Signals tabs for human review
- **Unmatched signals** (`unmatched`): relevant but outside taxonomy, stored with `proposed_topic` label — flow directly to Discovery Agent without manual review
- Discovery Agent triggers if 5+ classified OR 3+ unmatched signals exist in the last 30 days
- Minimum 3 supporting signals required per discovery proposal
