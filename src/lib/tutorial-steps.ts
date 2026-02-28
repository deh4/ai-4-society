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
