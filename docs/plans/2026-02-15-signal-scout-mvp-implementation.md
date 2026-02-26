# Signal Scout MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a vertical MVP slice — Signal Scout agent discovers AI risk signals from free sources, Gemini classifies them, humans approve/reject via admin UI, approved signals flow into the existing Dashboard.

**Architecture:** Firebase Cloud Function (2nd gen, scheduled every 6h) fetches RSS/API sources, sends articles to Gemini for classification, stores structured signals in Firestore with `status: "pending"`. An admin page (protected by Firebase Auth) lets humans approve/reject signals. The existing Dashboard merges approved signals into its evidence feed via a modified RiskContext.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Firebase (Auth, Firestore, Cloud Functions 2nd gen), Gemini API (`@google/generative-ai`), `rss-parser`, Tailwind 3.4

---

## Task 1: Expand Seed Data — 10 Risks + 10 Solutions

**Files:**
- Modify: `src/scripts/seed.ts`
- Modify: `src/scripts/seed-prod.ts`

**Context:** Currently only 3 risks (R01-R03) and 1 solution (S03). Expand to 10 risks across all categories with matching solutions. Both seed files must stay in sync.

**Step 1: Write the expanded risk data (R01-R10)**

Replace the `risks` array in `src/scripts/seed.ts` with 10 fully researched risks. Keep existing R01-R03 as-is, add R04-R10:

- **R04** — Mass Labor Displacement and Economic Polarization (Economic, High, 82)
- **R05** — Autonomous Weapons and AI-Enabled Conflict Escalation (Geopolitical, High, 75)
- **R06** — AI Power Concentration and Oligopoly Control (Economic, High, 80)
- **R07** — Environmental Cost of AI Infrastructure (Environmental, Medium, 65)
- **R08** — Loss of Human Agency and Cognitive Atrophy (Societal, Emerging, 58)
- **R09** — AI in Surveillance and Authoritarian Governance (Geopolitical, Critical, 85)
- **R10** — Model Collapse and Data Scarcity Crisis (Technological, Emerging, 55)

Each risk MUST follow the existing interface exactly (from `src/store/RiskContext.tsx:18-41`):
```typescript
{
    id: string,
    risk_name: string,
    category: string,
    score_2026: number,
    score_2035: number,
    connected_to: string[],       // reference other R/S IDs
    velocity: 'High' | 'Medium' | 'Low' | 'Critical',
    summary: string,              // 1-2 sentences with specific stats
    deep_dive: string,            // 2-3 paragraph analysis
    who_affected: string[],       // 3-4 affected groups
    timeline_narrative: {
        near_term: string,        // "By 2026, ..."
        mid_term: string,         // "By 2030, ..."
        long_term: string         // "By 2035, ..."
    },
    mitigation_strategies: string[],  // 3-4 strategies
    signal_evidence: [            // 2-3 real signal events
        {
            date: string,         // 'YYYY-MM-DD'
            isNew: boolean,
            headline: string,
            source: string,
            url?: string          // optional
        }
    ],
    expert_severity: number,      // 0-100
    public_perception: number     // 0-100 (gap matters)
}
```

Use real, verifiable signal evidence with actual dates, sources, and URLs where possible. Research current events for each risk category.

**Step 2: Write matching solutions (S01-S10)**

Replace the `solutions` array with 10 solutions. Keep existing S03, add the rest. Each follows the Solution interface (from `src/store/RiskContext.tsx:43-57`):

```typescript
{
    id: string,                   // S01-S10
    parent_risk_id: string,       // matching R01-R10
    solution_title: string,
    solution_type: string,        // e.g., "Technology + Policy"
    summary: string,
    deep_dive: string,
    implementation_stage: string, // "Research" | "Pilot Programs" | "Early Adoption" | etc.
    adoption_score_2026: number,
    adoption_score_2035: number,
    key_players: string[],
    barriers: string[],
    timeline_narrative: {
        near_term: string,
        mid_term: string,
        long_term: string
    }
}
```

**Step 3: Copy updated data to seed-prod.ts**

Copy the exact same `risks` and `solutions` arrays to `src/scripts/seed-prod.ts`. Only the Firebase initialization and logging differ between the two files.

**Step 4: Fix R03's `connected_to` reference**

R03 currently references `'R42'` which doesn't exist. Change to a valid reference like `'R09'` (surveillance relates to disinformation).

**Step 5: Test the seed script against the emulator**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society
npx firebase emulators:start &
sleep 5
npm run seed
```
Expected: `10 risks seeded.` and `10 solutions seeded.`

**Step 6: Commit**
```bash
git add src/scripts/seed.ts src/scripts/seed-prod.ts
git commit -m "feat: expand seed data to 10 risks (R01-R10) and 10 solutions (S01-S10)"
```

---

## Task 2: Set Up Cloud Functions Directory

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/index.ts` (placeholder)
- Modify: `firebase.json` (add functions config)
- Modify: `.gitignore` (add `functions/lib/`)

**Context:** Firebase Cloud Functions 2nd gen require a separate directory with its own `package.json` and TypeScript config. The function compiles to `functions/lib/`.

**Step 1: Create `functions/package.json`**

```json
{
  "name": "ai-4-society-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions"
  },
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.0",
    "firebase-admin": "^13.6.0",
    "firebase-functions": "^6.3.0",
    "rss-parser": "^3.13.0"
  },
  "devDependencies": {
    "typescript": "~5.9.3"
  }
}
```

**Step 2: Create `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create placeholder `functions/src/index.ts`**

```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

export const signalScout = onSchedule("every 6 hours", async () => {
  logger.info("Signal Scout: placeholder — pipeline not yet implemented");
});
```

**Step 4: Update `firebase.json`**

Add the `functions` key to the existing config:

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "firestore": { ... },
  "hosting": { ... },
  "emulators": {
    "functions": {
      "port": 5001
    },
    "auth": { ... },
    "firestore": { ... },
    "hosting": { ... },
    "ui": { ... }
  }
}
```

Keep all existing config, just add `functions` at top level and `functions` emulator port.

**Step 5: Update `.gitignore`**

Add:
```
functions/lib/
functions/node_modules/
```

**Step 6: Install dependencies and verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society/functions
npm install
npm run build
```
Expected: Compiles without errors, `functions/lib/index.js` exists.

**Step 7: Commit**
```bash
cd /Users/dehakuran/Projects/ai-4-society
git add functions/package.json functions/tsconfig.json functions/src/index.ts firebase.json .gitignore
git commit -m "feat: scaffold Cloud Functions directory with placeholder signal scout"
```

---

## Task 3: Signal Scout — Data Source Fetcher

**Files:**
- Create: `functions/src/config/sources.ts`
- Create: `functions/src/signal-scout/fetcher.ts`

**Context:** The fetcher module pulls articles from free RSS feeds and APIs. It returns a normalized array of raw articles regardless of source type.

**Step 1: Create the source registry `functions/src/config/sources.ts`**

```typescript
export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "api";
  url: string;
  category?: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: "arxiv-ai",
    name: "arXiv CS.AI",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "Research",
  },
  {
    id: "mit-tech-review",
    name: "MIT Technology Review",
    type: "rss",
    url: "https://www.technologyreview.com/feed/",
    category: "Journalism",
  },
  {
    id: "ars-ai",
    name: "Ars Technica AI",
    type: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    category: "Journalism",
  },
  {
    id: "verge-ai",
    name: "The Verge AI",
    type: "rss",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    category: "Journalism",
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    type: "rss",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "Journalism",
  },
  {
    id: "wired-ai",
    name: "Wired AI",
    type: "rss",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    category: "Journalism",
  },
  {
    id: "gdelt-ai",
    name: "GDELT DOC API",
    type: "api",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=artificial+intelligence+risk&mode=ArtList&maxrecords=20&format=json",
    category: "Global Events",
  },
];
```

**Step 2: Create the fetcher `functions/src/signal-scout/fetcher.ts`**

```typescript
import Parser from "rss-parser";
import { DATA_SOURCES, type DataSource } from "../config/sources.js";
import { logger } from "firebase-functions/v2";

export interface RawArticle {
  title: string;
  url: string;
  source_name: string;
  source_id: string;
  published_date: string; // ISO string
  snippet?: string;
}

const rssParser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "AI4Society-SignalScout/1.0",
  },
});

async function fetchRSS(source: DataSource): Promise<RawArticle[]> {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.link ?? "",
    source_name: source.name,
    source_id: source.id,
    published_date: item.isoDate ?? new Date().toISOString(),
    snippet: item.contentSnippet?.slice(0, 500),
  }));
}

async function fetchGDELT(source: DataSource): Promise<RawArticle[]> {
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`GDELT returned ${res.status}`);
  const data = await res.json();
  const articles = data.articles ?? [];
  return articles.map((a: { title?: string; url?: string; seendate?: string; domain?: string }) => ({
    title: a.title ?? "Untitled",
    url: a.url ?? "",
    source_name: a.domain ?? source.name,
    source_id: source.id,
    published_date: a.seendate
      ? new Date(a.seendate).toISOString()
      : new Date().toISOString(),
  }));
}

export async function fetchAllSources(): Promise<RawArticle[]> {
  const results: RawArticle[] = [];

  for (const source of DATA_SOURCES) {
    try {
      const articles =
        source.type === "rss"
          ? await fetchRSS(source)
          : await fetchGDELT(source);
      results.push(...articles);
      logger.info(`Fetched ${articles.length} articles from ${source.name}`);
    } catch (err) {
      logger.warn(`Failed to fetch from ${source.name}:`, err);
      // Continue with other sources
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return results.filter((article) => {
    if (!article.url || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}
```

**Step 3: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build
```
Expected: Compiles without errors.

**Step 4: Commit**
```bash
cd /Users/dehakuran/Projects/ai-4-society
git add functions/src/config/sources.ts functions/src/signal-scout/fetcher.ts
git commit -m "feat: add Signal Scout data source fetcher with RSS and GDELT support"
```

---

## Task 4: Signal Scout — Gemini Classifier

**Files:**
- Create: `functions/src/signal-scout/classifier.ts`

**Context:** The classifier takes raw articles, sends them to Gemini in batches, and returns structured signal data. Uses the `@google/generative-ai` SDK. The Gemini API key is stored in Firebase environment config.

**Step 1: Create `functions/src/signal-scout/classifier.ts`**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "./fetcher.js";

export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  risk_categories: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
}

const RISK_TAXONOMY = `
Risk taxonomy for classification:
- R01: Systemic Algorithmic Discrimination (hiring, healthcare, policing bias)
- R02: Privacy Erosion via Agentic AI (data scraping, inference, prompt injection)
- R03: AI-Amplified Disinformation (deepfakes, election interference, synthetic media)
- R04: Mass Labor Displacement (job automation, economic polarization, skill obsolescence)
- R05: Autonomous Weapons (lethal AI, military AI, conflict escalation)
- R06: AI Power Concentration (Big Tech oligopoly, open-source vs closed, regulatory capture)
- R07: Environmental Cost of AI (energy consumption, water usage, e-waste, data centers)
- R08: Loss of Human Agency (cognitive atrophy, AI dependency, decision outsourcing)
- R09: AI in Surveillance (facial recognition, social scoring, authoritarian use)
- R10: Model Collapse & Data Scarcity (training data exhaustion, synthetic data loops)
`;

const SYSTEM_PROMPT = `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

For each article provided, determine:
1. Is this article about a societal risk or impact of AI? (not just AI product news)
2. If yes, classify it.

Respond with a JSON array. For irrelevant articles, include them with "relevant": false.
For relevant articles, provide:
{
  "index": <number>,
  "relevant": true,
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "risk_categories": ["R01", ...],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

For irrelevant articles:
{ "index": <number>, "relevant": false }

Only output valid JSON. No markdown fences. No explanation.`;

const BATCH_SIZE = 10;

export async function classifyArticles(
  articles: RawArticle[],
  geminiApiKey: string
): Promise<ClassifiedSignal[]> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const results: ClassifiedSignal[] = [];

  // Process in batches
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const articleList = batch
      .map(
        (a, idx) =>
          `[${idx}] Title: ${a.title}\nSource: ${a.source_name}\nDate: ${a.published_date}\nSnippet: ${a.snippet ?? "N/A"}`
      )
      .join("\n\n");

    const prompt = `Classify these articles:\n\n${articleList}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const text = result.response.text();
      const parsed: Array<{
        index: number;
        relevant: boolean;
        summary?: string;
        risk_categories?: string[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
      }> = JSON.parse(text);

      for (const item of parsed) {
        if (!item.relevant) continue;
        const article = batch[item.index];
        if (!article) continue;

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          risk_categories: item.risk_categories ?? [],
          severity_hint: item.severity_hint ?? "Emerging",
          affected_groups: item.affected_groups ?? [],
          confidence_score: item.confidence_score ?? 0.5,
        });
      }

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} relevant signals so far`
      );
    } catch (err) {
      logger.error(`Gemini batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
      // Continue with next batch
    }
  }

  return results;
}
```

**Step 2: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build
```
Expected: Compiles without errors.

**Step 3: Commit**
```bash
cd /Users/dehakuran/Projects/ai-4-society
git add functions/src/signal-scout/classifier.ts
git commit -m "feat: add Gemini-powered signal classifier with batch processing"
```

---

## Task 5: Signal Scout — Firestore Store & Dedup

**Files:**
- Create: `functions/src/signal-scout/store.ts`

**Context:** The store module writes classified signals to Firestore, skipping any URLs that already exist in the collection.

**Step 1: Create `functions/src/signal-scout/store.ts`**

```typescript
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ClassifiedSignal } from "./classifier.js";

export async function storeSignals(signals: ClassifiedSignal[]): Promise<number> {
  const db = getFirestore();
  const collection = db.collection("signals");

  // Get existing URLs for dedup
  const existingSnapshot = await collection.select("source_url").get();
  const existingUrls = new Set(
    existingSnapshot.docs.map((doc) => doc.data().source_url as string)
  );

  const newSignals = signals.filter((s) => !existingUrls.has(s.source_url));

  if (newSignals.length === 0) {
    logger.info("No new signals to store (all duplicates).");
    return 0;
  }

  // Write in batches of 500 (Firestore limit)
  const BATCH_LIMIT = 500;
  let stored = 0;

  for (let i = 0; i < newSignals.length; i += BATCH_LIMIT) {
    const chunk = newSignals.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const signal of chunk) {
      const ref = collection.doc();
      batch.set(ref, {
        title: signal.title,
        summary: signal.summary,
        source_url: signal.source_url,
        source_name: signal.source_name,
        published_date: signal.published_date,
        risk_categories: signal.risk_categories,
        severity_hint: signal.severity_hint,
        affected_groups: signal.affected_groups,
        confidence_score: signal.confidence_score,
        status: "pending",
        fetched_at: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    stored += chunk.length;
  }

  logger.info(`Stored ${stored} new signals.`);
  return stored;
}
```

**Step 2: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build
```
Expected: Compiles without errors.

**Step 3: Commit**
```bash
cd /Users/dehakuran/Projects/ai-4-society
git add functions/src/signal-scout/store.ts
git commit -m "feat: add signal storage with URL-based deduplication"
```

---

## Task 6: Signal Scout — Wire Up the Scheduled Function

**Files:**
- Modify: `functions/src/index.ts`

**Context:** Wire up the full pipeline: fetch → classify → store, triggered every 6 hours. The Gemini API key is read from `defineSecret()`.

**Step 1: Update `functions/src/index.ts`**

```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { fetchAllSources } from "./signal-scout/fetcher.js";
import { classifyArticles } from "./signal-scout/classifier.js";
import { storeSignals } from "./signal-scout/store.js";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const signalScout = onSchedule(
  {
    schedule: "every 6 hours",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Signal Scout: starting pipeline run");

    // Step 1: Fetch articles from all sources
    const articles = await fetchAllSources();
    logger.info(`Fetched ${articles.length} unique articles`);

    if (articles.length === 0) {
      logger.info("No articles found. Ending run.");
      return;
    }

    // Step 2: Classify with Gemini
    const signals = await classifyArticles(articles, geminiApiKey.value());
    logger.info(`Classified ${signals.length} relevant signals`);

    if (signals.length === 0) {
      logger.info("No relevant signals found. Ending run.");
      return;
    }

    // Step 3: Store in Firestore
    const stored = await storeSignals(signals);
    logger.info(`Pipeline complete. Stored ${stored} new signals.`);
  }
);
```

**Step 2: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society/functions && npm run build
```
Expected: Compiles without errors, `functions/lib/index.js` contains the full pipeline.

**Step 3: Commit**
```bash
cd /Users/dehakuran/Projects/ai-4-society
git add functions/src/index.ts
git commit -m "feat: wire up Signal Scout scheduled pipeline (fetch → classify → store)"
```

---

## Task 7: Firebase Auth Setup

**Files:**
- Modify: `src/lib/firebase.ts` (add Auth export)
- Create: `src/store/AuthContext.tsx`

**Context:** Add Firebase Auth (Google sign-in) for admin access. The existing `firebase.ts` only exports `db`. We need to add `auth`. Then create an AuthContext similar to the existing RiskContext pattern.

**Step 1: Update `src/lib/firebase.ts`**

Add Auth import and export. Add emulator connection for auth. Keep all existing code:

```typescript
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-4-society.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-4-society",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-4-society.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

if (location.hostname === "localhost") {
    try {
        console.log("Attempting to connect to Firestore Emulator...");
        connectFirestoreEmulator(db, 'localhost', 8080);
        console.log("Connected to Firestore Emulator at localhost:8080");
        connectAuthEmulator(auth, 'http://localhost:9099');
        console.log("Connected to Auth Emulator at localhost:9099");
    } catch (e) {
        console.error("Error connecting to emulator", e);
    }
}
```

**Step 2: Create `src/store/AuthContext.tsx`**

Follow the same pattern as `RiskContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    signIn: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                // Check admins collection
                const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
                setIsAdmin(adminDoc.exists());
            } else {
                setIsAdmin(false);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signIn = async () => {
        await signInWithPopup(auth, googleProvider);
    };

    const logOut = async () => {
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading, signIn, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
```

**Step 3: Wrap App with AuthProvider**

Modify `src/App.tsx` — add `AuthProvider` inside `RiskProvider`:

```typescript
import { AuthProvider } from './store/AuthContext';

// Inside the return, wrap Router with AuthProvider:
<RiskProvider>
  <AuthProvider>
    <Router>
      ...
    </Router>
  </AuthProvider>
</RiskProvider>
```

**Step 4: Verify the app builds**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build
```
Expected: Builds without errors.

**Step 5: Commit**
```bash
git add src/lib/firebase.ts src/store/AuthContext.tsx src/App.tsx
git commit -m "feat: add Firebase Auth with Google sign-in and admin check"
```

---

## Task 8: Protected Route Component

**Files:**
- Create: `src/components/ProtectedRoute.tsx`

**Context:** A wrapper component that checks if the user is authenticated and is an admin. Redirects to home if not.

**Step 1: Create `src/components/ProtectedRoute.tsx`**

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="text-gray-400 text-sm">Checking access...</div>
            </div>
        );
    }

    if (!user || !isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
```

**Step 2: Add admin route to `src/App.tsx`**

Add the import and route:

```typescript
import { ProtectedRoute } from './components/ProtectedRoute';
import Admin from './pages/Admin';

// Add inside <Routes>:
<Route path="/admin" element={
    <ProtectedRoute>
        <Admin />
    </ProtectedRoute>
} />
```

Note: The `Admin` page doesn't exist yet — create a placeholder:

**Step 3: Create placeholder `src/pages/Admin.tsx`**

```typescript
export default function Admin() {
    return (
        <div className="min-h-screen p-8" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <h1 className="text-2xl font-bold">Admin — Signal Review</h1>
            <p className="text-gray-400 mt-2">Coming in Task 9.</p>
        </div>
    );
}
```

**Step 4: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build
```
Expected: Builds without errors.

**Step 5: Commit**
```bash
git add src/components/ProtectedRoute.tsx src/pages/Admin.tsx src/App.tsx
git commit -m "feat: add ProtectedRoute and admin route with placeholder page"
```

---

## Task 9: Admin Review Page

**Files:**
- Modify: `src/pages/Admin.tsx` (replace placeholder)

**Context:** The admin page lets authenticated admins review pending signals. It uses the same dark theme and styling patterns as the Dashboard. Reads from `signals` collection, writes status updates.

**Step 1: Implement the full Admin page**

Replace `src/pages/Admin.tsx` with the full implementation:

```typescript
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';

type SignalStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface Signal {
    id: string;
    title: string;
    summary: string;
    source_url: string;
    source_name: string;
    published_date: string;
    risk_categories: string[];
    severity_hint: 'Critical' | 'Emerging' | 'Horizon';
    affected_groups: string[];
    confidence_score: number;
    status: SignalStatus;
    admin_notes?: string;
    fetched_at: { seconds: number } | null;
}

const RISK_LABELS: Record<string, string> = {
    R01: 'Algorithmic Discrimination',
    R02: 'Privacy Erosion',
    R03: 'Disinformation',
    R04: 'Labor Displacement',
    R05: 'Autonomous Weapons',
    R06: 'Power Concentration',
    R07: 'Environmental Cost',
    R08: 'Human Agency Loss',
    R09: 'Surveillance',
    R10: 'Model Collapse',
};

const STATUS_COLORS: Record<SignalStatus, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10',
    approved: 'text-green-400 bg-green-400/10',
    rejected: 'text-red-400 bg-red-400/10',
    edited: 'text-blue-400 bg-blue-400/10',
};

export default function Admin() {
    const { user, logOut } = useAuth();
    const navigate = useNavigate();
    const [signals, setSignals] = useState<Signal[]>([]);
    const [filter, setFilter] = useState<SignalStatus | 'all'>('pending');
    const [selected, setSelected] = useState<Signal | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        const constraints = [orderBy('fetched_at', 'desc')];
        if (filter !== 'all') {
            constraints.unshift(where('status', '==', filter));
        }
        const q = query(collection(db, 'signals'), ...constraints);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as Signal[];
            setSignals(docs);
        });

        return unsubscribe;
    }, [filter]);

    const updateSignal = async (id: string, status: SignalStatus) => {
        if (status === 'rejected' && !adminNotes.trim()) {
            alert('Please add a note explaining why this signal is rejected.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'signals', id), {
                status,
                admin_notes: adminNotes || null,
                reviewed_at: serverTimestamp(),
                reviewed_by: user?.uid ?? null,
            });
            setSelected(null);
            setAdminNotes('');
        } finally {
            setUpdating(false);
        }
    };

    const severityColor = (hint: string) => {
        if (hint === 'Critical') return 'text-red-400';
        if (hint === 'Emerging') return 'text-orange-400';
        return 'text-gray-400';
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white transition-colors">
                        &larr; Observatory
                    </button>
                    <h1 className="text-lg font-bold">Signal Review</h1>
                    <span className="text-xs text-gray-500">
                        {signals.length} signal{signals.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors">
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="flex h-[calc(100vh-57px)]">
                {/* Left: Filter + List */}
                <div className="w-80 border-r border-white/10 flex flex-col">
                    {/* Filters */}
                    <div className="flex gap-1 p-3 border-b border-white/10">
                        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                                    filter === f
                                        ? 'bg-white/10 text-white'
                                        : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Signal List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {signals.map((signal) => (
                            <div
                                key={signal.id}
                                onClick={() => { setSelected(signal); setAdminNotes(signal.admin_notes ?? ''); }}
                                className={`p-3 rounded cursor-pointer transition-all ${
                                    selected?.id === signal.id
                                        ? 'bg-cyan-950/50 border-l-2 border-cyan-400'
                                        : 'hover:bg-white/5'
                                }`}
                            >
                                <div className="text-sm font-medium line-clamp-2">{signal.title}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-gray-500">{signal.source_name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[signal.status]}`}>
                                        {signal.status}
                                    </span>
                                    {signal.confidence_score >= 0.9 && (
                                        <span className="text-[9px] text-green-400">HIGH</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {signals.length === 0 && (
                            <div className="text-center text-gray-500 text-sm py-8">
                                No {filter === 'all' ? '' : filter} signals
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 overflow-y-auto p-6">
                    {selected ? (
                        <div className="max-w-2xl">
                            <h2 className="text-xl font-bold mb-2">{selected.title}</h2>

                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-xs text-gray-500">{selected.source_name}</span>
                                <span className="text-xs text-gray-500">{selected.published_date?.slice(0, 10)}</span>
                                {selected.source_url && (
                                    <a
                                        href={selected.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-cyan-400 hover:underline"
                                    >
                                        Source &rarr;
                                    </a>
                                )}
                            </div>

                            <p className="text-sm text-gray-300 leading-relaxed mb-6">{selected.summary}</p>

                            {/* Classification */}
                            <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
                                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Gemini Classification</h3>

                                <div>
                                    <span className="text-[10px] text-gray-500">Risk Categories</span>
                                    <div className="flex gap-1 mt-1">
                                        {selected.risk_categories.map((rc) => (
                                            <span key={rc} className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                                                {rc}: {RISK_LABELS[rc] ?? rc}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-6">
                                    <div>
                                        <span className="text-[10px] text-gray-500">Severity</span>
                                        <div className={`text-sm font-bold ${severityColor(selected.severity_hint)}`}>
                                            {selected.severity_hint}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-500">Confidence</span>
                                        <div className="text-sm font-bold">
                                            {Math.round(selected.confidence_score * 100)}%
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-gray-500">Affected Groups</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selected.affected_groups.map((g) => (
                                            <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300">
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Admin Notes */}
                            <div className="mb-4">
                                <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                                <textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add context or reason for rejection..."
                                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-cyan-400/50"
                                />
                            </div>

                            {/* Actions */}
                            {selected.status === 'pending' && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => updateSignal(selected.id, 'approved')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'rejected')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'edited')}
                                        disabled={updating}
                                        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Approve (Edited)
                                    </button>
                                </div>
                            )}

                            {selected.status !== 'pending' && (
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[selected.status]}`}>
                                        {selected.status}
                                    </span>
                                    <button
                                        onClick={() => updateSignal(selected.id, 'pending')}
                                        disabled={updating}
                                        className="text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        Reset to Pending
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                            Select a signal to review
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build
```
Expected: Builds without errors.

**Step 3: Commit**
```bash
git add src/pages/Admin.tsx
git commit -m "feat: implement admin signal review page with approve/reject/edit workflow"
```

---

## Task 10: Modify RiskContext — Add Live Signals Subscription

**Files:**
- Modify: `src/store/RiskContext.tsx`

**Context:** Add a Firestore subscription for approved signals. Merge them into each risk's `signal_evidence` array so the Dashboard displays live signals alongside seed data. Expose via the existing `useRisks()` hook.

**Step 1: Update `src/store/RiskContext.tsx`**

Add a `liveSignals` state, a second Firestore subscription for approved signals, and a merge function. The key changes:

1. Add `LiveSignal` interface
2. Add `liveSignals` to state and context
3. Add `onSnapshot` subscription for approved signals
4. Add a `mergedRisks` computed value that appends live signals to each risk's `signal_evidence`

```typescript
import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { collection, getDocs, query, where, onSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SignalEvidence {
    date: string;
    isNew: boolean;
    headline: string;
    source: string;
    url?: string;
    isLive?: boolean; // true for signals from the Signal Scout pipeline
}

export interface TimelineNarrative {
    near_term: string;
    mid_term: string;
    long_term: string;
}

export interface Risk {
    id: string;
    risk_name: string;
    category: string;
    score_2026: number;
    score_2035: number;
    connected_to: string[];
    velocity: 'High' | 'Medium' | 'Low' | 'Critical';
    summary: string;
    deep_dive: string;
    who_affected: string[];
    timeline_narrative: TimelineNarrative;
    mitigation_strategies: string[];
    signal_evidence: SignalEvidence[];
    expert_severity: number;
    public_perception: number;
}

export interface Solution {
    id: string;
    parent_risk_id: string;
    solution_title: string;
    solution_type: string;
    summary: string;
    deep_dive: string;
    implementation_stage: string;
    adoption_score_2026: number;
    adoption_score_2035: number;
    key_players: string[];
    barriers: string[];
    timeline_narrative: TimelineNarrative;
}

interface LiveSignal {
    id: string;
    title: string;
    summary: string;
    source_url: string;
    source_name: string;
    published_date: string;
    risk_categories: string[];
}

interface RiskContextType {
    risks: Risk[];
    solutions: Solution[];
    loading: boolean;
    error: string | null;
}

const RiskContext = createContext<RiskContextType | undefined>(undefined);

export function RiskProvider({ children }: { children: ReactNode }) {
    const [baseRisks, setBaseRisks] = useState<Risk[]>([]);
    const [solutions, setSolutions] = useState<Solution[]>([]);
    const [liveSignals, setLiveSignals] = useState<LiveSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch base risks and solutions (one-time)
    useEffect(() => {
        async function fetchData() {
            try {
                const risksSnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'risks'));
                const fetchedRisks: Risk[] = [];
                risksSnapshot.forEach((doc) => {
                    fetchedRisks.push({ id: doc.id, ...doc.data() } as Risk);
                });
                setBaseRisks(fetchedRisks);

                const solutionsSnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'solutions'));
                const fetchedSolutions: Solution[] = [];
                solutionsSnapshot.forEach((doc) => {
                    fetchedSolutions.push({ id: doc.id, ...doc.data() } as Solution);
                });
                setSolutions(fetchedSolutions);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to fetch data';
                console.error("Error fetching data:", err);
                setError(message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Subscribe to approved live signals (real-time)
    useEffect(() => {
        const q = query(
            collection(db, 'signals'),
            where('status', 'in', ['approved', 'edited'])
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const signals: LiveSignal[] = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as LiveSignal[];
            setLiveSignals(signals);
        }, (err) => {
            console.error("Error subscribing to live signals:", err);
        });
        return unsubscribe;
    }, []);

    // Merge live signals into risks
    const risks = useMemo(() => {
        if (liveSignals.length === 0) return baseRisks;

        return baseRisks.map((risk) => {
            const matching = liveSignals.filter((s) =>
                s.risk_categories.includes(risk.id)
            );
            if (matching.length === 0) return risk;

            const existingUrls = new Set(
                risk.signal_evidence.map((se) => se.url).filter(Boolean)
            );

            const newEvidence: SignalEvidence[] = matching
                .filter((s) => !existingUrls.has(s.source_url))
                .map((s) => ({
                    date: s.published_date?.slice(0, 10) ?? '',
                    isNew: true,
                    headline: s.title,
                    source: s.source_name,
                    url: s.source_url,
                    isLive: true,
                }));

            return {
                ...risk,
                signal_evidence: [...newEvidence, ...risk.signal_evidence],
            };
        });
    }, [baseRisks, liveSignals]);

    return (
        <RiskContext.Provider value={{ risks, solutions, loading, error }}>
            {children}
        </RiskContext.Provider>
    );
}

export function useRisks() {
    const context = useContext(RiskContext);
    if (context === undefined) {
        throw new Error('useRisks must be used within a RiskProvider');
    }
    return context;
}
```

**Step 2: Verify build**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build
```
Expected: Builds without errors.

**Step 3: Commit**
```bash
git add src/store/RiskContext.tsx
git commit -m "feat: add live signals subscription and merge into risk evidence feed"
```

---

## Task 11: Dashboard — Live Signal Indicator

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Context:** Add a pulsing dot next to signals that came from the Signal Scout pipeline (`isLive: true`). This is a minimal change — find where `signal_evidence` items are rendered and add the indicator.

**Step 1: Find the signal evidence rendering section in Dashboard.tsx**

Look for where `signal_evidence` is mapped. It will be in the right panel or center panel. Add a pulsing green dot before the headline for live signals.

The indicator JSX to add next to each signal headline:

```tsx
{signal.isLive && (
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />
)}
```

Add this inside the `.map()` over `signal_evidence`, right before the headline text.

**Step 2: Verify build and visual check**

Run:
```bash
cd /Users/dehakuran/Projects/ai-4-society && npm run build
```
Expected: Builds without errors.

**Step 3: Commit**
```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: add pulsing live indicator for Signal Scout evidence items"
```

---

## Task 12: Update Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

**Context:** The current rules allow all reads and writes (`allow read, write: if true`). Update to properly secure the signals collection and admin access.

**Step 1: Replace `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Risks and solutions: public read, no client write
    match /risks/{riskId} {
      allow read: if true;
      allow write: if false;
    }
    match /solutions/{solutionId} {
      allow read: if true;
      allow write: if false;
    }

    // Signals: public read for approved, admin read for all, admin write
    match /signals/{signalId} {
      allow read: if resource.data.status in ['approved', 'edited']
                  || isAdmin();
      allow write: if isAdmin();
    }

    // Admins collection: only readable by authenticated users
    match /admins/{userId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
  }
}
```

**Step 2: Commit**
```bash
git add firestore.rules
git commit -m "feat: update Firestore rules for signals collection and admin access"
```

---

## Task 13: Seed Admin User & Test End-to-End

**Files:**
- Create: `src/scripts/seed-admin.ts`

**Context:** Create a script to add your Firebase Auth UID to the `admins` collection. This is needed to access the admin page.

**Step 1: Create `src/scripts/seed-admin.ts`**

```typescript
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

initializeApp({ projectId: 'ai-4-society' });
const db = getFirestore();

// Replace with your actual Firebase Auth UID after first Google sign-in
const ADMIN_UID = process.argv[2];

if (!ADMIN_UID) {
    console.error('Usage: npm run seed:admin <firebase-auth-uid>');
    console.error('Get your UID from the Firebase Auth emulator UI at http://localhost:4000/auth');
    process.exit(1);
}

async function seedAdmin() {
    await db.collection('admins').doc(ADMIN_UID).set({
        created_at: new Date().toISOString(),
        role: 'admin',
    });
    console.log(`Admin user ${ADMIN_UID} added.`);
}

seedAdmin().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
```

**Step 2: Add npm script to `package.json`**

Add to `"scripts"`:
```json
"seed:admin": "ts-node src/scripts/seed-admin.ts"
```

**Step 3: Commit**
```bash
git add src/scripts/seed-admin.ts package.json
git commit -m "feat: add admin seed script for Firebase Auth user"
```

---

## Task 14: Create `.env.example` and Document Setup

**Files:**
- Create: `.env.example`
- Modify: `functions/.env.example` (create)

**Context:** Document the required environment variables for the project.

**Step 1: Create `.env.example` (frontend)**

```env
# Firebase Config (optional for emulator, required for production)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=ai-4-society.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ai-4-society
VITE_FIREBASE_STORAGE_BUCKET=ai-4-society.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
```

**Step 2: Create `functions/.env.example`**

```env
# Set via: firebase functions:secrets:set GEMINI_API_KEY
# The Gemini API key is stored as a Firebase secret, not in .env
# See: https://firebase.google.com/docs/functions/config-env#secret-manager
```

**Step 3: Commit**
```bash
git add .env.example functions/.env.example
git commit -m "docs: add .env.example files for frontend and functions"
```

---

## Summary: Task Dependency Order

```
Task 1:  Seed data (10 risks + 10 solutions)          — independent
Task 2:  Cloud Functions scaffold                       — independent
Task 3:  Signal Scout fetcher                           — depends on Task 2
Task 4:  Signal Scout classifier (Gemini)               — depends on Task 2
Task 5:  Signal Scout store                             — depends on Task 2
Task 6:  Wire up scheduled function                     — depends on Tasks 3, 4, 5
Task 7:  Firebase Auth setup                            — independent
Task 8:  Protected Route + admin route                  — depends on Task 7
Task 9:  Admin review page                              — depends on Tasks 7, 8
Task 10: RiskContext live signals subscription           — independent
Task 11: Dashboard live signal indicator                — depends on Task 10
Task 12: Firestore security rules                       — independent
Task 13: Seed admin user script                         — depends on Task 7
Task 14: Environment docs                               — independent
```

**Parallelizable groups:**
- Group A (backend): Tasks 2 → 3, 4, 5 (parallel) → 6
- Group B (auth): Tasks 7 → 8 → 9, 13
- Group C (dashboard): Tasks 10 → 11
- Group D (infra): Tasks 1, 12, 14 (all independent)
