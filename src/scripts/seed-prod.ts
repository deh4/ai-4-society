import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Use production Firestore (no emulator)
// Requires: GOOGLE_APPLICATION_CREDENTIALS env or gcloud auth
initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault()
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
        connected_to: ['R09', 'R01'],
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
    },
    {
        id: 'R04',
        risk_name: 'Mass Labor Displacement and Economic Polarization',
        category: 'Economic',
        score_2026: 82,
        score_2035: 70,
        connected_to: ['R06', 'R01', 'S04'],
        velocity: 'High',
        summary: 'Goldman Sachs estimates 300 million jobs globally could be exposed to AI automation by 2030, with white-collar knowledge workers now facing displacement alongside manual laborers for the first time.',
        deep_dive: `The 2024-2025 wave of generative AI has inverted traditional automation patterns: instead of replacing blue-collar jobs first, AI is now displacing copywriters, paralegals, junior programmers, and customer service agents. McKinsey projects that up to 30% of hours worked in the US could be automated by 2030. The economic impact is bifurcated—companies report record productivity gains while entry-level hiring freezes spread across tech, media, and finance.\n\nThe 'hollowing out' of middle-skill jobs is accelerating wealth concentration. AI tool access creates a new digital divide: workers who can leverage AI see productivity gains of 40-60%, while those who cannot are left behind. Freelance platforms report a 21% decline in writing and coding gigs since ChatGPT's launch, while AI-augmented workers command premium rates.`,
        who_affected: [
            'Knowledge workers (copywriters, translators, junior developers)',
            'Customer service and call center employees (2.3 million US jobs)',
            'Recent graduates entering the workforce',
            'Gig economy workers on freelance platforms'
        ],
        timeline_narrative: {
            near_term: 'By 2026, major corporations publicly announce \'AI-first\' workforce strategies, reducing hiring targets by 20-30%. Freelance marketplaces see continued decline in traditional knowledge work gigs.',
            mid_term: 'By 2030, UBI pilot programs are running in 15+ countries. \'Human-in-the-loop\' becomes a regulated job category with minimum wage protections.',
            long_term: 'By 2035, the labor market stabilizes around AI-augmented roles, but the transition period leaves lasting scars on a generation of workers who were mid-career during the disruption.'
        },
        mitigation_strategies: [
            'Government-funded AI reskilling programs targeting displaced workers',
            'Portable benefits systems decoupled from traditional employment',
            'AI productivity tax to fund transition programs',
            'Mandatory human staffing ratios for critical services (healthcare, education)'
        ],
        signal_evidence: [
            {
                date: '2024-06-05',
                isNew: false,
                headline: 'Goldman Sachs: AI could automate 300 million full-time jobs globally',
                source: 'Goldman Sachs Research',
                url: 'https://www.goldmansachs.com/insights/articles/generative-ai-could-raise-global-gdp-by-7-percent'
            },
            {
                date: '2024-09-15',
                isNew: false,
                headline: 'Freelance writing and coding gigs down 21% since ChatGPT launch',
                source: 'Bloomberg / Upwork data analysis'
            },
            {
                date: '2025-03-10',
                isNew: true,
                headline: 'McKinsey: Up to 30% of US work hours could be automated by 2030',
                source: 'McKinsey Global Institute',
                url: 'https://www.mckinsey.com/mgi/our-research/generative-ai-and-the-future-of-work-in-america'
            }
        ],
        expert_severity: 80,
        public_perception: 72
    },
    {
        id: 'R05',
        risk_name: 'Autonomous Weapons and AI-Enabled Conflict Escalation',
        category: 'Geopolitical',
        score_2026: 75,
        score_2035: 88,
        connected_to: ['R09', 'R03', 'S05'],
        velocity: 'High',
        summary: 'Over 100 countries are developing military AI systems, and autonomous drones have been used in combat in Ukraine, Libya, and Gaza without meaningful human oversight, compressing the kill chain to seconds.',
        deep_dive: `The use of AI in warfare has moved from theoretical concern to operational reality. Turkey's Kargu-2 drone reportedly engaged targets autonomously in Libya in 2021, and Ukraine's conflict has become a live testing ground for AI-powered target identification and autonomous drone swarms. The US Department of Defense's Replicator Initiative aims to deploy thousands of autonomous systems by 2026.\n\nThe fundamental risk is speed: AI-driven decision-making compresses the OODA loop (observe-orient-decide-act) to milliseconds, eliminating meaningful human oversight in lethal decisions. This creates 'flash war' scenarios analogous to financial flash crashes—escalation spirals that occur faster than diplomats can intervene. Additionally, the proliferation of cheap drone technology means non-state actors can now deploy lethal autonomous weapons with minimal resources.`,
        who_affected: [
            'Civilian populations in conflict zones',
            'Military personnel (reduced human oversight)',
            'Developing nations (asymmetric AI arms race)',
            'International humanitarian organizations'
        ],
        timeline_narrative: {
            near_term: 'By 2026, autonomous drone swarms are standard equipment for major militaries. The first confirmed fully autonomous lethal engagement by a state actor sparks international outcry.',
            mid_term: 'By 2030, AI-enabled cyber weapons can autonomously identify and exploit zero-day vulnerabilities in critical infrastructure. A \'Digital Geneva Convention\' is proposed but stalls.',
            long_term: 'By 2035, the AI arms race has created a new MAD (mutually assured destruction) paradigm where autonomous systems create unpredictable escalation dynamics between nuclear powers.'
        },
        mitigation_strategies: [
            'Binding international treaty on Lethal Autonomous Weapons Systems (LAWS)',
            'Mandatory human-in-the-loop requirements for lethal force decisions',
            'Export controls on military AI components and training data',
            'Confidence-building measures: AI incident hotlines between major powers'
        ],
        signal_evidence: [
            {
                date: '2024-04-24',
                isNew: false,
                headline: 'UN General Assembly adopts first resolution on autonomous weapons governance',
                source: 'United Nations',
                url: 'https://news.un.org/en/story/2024/04/1148906'
            },
            {
                date: '2024-08-28',
                isNew: false,
                headline: 'Pentagon Replicator Initiative: Thousands of autonomous systems planned by 2026',
                source: 'US Department of Defense'
            },
            {
                date: '2025-01-15',
                isNew: true,
                headline: 'AI-powered drone swarms used in Ukraine conflict with increasing autonomy',
                source: 'Royal United Services Institute (RUSI)',
                url: 'https://www.rusi.org/explore-our-research'
            }
        ],
        expert_severity: 88,
        public_perception: 55
    },
    {
        id: 'R06',
        risk_name: 'AI Power Concentration and Oligopoly Control',
        category: 'Economic',
        score_2026: 80,
        score_2035: 75,
        connected_to: ['R04', 'R02', 'S06'],
        velocity: 'High',
        summary: 'The top 3 AI companies (Microsoft/OpenAI, Google, Meta) control over 90% of frontier model development, with training runs now costing $100M+, creating an unprecedented concentration of technological power.',
        deep_dive: `AI development is consolidating into a narrow oligopoly at a pace that exceeds even the tech monopolies of the social media era. Training a frontier model now costs $100M-$1B, creating insurmountable barriers to entry. The compute required doubles roughly every 6-10 months, meaning only companies with access to massive GPU clusters (primarily NVIDIA H100/B200) can compete.\n\nThis concentration has downstream effects: these companies control the API layer through which most businesses access AI, creating platform dependency. They also control the training data pipelines, model architectures, and increasingly the hardware supply chain (custom chips). The 'kingmaker' dynamic means a single company's policy decisions—about content filtering, pricing, or capability restrictions—effectively become global AI policy without democratic input.`,
        who_affected: [
            'AI startups and small businesses (barrier to entry)',
            'Developing nations (technology dependency)',
            'Open-source AI community (resource disadvantage)',
            'Democratic institutions (unelected policy power)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, training costs for frontier models exceed $1B. The number of organizations capable of training from scratch shrinks to under 10 globally.',
            mid_term: 'By 2030, antitrust actions in the EU and US attempt to break up vertical integration (cloud + model + application). National sovereign AI programs emerge as a counter.',
            long_term: 'By 2035, either antitrust succeeds in creating a more competitive market, or AI becomes a regulated utility with mandatory access provisions similar to telecom.'
        },
        mitigation_strategies: [
            'Public investment in open-source foundation models (EU/CERN-style)',
            'Antitrust enforcement targeting vertical integration in AI stack',
            'Mandatory API interoperability standards for AI platforms',
            'Compute access programs for researchers and developing nations'
        ],
        signal_evidence: [
            {
                date: '2024-11-20',
                isNew: false,
                headline: 'FTC opens investigation into Microsoft-OpenAI partnership structure',
                source: 'Federal Trade Commission',
                url: 'https://www.ftc.gov/news-events'
            },
            {
                date: '2025-01-06',
                isNew: true,
                headline: 'Training GPT-5 class models estimated to cost over $500M',
                source: 'The Information / industry analysts'
            },
            {
                date: '2025-02-12',
                isNew: true,
                headline: 'EU launches European AI Office to oversee compliance and competition',
                source: 'European Commission',
                url: 'https://digital-strategy.ec.europa.eu/en/policies/european-ai-office'
            }
        ],
        expert_severity: 78,
        public_perception: 45
    },
    {
        id: 'R07',
        risk_name: 'Environmental Cost of AI Infrastructure',
        category: 'Environmental',
        score_2026: 65,
        score_2035: 72,
        connected_to: ['R06', 'S07'],
        velocity: 'Medium',
        summary: 'AI data centers are projected to consume 3-4% of global electricity by 2030 (up from 1-2% today), with a single GPT-4 training run estimated to use as much energy as 120 US homes consume in a year.',
        deep_dive: `The environmental footprint of AI is growing exponentially. Training large language models requires massive computational resources: GPT-4's training consumed an estimated 50 GWh of electricity. But training is only part of the picture—inference (running the models for users) now accounts for 60-80% of total AI energy consumption, and this scales linearly with adoption.\n\nWater consumption is an underreported concern: data centers used 6.6 billion gallons of water for cooling in 2023 in the US alone, and Google reported a 20% increase in water usage year-over-year directly attributed to AI workloads. The irony of using AI to solve climate change while simultaneously accelerating resource consumption creates a genuine paradox that the industry has yet to address transparently.`,
        who_affected: [
            'Communities near data center clusters (water and power competition)',
            'Developing nations (exported environmental costs)',
            'Climate-vulnerable populations globally',
            'Local power grids (strain from data center demand)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, major tech companies face backlash as data center energy demands delay municipal clean energy targets. Water-stressed regions begin restricting data center construction.',
            mid_term: 'By 2030, \'Green AI\' certifications become a market differentiator. Nuclear micro-reactors are deployed at data center campuses. Efficiency gains partially offset growth.',
            long_term: 'By 2035, next-generation hardware (neuromorphic chips, optical computing) reduces energy per inference by 100x, but total consumption continues to rise due to demand growth.'
        },
        mitigation_strategies: [
            'Carbon and water reporting mandates for AI model training and inference',
            'Energy efficiency standards for data center operations (PUE targets)',
            'Investment in renewable energy sources dedicated to AI infrastructure',
            'Research funding for energy-efficient model architectures and hardware'
        ],
        signal_evidence: [
            {
                date: '2024-05-01',
                isNew: false,
                headline: 'Google reports 48% increase in greenhouse gas emissions, largely due to AI data centers',
                source: 'Google Environmental Report 2024',
                url: 'https://sustainability.google/reports/'
            },
            {
                date: '2024-09-18',
                isNew: false,
                headline: 'IEA: Data centers could consume 3-4% of global electricity by 2030',
                source: 'International Energy Agency',
                url: 'https://www.iea.org/reports/electricity-2024'
            },
            {
                date: '2025-03-05',
                isNew: true,
                headline: 'Virginia residents protest new data center construction citing water and noise concerns',
                source: 'Washington Post'
            }
        ],
        expert_severity: 70,
        public_perception: 40
    },
    {
        id: 'R08',
        risk_name: 'Loss of Human Agency and Cognitive Atrophy',
        category: 'Societal',
        score_2026: 58,
        score_2035: 78,
        connected_to: ['R04', 'R01', 'S08'],
        velocity: 'Emerging',
        summary: 'Growing dependence on AI for decision-making, creativity, and critical thinking risks eroding fundamental human cognitive capabilities, with studies showing a 30% decline in critical thinking scores among heavy AI users.',
        deep_dive: `As AI becomes embedded in daily life—from navigation to writing to medical diagnosis—humans are increasingly outsourcing cognitive tasks that historically built and maintained mental capabilities. Early research from 2024-2025 suggests that heavy reliance on AI assistants correlates with reduced problem-solving ability, diminished spatial navigation skills, and declining creative originality.\n\nThe concern extends beyond individual cognition to collective human agency. When AI systems make recommendations that humans routinely accept without scrutiny (estimated at 85% acceptance rate for AI suggestions in professional settings), the locus of decision-making effectively shifts from human judgment to algorithmic optimization. This creates a subtle but profound shift: humans become executors of AI decisions rather than autonomous agents, raising questions about accountability, meaning, and the long-term trajectory of human intellectual development.`,
        who_affected: [
            'Students and young learners (formative cognitive development)',
            'Knowledge workers (skill atrophy in AI-augmented roles)',
            'Creative professionals (originality erosion)',
            'Elderly populations (accelerated cognitive decline)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, universities report a measurable decline in student writing and analytical skills. \'AI-free\' assessments become standard, but enforcement is inconsistent.',
            mid_term: 'By 2030, \'Cognitive Fitness\' programs emerge alongside physical fitness. Some employers require \'analog hours\' for deep work. Neuroscience research quantifies the impact.',
            long_term: 'By 2035, society bifurcates between those who maintain cognitive independence (a valued skill) and those who are fully AI-dependent for daily decision-making.'
        },
        mitigation_strategies: [
            'Educational curricula that emphasize AI-complementary skills (critical thinking, ethics)',
            'Digital wellbeing legislation with \'right to cognitive autonomy\' provisions',
            'Research funding for understanding long-term cognitive effects of AI dependence',
            'Design standards requiring AI systems to explain rather than just recommend'
        ],
        signal_evidence: [
            {
                date: '2024-07-12',
                isNew: false,
                headline: 'Study: GPS reliance linked to reduced hippocampal activity and spatial memory decline',
                source: 'Nature Communications',
                url: 'https://www.nature.com/ncomms/'
            },
            {
                date: '2025-01-20',
                isNew: true,
                headline: 'Survey: 40% of college professors report decline in student critical thinking since AI tool adoption',
                source: 'Chronicle of Higher Education'
            },
            {
                date: '2025-04-08',
                isNew: true,
                headline: 'Microsoft research: AI copilot users accept 85% of suggestions without modification',
                source: 'Microsoft Research / IEEE Software',
                url: 'https://www.microsoft.com/en-us/research/'
            }
        ],
        expert_severity: 65,
        public_perception: 35
    },
    {
        id: 'R09',
        risk_name: 'AI-Enabled Mass Surveillance and Authoritarian Governance',
        category: 'Geopolitical',
        score_2026: 85,
        score_2035: 90,
        connected_to: ['R02', 'R03', 'S09'],
        velocity: 'Critical',
        summary: 'At least 75 countries now use AI-powered surveillance systems, with China\'s social credit infrastructure being exported to 40+ nations, enabling unprecedented state control over populations.',
        deep_dive: `AI has fundamentally shifted the balance of power between states and citizens. Facial recognition, gait analysis, social media monitoring, and predictive policing systems are being deployed at scale by both authoritarian and democratic governments. China's integrated surveillance infrastructure—combining 700 million cameras with AI analysis—serves as a turnkey model being exported globally through Belt and Road digital partnerships.\n\nThe threat extends to democracies: the US, UK, and EU member states increasingly deploy AI-powered surveillance at borders, protests, and in public spaces. The '100% identification' capability of modern facial recognition (even with masks) combined with real-time emotion analysis creates chilling effects on free speech, assembly, and political dissent. The lack of international norms means surveillance technology flows freely across borders, enabling authoritarian regression even in nominally democratic states.`,
        who_affected: [
            'Ethnic and religious minorities under state surveillance',
            'Political dissidents and journalists in authoritarian states',
            'Protesters and activists in democratic nations',
            'Uyghur, Tibetan, and other targeted populations'
        ],
        timeline_narrative: {
            near_term: 'By 2026, AI-powered surveillance is standard in 100+ countries. \'Turnkey authoritarianism\' packages are commercially available from Chinese and Israeli firms.',
            mid_term: 'By 2030, real-time emotion recognition in public spaces enables \'pre-crime\' policing in several nations. Democratic pushback results in surveillance moratoriums in some EU cities.',
            long_term: 'By 2035, the global landscape is split: surveillance-free zones in some democracies vs. total information awareness states. The UN debates a \'Right to Anonymity\' convention.'
        },
        mitigation_strategies: [
            'International moratorium on AI facial recognition in public spaces',
            'Export controls on surveillance AI technology to authoritarian regimes',
            'Mandatory transparency reports for government AI surveillance programs',
            'Support for privacy-preserving technologies and encrypted communications'
        ],
        signal_evidence: [
            {
                date: '2024-06-17',
                isNew: false,
                headline: 'Carnegie report: AI surveillance technology used in at least 75 countries',
                source: 'Carnegie Endowment for International Peace',
                url: 'https://carnegieendowment.org/research/2024/06/ai-surveillance'
            },
            {
                date: '2024-12-01',
                isNew: false,
                headline: 'EU AI Act bans real-time facial recognition in public spaces with exceptions for law enforcement',
                source: 'European Parliament',
                url: 'https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence'
            },
            {
                date: '2025-02-28',
                isNew: true,
                headline: 'Amnesty International: Chinese surveillance tech exported to 40+ countries via Belt and Road',
                source: 'Amnesty International',
                url: 'https://www.amnesty.org/en/tech/'
            }
        ],
        expert_severity: 90,
        public_perception: 50
    },
    {
        id: 'R10',
        risk_name: 'Model Collapse and Data Scarcity Crisis',
        category: 'Technological',
        score_2026: 55,
        score_2035: 68,
        connected_to: ['R06', 'R02', 'S10'],
        velocity: 'Emerging',
        summary: 'As AI-generated content floods the internet, models trained on this synthetic data are showing progressive quality degradation—\'model collapse\'—while high-quality human-generated training data is projected to be exhausted by 2028.',
        deep_dive: `A fundamental paradox threatens AI's continued improvement: the more successful AI content generation becomes, the more it poisons its own future training data. Research from Oxford and Cambridge demonstrated in 2024 that models trained on AI-generated text progressively lose coherence and diversity—a phenomenon termed 'model collapse.' Within 5-10 generations of recursive training, outputs degrade to repetitive, low-quality text.\n\nSimultaneously, the supply of high-quality human-generated training data is finite and diminishing. Epoch AI estimates that the stock of high-quality text data will be exhausted between 2026-2028. This creates a 'data wall' that could slow or halt improvements in AI capabilities. The emerging responses—synthetic data generation, data licensing deals (Reddit-Google, News Corp-OpenAI), and web scraping expansion—each carry their own risks and limitations.`,
        who_affected: [
            'AI researchers and developers (capability plateau)',
            'Content creators (devaluation of human-generated content)',
            'Users of AI tools (degrading output quality)',
            'Publishers and data owners (contentious licensing disputes)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, major AI labs acknowledge diminishing returns from scaling alone. Data licensing costs exceed compute costs for some training runs.',
            mid_term: 'By 2030, \'Data Commons\' initiatives create curated, verified human datasets. Synthetic data techniques mature but require careful validation.',
            long_term: 'By 2035, AI development shifts from data-hungry approaches to more efficient architectures (neurosymbolic, few-shot). The \'data crisis\' is seen as a temporary growing pain.'
        },
        mitigation_strategies: [
            'Investment in curated, high-quality public training datasets',
            'Development of synthetic data validation and quality standards',
            'Fair compensation frameworks for human data contributors',
            'Research into data-efficient model architectures'
        ],
        signal_evidence: [
            {
                date: '2024-07-24',
                isNew: false,
                headline: 'Nature paper: Model collapse demonstrated in recursive AI training experiments',
                source: 'Nature / University of Oxford',
                url: 'https://www.nature.com/articles/s41586-024-07566-y'
            },
            {
                date: '2024-06-20',
                isNew: false,
                headline: 'Epoch AI: High-quality text data may be exhausted by 2026-2028',
                source: 'Epoch AI Research',
                url: 'https://epochai.org/blog/will-we-run-out-of-data'
            },
            {
                date: '2025-05-16',
                isNew: true,
                headline: 'Reddit and News Corp sign multi-billion dollar data licensing deals with AI companies',
                source: 'Wall Street Journal'
            }
        ],
        expert_severity: 60,
        public_perception: 25
    }
];

// Solution data addressing the risks above
const solutions = [
    {
        id: 'S01',
        parent_risk_id: 'R01',
        solution_title: 'Algorithmic Auditing & Fairness Certification Standards',
        solution_type: 'Policy + Technology',
        summary: 'Independent third-party auditing frameworks that test AI systems for bias before deployment, analogous to financial auditing standards.',
        deep_dive: `Algorithmic auditing is emerging as a critical accountability mechanism for AI systems deployed in high-stakes domains like hiring, lending, and criminal justice. New York City's Local Law 144, which took effect in 2023, requires employers using automated hiring tools to conduct annual bias audits—the first law of its kind in the US. The EU AI Act extends this further, classifying hiring and credit-scoring AI as 'high-risk' and mandating conformity assessments.\n\nThe challenge is standardization: there is no universally accepted definition of 'fairness' in AI (researchers have identified 21+ mathematical definitions that are mutually incompatible). Leading organizations like NIST, ISO, and IEEE are developing frameworks, but the audit industry remains fragmented. Companies like Holistic AI, Credo AI, and Arthur AI are building tooling for continuous monitoring, moving beyond one-time audits to ongoing fairness assurance.`,
        implementation_stage: 'Pilot Programs',
        adoption_score_2026: 25,
        adoption_score_2035: 70,
        key_players: [
            'NYC Department of Consumer and Worker Protection',
            'EU AI Office (AI Act enforcement)',
            'NIST (AI Risk Management Framework)',
            'Holistic AI & Credo AI (audit tooling)',
            'IEEE Standards Association'
        ],
        barriers: [
            'No universal definition of algorithmic fairness (21+ competing metrics)',
            'Proprietary model access limitations (black-box auditing challenges)',
            'Cost of auditing prohibitive for small businesses',
            'Lack of qualified auditors and certification programs'
        ],
        timeline_narrative: {
            near_term: 'By 2026, EU AI Act enforcement begins requiring conformity assessments for high-risk AI. NYC Law 144 becomes a model for 10+ US cities.',
            mid_term: 'By 2030, algorithmic auditing is a $10B industry. ISO standards for AI fairness are adopted globally. Real-time bias monitoring becomes standard practice.',
            long_term: 'By 2035, AI fairness certification is as routine as food safety labels. Consumer-facing \'Fairness Scores\' influence purchasing decisions.'
        }
    },
    {
        id: 'S02',
        parent_risk_id: 'R02',
        solution_title: 'Privacy-Preserving AI: Federated Learning & On-Device Processing',
        solution_type: 'Technology',
        summary: 'Technical approaches that enable AI to learn from data without centralizing it, including federated learning, on-device inference, and differential privacy guarantees.',
        deep_dive: `Privacy-preserving AI represents a paradigm shift from 'collect everything centrally' to 'bring the model to the data.' Federated learning, pioneered by Google for keyboard predictions, allows models to train across distributed devices without raw data ever leaving the user's device. Apple's on-device intelligence strategy (Apple Intelligence) demonstrates commercial viability at scale.\n\nDifferential privacy adds mathematical guarantees that individual data points cannot be reverse-engineered from model outputs. Combined with secure multi-party computation (SMPC) and homomorphic encryption, these technologies enable AI development that is functionally equivalent to centralized training while preserving individual privacy. The trade-off is computational overhead: federated learning can be 10-100x slower than centralized training, though hardware advances are closing the gap.`,
        implementation_stage: 'Early Adoption',
        adoption_score_2026: 30,
        adoption_score_2035: 75,
        key_players: [
            'Apple (on-device AI / Apple Intelligence)',
            'Google (federated learning pioneer)',
            'OpenMined (open-source privacy-preserving ML)',
            'NVIDIA (confidential computing hardware)',
            'EU ENISA (privacy standards body)'
        ],
        barriers: [
            'Computational overhead of federated learning (10-100x slower)',
            'Complexity of implementation for small development teams',
            'Accuracy trade-offs with differential privacy (noise injection)',
            'Lack of standardized benchmarks for privacy-preserving methods'
        ],
        timeline_narrative: {
            near_term: 'By 2026, Apple and Google process 80%+ of personal AI tasks on-device. Enterprise federated learning platforms see 5x adoption growth.',
            mid_term: 'By 2030, homomorphic encryption becomes practical for real-time inference. Healthcare AI operates entirely on encrypted patient data.',
            long_term: 'By 2035, centralized data collection for AI training is viewed as an outdated practice. Privacy-preserving techniques are the default, not the exception.'
        }
    },
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
    },
    {
        id: 'S04',
        parent_risk_id: 'R04',
        solution_title: 'Universal Basic Services & AI-Era Workforce Transition Programs',
        solution_type: 'Policy',
        summary: 'Comprehensive policy frameworks combining income support, retraining programs, and universal basic services to manage the economic disruption caused by AI automation.',
        deep_dive: `As AI displaces millions of workers, traditional unemployment insurance and job retraining prove inadequate for the scale and speed of transformation. Universal Basic Services (UBS)—publicly funded access to healthcare, housing, education, and digital connectivity—offers a more comprehensive safety net than Universal Basic Income (UBI) alone, at roughly 40% of the cost according to UCL's Institute for Global Prosperity.\n\nSeveral countries are piloting hybrid approaches. Finland's basic income experiment (2017-2018) showed improved wellbeing but limited employment effects, informing next-generation designs. The US CHIPS Act includes workforce transition provisions, and the EU's Just Transition Fund model is being adapted for AI displacement. The key insight is that transition support must be proactive (before displacement) rather than reactive (after job loss), requiring unprecedented coordination between governments, employers, and educational institutions.`,
        implementation_stage: 'Policy Debate',
        adoption_score_2026: 15,
        adoption_score_2035: 50,
        key_players: [
            'OECD (AI Policy Observatory)',
            'Nordic governments (pilot programs)',
            'US Department of Labor (workforce development)',
            'World Economic Forum (reskilling initiatives)',
            'Coursera & edX (mass retraining platforms)'
        ],
        barriers: [
            'Political resistance to expanded social safety nets',
            'Difficulty predicting which jobs will be displaced and when',
            'Funding mechanisms (AI productivity tax politically contentious)',
            'Retraining programs historically have low completion rates (30-40%)'
        ],
        timeline_narrative: {
            near_term: 'By 2026, 5+ countries launch AI-specific workforce transition programs. \'Right to retraining\' legislation is proposed in the EU.',
            mid_term: 'By 2030, UBI/UBS pilots are running in 15+ countries. AI companies contribute to transition funds via negotiated agreements.',
            long_term: 'By 2035, a new social contract emerges where AI-generated productivity gains are redistributed through universal services and reduced work hours.'
        }
    },
    {
        id: 'S05',
        parent_risk_id: 'R05',
        solution_title: 'International AI Arms Control Treaties',
        solution_type: 'Governance',
        summary: 'Binding international agreements to regulate the development and deployment of AI in military applications, modeled on nuclear non-proliferation and chemical weapons conventions.',
        deep_dive: `The absence of international norms governing military AI creates a dangerous vacuum. The Campaign to Stop Killer Robots, supported by 180+ organizations across 70 countries, has pushed for a preemptive ban on fully autonomous weapons since 2013. The UN Convention on Certain Conventional Weapons (CCW) has been the primary forum, but progress has been blocked by major military powers.\n\nIn 2024, the UN General Assembly adopted its first resolution on autonomous weapons, calling for new international norms. The US 'Political Declaration on Responsible Military Use of AI' (2023) represents a softer approach—establishing voluntary principles rather than binding restrictions. The fundamental challenge is verification: unlike nuclear weapons, AI capabilities are embedded in software that is difficult to inspect or limit through traditional arms control mechanisms. New approaches involving compute governance, chip export controls, and algorithmic transparency measures are being explored.`,
        implementation_stage: 'Negotiation',
        adoption_score_2026: 10,
        adoption_score_2035: 40,
        key_players: [
            'United Nations (CCW framework)',
            'Campaign to Stop Killer Robots (civil society)',
            'ICRC (International Committee of the Red Cross)',
            'US State Department (Political Declaration on Military AI)',
            'AUKUS & NATO (allied AI governance frameworks)'
        ],
        barriers: [
            'Major military powers (US, China, Russia) resist binding limits',
            'Verification challenge: AI capabilities are software-based and hard to inspect',
            'Dual-use technology: civilian AI easily adapted for military purposes',
            'Speed of development outpaces diplomatic timelines'
        ],
        timeline_narrative: {
            near_term: 'By 2026, 50+ countries sign the US Political Declaration on Military AI. A UN working group drafts elements of a legally binding instrument.',
            mid_term: 'By 2030, a \'Digital Geneva Convention\' establishes minimum standards for AI in conflict, but enforcement remains weak.',
            long_term: 'By 2035, chip-level governance and compute monitoring create a partial verification regime, analogous to IAEA inspections for nuclear material.'
        }
    },
    {
        id: 'S06',
        parent_risk_id: 'R06',
        solution_title: 'Open-Source AI & Antitrust Enforcement',
        solution_type: 'Technology + Policy',
        summary: 'Combining open-source AI model development with antitrust enforcement to prevent monopolistic control of AI capabilities and ensure broad access.',
        deep_dive: `Open-source AI models have emerged as the primary counterweight to corporate AI concentration. Meta's LLaMA release, Mistral's models, and the broader Hugging Face ecosystem demonstrate that competitive AI can be developed outside the closed corporate lab paradigm. In 2024, open-source models began matching proprietary performance on many benchmarks, with LLaMA 3.1 405B achieving GPT-4 level performance.\n\nHowever, open-source alone is insufficient without antitrust enforcement. The vertical integration of AI companies—controlling compute (cloud), models (APIs), and applications (consumer products)—mirrors the anticompetitive structures that led to the breakup of Standard Oil and AT&T. The FTC's investigation into the Microsoft-OpenAI relationship and the EU's Digital Markets Act enforcement signal growing regulatory appetite. The challenge is defining relevant markets in AI, where traditional antitrust frameworks struggle with platform dynamics and network effects.`,
        implementation_stage: 'Early Adoption',
        adoption_score_2026: 35,
        adoption_score_2035: 65,
        key_players: [
            'Meta (LLaMA open-source models)',
            'Mistral AI (European open-source leader)',
            'Hugging Face (model distribution platform)',
            'FTC & EU DG Competition (antitrust enforcement)',
            'Linux Foundation (AI & Data governance)'
        ],
        barriers: [
            'Open-source models still require massive compute to train and fine-tune',
            'Safety concerns: open models can be fine-tuned to remove guardrails',
            'Antitrust law struggles with platform dynamics in AI markets',
            'Corporate lobbying against regulatory intervention'
        ],
        timeline_narrative: {
            near_term: 'By 2026, open-source models achieve frontier performance for most tasks. EU antitrust investigations into AI market structure conclude.',
            mid_term: 'By 2030, publicly funded foundation models (EU CERN-for-AI initiative) provide a non-commercial alternative. Mandatory API interoperability is enforced.',
            long_term: 'By 2035, a competitive AI ecosystem exists with 50+ capable model providers. AI is treated as critical infrastructure with regulated access requirements.'
        }
    },
    {
        id: 'S07',
        parent_risk_id: 'R07',
        solution_title: 'Green AI Standards & Carbon-Aware Computing',
        solution_type: 'Technology + Policy',
        summary: 'Technical and regulatory frameworks to measure, report, and reduce the environmental impact of AI systems, including energy-efficient model design and carbon-aware scheduling.',
        deep_dive: `The Green AI movement advocates for treating computational efficiency as a first-class research objective alongside model performance. Practical approaches include: model distillation (creating smaller, efficient versions of large models), sparse architectures that activate only relevant parameters, and carbon-aware computing that schedules training jobs when renewable energy is available on the grid.\n\nOn the policy side, the EU's Corporate Sustainability Reporting Directive (CSRD) is being extended to include AI-specific energy and water consumption metrics. France became the first country to require data center energy reporting in 2024. Industry initiatives like the AI Carbon Footprint Tracker (developed by Allen AI and Hugging Face) enable researchers to measure and compare the environmental cost of different models and training approaches. The key insight is that smaller, more efficient models often match larger models' performance for specific tasks while using 10-100x less energy.`,
        implementation_stage: 'Pilot Programs',
        adoption_score_2026: 20,
        adoption_score_2035: 60,
        key_players: [
            'Allen Institute for AI (Green AI research)',
            'Hugging Face (Carbon Footprint Tracker)',
            'Google DeepMind (efficient architecture research)',
            'EU Commission (CSRD reporting framework)',
            'Climate TRACE (emissions monitoring)'
        ],
        barriers: [
            'Competitive pressure to prioritize performance over efficiency',
            'Lack of standardized measurement methodologies for AI carbon footprint',
            'Data center operators resist mandatory energy reporting',
            'Rebound effect: efficiency gains consumed by increased usage'
        ],
        timeline_narrative: {
            near_term: 'By 2026, EU mandates AI energy consumption reporting for large providers. \'Green AI\' labels appear on commercial AI products.',
            mid_term: 'By 2030, carbon-aware computing is standard practice. Model efficiency metrics (performance-per-watt) become key benchmarks alongside accuracy.',
            long_term: 'By 2035, next-generation hardware reduces energy per inference by 100x. AI systems actively optimize their own energy consumption in real-time.'
        }
    },
    {
        id: 'S08',
        parent_risk_id: 'R08',
        solution_title: 'Human Autonomy Frameworks & Digital Wellbeing Laws',
        solution_type: 'Policy + Technology',
        summary: 'Legal and design frameworks that protect human cognitive autonomy and agency in the age of pervasive AI assistance, ensuring AI augments rather than replaces human thinking.',
        deep_dive: `Human autonomy frameworks represent an emerging field at the intersection of cognitive science, ethics, and technology policy. The core principle is that AI systems should be designed to enhance human capabilities rather than create dependency. The EU AI Act's provisions on 'manipulation' and 'exploitation' represent early legal recognition of cognitive autonomy as a protected right.\n\nPractical implementation involves both design standards and regulation. 'Friction by design' approaches intentionally slow down AI-assisted decision-making for high-stakes choices, requiring users to engage critically rather than rubber-stamp AI recommendations. Educational institutions are developing 'AI literacy' curricula that teach students when and how to use AI tools without undermining their own cognitive development. Research from the Center for Humane Technology and others is building the evidence base for how AI interaction patterns affect attention, memory, and critical thinking.`,
        implementation_stage: 'Research',
        adoption_score_2026: 10,
        adoption_score_2035: 45,
        key_players: [
            'Center for Humane Technology',
            'UNESCO (AI Ethics framework)',
            'EU Parliament (AI Act cognitive autonomy provisions)',
            'Stanford HAI (Human-Centered AI research)',
            'WHO (digital health and wellbeing guidelines)'
        ],
        barriers: [
            'Difficulty measuring cognitive autonomy and its degradation',
            'Consumer preference for convenience over cognitive engagement',
            'Tech industry incentives favor increased AI dependence (engagement metrics)',
            'Limited longitudinal research on AI\'s cognitive effects'
        ],
        timeline_narrative: {
            near_term: 'By 2026, WHO publishes guidelines on AI and cognitive health. \'Digital Wellbeing\' becomes a regulated category in the EU alongside data protection.',
            mid_term: 'By 2030, \'Cognitive Impact Assessments\' are required for AI products targeting children. Schools integrate AI literacy as a core subject.',
            long_term: 'By 2035, \'Right to Cognitive Autonomy\' is enshrined in international human rights frameworks. AI systems are legally required to support human agency.'
        }
    },
    {
        id: 'S09',
        parent_risk_id: 'R09',
        solution_title: 'Democratic AI Oversight & Surveillance Moratoriums',
        solution_type: 'Governance',
        summary: 'Democratic governance mechanisms including surveillance moratoriums, independent oversight bodies, and citizen participation in AI policy decisions to prevent authoritarian AI use.',
        deep_dive: `The democratic response to AI surveillance combines immediate protective measures (moratoriums) with long-term institutional design (oversight bodies). Over 20 US cities including San Francisco, Boston, and Minneapolis have enacted bans or restrictions on government use of facial recognition technology. The EU AI Act's prohibition on real-time biometric identification in public spaces (with law enforcement exceptions) represents the most ambitious regulatory approach globally.\n\nBeyond moratoriums, democratic AI oversight requires new institutional infrastructure. Taiwan's participatory approach—using tools like Polis for citizen deliberation on AI policy—offers a model for inclusive governance. The UK AI Safety Institute and EU AI Office represent government attempts to build technical expertise for oversight. Civil society organizations play a crucial watchdog role: Access Now's annual report on facial recognition, Algorithm Watch's monitoring of automated decision-making, and the AI Incident Database all provide the transparency infrastructure that democratic accountability requires.`,
        implementation_stage: 'Advocacy',
        adoption_score_2026: 20,
        adoption_score_2035: 55,
        key_players: [
            'EU AI Office & AI Board',
            'UK AI Safety Institute',
            'Access Now (civil society advocacy)',
            'Taiwan Digital Ministry (participatory AI governance)',
            'AI Now Institute (research and advocacy)'
        ],
        barriers: [
            'National security exceptions undermine surveillance restrictions',
            'Surveillance industry lobbying against moratoriums',
            'Difficulty maintaining democratic oversight of fast-moving technology',
            'Authoritarian governments exporting surveillance as \'smart city\' infrastructure'
        ],
        timeline_narrative: {
            near_term: 'By 2026, the EU AI Act enforcement creates the first comprehensive surveillance oversight regime. 50+ cities globally have facial recognition restrictions.',
            mid_term: 'By 2030, international \'AI Watchdog\' bodies modeled on IAEA provide independent monitoring. Citizen assemblies on AI governance become routine.',
            long_term: 'By 2035, democratic AI governance is institutionalized with dedicated oversight bodies, mandatory transparency, and citizen participation mechanisms in most democracies.'
        }
    },
    {
        id: 'S10',
        parent_risk_id: 'R10',
        solution_title: 'Synthetic Data Standards & Data Commons',
        solution_type: 'Technology',
        summary: 'Technical standards for synthetic data quality assurance and publicly governed data commons that ensure sustainable, high-quality training data for AI development.',
        deep_dive: `As natural training data becomes scarce and contentious, synthetic data generation and public data commons emerge as complementary solutions. Gartner projects that by 2030, synthetic data will account for the majority of data used for AI training. Companies like Mostly AI, Gretel, and Synthesis AI already offer enterprise synthetic data platforms, and NVIDIA's Omniverse generates photorealistic synthetic training data for computer vision.\n\nData commons represent the governance complement to synthetic data technology. Inspired by Creative Commons and open data movements, initiatives like the LAION dataset, Common Crawl, and EleutherAI's The Pile provide publicly accessible training data. However, these face quality and consent challenges. The emerging model involves curated, governed data repositories with clear provenance, consent tracking, and fair compensation for human contributors. The EU's proposed Data Act and various national data trust frameworks provide legal scaffolding for this approach.`,
        implementation_stage: 'Research',
        adoption_score_2026: 15,
        adoption_score_2035: 55,
        key_players: [
            'NVIDIA (Omniverse synthetic data)',
            'Mostly AI & Gretel (synthetic data platforms)',
            'EleutherAI (open-source data and models)',
            'EU Commission (Data Act framework)',
            'Allen Institute for AI (open data initiatives)'
        ],
        barriers: [
            'Synthetic data can encode and amplify biases from source data',
            'Validation of synthetic data quality remains an unsolved problem',
            'Data commons face intellectual property and consent challenges',
            'Model collapse risk when synthetic data feeds back into training loops'
        ],
        timeline_narrative: {
            near_term: 'By 2026, synthetic data standards are published by IEEE and ISO. Major AI labs disclose training data composition for the first time.',
            mid_term: 'By 2030, public data commons provide curated, consent-tracked datasets for key domains (medical, legal, scientific). Synthetic data accounts for 40% of training data.',
            long_term: 'By 2035, a mature data ecosystem exists with clear provenance, fair compensation, and quality standards. The \'data crisis\' is resolved through a combination of synthetic and curated human data.'
        }
    }
];

const milestones = [
    { id: 'M01', year: 1950, title: 'Turing Test Proposed', description: 'Alan Turing publishes "Computing Machinery and Intelligence," flipping the script on philosophy with a single question: can machines think? Rather than defining intelligence, he proposes an imitation game — if a machine can fool a human into thinking it\'s human, does the distinction even matter? This paper doesn\'t just launch AI as an idea; it plants the seed for every chatbot, every language model, every debate about machine consciousness that follows.' },
    { id: 'M02', year: 1956, title: 'Dartmouth Conference', description: 'A small group of mathematicians and engineers gather at Dartmouth College for a summer workshop, armed with an audacious premise: "every aspect of learning or any other feature of intelligence can in principle be so precisely described that a machine can be made to simulate it." They coin the term "Artificial Intelligence" and launch a field. The optimism is breathtaking — they expect human-level AI within a generation. They\'re wrong about the timeline, but right about the destination.' },
    { id: 'M03', year: 1966, title: 'ELIZA Chatbot', description: 'Joseph Weizenbaum creates ELIZA at MIT — a simple pattern-matching program that simulates a Rogerian therapist. It has no understanding whatsoever. Yet people pour their hearts out to it, forming emotional bonds with a few hundred lines of code. Weizenbaum is horrified. He intended to demonstrate how superficial human-computer interaction is; instead he accidentally proves something profound about human psychology: we\'re wired to see intelligence and empathy, even where none exists.' },
    { id: 'M04', year: 1997, title: 'Deep Blue Defeats Kasparov', description: 'IBM\'s Deep Blue defeats world chess champion Garry Kasparov in a six-game match, and the world holds its breath. It\'s not just a chess victory — it\'s the first time a machine publicly humbles human expertise in a domain that was considered the pinnacle of strategic thinking. Kasparov accuses IBM of cheating. IBM dismantles the machine. But the message is clear: raw computational power, applied with enough sophistication, can overcome centuries of human mastery.' },
    { id: 'M05', year: 2012, title: 'AlexNet Wins ImageNet', description: 'A deep convolutional neural network called AlexNet crushes the ImageNet image recognition competition, cutting the error rate nearly in half. The secret ingredients: massive GPU computing, millions of labeled images, and dropout regularization. Overnight, the AI research community pivots from hand-crafted features to deep learning. This single result triggers the revolution — within three years, every major tech company restructures around neural networks. The deep learning era begins not with a paper, but with a benchmark score.' },
    { id: 'M06', year: 2014, title: 'GANs Introduced', description: 'Ian Goodfellow, reportedly inspired by a conversation at a bar, invents Generative Adversarial Networks — two neural networks locked in a creative duel. One generates fake images; the other tries to spot the fakes. Through this adversarial dance, machines learn to create startlingly realistic content from nothing. GANs don\'t just advance AI — they force society to confront a new reality: seeing is no longer believing. Deepfakes, synthetic media, and AI art all trace their lineage to this single architecture.' },
    { id: 'M07', year: 2016, title: 'AlphaGo Defeats Lee Sedol', description: 'DeepMind\'s AlphaGo defeats world Go champion Lee Sedol 4-1, conquering a game with more possible positions than atoms in the universe. Move 37 of Game 2 becomes legendary — a play so unconventional that human experts initially call it a mistake, then realize it\'s brilliant. Lee Sedol says he\'s "speechless." The victory shatters the assumption that Go\'s reliance on intuition and pattern recognition makes it uniquely human. AlphaGo didn\'t just learn the game — it discovered strategies humans never imagined in 2,500 years of play.' },
    { id: 'M08', year: 2017, title: 'Transformer Architecture', description: 'A team at Google publishes "Attention Is All You Need" — eight pages that quietly reshape the entire field. The Transformer architecture replaces sequential processing with self-attention, allowing models to process entire sequences in parallel. It\'s faster, more scalable, and dramatically more capable. GPT, BERT, PaLM, Claude — every foundation model that follows stands on this paper. The irony: it was designed for machine translation. Its authors had no idea they were building the engine for a revolution.' },
    { id: 'M09', year: 2020, title: 'AlphaFold Solves Protein Folding', description: 'DeepMind\'s AlphaFold solves protein structure prediction — a 50-year grand challenge in biology — with accuracy rivaling experimental methods. It predicts the 3D shapes of nearly every known protein, work that would have taken experimental scientists centuries. Overnight, structural biology leaps forward by decades. This is the moment AI stops being merely impressive and becomes indispensable to science. Drug discovery, disease understanding, enzyme design — all accelerated by a neural network doing in hours what labs couldn\'t do in years.' },
    { id: 'M10', year: 2021, title: 'DALL-E — Text to Image', description: 'OpenAI unveils DALL-E, a model that generates images from text descriptions: "an armchair in the shape of an avocado." The results are surreal, playful, and deeply unsettling to artists and illustrators who suddenly see a machine doing in seconds what takes them hours. It\'s the opening salvo in AI\'s creative revolution. Within a year, Midjourney and Stable Diffusion follow. The question shifts from "can AI be creative?" to "what does creativity even mean when a machine can do it?"' },
    { id: 'M11', year: 2022, title: 'ChatGPT Launched', description: 'On November 30, OpenAI releases ChatGPT. Within five days, a million people are using it. Within two months, 100 million — the fastest technology adoption in human history. It isn\'t the most powerful model, but it\'s the first one anyone can talk to. Teachers panic. Writers worry. Coders marvel. Executives scramble. For the first time, AI isn\'t an abstract concept debated in labs — it\'s sitting on everyone\'s laptop, writing their emails, explaining quantum physics, and occasionally making things up with complete confidence.' },
    { id: 'M12', year: 2023, title: 'EU AI Act', description: 'The European Union agrees on the AI Act — the world\'s first comprehensive legal framework for regulating artificial intelligence. It bans social scoring, restricts real-time facial recognition, and requires transparency for high-risk AI systems. Critics call it either too aggressive (stifling innovation) or too timid (full of loopholes). But it establishes a precedent: AI is not beyond the reach of democratic governance. Like GDPR before it, the AI Act becomes a global reference point — setting standards that ripple far beyond European borders.' },
    { id: 'M13', year: 2024, title: 'AI Agents Emerge', description: 'Autonomous AI agents — systems that can plan multi-step tasks, use tools, browse the web, and execute code — move from research demos to production. Software engineers start delegating entire features to AI assistants. Customer service bots handle complex cases end-to-end. The shift is subtle but seismic: AI goes from "tool you use" to "colleague that acts." Questions of accountability, oversight, and control become urgent when the AI isn\'t just suggesting — it\'s doing.' },
    { id: 'M14', year: 2025, title: 'DeepSeek R1', description: 'DeepSeek, a Chinese AI lab, releases R1 — an open-source reasoning model that matches or exceeds proprietary Western models at a fraction of the cost. Trained with novel reinforcement learning techniques, it demonstrates that frontier AI capability is no longer the exclusive domain of well-funded Silicon Valley labs. The geopolitical implications are immediate: the assumption that export controls and compute restrictions can contain AI capability is shattered. Open-source AI becomes not just viable but competitive at the highest level.' },
];

async function clearDatabase() {
    console.log('Clearing existing PRODUCTION data...');

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

    // Clear all milestones
    const milestonesSnapshot = await db.collection('milestones').get();
    const milestoneDeleteBatch = db.batch();
    milestonesSnapshot.docs.forEach((doc) => {
        milestoneDeleteBatch.delete(doc.ref);
    });
    await milestoneDeleteBatch.commit();
    console.log(`Deleted ${milestonesSnapshot.size} existing milestones.`);
}

async function seed() {
    console.log('⚠️  Seeding PRODUCTION Firestore...');
    
    // Clear existing data first
    await clearDatabase();

    console.log('Seeding Risks...');
    const riskBatch = db.batch();
    for (const risk of risks) {
        const ref = db.collection('risks').doc(risk.id);
        riskBatch.set(ref, risk);
    }
    await riskBatch.commit();
    console.log(`✅ ${risks.length} risks seeded.`);

    console.log('Seeding Solutions...');
    const solBatch = db.batch();
    for (const sol of solutions) {
        const ref = db.collection('solutions').doc(sol.id);
        solBatch.set(ref, sol);
    }
    await solBatch.commit();
    console.log(`✅ ${solutions.length} solutions seeded.`);

    console.log('Seeding Milestones...');
    const mileBatch = db.batch();
    for (const m of milestones) {
        const ref = db.collection('milestones').doc(m.id);
        mileBatch.set(ref, m);
    }
    await mileBatch.commit();
    console.log(`✅ ${milestones.length} milestones seeded.`);
}

seed().then(() => {
    console.log('🎉 PRODUCTION database cleanup and seeding complete!');
    process.exit(0);
}).catch((e) => {
    console.error('❌ Error seeding production:', e);
    process.exit(1);
});
