# Reviewer Onboarding & Help System — Design Document

**Date:** 2026-02-28
**Status:** Approved

## Problem

After a lead approves a new reviewer, there's zero guidance — the user suddenly sees an "Admin" button and must figure out their tabs on their own. There's no tutorial, no glossary, no explanation of what R01-R10 means or how the pipeline works. This leads to confusion, mistakes, and support burden on leads.

## Solution

A three-layer onboarding and help system:

1. **Accountability Acknowledgment Modal** — gate before any admin access
2. **Interactive Tutorial Overlay** — role-specific step-by-step walkthrough per tab
3. **Contextual Help Panel + Reference Page** — persistent help accessible anytime

---

## 1. Accountability Acknowledgment Modal

Appears on first `/admin` visit after approval. Full-screen, no close button. Only way past: clicking the acknowledgment button.

**Content:**

> **Welcome to the AI 4 Society Observatory**
>
> You have been granted reviewer access to this platform. Before you begin, please read and acknowledge the following.
>
> The AI 4 Society Observatory is a public intelligence resource. The decisions you make as a reviewer — approving signals, validating risk scores, or shaping new categories — directly influence the information that researchers, policymakers, and the public rely on.
>
> By proceeding, you acknowledge that:
>
> - You will review each item carefully and in good faith, applying your honest judgment
> - You understand that approved content becomes part of a public record
> - You will not approve, reject, or modify content to serve personal, commercial, or political interests
> - You will flag or escalate items you are uncertain about rather than guessing
> - Inaction is safe — unreviewed items remain pending and never publish automatically
>
> All reviewer actions are logged with your identity and timestamp for transparency and accountability.

**Button:** "I Understand and Acknowledge"

**Storage:** `acknowledgedAt: Timestamp` field on `/users/{uid}`. If null/missing, modal blocks admin access.

---

## 2. Interactive Tutorial Overlay

Triggers immediately after acknowledgment modal on first admin visit. Uses a spotlight pattern — dims the page, highlights one element at a time with a tooltip.

### Tutorial Engine

- Spotlight dims background with a semi-transparent overlay
- Highlighted element is "cut out" from the overlay
- Tooltip positioned next to the highlighted element with step content
- Navigation: Back / Next / Skip Tutorial buttons
- Skipping shows a soft reminder: "You can revisit the tutorial anytime from the help menu"

### Role-Specific Tutorial Steps

**Signal Reviewer (Risk Signals tab):**
1. Tab bar — "These are your review tabs. Risk Signals and Solution Signals contain articles classified by our AI agent, Signal Scout."
2. Signal list — "Signals are grouped by date. Each one is an article about AI's societal impact, waiting for your review."
3. A signal item — "Click a signal to see its full details — summary, classification, severity, and source link."
4. Classification panel — "Signal Scout assigned these risk categories (R01-R10) and a severity level. Verify if the AI got it right."
5. Action buttons — "Approve if the classification is correct. Reject with a note if it's wrong or irrelevant. Approve (Edited) if you want to flag that the classification needed adjustment."
6. Bulk reject — "For days with many low-quality signals, you can reject an entire day at once with a shared note."

**Discovery Reviewer (Discovery tab):**
1. Proposal list — "These are AI-generated proposals for new risks or solutions not yet in our registry. The Discovery Agent clusters multiple signals to identify novel patterns."
2. A proposal — "Each proposal shows what's novel, supporting evidence, and suggested themes."
3. Narrative form — "To approve, you complete the narrative — give it a document ID (e.g. R11), name, and summary. This creates a new entry in the public registry."
4. Reject — "Reject with a note if the proposal is noise or already covered by an existing category."

**Scoring Reviewer (Validation tab):**
1. Proposal list — "The Validator Agent proposes updates to existing risk and solution scores based on recent signals."
2. Proposed changes — "Each change shows the current value, proposed value, and reasoning. You can edit the proposed value before approving."
3. Actions — "Approve to apply the changes to the live registry. Reject with a note if the evidence doesn't support the change."

**Editor (Milestones tab):**
- Covers milestone creation and narrative editing workflow.

**Lead (Users tab):**
- Covers reviewing applications, assigning roles, Observatory link.

### Multi-Role Users

If a user has multiple roles, the tutorial covers their first visible tab. Remaining tabs show their own mini-tutorial on first visit.

### Tracking

`onboardingCompleted: { [tabName]: boolean }` in `/users/{uid}`. Tutorial only shows once per tab.

---

## 3. Contextual Help Panel (per-tab)

Small `?` icon in each tab header, right-aligned. Opens a 300px slide-out panel from the right (overlays content, doesn't push layout).

**Panel structure per tab:**

1. **What This Tab Does** — 1-2 sentence overview
2. **Your Workflow** — numbered steps
3. **Key Terms** — glossary relevant to this tab:
   - Risk Signals: R01-R10 labels, severity levels, confidence scores
   - Solution Signals: S01-S10 labels, signal_type meanings
   - Discovery: what "novel" means, how proposals are generated, proposed_topic
   - Validation: how scores work, velocity, implementation stage, confidence
4. **Pipeline Context** — mini pipeline diagram with current stage highlighted
5. **Replay Tutorial** button — re-triggers the interactive overlay

**Close:** Click `?` again, click outside, or press Escape.

---

## 4. Help Reference Page (`/help`)

Accessible from "Help" link in admin header. Single scrollable page with anchor sections.

**Sections:**

1. **The Pipeline** — full flow diagram with descriptions of each stage and which agents/roles are involved
2. **Roles & Responsibilities** — expandable cards per role: what you review, your tabs, time commitment, inactivity implications
3. **Risk Taxonomy (R01-R10)** — code, full name, description, examples
4. **Solution Taxonomy (S01-S10)** — code, full name, description, which risk it addresses
5. **Glossary** — searchable list: signal types, severity levels, confidence, statuses, velocity, implementation stages
6. **FAQ** — "What happens if I approve something wrong?", "What does unmatched mean?", "How often should I review?", "Who do I escalate to?"

**Access:** All authenticated users with active roles. Not role-gated.

---

## Data Model

**Firestore changes to `/users/{uid}`:**

```
acknowledgedAt: Timestamp | null
onboardingCompleted: {
  'risk-signals': boolean,
  'solution-signals': boolean,
  'discovery': boolean,
  'validation': boolean,
  'milestones': boolean,
  'users': boolean
}
```

## Files

**New files (6):**

| File | Purpose |
|------|---------|
| `src/components/admin/AcknowledgmentModal.tsx` | Full-screen accountability gate |
| `src/components/admin/TutorialOverlay.tsx` | Spotlight step-by-step overlay engine |
| `src/components/admin/HelpPanel.tsx` | Slide-out contextual help per tab |
| `src/pages/Help.tsx` | Full reference page |
| `src/lib/tutorial-steps.ts` | Tutorial step definitions per role/tab |
| `src/lib/help-content.ts` | Static content for help panels, glossary, FAQ |

**Modified files (4):**

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Gate on acknowledgedAt, trigger tutorial, add ? button per tab, add Help link |
| `src/store/AuthContext.tsx` | Expose acknowledgedAt and onboardingCompleted from userDoc |
| `src/App.tsx` | Add /help route |
| `firestore.rules` | Allow active users to write acknowledgedAt and onboardingCompleted to own doc (verify existing rules cover this) |
