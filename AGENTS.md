# Agent Notes for ai-4-society

## Project Snapshot
- Stack: React 19 + TypeScript + Vite
- Styling: Tailwind CSS + custom CSS variables
- Runtime data: Firebase Firestore
- Module type: ESM ("type": "module")

## Commands
- Install: npm install
- Dev server: npm run dev
- Build: npm run build
- Preview prod build: npm run preview
- Lint: npm run lint
- Seed Firestore emulator: npm run seed
- Seed Firestore production: npm run seed:prod

### Tests
- No dedicated test runner is configured in package.json.
- Single-test command: not available until a test framework is added.
- If tests are added later, prefer the runner's single-file or -t flag.

## Linting and TypeScript
- ESLint uses @eslint/js + typescript-eslint + react-hooks + react-refresh.
- TypeScript is strict with noUnusedLocals/Parameters enabled.
- NoEmit for app and node configs; Vite handles bundling.
- Avoid unused imports, unused locals, and side-effect imports.

## Formatting and Style Conventions
- Indentation: 4 spaces are used across most TS/TSX files.
- Semicolons are used in existing code; keep them consistent.
- Quotes: single quotes in TS/TSX; double quotes appear in JSX classes.
- JSX: prefer multiline JSX with trailing commas where present.
- Keep lines readable; wrap JSX props when long.

## Imports
- Order: external imports first, then local modules, then assets.
- Use named imports where possible; default imports for components.
- Type-only imports use the `type` keyword.
- Prefer relative paths rooted in `src/`.

## TypeScript and Types
- Prefer explicit interfaces for props and data models.
- Use union literal types for constrained values.
- Use optional properties with `?` and avoid `any`.
- Guard against undefined before accessing optional data.

## Components and React
- Prefer function components with explicit props interfaces.
- Keep state and effects near usage; avoid prop drilling by using context.
- Use React hooks directly; do not create custom hooks unless needed.
- Keep side effects in `useEffect` with tight dependency arrays.

## Data and Firebase
- Firestore data shapes are defined in `src/store/RiskContext.tsx`.
- Seed scripts live in `src/scripts/` and use firebase-admin.
- Emulator seeding sets `FIRESTORE_EMULATOR_HOST` in `seed.ts`.
- Production seed requires GOOGLE_APPLICATION_CREDENTIALS or gcloud auth.

## Styling
- Tailwind is configured in `tailwind.config.js`.
- Global styles are in `src/index.css` and `src/theme/variables.css`.
- Theme switches via `data-theme="solution"` on `document.body`.
- Prefer existing CSS variables for color and typography.

## Naming Conventions
- Components: PascalCase (e.g., `AboutModal`).
- Hooks: use `useX` naming (e.g., `useRisks`).
- Context: `XContext` + `XProvider`.
- Types/interfaces: PascalCase with descriptive names.

## Error Handling
- Use try/catch for async Firestore operations.
- Keep error messages user-facing but concise.
- Log errors to console only when useful for debugging.

## Routing
- Router is configured in `src/App.tsx` using react-router-dom.
- Routes: `/`, `/dashboard`, `/contribute`.
- Use `useNavigate` for navigation in pages.

## Assets
- Images are imported from `src/assets` in pages.
- Keep asset filenames descriptive and lowercase.

## Build and Deploy Notes
- Vite build outputs to `dist`.
- Firebase hosting config is in `firebase.json`.
- Deployment steps are documented in `.agent/workflows/deploy_to_firebase.md`.

## Repository Rules
- No Cursor rules found in `.cursor/rules/` or `.cursorrules`.
- No Copilot instructions found in `.github/copilot-instructions.md`.

## When Editing
- Follow existing structure; avoid large refactors unless requested.
- Keep changes focused and minimal.
- Do not introduce new tooling without approval.
- Avoid adding documentation files unless asked.

## Quick File Map
- App entry: `src/main.tsx`
- Routing: `src/App.tsx`
- State: `src/store/RiskContext.tsx`
- Pages: `src/pages/`
- Components: `src/components/`
- Styles: `src/index.css`, `src/theme/variables.css`
- Seeds: `src/scripts/seed.ts`, `src/scripts/seed-prod.ts`

## Suggested Workflow for Agents
1. Read the relevant components and context first.
2. Make the smallest possible change to meet requirements.
3. Run `npm run lint` for verification when touching TS/TSX.
4. Run `npm run build` before deployment changes.

## Notes for Single-Test Execution
- Not currently available; consider adding Vitest or React Testing Library
  if tests are needed later.
- Once added, document a single test command here.
