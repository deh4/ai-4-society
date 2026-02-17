import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Use production Firestore (no emulator)
// Requires: GOOGLE_APPLICATION_CREDENTIALS env or gcloud auth
initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault()
});

const db = getFirestore();

// ─── Agent Registry ─────────────────────────────────────────────────────────

interface AgentRegistryDoc {
    name: string;
    description: string;
    tier: string;
    status: 'active' | 'disabled' | 'not_deployed';
    deployedAt: FirebaseFirestore.Timestamp | null;
    functionName: string | null;
    schedule: string | null;
    overseerRole: string;
}

const agents: Record<string, AgentRegistryDoc> = {
    'signal-scout': {
        name: 'Signal Scout',
        description: 'Discovers and collects real-world evidence from news, research, and GDELT. Classifies signals using Gemini and maps them to risks/solutions.',
        tier: '2A',
        status: 'active',
        deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
        functionName: 'signalScout',
        schedule: 'every 6 hours',
        overseerRole: 'Source Sentinel',
    },
    'topic-tracker': {
        name: 'Topic Tracker',
        description: 'Monitors AI domains and emerging themes. Detects trend shifts, clusters related signals, and identifies new topics requiring risk/solution entries.',
        tier: '2A',
        status: 'active',
        deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
        functionName: 'topicTracker',
        schedule: '0 8 * * *',
        overseerRole: 'Causality Cartographer',
    },
    'risk-evaluation': {
        name: 'Risk Evaluation',
        description: 'Assesses and updates risk metrics from incoming signals. Recalculates severity scores, velocity, and timeline projections based on new evidence.',
        tier: '2B',
        status: 'active',
        deployedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
        functionName: 'riskEvaluation',
        schedule: '0 9 * * *',
        overseerRole: 'Severity Steward',
    },
    'solution-evaluation': {
        name: 'Solution Evaluation',
        description: 'Tracks solution development and adoption progress. Updates adoption scores, implementation stages, and identifies new mitigation approaches.',
        tier: '2B',
        status: 'not_deployed',
        deployedAt: null,
        functionName: null,
        schedule: null,
        overseerRole: 'Greenlight Gardener',
    },
    'validation': {
        name: 'Validation',
        description: 'Ensures data quality and consistency across the observatory. Fact-checks URLs, validates source credibility, and flags stale or conflicting data.',
        tier: '2C',
        status: 'not_deployed',
        deployedAt: null,
        functionName: null,
        schedule: null,
        overseerRole: 'Gap Engineer',
    },
    'consolidation': {
        name: 'Consolidation',
        description: 'Aggregates updates from all agents, resolves conflicts between overlapping data, and maintains versioning for risk/solution document history.',
        tier: '2C',
        status: 'not_deployed',
        deployedAt: null,
        functionName: null,
        schedule: null,
        overseerRole: 'Forecast Scribe',
    },
    'orchestrator': {
        name: 'Orchestrator',
        description: 'Master coordination agent. Manages scheduling, resolves inter-agent conflicts, triggers cascading updates, and monitors overall system health.',
        tier: '1',
        status: 'not_deployed',
        deployedAt: null,
        functionName: null,
        schedule: null,
        overseerRole: 'Observatory Steward',
    },
};

// ─── Signal Scout Config ────────────────────────────────────────────────────

interface SourceConfig {
    name: string;
    type: 'rss' | 'api';
    enabled: boolean;
}

const signalScoutSources: Record<string, SourceConfig> = {
    'arxiv-ai': {
        name: 'arXiv CS.AI',
        type: 'rss',
        enabled: true,
    },
    'mit-tech-review': {
        name: 'MIT Technology Review',
        type: 'rss',
        enabled: true,
    },
    'ars-ai': {
        name: 'Ars Technica AI',
        type: 'rss',
        enabled: true,
    },
    'verge-ai': {
        name: 'The Verge AI',
        type: 'rss',
        enabled: true,
    },
    'techcrunch-ai': {
        name: 'TechCrunch AI',
        type: 'rss',
        enabled: true,
    },
    'wired-ai': {
        name: 'Wired AI',
        type: 'rss',
        enabled: true,
    },
    'gdelt-ai': {
        name: 'GDELT DOC API',
        type: 'api',
        enabled: true,
    },
};

// ─── Signal Scout Health Baseline ───────────────────────────────────────────

const signalScoutHealth = {
    lastRunAt: null,
    lastRunOutcome: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveErrors: 0,
    consecutiveEmptyRuns: 0,
    lastRunTokens: null,
    totalTokensToday: { input: 0, output: 0 },
    totalTokensMonth: { input: 0, output: 0 },
    estimatedCostMonth: 0,
    lastRunArticlesFetched: 0,
    lastRunSignalsStored: 0,
    totalSignalsLifetime: 0,
};

// ─── Seed Function ──────────────────────────────────────────────────────────

async function seedAgents() {
    console.log('Seeding agent registry to PRODUCTION Firestore...');

    // 1. Create agent registry docs
    const agentBatch = db.batch();
    for (const [agentId, agentData] of Object.entries(agents)) {
        const ref = db.collection('agents').doc(agentId);
        agentBatch.set(ref, agentData);
    }
    await agentBatch.commit();
    console.log(`  ${Object.keys(agents).length} agent registry docs created.`);

    // 2. Create Signal Scout config doc
    await db
        .collection('agents')
        .doc('signal-scout')
        .collection('config')
        .doc('current')
        .set({
            sources: signalScoutSources,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'seed-script',
        });
    console.log('  Signal Scout config doc created (7 sources).');

    // 3. Create Signal Scout health baseline (only if it doesn't exist)
    const healthRef = db.collection('agents').doc('signal-scout').collection('health').doc('latest');
    const healthSnap = await healthRef.get();
    if (!healthSnap.exists) {
        await healthRef.set(signalScoutHealth);
        console.log('  Signal Scout health baseline created.');
    } else {
        console.log('  Signal Scout health baseline already exists, skipping.');
    }
}

seedAgents()
    .then(() => {
        console.log('Agent registry seeding complete!');
        process.exit(0);
    })
    .catch((e) => {
        console.error('Error seeding agents:', e);
        process.exit(1);
    });
