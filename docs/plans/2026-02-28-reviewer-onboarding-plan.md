# Reviewer Onboarding & Help System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an accountability acknowledgment gate, interactive per-tab tutorial overlay, contextual help panels, and a full help reference page for new reviewers.

**Architecture:** Acknowledgment modal blocks admin access until user accepts (stored in Firestore). Tutorial overlay highlights UI elements step-by-step per role/tab. Help panel slides out per tab. Help page is a standalone route.

**Tech Stack:** React 19, TypeScript, Firestore, Tailwind 3.4, Framer Motion (for overlay animations)

---

### Task 1: Update Firestore rules and UserDoc type for onboarding fields

**Files:**
- Modify: `firestore.rules:61-65`
- Modify: `src/lib/roles.ts:12-26`

**Step 1: Update UserDoc interface in roles.ts**

Add the two new fields after `totalReviews`:

```typescript
export interface UserDoc {
    email: string;
    displayName: string;
    photoURL: string | null;
    roles: UserRole[];
    status: UserStatus;
    appliedRoles: UserRole[];
    applicationNote: string;
    appliedAt: { seconds: number } | null;
    approvedAt: { seconds: number } | null;
    approvedBy: string | null;
    lastActiveAt: { seconds: number } | null;
    totalReviews: number;
    acknowledgedAt: { seconds: number } | null;
    onboardingCompleted: Record<string, boolean>;
}
```

**Step 2: Update Firestore rules to allow self-write of onboarding fields**

Change the active user self-update rule (line 61-65) from:

```
      // Active users can update their own lastActiveAt (activity tracking)
      allow update: if request.auth != null
                    && request.auth.uid == userId
                    && isActiveUser()
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastActiveAt']);
```

To:

```
      // Active users can update their own activity and onboarding tracking
      allow update: if request.auth != null
                    && request.auth.uid == userId
                    && isActiveUser()
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
                         ['lastActiveAt', 'acknowledgedAt', 'onboardingCompleted']);
```

**Step 3: Build to verify**

Run: `cd /Users/dehakuran/Projects/ai-4-society && npm run build`

**Step 4: Commit**

```bash
git add src/lib/roles.ts firestore.rules
git commit -m "feat(onboarding): add acknowledgedAt and onboardingCompleted to UserDoc and Firestore rules

Active users can now write their own acknowledgment timestamp
and onboarding completion tracking to their user document.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create help content and tutorial steps data files

**Files:**
- Create: `src/lib/help-content.ts`
- Create: `src/lib/tutorial-steps.ts`

**Step 1: Create help-content.ts**

This file contains all static text for help panels, glossary, and FAQ. Create `src/lib/help-content.ts`:

```typescript
export const RISK_TAXONOMY: Record<string, { name: string; description: string }> = {
    R01: { name: 'Systemic Algorithmic Discrimination', description: 'Bias in hiring, healthcare, policing, and other automated decision systems that disproportionately affect marginalized groups.' },
    R02: { name: 'Privacy Erosion via Agentic AI', description: 'Data scraping, inference attacks, and prompt injection that compromise personal privacy at scale.' },
    R03: { name: 'AI-Amplified Disinformation', description: 'Deepfakes, synthetic media, and AI-generated content used for election interference and manipulation.' },
    R04: { name: 'Mass Labor Displacement', description: 'Job automation, economic polarization, and skill obsolescence driven by AI adoption.' },
    R05: { name: 'Autonomous Weapons', description: 'Lethal autonomous systems, military AI, and AI-driven conflict escalation.' },
    R06: { name: 'AI Power Concentration', description: 'Big Tech oligopoly, open-source vs closed model dynamics, and regulatory capture.' },
    R07: { name: 'Environmental Cost of AI', description: 'Energy consumption, water usage, e-waste, and carbon footprint of data centers and training runs.' },
    R08: { name: 'Loss of Human Agency', description: 'Cognitive atrophy, over-reliance on AI, and outsourcing of critical decisions to automated systems.' },
    R09: { name: 'AI in Surveillance', description: 'Facial recognition, social scoring, and authoritarian deployment of AI-powered monitoring.' },
    R10: { name: 'Model Collapse & Data Scarcity', description: 'Training data exhaustion, synthetic data feedback loops, and degradation of model quality.' },
};

export const SOLUTION_TAXONOMY: Record<string, { name: string; description: string; addresses: string }> = {
    S01: { name: 'Algorithmic Auditing & Fairness Certification', description: 'Standards and certification bodies for auditing AI systems for bias and fairness.', addresses: 'R01' },
    S02: { name: 'Privacy-Preserving AI', description: 'Federated learning, on-device processing, and differential privacy techniques.', addresses: 'R02' },
    S03: { name: 'Digital Content Provenance (C2PA)', description: 'Standards for tracking the origin and authenticity of digital content.', addresses: 'R03' },
    S04: { name: 'Workforce Transition Programs', description: 'Universal basic services, retraining programs, and AI-era labor policies.', addresses: 'R04' },
    S05: { name: 'International AI Arms Control', description: 'Treaties and agreements limiting autonomous weapons development.', addresses: 'R05' },
    S06: { name: 'Open-Source AI & Antitrust', description: 'Open-source AI initiatives and antitrust enforcement against AI monopolies.', addresses: 'R06' },
    S07: { name: 'Green AI Standards', description: 'Carbon-aware computing, energy-efficient training, and sustainability reporting.', addresses: 'R07' },
    S08: { name: 'Human Autonomy Frameworks', description: 'Digital wellbeing laws and frameworks preserving human decision-making authority.', addresses: 'R08' },
    S09: { name: 'Democratic AI Oversight', description: 'Surveillance moratoriums, democratic governance of AI, and transparency mandates.', addresses: 'R09' },
    S10: { name: 'Synthetic Data Standards & Data Commons', description: 'Quality standards for synthetic data and shared data commons initiatives.', addresses: 'R10' },
};

export const GLOSSARY: Array<{ term: string; definition: string }> = [
    { term: 'Signal', definition: 'A news article or report that has been classified by Signal Scout as relevant to AI societal impact.' },
    { term: 'Signal Type: risk', definition: 'Article primarily about an AI-related harm, negative trend, or societal risk.' },
    { term: 'Signal Type: solution', definition: 'Article primarily about a countermeasure, policy, or mitigation gaining traction.' },
    { term: 'Signal Type: both', definition: 'Article that covers both a risk and a response or solution to it.' },
    { term: 'Signal Type: unmatched', definition: 'Article deemed relevant by AI but not fitting any existing R/S taxonomy code. Flows directly to Discovery Agent.' },
    { term: 'Severity: Critical', definition: 'Immediate, significant impact. Requires urgent attention and likely affects large populations.' },
    { term: 'Severity: Emerging', definition: 'Growing concern with increasing evidence. Not yet critical but trending toward significant impact.' },
    { term: 'Severity: Horizon', definition: 'Early-stage risk on the radar. Limited evidence but worth monitoring for future escalation.' },
    { term: 'Confidence Score', definition: 'How confident the AI is in its classification (0.0-1.0). Signals below 0.8 are automatically filtered out.' },
    { term: 'Discovery Proposal', definition: 'An AI-generated recommendation for a new risk or solution category, based on clustering multiple signals.' },
    { term: 'Validation Proposal', definition: 'An AI-generated recommendation to update scores or fields on an existing risk or solution.' },
    { term: 'Proposed Topic', definition: 'A free-text label (3-8 words) assigned by Signal Scout to unmatched signals, describing the novel topic.' },
    { term: 'Velocity', definition: 'How fast a risk is developing. Levels: Critical, High, Medium, Low. Can only advance one stage at a time.' },
    { term: 'Implementation Stage', definition: 'How far along a solution is in real-world adoption. Can only advance one stage at a time.' },
];

export const TAB_HELP: Record<string, { title: string; description: string; workflow: string[]; terms: string[] }> = {
    'risk-signals': {
        title: 'Risk Signals',
        description: 'Articles classified by Signal Scout as related to AI societal risks. Each signal is linked to one or more risk categories (R01-R10).',
        workflow: [
            'Select a pending signal from the list',
            'Read the AI-generated summary and check the source link',
            'Verify the risk category assignment (R01-R10) and severity level',
            'Approve if correct, Reject with a note if wrong, or Approve (Edited) if adjusted',
        ],
        terms: ['Signal', 'Signal Type: risk', 'Signal Type: both', 'Severity: Critical', 'Severity: Emerging', 'Severity: Horizon', 'Confidence Score'],
    },
    'solution-signals': {
        title: 'Solution Signals',
        description: 'Articles classified by Signal Scout as related to AI countermeasures and solutions. Each signal is linked to one or more solution categories (S01-S10).',
        workflow: [
            'Select a pending signal from the list',
            'Read the AI-generated summary and check the source link',
            'Verify the solution category assignment (S01-S10)',
            'Approve if correct, Reject with a note if wrong, or Approve (Edited) if adjusted',
        ],
        terms: ['Signal', 'Signal Type: solution', 'Signal Type: both', 'Confidence Score'],
    },
    'discovery': {
        title: 'Discovery Proposals',
        description: 'AI-generated proposals for new risk or solution categories not yet in the registry. The Discovery Agent clusters multiple signals — including unmatched ones — to identify novel patterns.',
        workflow: [
            'Select a pending proposal from the list',
            'Read why the AI considers it novel and review the supporting signals',
            'To approve: assign a document ID (e.g. R11), name, and summary',
            'To reject: add a note explaining why it\'s noise or already covered',
        ],
        terms: ['Discovery Proposal', 'Signal Type: unmatched', 'Proposed Topic'],
    },
    'validation': {
        title: 'Validation Proposals',
        description: 'AI-generated recommendations to update scores or fields on existing risks and solutions, based on recent signal evidence.',
        workflow: [
            'Select a pending proposal from the list',
            'Review each proposed change: current value, proposed value, and reasoning',
            'Edit the proposed value if you disagree with the AI\'s suggestion',
            'Approve to apply changes to the live registry, or reject with a note',
        ],
        terms: ['Validation Proposal', 'Velocity', 'Implementation Stage', 'Confidence Score'],
    },
    'milestones': {
        title: 'Milestones',
        description: 'Key events and milestones in the AI societal impact landscape. Editors create and maintain timeline entries that appear on the public dashboard.',
        workflow: [
            'Review existing milestones for accuracy and completeness',
            'Create new milestones for significant events',
            'Edit narratives to keep content current and well-written',
        ],
        terms: [],
    },
    'users': {
        title: 'User Management',
        description: 'Review applications from new contributors and manage existing reviewer roles. Only available to leads.',
        workflow: [
            'Check the pending applications list',
            'Read the applicant\'s motivation note and requested roles',
            'Toggle the roles you want to assign',
            'Approve to activate the user, or reject with a reason',
        ],
        terms: [],
    },
};

export const FAQ: Array<{ question: string; answer: string }> = [
    { question: 'What happens if I approve something incorrectly?', answer: 'All actions are logged with your identity and timestamp. A lead can reverse any decision. Approved signals and proposals can be reset to pending or rejected after the fact.' },
    { question: 'What does "unmatched" mean?', answer: 'An unmatched signal is an article that Signal Scout flagged as relevant to AI societal impact, but couldn\'t classify into the existing R01-R10/S01-S10 taxonomy. These flow directly to the Discovery Agent, which clusters them into proposals for new categories.' },
    { question: 'How often should I review?', answer: 'Signal Scout runs every 6 hours, so new signals arrive regularly. Aim for at least one review session per week. Discovery and Validation proposals arrive weekly (Sunday and Monday respectively).' },
    { question: 'What if I\'m unsure about a signal?', answer: 'Skip it — leave it as pending. Inaction is always safe. Unreviewed items never publish automatically. If you need guidance, add a note and flag it for a lead to review.' },
    { question: 'Who do I escalate to?', answer: 'Flag items for the lead role by adding a note that starts with "ESCALATE:" — leads will see it in the admin notes.' },
    { question: 'Can I undo a rejection?', answer: 'Yes. Select the rejected item and click "Reset to Pending" to move it back into the review queue.' },
];

export const PIPELINE_STEPS = [
    { id: 'scout', label: 'Signal Scout', description: 'AI agent fetches articles every 6 hours and classifies them into risk/solution categories or flags them as unmatched.', agent: true },
    { id: 'signal-review', label: 'Signal Review', description: 'Signal reviewers approve or reject classified signals. Unmatched signals skip this step.', agent: false },
    { id: 'discovery', label: 'Discovery Agent', description: 'Weekly AI analysis clusters approved + unmatched signals to propose new risk/solution categories.', agent: true },
    { id: 'discovery-review', label: 'Discovery Review', description: 'Discovery reviewers evaluate proposals and create new registry entries from approved ones.', agent: false },
    { id: 'validator', label: 'Validator Agent', description: 'Weekly AI analysis proposes score and field updates for existing risks and solutions.', agent: true },
    { id: 'scoring-review', label: 'Scoring Review', description: 'Scoring reviewers approve or adjust proposed changes to the live registry.', agent: false },
];
```

**Step 2: Create tutorial-steps.ts**

Create `src/lib/tutorial-steps.ts`:

```typescript
export interface TutorialStep {
    /** CSS selector for the element to highlight */
    target: string;
    /** Tooltip title */
    title: string;
    /** Tooltip body text */
    content: string;
    /** Preferred tooltip position relative to target */
    position: 'top' | 'bottom' | 'left' | 'right';
}

export const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {
    'risk-signals': [
        {
            target: '[data-tutorial="tab-bar"]',
            title: 'Your Review Tabs',
            content: 'These are your review tabs. Risk Signals and Solution Signals contain articles classified by our AI agent, Signal Scout.',
            position: 'bottom',
        },
        {
            target: '[data-tutorial="signal-list"]',
            title: 'Signal List',
            content: 'Signals are grouped by date. Each one is an article about AI\'s societal impact, waiting for your review.',
            position: 'right',
        },
        {
            target: '[data-tutorial="signal-item"]',
            title: 'Signal Details',
            content: 'Click a signal to see its full details — summary, classification, severity, and source link.',
            position: 'right',
        },
        {
            target: '[data-tutorial="classification"]',
            title: 'AI Classification',
            content: 'Signal Scout assigned these risk categories (R01-R10) and a severity level. Verify if the AI got it right.',
            position: 'left',
        },
        {
            target: '[data-tutorial="actions"]',
            title: 'Review Actions',
            content: 'Approve if the classification is correct. Reject with a note if it\'s wrong or irrelevant. Approve (Edited) if you want to flag that the classification needed adjustment.',
            position: 'top',
        },
        {
            target: '[data-tutorial="bulk-reject"]',
            title: 'Bulk Reject',
            content: 'For days with many low-quality signals, you can reject an entire day at once with a shared note.',
            position: 'bottom',
        },
    ],
    'solution-signals': [
        {
            target: '[data-tutorial="signal-list"]',
            title: 'Solution Signals',
            content: 'These are articles about AI countermeasures and solutions, classified into S01-S10 categories. Same review flow as risk signals.',
            position: 'right',
        },
    ],
    'discovery': [
        {
            target: '[data-tutorial="proposal-list"]',
            title: 'Discovery Proposals',
            content: 'These are AI-generated proposals for new risks or solutions not yet in our registry. The Discovery Agent clusters multiple signals to identify novel patterns.',
            position: 'right',
        },
        {
            target: '[data-tutorial="proposal-detail"]',
            title: 'Proposal Details',
            content: 'Each proposal shows what\'s novel, supporting evidence, and suggested themes.',
            position: 'left',
        },
        {
            target: '[data-tutorial="narrative-form"]',
            title: 'Complete the Narrative',
            content: 'To approve, complete the narrative — assign a document ID (e.g. R11), name, and summary. This creates a new entry in the public registry.',
            position: 'left',
        },
        {
            target: '[data-tutorial="actions"]',
            title: 'Review Actions',
            content: 'Reject with a note if the proposal is noise or already covered by an existing category.',
            position: 'top',
        },
    ],
    'validation': [
        {
            target: '[data-tutorial="proposal-list"]',
            title: 'Validation Proposals',
            content: 'The Validator Agent proposes updates to existing risk and solution scores based on recent signals.',
            position: 'right',
        },
        {
            target: '[data-tutorial="proposed-changes"]',
            title: 'Proposed Changes',
            content: 'Each change shows the current value, proposed value, and reasoning. You can edit the proposed value before approving.',
            position: 'left',
        },
        {
            target: '[data-tutorial="actions"]',
            title: 'Review Actions',
            content: 'Approve to apply the changes to the live registry. Reject with a note if the evidence doesn\'t support the change.',
            position: 'top',
        },
    ],
    'milestones': [
        {
            target: '[data-tutorial="milestone-list"]',
            title: 'Milestones',
            content: 'Key events in the AI landscape. Create new milestones for significant events and edit narratives to keep content current.',
            position: 'right',
        },
    ],
    'users': [
        {
            target: '[data-tutorial="user-list"]',
            title: 'User Applications',
            content: 'Pending applications appear here. Review their motivation note and requested roles.',
            position: 'right',
        },
        {
            target: '[data-tutorial="role-assignment"]',
            title: 'Assign Roles',
            content: 'Toggle the roles you want to assign. You can grant any subset of what they requested.',
            position: 'left',
        },
        {
            target: '[data-tutorial="actions"]',
            title: 'Approve or Reject',
            content: 'Approve to activate the user, or reject with a reason. They\'ll see the result immediately.',
            position: 'top',
        },
    ],
};
```

**Step 3: Build to verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/lib/help-content.ts src/lib/tutorial-steps.ts
git commit -m "feat(onboarding): add help content and tutorial step definitions

Static content for glossary, FAQ, per-tab help, pipeline description,
risk/solution taxonomies, and role-specific tutorial step sequences.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create Acknowledgment Modal component

**Files:**
- Create: `src/components/admin/AcknowledgmentModal.tsx`

**Step 1: Create the component**

Create `src/components/admin/AcknowledgmentModal.tsx`:

```typescript
import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

export default function AcknowledgmentModal({ onComplete }: { onComplete: () => void }) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    const handleAcknowledge = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                acknowledgedAt: serverTimestamp(),
            });
            onComplete();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0f1a] border border-white/10 rounded-xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white">Welcome to the AI 4 Society Observatory</h2>

                <p className="text-sm text-gray-300 leading-relaxed">
                    You have been granted reviewer access to this platform. Before you begin, please read and acknowledge the following.
                </p>

                <p className="text-sm text-gray-300 leading-relaxed">
                    The AI 4 Society Observatory is a public intelligence resource. The decisions you make as a reviewer — approving signals, validating risk scores, or shaping new categories — directly influence the information that researchers, policymakers, and the public rely on.
                </p>

                <div className="bg-white/5 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-white">By proceeding, you acknowledge that:</p>
                    <ul className="space-y-2 text-sm text-gray-300">
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will review each item carefully and in good faith, applying your honest judgment</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You understand that approved content becomes part of a public record</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will not approve, reject, or modify content to serve personal, commercial, or political interests</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>You will flag or escalate items you are uncertain about rather than guessing</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-cyan-400 shrink-0">-</span>
                            <span>Inaction is safe — unreviewed items remain pending and never publish automatically</span>
                        </li>
                    </ul>
                </div>

                <p className="text-xs text-gray-500">
                    All reviewer actions are logged with your identity and timestamp for transparency and accountability.
                </p>

                <button
                    onClick={handleAcknowledge}
                    disabled={saving}
                    className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'I Understand and Acknowledge'}
                </button>
            </div>
        </div>
    );
}
```

**Step 2: Build to verify**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/components/admin/AcknowledgmentModal.tsx
git commit -m "feat(onboarding): add accountability acknowledgment modal

Full-screen modal shown on first admin visit. Blocks access until
the user acknowledges their responsibilities as a reviewer.
Stores acknowledgedAt timestamp in Firestore.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Create Tutorial Overlay component

**Files:**
- Create: `src/components/admin/TutorialOverlay.tsx`

**Step 1: Create the component**

Create `src/components/admin/TutorialOverlay.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';
import type { TutorialStep } from '../../lib/tutorial-steps';

interface Props {
    steps: TutorialStep[];
    tabName: string;
    onComplete: () => void;
}

export default function TutorialOverlay({ steps, tabName, onComplete }: Props) {
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    const step = steps[currentStep];

    const updateTargetRect = useCallback(() => {
        if (!step) return;
        const el = document.querySelector(step.target);
        if (el) {
            setTargetRect(el.getBoundingClientRect());
        } else {
            setTargetRect(null);
        }
    }, [step]);

    useEffect(() => {
        updateTargetRect();
        window.addEventListener('resize', updateTargetRect);
        window.addEventListener('scroll', updateTargetRect, true);
        return () => {
            window.removeEventListener('resize', updateTargetRect);
            window.removeEventListener('scroll', updateTargetRect, true);
        };
    }, [updateTargetRect]);

    const markComplete = async () => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                [`onboardingCompleted.${tabName}`]: true,
            });
        } catch {
            // Non-blocking — tutorial still dismisses
        }
        onComplete();
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep((s) => s + 1);
        } else {
            markComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep((s) => s - 1);
    };

    const handleSkip = () => {
        markComplete();
    };

    if (!step) return null;

    // Tooltip positioning
    const padding = 8;
    const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 60, maxWidth: 320 };
    if (targetRect) {
        if (step.position === 'bottom') {
            tooltipStyle.top = targetRect.bottom + padding;
            tooltipStyle.left = targetRect.left;
        } else if (step.position === 'top') {
            tooltipStyle.bottom = window.innerHeight - targetRect.top + padding;
            tooltipStyle.left = targetRect.left;
        } else if (step.position === 'right') {
            tooltipStyle.top = targetRect.top;
            tooltipStyle.left = targetRect.right + padding;
        } else {
            tooltipStyle.top = targetRect.top;
            tooltipStyle.right = window.innerWidth - targetRect.left + padding;
        }
    } else {
        // Fallback: center the tooltip
        tooltipStyle.top = '50%';
        tooltipStyle.left = '50%';
        tooltipStyle.transform = 'translate(-50%, -50%)';
    }

    return (
        <div className="fixed inset-0 z-50">
            {/* Overlay with cutout */}
            <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                <defs>
                    <mask id="tutorial-mask">
                        <rect width="100%" height="100%" fill="white" />
                        {targetRect && (
                            <rect
                                x={targetRect.left - 4}
                                y={targetRect.top - 4}
                                width={targetRect.width + 8}
                                height={targetRect.height + 8}
                                rx={8}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    width="100%" height="100%"
                    fill="rgba(0,0,0,0.7)"
                    mask="url(#tutorial-mask)"
                    style={{ pointerEvents: 'all' }}
                    onClick={(e) => e.stopPropagation()}
                />
            </svg>

            {/* Highlight border */}
            {targetRect && (
                <div
                    className="absolute border-2 border-cyan-400 rounded-lg pointer-events-none"
                    style={{
                        top: targetRect.top - 4,
                        left: targetRect.left - 4,
                        width: targetRect.width + 8,
                        height: targetRect.height + 8,
                        zIndex: 55,
                    }}
                />
            )}

            {/* Tooltip */}
            <div style={tooltipStyle} className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 shadow-2xl">
                <div className="text-xs text-gray-500 mb-1">
                    Step {currentStep + 1} of {steps.length}
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.content}</p>
                <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                        <button
                            onClick={handleBack}
                            className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white transition-colors"
                        >
                            Back
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
                    >
                        {currentStep < steps.length - 1 ? 'Next' : 'Finish'}
                    </button>
                    <button
                        onClick={handleSkip}
                        className="px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors ml-auto"
                    >
                        Skip Tutorial
                    </button>
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Build to verify**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/components/admin/TutorialOverlay.tsx
git commit -m "feat(onboarding): add interactive tutorial overlay component

Spotlight overlay with SVG mask cutout highlights UI elements
step-by-step. Positions tooltip relative to target element.
Stores completion per tab in Firestore.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Create Help Panel component (contextual per-tab)

**Files:**
- Create: `src/components/admin/HelpPanel.tsx`

**Step 1: Create the component**

Create `src/components/admin/HelpPanel.tsx`:

```typescript
import { TAB_HELP, GLOSSARY, PIPELINE_STEPS } from '../../lib/help-content';

interface Props {
    tabName: string;
    onClose: () => void;
    onReplayTutorial: () => void;
}

export default function HelpPanel({ tabName, onClose, onReplayTutorial }: Props) {
    const help = TAB_HELP[tabName];
    if (!help) return null;

    const relevantTerms = GLOSSARY.filter((g) => help.terms.includes(g.term));

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={onClose} />

            {/* Panel */}
            <div className="fixed top-0 right-0 h-full w-80 z-50 bg-[#0a0f1a] border-l border-white/10 overflow-y-auto shadow-2xl">
                <div className="p-4 space-y-5">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white">{help.title}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">&times;</button>
                    </div>

                    {/* Description */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">What This Tab Does</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">{help.description}</p>
                    </div>

                    {/* Workflow */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Your Workflow</h3>
                        <ol className="space-y-1.5">
                            {help.workflow.map((step, i) => (
                                <li key={i} className="flex gap-2 text-sm text-gray-300">
                                    <span className="text-cyan-400 font-bold shrink-0">{i + 1}.</span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Key Terms */}
                    {relevantTerms.length > 0 && (
                        <div>
                            <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Key Terms</h3>
                            <div className="space-y-2">
                                {relevantTerms.map((term) => (
                                    <div key={term.term}>
                                        <div className="text-xs font-medium text-cyan-400">{term.term}</div>
                                        <div className="text-xs text-gray-400">{term.definition}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pipeline Context */}
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Pipeline</h3>
                        <div className="space-y-1">
                            {PIPELINE_STEPS.map((ps) => {
                                const isActive =
                                    (tabName === 'risk-signals' || tabName === 'solution-signals') && ps.id === 'signal-review' ||
                                    tabName === 'discovery' && ps.id === 'discovery-review' ||
                                    tabName === 'validation' && ps.id === 'scoring-review';
                                return (
                                    <div
                                        key={ps.id}
                                        className={`text-[10px] px-2 py-1 rounded ${isActive ? 'bg-cyan-400/10 text-cyan-400 font-medium' : 'text-gray-500'}`}
                                    >
                                        {ps.agent ? '🤖' : '👤'} {ps.label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Replay Tutorial */}
                    <button
                        onClick={onReplayTutorial}
                        className="w-full py-2 rounded bg-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                        Replay Tutorial
                    </button>
                </div>
            </div>
        </>
    );
}
```

**Step 2: Build to verify**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/components/admin/HelpPanel.tsx
git commit -m "feat(onboarding): add contextual help panel for admin tabs

Slide-out panel showing tab description, workflow steps, key terms
from glossary, pipeline context with active stage highlighted,
and replay tutorial button.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Create Help reference page

**Files:**
- Create: `src/pages/Help.tsx`
- Modify: `src/App.tsx`

**Step 1: Create Help.tsx**

Create `src/pages/Help.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { RISK_TAXONOMY, SOLUTION_TAXONOMY, GLOSSARY, FAQ, PIPELINE_STEPS } from '../lib/help-content';
import { VALID_ROLES } from '../lib/roles';

const ROLE_INFO: Record<string, { label: string; tabs: string; time: string; description: string }> = {
    'signal-reviewer': { label: 'Signal Reviewer', tabs: 'Risk Signals, Solution Signals', time: '30-60 min/week', description: 'Reviews Signal Scout AI output. Approves or rejects classified signals.' },
    'discovery-reviewer': { label: 'Discovery Reviewer', tabs: 'Discovery', time: '1-2 hours/week', description: 'Reviews AI-generated proposals for new risk and solution categories.' },
    'scoring-reviewer': { label: 'Scoring Reviewer', tabs: 'Validation', time: '1-2 hours/week', description: 'Reviews AI-proposed score changes and field updates for existing entries.' },
    'editor': { label: 'Editor', tabs: 'Milestones', time: '1-3 hours/week', description: 'Creates and edits milestones and narrative content.' },
    'lead': { label: 'Lead', tabs: 'All tabs + Users', time: '2-5 hours/week', description: 'Final authority. Manages users, resolves conflicts, oversees all review activities.' },
};

export default function Help() {
    const { logOut, user } = useAuth();
    const navigate = useNavigate();
    const [glossaryFilter, setGlossaryFilter] = useState('');
    const [expandedRole, setExpandedRole] = useState<string | null>(null);

    const filteredGlossary = glossaryFilter
        ? GLOSSARY.filter((g) =>
            g.term.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
            g.definition.toLowerCase().includes(glossaryFilter.toLowerCase()))
        : GLOSSARY;

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => navigate('/admin')} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
                        &larr; Admin
                    </button>
                    <h1 className="text-lg font-bold shrink-0">Help & Reference</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 truncate">{user?.email}</span>
                    <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors shrink-0">
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="p-4 max-w-4xl mx-auto space-y-8 md:p-6">
                {/* 1. Pipeline */}
                <section id="pipeline">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">The Pipeline</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-2">
                        {PIPELINE_STEPS.map((step, i) => (
                            <div key={step.id} className="flex gap-3 items-start">
                                <div className="flex flex-col items-center shrink-0">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step.agent ? 'bg-cyan-400/10 text-cyan-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
                                        {step.agent ? 'AI' : 'H'}
                                    </div>
                                    {i < PIPELINE_STEPS.length - 1 && <div className="w-px h-4 bg-white/10 mt-1" />}
                                </div>
                                <div className="pb-2">
                                    <div className="text-sm font-medium">{step.label}</div>
                                    <div className="text-xs text-gray-400">{step.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2. Roles */}
                <section id="roles">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Roles & Responsibilities</h2>
                    <div className="space-y-2">
                        {VALID_ROLES.map((role) => {
                            const info = ROLE_INFO[role];
                            if (!info) return null;
                            const isExpanded = expandedRole === role;
                            return (
                                <div key={role} className="bg-white/5 rounded-lg border border-white/10">
                                    <button
                                        onClick={() => setExpandedRole(isExpanded ? null : role)}
                                        className="w-full flex items-center justify-between p-3 text-left"
                                    >
                                        <span className="text-sm font-medium">{info.label}</span>
                                        <span className="text-[10px] text-gray-500">{info.time}</span>
                                    </button>
                                    {isExpanded && (
                                        <div className="px-3 pb-3 space-y-2 text-xs text-gray-400">
                                            <div>{info.description}</div>
                                            <div><span className="text-gray-500">Tabs:</span> {info.tabs}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 3. Risk Taxonomy */}
                <section id="risks">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Risk Taxonomy (R01-R10)</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {Object.entries(RISK_TAXONOMY).map(([code, { name, description }]) => (
                            <div key={code} className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-bold">{code}</span>
                                    <span className="text-sm font-medium">{name}</span>
                                </div>
                                <div className="text-xs text-gray-400">{description}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 4. Solution Taxonomy */}
                <section id="solutions">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Solution Taxonomy (S01-S10)</h2>
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {Object.entries(SOLUTION_TAXONOMY).map(([code, { name, description, addresses }]) => (
                            <div key={code} className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-bold">{code}</span>
                                    <span className="text-sm font-medium">{name}</span>
                                    <span className="text-[9px] text-gray-500">addresses {addresses}</span>
                                </div>
                                <div className="text-xs text-gray-400">{description}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 5. Glossary */}
                <section id="glossary">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Glossary</h2>
                    <input
                        value={glossaryFilter}
                        onChange={(e) => setGlossaryFilter(e.target.value)}
                        placeholder="Search terms..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white placeholder-gray-600 mb-3 focus:outline-none focus:border-cyan-400/50"
                    />
                    <div className="bg-white/5 rounded-lg border border-white/10 divide-y divide-white/5">
                        {filteredGlossary.map((g) => (
                            <div key={g.term} className="p-3">
                                <div className="text-sm font-medium text-cyan-400">{g.term}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{g.definition}</div>
                            </div>
                        ))}
                        {filteredGlossary.length === 0 && (
                            <div className="p-3 text-xs text-gray-500">No matching terms</div>
                        )}
                    </div>
                </section>

                {/* 6. FAQ */}
                <section id="faq">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">FAQ</h2>
                    <div className="space-y-3">
                        {FAQ.map((f) => (
                            <div key={f.question} className="bg-white/5 rounded-lg border border-white/10 p-3">
                                <div className="text-sm font-medium mb-1">{f.question}</div>
                                <div className="text-xs text-gray-400">{f.answer}</div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
```

**Step 2: Add route to App.tsx**

Add after the `/observatory` route (line 32):

```typescript
<Route path="/help" element={
    <ProtectedRoute>
        <Help />
    </ProtectedRoute>
} />
```

And add the import at the top:

```typescript
import Help from './pages/Help';
```

**Step 3: Build to verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/pages/Help.tsx src/App.tsx
git commit -m "feat(onboarding): add help reference page with glossary and FAQ

Full reference page at /help with pipeline diagram, role descriptions,
R01-R10 and S01-S10 taxonomies, searchable glossary, and FAQ.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Wire everything into Admin.tsx

**Files:**
- Modify: `src/pages/Admin.tsx`

**Step 1: Add imports**

Add at the top of Admin.tsx:

```typescript
import AcknowledgmentModal from '../components/admin/AcknowledgmentModal';
import TutorialOverlay from '../components/admin/TutorialOverlay';
import HelpPanel from '../components/admin/HelpPanel';
import { TUTORIAL_STEPS } from '../lib/tutorial-steps';
```

**Step 2: Add state for onboarding flows**

After the existing state declarations (around line 84), add:

```typescript
const [acknowledged, setAcknowledged] = useState(() => !!(userDoc as Record<string, unknown> | null)?.acknowledgedAt);
const [showTutorial, setShowTutorial] = useState(false);
const [showHelpPanel, setShowHelpPanel] = useState(false);
```

**Step 3: Derive whether tutorial should show for current tab**

Add after the state:

```typescript
const onboardingCompleted = (userDoc as Record<string, unknown> | null)?.onboardingCompleted as Record<string, boolean> | undefined;
const shouldShowTutorial = acknowledged && !onboardingCompleted?.[adminTab] && TUTORIAL_STEPS[adminTab];
```

**Step 4: Trigger tutorial on first tab visit**

Add a useEffect:

```typescript
useEffect(() => {
    if (shouldShowTutorial && !showTutorial) {
        // Small delay to let the tab content render so tutorial targets exist
        const timer = setTimeout(() => setShowTutorial(true), 500);
        return () => clearTimeout(timer);
    }
}, [adminTab, shouldShowTutorial]);
```

**Step 5: Add acknowledgment gate at the top of the return JSX**

Right after `return (` and before the existing `<div>`, add:

```typescript
{!acknowledged && (
    <AcknowledgmentModal onComplete={() => setAcknowledged(true)} />
)}
```

**Step 6: Add tutorial overlay (before closing `</div>`)**

```typescript
{showTutorial && TUTORIAL_STEPS[adminTab] && (
    <TutorialOverlay
        steps={TUTORIAL_STEPS[adminTab]}
        tabName={adminTab}
        onComplete={() => setShowTutorial(false)}
    />
)}
```

**Step 7: Add help panel (before closing `</div>`)**

```typescript
{showHelpPanel && (
    <HelpPanel
        tabName={adminTab}
        onClose={() => setShowHelpPanel(false)}
        onReplayTutorial={() => { setShowHelpPanel(false); setShowTutorial(true); }}
    />
)}
```

**Step 8: Add Help link and ? button to the header**

In the header's right section (around line 246), add before the email span:

```typescript
<button
    onClick={() => navigate('/help')}
    className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
>
    Help
</button>
```

In the tab bar area (around line 283, after the Observatory button), add:

```typescript
<button
    onClick={() => setShowHelpPanel(!showHelpPanel)}
    className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300 whitespace-nowrap ml-auto"
>
    ?
</button>
```

**Step 9: Add data-tutorial attributes to existing elements**

Add `data-tutorial` attributes to key elements for the tutorial overlay to target. These are the selectors referenced in `tutorial-steps.ts`:

- Tab bar `<div>`: add `data-tutorial="tab-bar"`
- Signal list `<div>` (the `flex-1 overflow-y-auto p-2` container): add `data-tutorial="signal-list"`
- First signal item in list: add `data-tutorial="signal-item"` to the first `.map()` item (conditionally: `{i === 0 ? { 'data-tutorial': 'signal-item' } : {}}`)
- Classification panel `<div>` (the `bg-white/5 rounded p-4 mb-6 space-y-3` container): add `data-tutorial="classification"`
- Action buttons container: add `data-tutorial="actions"`
- Bulk reject button area: add `data-tutorial="bulk-reject"` to the day header

For DiscoveryTab.tsx and ValidationTab.tsx, add similar attributes:
- Proposal list container: `data-tutorial="proposal-list"`
- Proposal detail area: `data-tutorial="proposal-detail"`
- Narrative form: `data-tutorial="narrative-form"`
- Actions: `data-tutorial="actions"`
- Proposed changes: `data-tutorial="proposed-changes"`

**Step 10: Build to verify**

Run: `npm run build`

**Step 11: Commit**

```bash
git add src/pages/Admin.tsx src/components/admin/DiscoveryTab.tsx src/components/admin/ValidationTab.tsx
git commit -m "feat(onboarding): wire acknowledgment, tutorial, and help into Admin

Acknowledgment modal gates first admin access. Tutorial overlay
triggers per tab on first visit. Help panel accessible via ? button.
Help page linked in header. data-tutorial attributes added to key
UI elements for spotlight targeting.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Final build, lint, and deploy

**Step 1: Full build check**

Run: `npm run build && cd functions && npm run build`

**Step 2: Run lint**

Run: `npm run lint`
Fix any new lint errors introduced by our changes.

**Step 3: Manual smoke test**

Run: `npm run dev`
- Navigate to `/admin` — verify acknowledgment modal appears
- Click "I Understand and Acknowledge" — verify it dismisses and tutorial starts
- Walk through tutorial steps — verify spotlight highlights correct elements
- Click `?` button — verify help panel slides out with correct content
- Navigate to `/help` — verify full reference page renders
- Close tutorial, switch tabs — verify new tab's tutorial triggers
- Revisit a completed tab — verify tutorial doesn't re-trigger

**Step 4: Deploy Firestore rules**

Run: `firebase use` to verify project, then:
Run: `firebase deploy --only firestore:rules`

**Step 5: Push to main for CI hosting deploy**

```bash
git push origin main
```
