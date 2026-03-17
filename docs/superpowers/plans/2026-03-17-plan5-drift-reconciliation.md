# Plan 5: Drift Reconciliation & Fixes

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three concrete schema/parsing bugs introduced across Plans 1–4. Tasks 3-5 from the original draft (DAL subscription abstraction) were dropped — they add complexity without fixing real bugs. This plan is scoped to only what's broken.

**Architecture:** Two type-level additions to match what backend agents actually write to Firestore, and one parsing fix in the admin review list that causes proposals to render with blank titles and empty bodies.

**Tech Stack:** TypeScript, React 19, Firebase/Firestore (client SDK)

---

## Chunk 1: Type Definitions Sync

### Task 1: Update Signal Types
**Files:**
- Modify: `src/types/signal.ts`

- [ ] **Step 1: Add `severity_hint` and `affected_groups` to `Signal` interface**
The backend Signal Scout agent extracts these two fields and saves them to Firestore. Without them in the type, TypeScript won't surface them in reviews or display logic.

```typescript
export interface Signal {
  // ... existing fields ...
  proposed_topic?: string;

  severity_hint?: "Critical" | "Emerging" | "Horizon";
  affected_groups?: string[];

  source_credibility: number;
  // ... existing fields ...
}
```

### Task 2: Update Proposal Types
**Files:**
- Modify: `src/types/proposal.ts`

- [ ] **Step 1: Add `node_type` to `update_data` in `GraphProposal`**
The Validator Agent writes `node_type` inside `update_data` to ensure correct database writes during approval. The field is used server-side to route the update to the right node collection.

```typescript
  update_data?: {
    node_id: string;
    node_name: string;
    node_type?: string;
    proposed_changes: Record<
      string,
      {
        current_value: unknown;
        proposed_value: unknown;
        reasoning: string;
      }
    >;
    overall_reasoning: string;
  };
```

---

## Chunk 2: Admin Parsing Fix

### Task 3: Fix UnifiedReviewList Nested Proposal Parsing
**Files:**
- Modify: `src/components/admin/UnifiedReviewList.tsx`

- [ ] **Step 1: Fix discovery proposal parsing to drill into `node_data` / `edge_data`**
The current implementation reads `data.proposed_changes?.name` and `data.node_type` from the root document. The actual Firestore structure from the Discovery Agent nests this data under `data.node_data` (for `new_node`) and `data.edge_data` (for `new_edge`). This causes blank titles and empty summaries in the review list.

Replace the discovery proposals `snap.docs.map(...)` block with:

```typescript
const discoveries: ReviewItem[] = snap.map((data) => {
  if (data.proposal_type === "new_node") {
    return {
      id: data.id,
      type: "discovery" as const,
      title: data.node_data?.name ?? "New node proposal",
      summary: data.node_data?.description ?? "",
      status: data.status,
      createdAt: data.created_at,
      proposedName: data.node_data?.name,
      proposalType: data.proposal_type,
      skeleton: data.node_data as Record<string, unknown>,
      supportingSignalIds: data.supporting_signal_ids ?? [],
    };
  } else {
    // new_edge
    return {
      id: data.id,
      type: "discovery" as const,
      title: `${data.edge_data?.from_node} → ${data.edge_data?.to_node}`,
      summary: data.edge_data?.reasoning ?? "",
      status: data.status,
      createdAt: data.created_at,
      proposedName: "New Edge",
      proposalType: data.proposal_type,
      skeleton: data.edge_data as Record<string, unknown>,
      supportingSignalIds: data.supporting_signal_ids ?? [],
    };
  }
});
```

- [ ] **Step 2: Fix validation proposal parsing to drill into `update_data`**
Similarly, the validation proposals block reads `data.node_name`, `data.overall_reasoning`, and `data.node_type` from the document root. These live under `data.update_data.*`.

Update the validation proposals `snap.docs.map(...)` block to read from `data.update_data`:
- `data.update_data?.node_name` (not `data.node_name`)
- `data.update_data?.overall_reasoning` (not `data.overall_reasoning`)
- `data.update_data?.node_type` (not `data.node_type`)
- `data.update_data?.proposed_changes` (not `data.proposed_changes`)

---

## Chunk 3: Commit

- [ ] **Step 1: Commit type fixes**
```bash
git add src/types/signal.ts src/types/proposal.ts
git commit -m "fix(types): add severity_hint, affected_groups to Signal; node_type to update_data"
```

- [ ] **Step 2: Commit parsing fix**
```bash
git add src/components/admin/UnifiedReviewList.tsx
git commit -m "fix(admin): drill into node_data/edge_data/update_data for proposal parsing"
```
