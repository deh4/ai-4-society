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
