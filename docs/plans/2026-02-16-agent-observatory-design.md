# Agent Observatory — Design Document

**Date:** 2026-02-16
**Status:** Approved
**Audience:** Small admin team (2-5 people)

## Overview

A dedicated `/observatory` page for monitoring health, diagnostics, configuration, and cost of all agents in the AI 4 Society platform. Shows all 7 planned agents (including undeployed ones) with per-agent detail views.

## Goals

- Centralized visibility into every agent's health, run history, and token/cost metrics
- Light runtime configuration (toggle data sources on/off) without redeploying
- Structured run summaries stored in Firestore (not raw Cloud Logging)
- Foundation that scales as agents 2-7 get built

## Approach

**Agent Registry pattern** — each agent gets a Firestore document tree under `agents/{agentId}` containing its registry info, config, health, and run history. The UI reads these via `onSnapshot` for real-time updates.

---

## Data Model

### `agents/{agentId}` — Registry Document

```typescript
interface AgentRegistryDoc {
  name: string;                    // "Signal Scout"
  description: string;             // Short purpose summary
  tier: string;                    // "2A", "2B", "2C", "1"
  status: 'active' | 'disabled' | 'not_deployed';
  deployedAt: Timestamp | null;
  functionName: string | null;     // "signalScout" — maps to Cloud Function
  schedule: string | null;         // "every 6 hours" — display only
  overseerRole: string;            // "Source Sentinel"
}
```

### `agents/{agentId}/config/current` — Runtime Config

Per-agent config shape. For Signal Scout:

```typescript
interface SignalScoutConfig {
  sources: Record<string, { enabled: boolean; name: string; type: 'rss' | 'api' }>;
  updatedAt: Timestamp;
  updatedBy: string;               // admin UID
}
```

Each future agent defines its own config shape in the same location.

### `agents/{agentId}/health/latest` — Health Snapshot

```typescript
interface AgentHealth {
  lastRunAt: Timestamp | null;
  lastRunOutcome: 'success' | 'partial' | 'empty' | 'error';
  lastError: string | null;
  lastErrorAt: Timestamp | null;
  consecutiveErrors: number;
  consecutiveEmptyRuns: number;
  // Token tracking
  lastRunTokens: { input: number; output: number } | null;
  totalTokensToday: { input: number; output: number };
  totalTokensMonth: { input: number; output: number };
  estimatedCostMonth: number;      // USD
  // Throughput
  lastRunArticlesFetched: number;
  lastRunSignalsStored: number;
  totalSignalsLifetime: number;
}
```

### `agents/{agentId}/runs/{auto-id}` — Run History

```typescript
interface AgentRunSummary {
  startedAt: Timestamp;
  completedAt: Timestamp;
  duration: number;                // ms
  outcome: 'success' | 'partial' | 'empty' | 'error';
  error: string | null;
  metrics: {
    articlesFetched: number;
    signalsStored: number;
    geminiCalls: number;
    tokensInput: number;
    tokensOutput: number;
    firestoreReads: number;
    firestoreWrites: number;
  };
  sourcesUsed: string[];
}
```

Runs older than 90 days are pruned by `dataLifecycle`.

---

## UI Design

### Route & Access

- **Route:** `/observatory` (new top-level route)
- **Protection:** `ProtectedRoute` (same as `/admin` — requires auth + admin)
- **Nav:** Added to the existing header/navbar alongside Dashboard and Admin links

### Agent List View (default)

Grid of agent cards (responsive: 3 columns desktop, 2 tablet, 1 mobile).

Each card shows:
- **Status dot:** green (healthy), yellow (warning), red (error), gray (not deployed)
- **Agent name + tier**
- **Status label:** Active / Disabled / Not Deployed
- **Last run:** relative time (deployed agents only)

A **System Summary** panel aggregates across all active agents: total runs today, month's token usage, estimated cost, signals in pipeline.

Status dot logic (same as existing PipelineHealth):
- **Green:** last run < 7h ago AND consecutive errors < 2
- **Yellow:** last run 7-12h ago OR 3+ consecutive empty runs
- **Red:** last run > 12h ago OR 2+ consecutive errors
- **Gray:** status is `not_deployed`

### Agent Detail View (click a card)

Back arrow + agent name header. Three tabs for deployed agents:

**Health tab (default):**
- Current status, last run time + outcome + duration
- Last run metrics: articles fetched, signals stored, gemini calls, tokens in/out
- Monthly totals: total runs, tokens used, estimated cost
- Consecutive errors count
- Last error message (if any)

**Config tab:**
- Data sources list with toggle switches (enabled/disabled)
- Save Changes button — writes to `agents/{id}/config/current`
- View-only display for schedule and model (not editable from UI)

**Run History tab:**
- Table: time, outcome, duration, signals stored, tokens
- Rows expandable to show full metrics, sources used, error message

**For "Not Deployed" agents:** Detail view shows description, planned role, overseer role, and "Not yet deployed" status. No tabs.

### Design System

Same dark theme (CSS variables from `variables.css`), Tailwind utility classes. Status colors:
- Healthy/active: `--accent-structural` (cold blue / soft green)
- Error: `--accent-critical` (neon red / cyber gold)
- Warning: amber/yellow (`#F59E0B`)
- Not deployed: gray (`#6B7280`)

---

## Backend Changes

### Signal Scout Function Refactor

1. **Read config from Firestore:** At run start, fetch `agents/signal-scout/config/current` for enabled sources. Fall back to all-enabled if doc doesn't exist.

2. **Capture Gemini token counts:** Extract `usageMetadata.promptTokenCount` and `usageMetadata.candidatesTokenCount` from Gemini API responses. Accumulate across batch calls.

3. **Write structured run summary:** At run end, write to:
   - `agents/signal-scout/runs/{auto-id}` — full run summary
   - `agents/signal-scout/health/latest` — updated health snapshot with rolling token totals
   - `_pipeline_health/status` — keep for backward compat with existing PipelineHealth badge

### dataLifecycle Extension

Add cleanup: delete `agents/*/runs/*` docs older than 90 days.

### No New Cloud Functions

The `/observatory` page reads Firestore directly via `onSnapshot`. Existing HTTP endpoints (`usageReport`, `pipelineHealth`) remain unchanged.

---

## Security Rules

```
agents/{agentId}                → public read
agents/{agentId}/config/{doc}   → admin read + write
agents/{agentId}/health/{doc}   → admin read, server write only
agents/{agentId}/runs/{runId}   → admin read, server write only
```

---

## Migration & Seeding

A one-time `seed-agents.ts` script:
- Creates 7 agent registry docs from `.agent/AGENTIC_FRAMEWORK_ARCHITECTURE.md` data
- Populates Signal Scout config doc from current `sources.ts` values
- Sets Signal Scout status to `active`, others to `not_deployed`

Existing `_pipeline_health` and `_usage` data remains in place. No destructive migration.
