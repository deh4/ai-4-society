# Unmatched Signal Capture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture articles that describe novel AI risks/solutions not fitting the existing taxonomy, and feed them to the Discovery Agent for clustering into new category proposals.

**Architecture:** Signal Scout gets a new `"unmatched"` classification path that stores signals with a free-text `proposed_topic` instead of taxonomy codes. The Discovery Agent queries these unmatched signals alongside classified ones. A new "Emerging" tab in the admin UI lets reviewers see and triage unmatched signals.

**Tech Stack:** TypeScript, Firebase Cloud Functions, Gemini 2.5 Flash/Pro, React 19, Firestore

---

### Task 1: Extend Signal Scout classifier — types and prompt

**Files:**
- Modify: `functions/src/signal-scout/classifier.ts`

**Step 1: Update the `ClassifiedSignal` interface (line 5-17)**

Add `"unmatched"` to the `signal_type` union and add `proposed_topic`:

```typescript
export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both" | "unmatched";
  risk_categories: string[];
  solution_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  proposed_topic?: string;
}
```

**Step 2: Update the Gemini system prompt (line 50-88)**

Add the unmatched classification option. After the existing rules (line 82), add:

```
- If the article describes a genuine AI-related societal risk or solution that does NOT fit any existing R/S code, use signal_type: "unmatched" with a short proposed_topic label (3-8 words). risk_categories and solution_ids must both be empty [] for unmatched signals.
```

Update the JSON output format to include:
```json
{
  "index": 0,
  "relevant": true,
  "signal_type": "unmatched",
  "summary": "...",
  "proposed_topic": "<3-8 word label>",
  "risk_categories": [],
  "solution_ids": [],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["..."],
  "confidence_score": 0.85
}
```

**Step 3: Add `proposed_topic` to the parsed response type (line 139-149)**

Add `proposed_topic?: string;` to the parsed item interface.

**Step 4: Update validation logic (lines 161-182)**

After `const signalType = item.signal_type ?? "risk";` (line 161), add a branch for unmatched signals before the existing taxonomy checks:

```typescript
// Unmatched signals: skip taxonomy checks, require proposed_topic
if (signalType === "unmatched") {
  const topic = item.proposed_topic ?? "";
  if (!topic) {
    logger.info(`Dropping unmatched signal with no proposed_topic: ${batch[item.index]?.title}`);
    continue;
  }
  results.push({
    title: article.title,
    summary: item.summary ?? "",
    source_url: article.url,
    source_name: article.source_name,
    published_date: article.published_date,
    signal_type: "unmatched",
    risk_categories: [],
    solution_ids: [],
    severity_hint: item.severity_hint ?? "Emerging",
    affected_groups: item.affected_groups ?? [],
    confidence_score: confidence,
    proposed_topic: topic,
  });
  continue;
}
```

**Step 5: Build to verify**

Run: `cd functions && npm run build`
Expected: Clean compilation, no errors.

**Step 6: Commit**

```bash
git add functions/src/signal-scout/classifier.ts
git commit -m "feat(signal-scout): add unmatched signal classification path

Signals that are relevant but don't fit R01-R10/S01-S10 taxonomy
are now stored with signal_type 'unmatched' and a proposed_topic label
instead of being silently dropped."
```

---

### Task 2: Update Signal Scout store to persist `proposed_topic`

**Files:**
- Modify: `functions/src/signal-scout/store.ts`

**Step 1: Add `proposed_topic` to the Firestore document (line 32-46)**

In the `batch.set(ref, { ... })` call, add the field conditionally:

```typescript
batch.set(ref, {
  title: signal.title,
  summary: signal.summary,
  source_url: signal.source_url,
  source_name: signal.source_name,
  published_date: signal.published_date,
  signal_type: signal.signal_type,
  risk_categories: signal.risk_categories,
  solution_ids: signal.solution_ids,
  severity_hint: signal.severity_hint,
  affected_groups: signal.affected_groups,
  confidence_score: signal.confidence_score,
  status: "pending",
  fetched_at: FieldValue.serverTimestamp(),
  ...(signal.proposed_topic ? { proposed_topic: signal.proposed_topic } : {}),
});
```

**Step 2: Build to verify**

Run: `cd functions && npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add functions/src/signal-scout/store.ts
git commit -m "feat(signal-scout): store proposed_topic field for unmatched signals"
```

---

### Task 3: Update Discovery Agent analyzer to accept unmatched signals

**Files:**
- Modify: `functions/src/discovery-agent/analyzer.ts`

**Step 1: Add `UnmatchedSignal` interface and update function signature (after line 20)**

```typescript
export interface UnmatchedSignal {
  id: string;
  title: string;
  summary: string;
  proposed_topic: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
}
```

Update `analyzeSignals` signature to accept an optional unmatched signals array:

```typescript
export async function analyzeSignals(
  signals: ApprovedSignal[],
  unmatchedSignals: UnmatchedSignal[],
  risks: RegistryItem[],
  solutions: RegistryItem[],
  geminiApiKey: string
): Promise<DiscoveryResult> {
```

**Step 2: Add unmatched signals section to the prompt (after line 63)**

After the existing `signalText`, build the unmatched section:

```typescript
const unmatchedText = unmatchedSignals.length > 0
  ? unmatchedSignals
      .map(
        (s) =>
          `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
          `Proposed topic: ${s.proposed_topic}\n` +
          `Summary: ${s.summary}`
      )
      .join("\n\n")
  : "None";
```

Update the prompt (line 90) to include both sections:

```typescript
const prompt = `${registryText}\n\nCLASSIFIED SIGNALS (last 30 days):\n\n${signalText}\n\nUNMATCHED SIGNALS (potential novel topics — these did not fit existing taxonomy):\n\n${unmatchedText}`;
```

**Step 3: Update the system prompt (line 65) to mention unmatched signals**

Add after "Rules for a valid proposal:" section:

```
Pay special attention to UNMATCHED SIGNALS — these are articles that our classifier flagged as relevant but could not map to existing taxonomy codes. They are the strongest candidates for novel risks/solutions. Unmatched signals can be referenced by their IDs in supporting_signal_ids just like classified signals.
```

**Step 4: Update the valid signal ID set to include unmatched IDs (line 111)**

```typescript
const validSignalIds = new Set([
  ...signals.map((s) => s.id),
  ...unmatchedSignals.map((s) => s.id),
]);
```

**Step 5: Build to verify**

Run: `cd functions && npm run build`
Expected: Build will fail because `index.ts` still calls the old signature. That's fine — we fix it in Task 4.

**Step 6: Commit**

```bash
git add functions/src/discovery-agent/analyzer.ts
git commit -m "feat(discovery): accept unmatched signals for novel risk detection

Adds a separate UNMATCHED SIGNALS section to the Gemini prompt,
giving the Discovery Agent explicit visibility into articles that
didn't fit the existing taxonomy."
```

---

### Task 4: Update Discovery Agent pipeline in index.ts

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Import `UnmatchedSignal` type**

Update the import from `./discovery-agent/analyzer.js` to include `UnmatchedSignal`.

**Step 2: Add unmatched signals query (after the existing signals query, ~line 346)**

After the existing `signalsSnap` query, add:

```typescript
// Also fetch unmatched signals (any status) from last 30 days
const unmatchedSnap = await db
  .collection("signals")
  .where("signal_type", "==", "unmatched")
  .where("fetched_at", ">", cutoff)
  .orderBy("fetched_at", "desc")
  .get();

const unmatchedSignals = unmatchedSnap.docs.map((d) => ({
  id: d.id,
  title: (d.data().title as string) ?? "",
  summary: (d.data().summary as string) ?? "",
  proposed_topic: (d.data().proposed_topic as string) ?? "",
  severity_hint: (d.data().severity_hint as string) ?? "Emerging",
  source_name: (d.data().source_name as string) ?? "",
  published_date: (d.data().published_date as string) ?? "",
}));

logger.info(`Discovery: ${unmatchedSignals.length} unmatched signals in last 30 days`);
```

**Step 3: Update the minimum threshold check (line 362)**

Change from:
```typescript
if (signals.length < 5) {
```
To:
```typescript
if (signals.length < 5 && unmatchedSignals.length < 3) {
```

Update the log message and metrics accordingly to reflect both counts.

**Step 4: Update the `analyzeSignals` call (line 394)**

Pass the unmatched signals:
```typescript
const { proposals, tokenUsage } = await analyzeSignals(
  signals, unmatchedSignals, risks, solutions, geminiApiKey.value()
);
```

**Step 5: Build to verify**

Run: `cd functions && npm run build`
Expected: Clean compilation.

**Step 6: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(discovery): query unmatched signals and lower trigger threshold

Discovery Agent now fetches unmatched signals (any status) alongside
approved signals. Triggers if 5+ classified OR 3+ unmatched signals exist."
```

---

### Task 5: Add Emerging Signals tab to Admin UI — roles and tab config

**Files:**
- Modify: `src/lib/roles.ts`
- Modify: `src/pages/Admin.tsx`

**Step 1: Add tab access in roles.ts (line 29-36)**

Add the new tab to `ROLE_TAB_ACCESS`:

```typescript
export const ROLE_TAB_ACCESS: Record<string, UserRole[]> = {
    'risk-signals': ['signal-reviewer', 'lead'],
    'solution-signals': ['signal-reviewer', 'lead'],
    'emerging-signals': ['signal-reviewer', 'lead'],
    'discovery': ['discovery-reviewer', 'lead'],
    'validation': ['scoring-reviewer', 'lead'],
    'milestones': ['editor', 'lead'],
    'users': ['lead'],
};
```

**Step 2: Add tab config in Admin.tsx**

Update the `AdminTab` type (line 63):
```typescript
type AdminTab = 'risk-signals' | 'solution-signals' | 'emerging-signals' | 'discovery' | 'validation' | 'milestones' | 'users';
```

Add to `TAB_CONFIG` (line 65):
```typescript
'emerging-signals': { label: 'Emerging', accent: 'border-amber-400' },
```

Add to `ALL_TABS` array (line 74), between `'solution-signals'` and `'discovery'`:
```typescript
const ALL_TABS: AdminTab[] = ['risk-signals', 'solution-signals', 'emerging-signals', 'discovery', 'validation', 'milestones', 'users'];
```

**Step 3: Add `proposed_topic` to Signal interface (line 16-33)**

Add the field:
```typescript
proposed_topic?: string;
```

**Step 4: Update signal type filter (line 92)**

Include the emerging tab in the signal tab check. Change line 130:
```typescript
if (adminTab !== 'risk-signals' && adminTab !== 'solution-signals' && adminTab !== 'emerging-signals') return;
```

Update the `signalTypeValues` filter (line 92):
```typescript
const signalTypeValues = adminTab === 'risk-signals' ? ['risk', 'both']
    : adminTab === 'solution-signals' ? ['solution', 'both']
    : ['unmatched'];
```

**Step 5: Add the emerging tab to the signal tabs rendering condition (line 306)**

Change:
```typescript
{(adminTab === 'risk-signals' || adminTab === 'solution-signals') && (
```
To:
```typescript
{(adminTab === 'risk-signals' || adminTab === 'solution-signals' || adminTab === 'emerging-signals') && (
```

**Step 6: Update pending count tracking (line 111-127)**

Add `emerging` to the pending counts state:
```typescript
const [pendingCounts, setPendingCounts] = useState<{ risk: number; solution: number; emerging: number }>({ risk: 0, solution: 0, emerging: 0 });
```

In the snapshot handler, add counting for unmatched:
```typescript
else if (type === 'unmatched') emerging++;
```
(before the final `else risk++` fallback)

Wire up the pending count in the tab rendering (line 256):
```typescript
const pending = tab === 'risk-signals' ? pendingCounts.risk
    : tab === 'solution-signals' ? pendingCounts.solution
    : tab === 'emerging-signals' ? pendingCounts.emerging
    : 0;
```

Update the badge visibility condition (line 270):
```typescript
{(tab === 'risk-signals' || tab === 'solution-signals' || tab === 'emerging-signals') && pending > 0 && (
```

**Step 7: Update the detail panel classification section for emerging signals**

In the right-side detail panel, add a conditional block for the emerging tab (after the solution-signals block, around line 530):

```typescript
{adminTab === 'emerging-signals' && (
    <div>
        <span className="text-[10px] text-gray-500">Proposed Topic</span>
        <div className="flex gap-1 mt-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-amber-400/10 text-amber-400">
                {selected.proposed_topic ?? 'No topic'}
            </span>
        </div>
    </div>
)}
```

**Step 8: Update the signal list item to show proposed_topic badge for unmatched signals**

In the signal list item (around line 399-424), add a conditional for unmatched signals showing the proposed_topic:

```typescript
{signal.signal_type === 'unmatched' && signal.proposed_topic && (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400">
        {signal.proposed_topic}
    </span>
)}
```

**Step 9: Build to verify**

Run: `npm run build`
Expected: Clean build.

**Step 10: Commit**

```bash
git add src/lib/roles.ts src/pages/Admin.tsx
git commit -m "feat(admin): add Emerging Signals tab for unmatched signal review

New amber-accented tab shows signals that didn't fit the R/S taxonomy,
with proposed_topic badges and pending count. Same review flow as
existing signal tabs."
```

---

### Task 6: Verify end-to-end and deploy functions

**Step 1: Final build check**

Run: `npm run build && cd functions && npm run build`
Expected: Both builds clean.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 3: Manual smoke test**

Run: `npm run dev`
- Navigate to Admin
- Verify the "Emerging" tab appears between "Solution Signals" and "Discovery"
- Verify it shows "No pending signals" (empty state)
- Verify tab has amber accent when selected

**Step 4: Commit any remaining fixes**

If any lint or build issues were found, fix and commit.

**Step 5: Deploy functions**

Run: `firebase use` to verify project is `ai-4-society`, then:
Run: `firebase deploy --only functions`

Push to main for hosting deployment via CI.
