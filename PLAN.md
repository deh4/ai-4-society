# Admin Refactor + Taxonomy Pipeline Improvements — Implementation Plan

## Summary of Changes

9 requirements mapped to concrete implementation steps across frontend, backend, and data layer.

---

## Requirement 1: Classifier always uses latest risk/solutions graph

**Current:** Signal Scout's `classifyArticles()` receives `nodes: GraphNodeInfo[]` from the caller. The caller in `index.ts` reads `graph_snapshot/current` at runtime.

**Status:** Already correct — it reads the live graph snapshot each run. No code change needed.

**Verify:** `functions/src/agents/signal-scout/index.ts` fetches `graph_snapshot/current` before calling `classifyArticles()`.

---

## Requirement 2: Keep RELEVANCE_THRESHOLD at 0.8

**Current:** `classifier.ts` line 40: `RELEVANCE_THRESHOLD = 0.8`

**Status:** No change. Threshold stays.

---

## Requirement 3: Discovery Agent reads ALL signals (including rejected), highlights signal quality

### 3a. Backend — Discovery Agent reads all statuses

**File:** `functions/src/agents/discovery/index.ts`

**Change:** Classified signal query (line 33):
- FROM: `status IN ["pending", "approved", "edited"]`
- TO: `status IN ["pending", "approved", "edited", "rejected"]`

Unmatched signals: already have no status filter — no change.

### 3b. Backend — Discovery Agent passes signal status to analyzer

**File:** `functions/src/agents/discovery/index.ts`

Pass `status` field for each signal to the analyzer so Gemini can see which signals humans rejected vs approved.

### 3c. Backend — Analyzer prompt update

**File:** `functions/src/agents/discovery/analyzer.ts`

Update Gemini prompt to include signal review status. Instruct Gemini to flag when proposals rely heavily on unmatched/rejected signals. Add to the response schema:

```typescript
{
  // existing fields...
  signal_quality_summary: string;  // e.g. "3 of 5 supporting signals are unmatched"
  unmatched_signal_count: number;
  rejected_signal_count: number;
}
```

### 3d. Backend — Store quality metadata on proposals

**File:** `functions/src/agents/discovery/store.ts`

Store `signal_quality_summary`, `unmatched_signal_count`, `rejected_signal_count` on each `graph_proposals` document.

### 3e. Frontend — Discovery detail panel shows signal quality

In the new Discovery review tab, display:
- Signal quality summary badge (e.g. "3/5 unmatched signals")
- Color coding: all-approved = green, mixed = amber, mostly-rejected/unmatched = red
- Each supporting signal shows its status (approved/rejected/pending/unmatched)

---

## Requirement 4: No changes to Validator Agent

Confirmed. No backend changes for validator.

---

## Requirement 5: Editorial Hook Agent — narrative curation with featured images

### 5a. Schema — Add image fields to EditorialHook

**File:** `src/types/editorial.ts`

Add fields:
```typescript
  featured_image_url?: string;      // URL to mobile-friendly image
  featured_image_alt?: string;      // Accessibility alt text
  narrative_headline?: string;      // Short headline for the narrative (editable)
```

### 5b. Backend — Feed Curator generates image suggestions

**File:** `functions/src/agents/feed-curator/index.ts`

After generating hook text, add a second Gemini call to generate:
- A search query for finding a relevant featured image
- Alt text suggestion
- Optional: call an image API (Unsplash/Pexels) to auto-fetch a Creative Commons image URL

### 5c. Frontend — EditorialReviewTab enhancement

**File:** `src/components/admin/EditorialReviewTab.tsx`

Add to detail panel:
- Image preview (if auto-fetched)
- Image URL input field (admin can paste/replace)
- Image upload button (stores to Firebase Storage, writes URL)
- Alt text field (editable)
- Narrative headline field (editable, separate from hook_text)
- Mobile preview toggle showing how it looks on the homepage

### 5d. Frontend — FeaturedStory shows image

**File:** `src/components/landing/FeaturedStory.tsx`

Add featured image display in the carousel card. Fallback to a gradient/pattern if no image.

---

## Requirement 6: Agents tab stays as-is

No changes to AgentsSection or AgentDetailPanel.

---

## Requirement 7: Users tab stays as-is

No changes to UsersTab.

---

## Requirement 8: Podcast Agent placeholder

### 8a. Agent registry

**File:** `src/data/agentConfig.ts`

Add to `AGENT_IDS`: `"podcast"`
Add label: `"podcast": "Podcast Agent"`
Add schedule: `"podcast": "Weekly (Fri 12:00 UTC)"`

### 8b. Agent detail panel

**File:** `src/components/admin/AgentDetailPanel.tsx`

Add to `TRIGGER_MAP`: `"podcast": "triggerPodcast"`
Show "Coming Soon" badge when agent has no health data yet.

### 8c. Backend placeholder

**File:** `functions/src/agents/podcast/index.ts` (new)

Minimal Cloud Function that:
- Logs "Podcast agent not yet implemented"
- Writes a health doc so the admin panel can show it
- Exports `scheduledPodcast` (no-op schedule) and `triggerPodcast` (callable that returns placeholder)

**File:** `functions/src/index.ts`

Add export line.

---

## Requirement 9: Task assignment system

### 9a. Schema — Add assignment fields

**Files to update:**
- `src/types/signal.ts` or `src/types/taxonomy.ts`
- `src/types/editorial.ts`
- Graph proposal type

Add to all reviewable documents:
```typescript
  assigned_to?: string;       // UID of assigned reviewer
  assigned_by?: string;       // UID of assigner (lead)
  assigned_at?: Timestamp;    // When assigned
```

### 9b. Firestore — Write assignment

Create helper in `src/data/assignments.ts`:
```typescript
assignItem(collection: string, docId: string, assigneeUid: string, assignerUid: string)
unassignItem(collection: string, docId: string)
getMyAssignments(uid: string, collection: string) → docs where assigned_to == uid
```

### 9c. Frontend — Assignment UI in each review tab

Each review tab's detail panel gets:
- "Assign to" dropdown showing active users with the relevant role
  - Risk/Solution Signals tab → users with `signal-reviewer` or `lead`
  - Discovery tab → users with `discovery-reviewer` or `lead`
  - Scoring tab → users with `scoring-reviewer` or `lead`
  - Editorial tab → users with `editor` or `lead`
- "Assigned to: [Name]" badge on list cards
- Filter: "My assignments" / "Unassigned" / "All"

### 9d. Frontend — Assignment indicator on list cards

Each ReviewItemCard shows:
- Small avatar/initials of assignee (if assigned)
- "You" badge if assigned to current user
- Unassigned items show no badge

### 9e. Firestore rules — Assignment validation

Only `lead` role can assign items. Reviewers can only self-assign (pick from unassigned queue).

---

## Admin Tab Refactor (Core UI restructuring)

### New tab structure

```
type AdminSection =
  | "risk-signals"     // signal_type: "risk" | "both"
  | "solution-signals" // signal_type: "solution" | "both"
  | "discovery"        // graph_proposals: new_node / new_edge
  | "scoring"          // graph_proposals: update_node
  | "editorial"        // editorial_hooks
  | "agents"           // agent health/config
  | "users";           // user management
```

### RBAC mapping (already in roles.ts lines 36-39)

```typescript
ROLE_TAB_ACCESS = {
  'risk-signals':     ['signal-reviewer', 'lead'],
  'solution-signals': ['signal-reviewer', 'lead'],
  'discovery':        ['discovery-reviewer', 'lead'],
  'scoring':          ['scoring-reviewer', 'lead'],     // was 'validation'
  'editorial':        ['editor', 'lead'],
  'agents':           ['lead'],
  'users':            ['lead'],
}
```

### Files to create (new components)

1. **`src/components/admin/RiskSignalsTab.tsx`**
   - Own Firestore subscription: `signals` where `signal_type IN ["risk", "both"]`
   - Groups signals by `fetched_at` date (truncate to calendar day)
   - Collapsible date groups, newest first
   - Left panel: grouped signal list with bulk select per group
   - Right panel: signal detail (extracted from current Admin.tsx renderSignalDetail)
   - Bulk approve + bulk reject with notes
   - Assignment dropdown in detail panel

2. **`src/components/admin/SolutionSignalsTab.tsx`**
   - Same structure as RiskSignalsTab
   - Firestore subscription: `signals` where `signal_type IN ["solution", "both"]`
   - "both" signals appear in BOTH tabs — same Firestore doc, action in one reflects in other

3. **`src/components/admin/DiscoveryTab.tsx`** (replace legacy)
   - Own Firestore subscription: `graph_proposals` where `proposal_type IN ["new_node", "new_edge"]`
   - Shows signal quality summary (from requirement 3e)
   - Supporting signals section shows each signal's review status
   - Unmatched signals visible as context section
   - Bulk approve + bulk reject
   - Assignment dropdown

4. **`src/components/admin/ScoringTab.tsx`**
   - Own Firestore subscription: `graph_proposals` where `proposal_type == "update_node"`
   - Shows proposed changes diff (current vs proposed)
   - Bulk approve + bulk reject
   - Assignment dropdown

### Files to extract (shared components)

5. **`src/components/admin/AdminNotesInput.tsx`**
   - Shared textarea for admin notes (used in all detail panels)

6. **`src/components/admin/BulkActionBar.tsx`**
   - Shared bulk approve/reject bar with notes textarea
   - Props: `selectedCount`, `onApprove`, `onReject`, `updating`

7. **`src/components/admin/AssigneeDropdown.tsx`**
   - Shared user picker filtered by role
   - Props: `currentAssignee`, `allowedRoles`, `onAssign`

8. **`src/components/admin/SignalDateGroup.tsx`**
   - Collapsible group header showing date + signal count
   - Select all / deselect all per group

### Files to extract (hooks)

9. **`src/hooks/useSignalActions.ts`**
   - `handleSignalAction(id, status)` — approve/reject/edit/reset
   - `handleBulkAction(ids, status, notes)` — bulk approve or reject
   - Returns `{ handleSignalAction, handleBulkAction, updating }`

10. **`src/hooks/useProposalActions.ts`**
    - `handleProposalApprove(id)` — callable
    - `handleProposalReject(id, reason)` — callable
    - `handleBulkProposalAction(ids, status, reason)` — batch callable
    - Returns `{ handleProposalApprove, handleProposalReject, handleBulkProposalAction, updating }`

### Files to modify

11. **`src/pages/Admin.tsx`** — Gut and rewire
    - Remove: all inline renderXxxDetail functions, all review state, all action handlers
    - Keep: section navigation, header, acknowledgment modal
    - Replace: `UnifiedReviewList` usage with per-tab components
    - Target: ~150 lines (from 799)

12. **`src/lib/roles.ts`** — Update ROLE_TAB_ACCESS
    - Remove legacy `'review'` entry
    - Keep existing legacy entries (already correct for new tabs)
    - Update `AdminSection` type

13. **`src/components/admin/ReviewItemCard.tsx`** — Move type, enhance card
    - Move `ReviewItem` interface to `src/types/review.ts`
    - Add `assignedTo` display
    - Add date group awareness

### Files to delete

14. **Legacy components (dead code):**
    - `src/components/admin/DiscoveryTab.tsx` (old version, replaced by new)
    - `src/components/admin/ValidationTab.tsx`
    - `src/components/admin/RiskUpdatesTab.tsx`
    - `src/components/admin/SolutionUpdatesTab.tsx`
    - `src/components/admin/UnifiedReviewList.tsx` (replaced by per-tab lists)

---

## Implementation Order

### Phase 1: Backend changes (non-breaking)
1. Discovery Agent: read rejected signals + pass status to analyzer (3a-3d)
2. Podcast Agent placeholder (8a-8c)
3. Editorial hook schema: add image fields (5a)

### Phase 2: Extract shared components
4. Extract `AdminNotesInput`, `BulkActionBar`, `SignalDateGroup` (shared)
5. Extract `useSignalActions`, `useProposalActions` hooks
6. Move `ReviewItem` type to `src/types/review.ts`

### Phase 3: Build new tabs
7. `RiskSignalsTab` — with date grouping, bulk actions
8. `SolutionSignalsTab` — mirror of risk tab
9. `DiscoveryTab` (new) — with signal quality display
10. `ScoringTab` — with diff display
11. Enhance `EditorialReviewTab` — add image support (5c)

### Phase 4: Task assignment
12. Add assignment fields to schemas (9a)
13. Build `AssigneeDropdown` component (9c)
14. Wire assignment into each tab (9c-9d)
15. Firestore rules for assignment (9e)

### Phase 5: Rewire Admin.tsx + cleanup
16. Rewire `Admin.tsx` to use new tab components
17. Delete legacy components (UnifiedReviewList, old tabs)
18. Update RBAC in roles.ts
19. Update FeaturedStory for images (5d)
20. Update README.md per documentation rule
