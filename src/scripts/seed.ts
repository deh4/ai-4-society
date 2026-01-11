import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

initializeApp({
    projectId: 'ai-4-society'
});

const db = getFirestore();

// Research-based risk data (2025-2026) with real statistics and signal events
const risks = [
    {
        id: 'R01',
        risk_name: 'Systemic Algorithmic Discrimination in Critical Sectors',
        category: 'Societal',
        score_2026: 78,
        score_2035: 65,
        connected_to: ['R02', 'S05'],
        velocity: 'High',
        summary: 'AI systems in hiring, healthcare, and policing are actively reproducing and amplifying historical biases, with recent studies showing LLMs favor white-associated names 85% of the time over Black-associated names.',
        deep_dive: `As AI models move from 'advisory' to 'agentic' roles in hiring and healthcare, biases are becoming automated at scale. 2024-2025 research confirms that large language models (LLMs) consistently disadvantage racial minorities and women. For instance, resume-screening AIs have been found to reject candidates based on dialect markers (e.g., AAVE) or name associations, regardless of qualifications. In healthcare, diagnostic algorithms continue to downplay pain symptoms in women and minority groups, leading to measurable disparities in care outcomes.`,
        who_affected: [
            'Racial minorities (specifically Black and Hispanic communities)',
            'Women (healthcare and hiring bias)',
            'Job seekers over age 40',
            'Non-native English speakers'
        ],
        timeline_narrative: {
            near_term: 'By 2026, \'Shadow HR\' becomes a major issue; companies use unregulated AI agents to silently filter applicants. Class-action lawsuits targeting AI vendors (like the Workday suit) proliferate.',
            mid_term: 'By 2030, strict liability laws in the EU and US force companies to prove \'algorithmic fairness\' before deployment. The \'Black Box\' problem remains a legal defense hurdle.',
            long_term: 'By 2035, bias is not eliminated but managed via \'Constitutional AI\' frameworks where fairness constraints are mathematically guaranteed, though cultural nuances still cause friction.'
        },
        mitigation_strategies: [
            'Mandatory \'Bias Impact Statements\' for public-sector AI procurement',
            'Third-party algorithmic auditing (similar to financial audits)',
            'Red-teaming requirements specifically for protected class discrimination',
            'Legal bans on \'emotion recognition\' in hiring'
        ],
        signal_evidence: [
            {
                date: '2024-10-31',
                isNew: true,
                headline: 'Study finds LLMs favor white names 85% of the time in resume ranking',
                source: 'University of Washington',
                url: 'https://www.washington.edu/news/2024/10/31/ai-bias-resume-screening-race-gender/'
            },
            {
                date: '2024-02-20',
                isNew: false,
                headline: 'Class action lawsuit filed against Workday alleging AI bias in hiring',
                source: 'US District Court / Reuters'
            },
            {
                date: '2025-02-05',
                isNew: true,
                headline: 'Generative AI models found to reinforce regressive gender stereotypes in narratives',
                source: 'UNESCO',
                url: 'https://www.unesco.org/en/articles/generative-ai'
            }
        ],
        expert_severity: 85,
        public_perception: 60
    },
    {
        id: 'R02',
        risk_name: 'Erosion of Privacy via Agentic AI and Data Scraping',
        category: 'Technological',
        score_2026: 88,
        score_2035: 92,
        connected_to: ['R01', 'R03'],
        velocity: 'Critical',
        summary: 'The shift to \'Agentic AI\' (AI that takes actions) and massive data scraping for training has made traditional privacy consent models obsolete, with 1 in 4 Millennials already reporting identity theft victimization as of 2025.',
        deep_dive: `The privacy paradigm is shifting from 'data leakage' to 'inference harvesting.' AI models can now infer sensitive attributes (health status, political affiliation, sexual orientation) from non-sensitive data points with high accuracy. Furthermore, the rise of autonomous AI agents in 2025-2026 introduces 'Prompt Injection' as a top security threat, where malicious actors can trick personal AI assistants into revealing private user data. The widespread scraping of the open web to train models has effectively privatized the public commons.`,
        who_affected: [
            'General internet users (global)',
            'Children (biometric data collection)',
            'Creative professionals (copyright/style theft)',
            'Enterprises (IP leakage via employees using AI)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, \'Prompt Injection\' attacks on personal AI assistants become the #1 vector for identity theft. The concept of \'public data\' is legally challenged.',
            mid_term: 'By 2029, a \'Post-Privacy\' economy emerges where data privacy is a luxury service. Zero-Knowledge Proofs (ZKPs) become standard for verifying age/identity without revealing data.',
            long_term: 'By 2035, personal \'Data Pods\' owned by individuals (not platforms) become the standard architecture, enforced by Web3-style protocols and privacy laws.'
        },
        mitigation_strategies: [
            'Adoption of \'Poisoning\' tools (e.g., Nightshade) to protect personal images',
            'Legislation establishing \'Data Provenance\' rights',
            'Mandatory \'Do Not Train\' flags in web standards',
            'Deployment of Local-First AI models (on-device processing)'
        ],
        signal_evidence: [
            {
                date: '2025-12-02',
                isNew: true,
                headline: 'Report: 76% of consumers believe cybercrime is unstoppable due to AI',
                source: 'Experian 2026 Data Breach Forecast',
                url: 'https://www.experianplc.com'
            },
            {
                date: '2025-12-15',
                isNew: true,
                headline: 'Prompt Injection identified as top enterprise AI security threat for 2026',
                source: 'PointGuard AI Predictions'
            },
            {
                date: '2024-12-09',
                isNew: false,
                headline: 'Deepfakes of health experts used to scam elderly Australians',
                source: 'AI Incident Database'
            }
        ],
        expert_severity: 90,
        public_perception: 75
    },
    {
        id: 'R03',
        risk_name: 'AI-Amplified Disinformation and Reality Distortion',
        category: 'Geopolitical',
        score_2026: 95,
        score_2035: 80,
        connected_to: ['R42', 'R01'],
        velocity: 'Critical',
        summary: 'AI tools have lowered the cost of generating convincing disinformation to near zero. 83% of US adults expressed fear of AI election interference, validated by \'Operation Overload\' and deepfake robocalls.',
        deep_dive: `The 'Liars Dividend' has arrived: bad actors flood the zone with AI noise, while simultaneously claiming real evidence is fake. Recent campaigns (2024-2025) moved beyond simple text to hyper-realistic audio and video deepfakes. Threat actors are successfully using AI to impersonate trusted institutions (media, NGOs) and local figures (mayors, bosses) to conduct fraud and sow chaos. The speed of dissemination now outpaces human fact-checking capabilities by orders of magnitude.`,
        who_affected: [
            'Voters in democratic nations (60+ countries in 2024-25)',
            'Elderly populations (voice cloning scams)',
            'Public figures and brands (reputational damage)',
            'Journalists (overwhelmed by synthetic noise)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, \'Reality Apathy\' sets in; the public stops trusting all digital media. Biometric verification for social media accounts becomes a major political debate.',
            mid_term: 'By 2030, the internet fractures into \'Authenticated\' zones (verified humans) and \'The Wild\' (AI bots). News is cryptographically signed at the source (C2PA).',
            long_term: 'By 2035, AI \'Truth Defense\' agents automatically flag manipulation in real-time AR glasses. Disinformation shifts to closed, encrypted networks.'
        },
        mitigation_strategies: [
            'Implementation of C2PA / Watermarking standards at the camera hardware level',
            'AI-literacy education as a mandatory school curriculum',
            'Liability laws for platforms amplifying non-labeled synthetic content',
            'Cryptographic \'Personhood Credentials\' for online interaction'
        ],
        signal_evidence: [
            {
                date: '2025-01-30',
                isNew: true,
                headline: 'Harvard Study: 83.4% of US adults fear AI election misinformation',
                source: 'Harvard Kennedy School Misinfo Review',
                url: 'https://misinforeview.hks.harvard.edu/'
            },
            {
                date: '2024-01-22',
                isNew: false,
                headline: 'Fake Biden Robocalls urge NH voters to skip primary',
                source: 'NBC News / DOJ Indictment'
            },
            {
                date: '2025-01-12',
                isNew: true,
                headline: 'Deepfake video scams defraud users of $850k by impersonating Brad Pitt',
                source: 'AI Incident Database (Incident 901)'
            }
        ],
        expert_severity: 95,
        public_perception: 88
    }
];

// Solution data addressing the risks above
const solutions = [
    {
        id: 'S03',
        parent_risk_id: 'R03',
        solution_title: 'Digital Content Provenance (C2PA) Standards',
        solution_type: 'Technology + Policy',
        summary: 'A cryptographic \'nutrition label\' for digital content that proves where an image/video came from and if it was altered by AI.',
        deep_dive: `The Coalition for Content Provenance and Authenticity (C2PA) offers an open technical standard that allows publishers to embed tamper-evident metadata in media files. This solution moves verification from 'detecting the fake' (which is becoming impossible) to 'proving the real.' Implementation involves camera manufacturers (Sony, Canon) signing images at the point of capture, and platforms (LinkedIn, Google) displaying a 'Digital Credential' icon to users.`,
        implementation_stage: 'Early Adoption',
        adoption_score_2026: 35,
        adoption_score_2035: 85,
        key_players: [
            'Adobe (Content Authenticity Initiative)',
            'Microsoft',
            'BBC',
            'Sony & Leica (Hardware implementation)',
            'EU Commission (Digital Services Act)'
        ],
        barriers: [
            'Stripping of metadata by non-compliant social platforms',
            'Legacy hardware (billions of old cameras/phones)',
            'Public confusion over what the \'credentials\' icon means',
            'Resistance from open-source AI communities'
        ],
        timeline_narrative: {
            near_term: 'By 2026, major news organizations (BBC, NYT) and official government accounts use C2PA for all releases. Social platforms flag non-signed content as \'Unverified\'.',
            mid_term: 'By 2030, browsers natively block or gray-out unauthenticated media in \'High Trust\' modes. It becomes difficult to post anonymous viral content without friction.',
            long_term: 'By 2035, the standard is universal. \'Raw\' unsigned media is treated like spam email—automatically filtered out of view for most users.'
        }
    }
];

async function clearDatabase() {
    console.log('Clearing existing data...');
    
    // Clear all risks
    const risksSnapshot = await db.collection('risks').get();
    const riskDeleteBatch = db.batch();
    risksSnapshot.docs.forEach((doc) => {
        riskDeleteBatch.delete(doc.ref);
    });
    await riskDeleteBatch.commit();
    console.log(`Deleted ${risksSnapshot.size} existing risks.`);
    
    // Clear all solutions
    const solutionsSnapshot = await db.collection('solutions').get();
    const solutionDeleteBatch = db.batch();
    solutionsSnapshot.docs.forEach((doc) => {
        solutionDeleteBatch.delete(doc.ref);
    });
    await solutionDeleteBatch.commit();
    console.log(`Deleted ${solutionsSnapshot.size} existing solutions.`);
}

async function seed() {
    // Clear existing data first
    await clearDatabase();
    
    console.log('Seeding Risks...');
    const riskBatch = db.batch();
    for (const risk of risks) {
        const ref = db.collection('risks').doc(risk.id);
        riskBatch.set(ref, risk);
    }
    await riskBatch.commit();
    console.log(`${risks.length} risks seeded.`);

    console.log('Seeding Solutions...');
    const solBatch = db.batch();
    for (const sol of solutions) {
        const ref = db.collection('solutions').doc(sol.id);
        solBatch.set(ref, sol);
    }
    await solBatch.commit();
    console.log(`${solutions.length} solutions seeded.`);
}

seed().then(() => {
    console.log('Database cleanup and seeding complete!');
    process.exit(0);
}).catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
});
