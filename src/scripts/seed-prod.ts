import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Use production Firestore (no emulator)
// Requires: GOOGLE_APPLICATION_CREDENTIALS env or gcloud auth
initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault()
});

const db = getFirestore();

// Rich risk data with comprehensive explanations
const risks = [
    {
        id: 'R01',
        risk_name: 'Deepfake Fraud',
        category: 'Security',
        score_2026: 9.5,
        score_2035: 4.0,
        connected_to: ['R05', 'R09'],
        velocity: 'High',
        summary: 'AI-generated synthetic media is being weaponized for financial fraud, identity theft, and institutional manipulation.',
        deep_dive: `Imagine receiving a video call from your bank manager asking you to authorize a transfer—except it's not really them. It's a synthetic clone created by AI in real-time.

Deepfake technology has evolved from novelty face-swaps to sophisticated voice and video synthesis that can fool even trained observers. Criminals now use these tools to impersonate executives (CEO fraud), create fake identity documents, and manipulate stock markets with fabricated announcements.

The "Liar's Dividend" compounds the problem: as deepfakes become common, genuine evidence becomes easier to dismiss. A real scandal can be denied as "just another fake." This erodes the foundation of trust that institutions and markets depend on.`,
        who_affected: ['Financial institutions', 'Consumers', 'Journalists', 'Legal systems', 'Politicians'],
        timeline_narrative: {
            near_term: 'Current tools require significant effort but are rapidly democratizing. Early fraud cases emerge targeting high-net-worth individuals and enterprises.',
            mid_term: 'Real-time deepfake calls become indistinguishable from reality. Mass fraud campaigns target millions. Authentication systems struggle to keep pace.',
            long_term: 'New cryptographic identity standards emerge. Adoption of "proof of humanity" protocols reduces fraud, but societal trust scars remain.'
        },
        mitigation_strategies: [
            'Implement cryptographic content provenance (C2PA standard)',
            'Deploy voice/video biometric verification for sensitive transactions',
            'Establish "proof of humanity" protocols for high-stakes communications',
            'Invest in real-time deepfake detection infrastructure',
            'Create legal frameworks for synthetic media accountability'
        ],
        signal_evidence: [
            { date: '11/26', isNew: true, headline: 'Deepfake Senator scandal rocks midterms', source: 'GLOBAL NEWS', url: 'https://example.com/deepfake-senator' },
            { date: '08/26', isNew: false, headline: '$25M CEO voice clone heist confirmed', source: 'FINANCIAL TIMES', url: 'https://example.com/voice-clone-heist' },
            { date: '03/26', isNew: false, headline: 'First conviction under Digital Authenticity Act', source: 'REUTERS', url: 'https://example.com/digital-auth-act' }
        ],
        expert_severity: 9.5,
        public_perception: 6.2
    },
    {
        id: 'R02',
        risk_name: 'Model Collapse',
        category: 'Tech',
        score_2026: 3.0,
        score_2035: 9.8,
        connected_to: ['R08', 'R12'],
        velocity: 'Medium',
        summary: 'AI models trained on AI-generated content progressively lose coherence, diversity, and reliability.',
        deep_dive: `What happens when AI systems start learning primarily from content created by other AI systems? The answer is "model collapse"—a gradual degradation where outputs become more generic, less diverse, and increasingly disconnected from human reality.

Think of it like making a photocopy of a photocopy, over and over. Each generation loses fidelity. As the internet fills with AI-generated text, images, and code, future AI models trained on this synthetic soup inherit and amplify its flaws.

This creates a feedback loop: AI generates content → humans use it → new AI trains on it → quality degrades → repeat. The long tail of human creativity—unusual perspectives, minority viewpoints, rare expertise—gets smoothed away into bland statistical averages.`,
        who_affected: ['AI researchers', 'Content creators', 'Educators', 'Knowledge workers', 'Future generations'],
        timeline_narrative: {
            near_term: 'Early signs visible in niche domains. Researchers begin documenting quality degradation in specific model families.',
            mid_term: 'Synthetic content dominates training datasets. New models show measurable loss of nuance and creativity. "Human-verified" data becomes premium.',
            long_term: 'Industry restructures around authenticated human data. New data collection ethics emerge. Historical pre-AI archives become invaluable.'
        },
        mitigation_strategies: [
            'Establish provenance tracking for all training data',
            'Create authenticated "human-only" content repositories',
            'Develop synthetic content detection for dataset curation',
            'Implement data dividends to incentivize human contribution',
            'Preserve pre-AI internet archives as baseline datasets'
        ],
        signal_evidence: [
            { date: '09/26', isNew: true, headline: 'OpenAI admits training data contamination', source: 'WIRED', url: 'https://example.com/data-contamination' },
            { date: '05/26', isNew: false, headline: 'Wikipedia editors overwhelmed by AI submissions', source: 'THE VERGE', url: 'https://example.com/wikipedia-ai' }
        ],
        expert_severity: 8.2,
        public_perception: 3.1
    },
    {
        id: 'R05',
        risk_name: 'Political Instability',
        category: 'Society',
        score_2026: 7.2,
        score_2035: 8.5,
        connected_to: ['R01', 'R09'],
        velocity: 'Critical',
        summary: 'AI-enabled misinformation and micro-targeting destabilize democratic institutions and social cohesion.',
        deep_dive: `Democracy depends on shared truth—a common factual baseline from which citizens can debate policy. AI is fragmenting this foundation.

Imagine a world where every voter receives a uniquely crafted political message, designed by AI to exploit their specific psychological vulnerabilities. Where authentic leaked documents are dismissed as AI fakes. Where foreign actors can generate thousands of "concerned citizen" personas, each with years of synthetic posting history.

This isn't science fiction. It's happening now. The 2024 elections saw unprecedented use of AI-generated political content, and detection tools are losing the arms race. The result: declining trust in all institutions, rising polarization, and democratic paralysis.`,
        who_affected: ['Voters', 'Election officials', 'Journalists', 'Political parties', 'Democratic institutions'],
        timeline_narrative: {
            near_term: 'AI-generated political content becomes indistinguishable from human. First major elections contested on authenticity grounds.',
            mid_term: 'Micro-targeted influence operations at scale. Several democracies experience governance crises linked to information warfare.',
            long_term: 'New authentication frameworks for public discourse emerge. Some democracies adapt; others fragment into information bubbles.'
        },
        mitigation_strategies: [
            'Mandate disclosure of AI-generated political content',
            'Fund independent fact-checking infrastructure',
            'Develop authenticated communication channels for officials',
            'Strengthen media literacy education',
            'Create international norms against AI-enabled election interference'
        ],
        signal_evidence: [
            { date: '10/26', isNew: true, headline: 'EU mandates AI labels on political ads', source: 'POLITICO', url: 'https://example.com/eu-ai-labels' },
            { date: '06/26', isNew: false, headline: 'Brazilian election results delayed over deepfake claims', source: 'BBC', url: 'https://example.com/brazil-election-deepfake' }
        ],
        expert_severity: 8.8,
        public_perception: 7.5
    },
    {
        id: 'R08',
        risk_name: 'Data Scarcity',
        category: 'Tech',
        score_2026: 4.0,
        score_2035: 9.0,
        connected_to: ['R02'],
        velocity: 'Low',
        summary: 'High-quality human-generated training data is being exhausted, limiting AI advancement and concentrating power.',
        deep_dive: `AI's hunger for data is insatiable—and we're running out of the good stuff.

Large language models have already consumed most of the publicly available internet. Books, academic papers, code repositories, forums—all ingested. But here's the problem: there isn't more internet. Production of new human-generated content can't keep pace with training demands.

This creates two concerning dynamics. First, companies with proprietary data (private messages, internal documents, subscription content) gain massive advantages. Second, the pressure to use synthetic data accelerates model collapse. The result is an AI development bottleneck that could stall progress—or concentrate power in the few entities with data hoards.`,
        who_affected: ['AI startups', 'Open source community', 'Researchers', 'Content creators', 'Smaller nations'],
        timeline_narrative: {
            near_term: 'Major AI labs report diminishing returns from internet-scale training. Premium data licensing deals multiply.',
            mid_term: 'Data becomes the primary competitive moat. Smaller players struggle. New regulation addresses data rights.',
            long_term: 'Alternative paradigms emerge (simulation, reasoning). Data cooperatives form. New equilibrium between human and synthetic training.'
        },
        mitigation_strategies: [
            'Develop efficient learning from smaller datasets',
            'Create data cooperatives with fair compensation',
            'Invest in simulation and synthetic environments',
            'Establish data rights and provenance standards',
            'Fund public domain knowledge repositories'
        ],
        signal_evidence: [
            { date: '07/26', isNew: false, headline: 'Reddit data deal valued at $500M', source: 'TECHCRUNCH', url: 'https://example.com/reddit-data-deal' },
            { date: '04/26', isNew: false, headline: 'Researchers warn of "peak data" for LLMs', source: 'MIT TECH REVIEW', url: 'https://example.com/peak-data' }
        ],
        expert_severity: 7.5,
        public_perception: 2.8
    },
    {
        id: 'R09',
        risk_name: 'Mental Health Crisis',
        category: 'Health',
        score_2026: 8.0,
        score_2035: 6.5,
        connected_to: ['R01', 'R05'],
        velocity: 'High',
        summary: 'AI companions, addictive algorithms, and reality distortion contribute to rising anxiety, isolation, and identity confusion.',
        deep_dive: `We are running an unprecedented experiment on human psychology—and the early results are troubling.

AI companions offer perfect validation, never criticizing, always available. Recommendation algorithms serve content engineered to maximize engagement (read: emotional arousal). Synthetic media blurs the line between real and fake, undermining our ability to trust our own perceptions.

The most vulnerable are young people who've never known a world without these pressures. Rates of anxiety, depression, and "reality confusion" are spiking. Some researchers describe it as a form of mass dissociation—a generation struggling to distinguish authentic experience from algorithmic performance.`,
        who_affected: ['Teenagers', 'Young adults', 'Heavy social media users', 'Isolated individuals', 'Mental health systems'],
        timeline_narrative: {
            near_term: 'Companion AI adoption accelerates. First studies link usage to emotional dependency. Youth mental health crisis deepens.',
            mid_term: 'Regulatory intervention in addictive design. New therapeutic approaches for "AI-mediated" conditions. Some platforms reform.',
            long_term: 'Cultural adaptation to AI presence. New norms around healthy tech use. Mental health integration improves but scars persist.'
        },
        mitigation_strategies: [
            'Regulate addictive algorithmic design patterns',
            'Require transparency in AI companion capabilities',
            'Fund research on AI-human psychological dynamics',
            'Integrate digital wellbeing into education',
            'Expand mental health resources with AI-specific training'
        ],
        signal_evidence: [
            { date: '08/26', isNew: true, headline: 'Surgeon General warns of AI companion dependency', source: 'CNN', url: 'https://example.com/ai-dependency-warning' },
            { date: '02/26', isNew: false, headline: 'Teen anxiety rates hit record high globally', source: 'WHO', url: 'https://example.com/teen-anxiety-stats' }
        ],
        expert_severity: 8.0,
        public_perception: 7.8
    },
    {
        id: 'R12',
        risk_name: 'Algorithmic Bias',
        category: 'Ethics',
        score_2026: 8.8,
        score_2035: 5.0,
        connected_to: ['R02', 'R08'],
        velocity: 'Medium',
        summary: 'AI systems encode and amplify historical discrimination, affecting hiring, lending, justice, and healthcare.',
        deep_dive: `AI doesn't discriminate on purpose—it just faithfully reproduces the patterns in its training data. Unfortunately, that data reflects centuries of human bias.

When an AI hiring tool learns from past decisions, it learns that men were hired more often for technical roles. When a lending algorithm trains on historical approvals, it learns to favor zip codes that correlate with race. When a healthcare model predicts risk, it may underestimate pain in certain demographics because doctors historically dismissed their complaints.

The danger is scale and invisibility. A biased human might affect hundreds of decisions. A biased algorithm can affect millions—automatically, invisibly, with a veneer of objectivity that makes it harder to challenge.`,
        who_affected: ['Job seekers', 'Loan applicants', 'Patients', 'Defendants', 'Marginalized communities'],
        timeline_narrative: {
            near_term: 'High-profile bias incidents drive awareness. Regulatory frameworks emerge in EU and US. Audit requirements increase.',
            mid_term: 'Bias detection becomes standard practice. New training techniques reduce encoded discrimination. Legal precedents established.',
            long_term: 'Mature fairness standards integrated into AI development. Remaining gaps actively monitored. Historical harms addressed.'
        },
        mitigation_strategies: [
            'Mandate algorithmic impact assessments',
            'Require third-party bias audits for high-stakes systems',
            'Develop and enforce fairness standards',
            'Create redress mechanisms for algorithmic harm',
            'Diversify AI development teams and training data'
        ],
        signal_evidence: [
            { date: '10/26', isNew: true, headline: 'California passes landmark AI Fairness Act', source: 'LOS ANGELES TIMES', url: 'https://example.com/ai-fairness-act' },
            { date: '01/26', isNew: false, headline: 'Healthcare AI audit reveals racial disparities', source: 'JAMA', url: 'https://example.com/healthcare-ai-bias' }
        ],
        expert_severity: 8.8,
        public_perception: 5.5
    }
];

const solutions = [
    {
        id: 'S01',
        parent_risk_id: 'R01',
        solution_title: 'Digital Identity Wallets',
        solution_type: 'Tech Infrastructure',
        summary: 'Cryptographic identity verification that proves you are who you claim to be, resistant to deepfake impersonation.',
        deep_dive: `Digital ID wallets use cryptographic signatures to create unforgeable proof of identity. When you receive a video call, the wallet can verify that the person on the other end controls the private key associated with their claimed identity—something no deepfake can fake.

This isn't about surveillance. Modern zero-knowledge proofs allow verification without revealing unnecessary personal information. You can prove you're over 18 without revealing your birth date. You can prove you're an authorized bank employee without exposing your full identity.`,
        implementation_stage: 'Pilot',
        adoption_score_2026: 2.0,
        adoption_score_2035: 8.5,
        key_players: ['EU Digital ID', 'Apple', 'World ID'],
        barriers: ['Privacy concerns', 'Regulatory fragmentation', 'User adoption friction'],
        timeline_narrative: {
            near_term: 'Pilot programs in EU, select enterprises. Early adopter communities.',
            mid_term: 'Government integration accelerates. Banking sector adopts for high-value transactions.',
            long_term: 'Mainstream adoption. Deepfake fraud significantly reduced.'
        }
    },
    {
        id: 'S02',
        parent_risk_id: 'R02',
        solution_title: 'Human Data Dividends',
        solution_type: 'Policy',
        summary: 'Compensation frameworks that pay people for their data contributions to AI training.',
        deep_dive: `Your words, photos, and creative work power AI systems worth billions. Data dividends propose that you should share in that value.

This isn't just about fairness—it's about sustaining the human contribution that AI depends on. When people are compensated for quality content, they have incentive to keep creating. When synthetic content is free but human content has value, the market naturally filters for authenticity.`,
        implementation_stage: 'Concept',
        adoption_score_2026: 0.5,
        adoption_score_2035: 6.0,
        key_players: ['Data cooperatives', 'Creative unions', 'Progressive regulators'],
        barriers: ['Tracking complexity', 'Industry resistance', 'Valuation challenges'],
        timeline_narrative: {
            near_term: 'Academic proposals gain traction. Early experiments in creative industries.',
            mid_term: 'Regulatory frameworks emerge in EU. Major platforms pilot compensation programs.',
            long_term: 'Data contribution becomes recognized form of labor with established rights.'
        }
    },
    {
        id: 'S03',
        parent_risk_id: 'R05',
        solution_title: 'Authenticated Public Discourse',
        solution_type: 'Governance',
        summary: 'Verified communication channels for public officials and institutions that prove authenticity.',
        deep_dive: `What if every official government communication came with cryptographic proof it was genuine? What if politicians' public statements were signed in a way deepfakes couldn't forge?

Authenticated discourse doesn't prevent lies—politicians can still mislead. But it prevents impersonation. You can be certain the message came from who it claims. Combined with independent journalism, this restores a baseline of factual ground truth.`,
        implementation_stage: 'Early Adoption',
        adoption_score_2026: 3.0,
        adoption_score_2035: 7.5,
        key_players: ['Government digital services', 'Journalism organizations', 'Tech platforms'],
        barriers: ['Technical complexity', 'Political will', 'Legacy system integration'],
        timeline_narrative: {
            near_term: 'Early adoption by progressive governments. Major news organizations implement verification.',
            mid_term: 'International standards emerge. Public expectation of authenticity grows.',
            long_term: 'Authenticated communication becomes norm for official discourse.'
        }
    }
];

async function seed() {
    console.log('Seeding PRODUCTION Firestore...');

    console.log('Seeding Risks...');
    const riskBatch = db.batch();
    for (const risk of risks) {
        const ref = db.collection('risks').doc(risk.id);
        riskBatch.set(ref, risk);
    }
    await riskBatch.commit();
    console.log('Risks seeded: ' + risks.length);

    console.log('Seeding Solutions...');
    const solBatch = db.batch();
    for (const sol of solutions) {
        const ref = db.collection('solutions').doc(sol.id);
        solBatch.set(ref, sol);
    }
    await solBatch.commit();
    console.log('Solutions seeded: ' + solutions.length);
}

seed().then(() => {
    console.log('PRODUCTION seeding complete!');
    process.exit(0);
}).catch((e) => {
    console.error('Error seeding production:', e);
    process.exit(1);
});
