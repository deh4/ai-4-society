/**
 * seed-v2-graph.ts
 *
 * Reads v1 data (risks, solutions, milestones) from production Firestore
 * and populates v2 graph collections: nodes, edges, graph_snapshot, node_summaries.
 *
 * Equivalent to calling migrateV1toV2 + buildGraph cloud functions.
 * Safe to re-run — all writes are set() (upsert).
 *
 * Prerequisites:
 *   gcloud auth application-default login
 *   OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *
 * Run:
 *   npm run seed:v2-graph
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault(),
});

const db = getFirestore();

const credibilityMap: Record<string, number> = {
    'arXiv CS.AI': 0.85,
    'MIT Technology Review': 0.8,
    'Ars Technica': 0.75,
    'The Verge': 0.65,
    'TechCrunch': 0.6,
    'Wired': 0.75,
    'TLDR AI': 0.65,
    'Import AI': 0.7,
    'Last Week in AI': 0.65,
    'GDELT': 0.5,
};

async function migrate() {
    console.log('--- Step 1: Migrating risks → nodes ---');
    const risksSnap = await db.collection('risks').get();
    const stakeholderSet = new Set<string>();

    for (const d of risksSnap.docs) {
        const data = d.data();
        await db.doc(`nodes/${d.id}`).set({
            id: d.id,
            type: 'risk',
            name: data.risk_name ?? data.name ?? d.id,
            category: data.category ?? '',
            summary: data.summary ?? '',
            deep_dive: data.deep_dive ?? '',
            score_2026: data.score_2026 ?? 50,
            score_2035: data.score_2035 ?? 50,
            velocity: data.velocity ?? 'Medium',
            expert_severity: data.expert_severity ?? 50,
            public_perception: data.public_perception ?? 50,
            timeline_narrative: data.timeline_narrative ?? { near_term: '', mid_term: '', long_term: '' },
            mitigation_strategies: data.mitigation_strategies ?? [],
            version: data.version ?? 1,
            lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
            lastUpdatedBy: data.lastUpdatedBy ?? 'migration',
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        });

        if (Array.isArray(data.who_affected)) {
            data.who_affected.forEach((s: string) => stakeholderSet.add(s));
        }

        if (Array.isArray(data.connected_to)) {
            for (const target of data.connected_to) {
                const edgeId = `${d.id}-${target}-migration`;
                const relationship = (target as string).startsWith('S') ? 'addressed_by' : 'correlates_with';
                const targetType = (target as string).startsWith('S') ? 'solution' : 'risk';
                await db.doc(`edges/${edgeId}`).set({
                    id: edgeId,
                    from_node: d.id,
                    from_type: 'risk',
                    to_node: target,
                    to_type: targetType,
                    relationship,
                    created_by: 'migration',
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
        }
    }
    console.log(`  ${risksSnap.size} risks → nodes`);

    console.log('--- Step 2: Migrating solutions → nodes ---');
    const solutionsSnap = await db.collection('solutions').get();
    for (const d of solutionsSnap.docs) {
        const data = d.data();
        await db.doc(`nodes/${d.id}`).set({
            id: d.id,
            type: 'solution',
            name: data.solution_title ?? data.name ?? d.id,
            solution_type: data.solution_type ?? '',
            summary: data.summary ?? '',
            deep_dive: data.deep_dive ?? '',
            implementation_stage: data.implementation_stage ?? 'Research',
            adoption_score_2026: data.adoption_score_2026 ?? 0,
            adoption_score_2035: data.adoption_score_2035 ?? 0,
            key_players: data.key_players ?? [],
            barriers: data.barriers ?? [],
            timeline_narrative: data.timeline_narrative ?? { near_term: '', mid_term: '', long_term: '' },
            version: data.version ?? 1,
            lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
            lastUpdatedBy: data.lastUpdatedBy ?? 'migration',
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        });

        if (data.parent_risk_id) {
            const edgeId = `${data.parent_risk_id}-${d.id}-addressed_by`;
            await db.doc(`edges/${edgeId}`).set({
                id: edgeId,
                from_node: data.parent_risk_id,
                from_type: 'risk',
                to_node: d.id,
                to_type: 'solution',
                relationship: 'addressed_by',
                created_by: 'migration',
                createdAt: FieldValue.serverTimestamp(),
            });
        }
    }
    console.log(`  ${solutionsSnap.size} solutions → nodes`);

    console.log('--- Step 3: Migrating milestones → nodes ---');
    const milestonesSnap = await db.collection('milestones').get();
    for (const d of milestonesSnap.docs) {
        const data = d.data();
        await db.doc(`nodes/${d.id}`).set({
            id: d.id,
            type: 'milestone',
            name: data.title ?? '',
            description: data.description ?? '',
            date: data.year ? String(data.year) : '',
            significance: data.significance ?? 'deployment',
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    console.log(`  ${milestonesSnap.size} milestones → nodes`);

    console.log('--- Step 4: Creating stakeholder nodes ---');
    const sortedStakeholders = [...stakeholderSet].sort();
    for (let i = 0; i < sortedStakeholders.length; i++) {
        const name = sortedStakeholders[i];
        const sId = `SH${String(i + 1).padStart(2, '0')}`;
        await db.doc(`nodes/${sId}`).set({
            id: sId,
            type: 'stakeholder',
            name,
            description: '',
            createdAt: FieldValue.serverTimestamp(),
        });

        for (const riskDoc of risksSnap.docs) {
            const riskData = riskDoc.data();
            if (Array.isArray(riskData.who_affected) && riskData.who_affected.includes(name)) {
                const edgeId = `${riskDoc.id}-${sId}-impacts`;
                await db.doc(`edges/${edgeId}`).set({
                    id: edgeId,
                    from_node: riskDoc.id,
                    from_type: 'risk',
                    to_node: sId,
                    to_type: 'stakeholder',
                    relationship: 'impacts',
                    created_by: 'migration',
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
        }
    }
    console.log(`  ${sortedStakeholders.length} stakeholder nodes created`);

    console.log('--- Step 5: Updating signal related_node_ids ---');
    const signalsSnap = await db.collection('signals').get();
    let signalCount = 0;
    for (const d of signalsSnap.docs) {
        const data = d.data();
        // Skip if already migrated
        if (Array.isArray(data.related_node_ids)) continue;

        const relatedNodes: Array<{ node_id: string; node_type: string; relevance: number }> = [];
        const relatedNodeIds: string[] = [];

        if (Array.isArray(data.risk_categories)) {
            for (const cat of data.risk_categories) {
                relatedNodes.push({ node_id: cat, node_type: 'risk', relevance: data.confidence_score ?? 0.8 });
                relatedNodeIds.push(cat);
            }
        }
        if (Array.isArray(data.solution_ids)) {
            for (const sol of data.solution_ids) {
                relatedNodes.push({ node_id: sol, node_type: 'solution', relevance: data.confidence_score ?? 0.8 });
                relatedNodeIds.push(sol);
            }
        }

        const credibility = credibilityMap[data.source_name] ?? 0.5;
        const confidence = data.confidence_score ?? 0.5;
        const severityMultiplier =
            data.severity_hint === 'Critical' ? 1.0
            : data.severity_hint === 'Emerging' ? 0.7
            : data.severity_hint === 'Horizon' ? 0.4
            : 0.7;

        await d.ref.update({
            related_nodes: relatedNodes,
            related_node_ids: relatedNodeIds,
            source_credibility: credibility,
            impact_score: credibility * confidence * severityMultiplier,
        });
        signalCount++;
    }
    console.log(`  ${signalCount} signals updated (${signalsSnap.size - signalCount} already migrated)`);
}

async function buildGraph() {
    console.log('--- Step 6: Building graph_snapshot ---');
    const nodesSnap = await db.collection('nodes').get();
    const edgesSnap = await db.collection('edges').get();

    const nodes = nodesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const edges = edgesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));

    const snapshotNodes = nodes.map((n) => {
        const node: Record<string, unknown> = { id: n.id, type: n.type, name: n.name };
        if (n.velocity) node.velocity = n.velocity;
        if (n.implementation_stage) node.implementation_stage = n.implementation_stage;
        if (n.significance) node.significance = n.significance;
        if (n.score_2026 !== undefined) node.score_2026 = n.score_2026;
        return node;
    });

    const snapshotEdges = edges.map((e) => ({
        from: e.from_node,
        to: e.to_node,
        relationship: e.relationship,
        ...(e.properties ? { properties: e.properties } : {}),
    }));

    await db.doc('graph_snapshot/current').set({
        nodes: snapshotNodes,
        edges: snapshotEdges,
        nodeCount: snapshotNodes.length,
        edgeCount: snapshotEdges.length,
        updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  graph_snapshot/current: ${snapshotNodes.length} nodes, ${snapshotEdges.length} edges`);

    console.log('--- Step 7: Building node_summaries ---');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const node of nodes) {
        const nodeId = node.id as string;

        const signalsSnap = await db
            .collection('signals')
            .where('related_node_ids', 'array-contains', nodeId)
            .where('status', '==', 'approved')
            .get();

        const signals = signalsSnap.docs.map((d) => d.data());

        const count7d = signals.filter((s) => {
            const fetchedAt = s.fetched_at as { toDate?: () => Date } | undefined;
            return fetchedAt?.toDate && fetchedAt.toDate() >= sevenDaysAgo;
        }).length;

        const count30d = signals.filter((s) => {
            const fetchedAt = s.fetched_at as { toDate?: () => Date } | undefined;
            return fetchedAt?.toDate && fetchedAt.toDate() >= thirtyDaysAgo;
        }).length;

        const previousCount = count30d - count7d;
        const avgPrevious = previousCount / 3;
        let trending: 'rising' | 'stable' | 'declining' = 'stable';
        if (count7d > avgPrevious * 1.5) trending = 'rising';
        else if (count7d < avgPrevious * 0.5 && count7d < avgPrevious) trending = 'declining';

        const votesSnap = await db.collection('nodes').doc(nodeId).collection('votes').get();
        let voteUp = 0, voteDown = 0;
        votesSnap.forEach((v) => {
            if (v.data().value === 1) voteUp++;
            else if (v.data().value === -1) voteDown++;
        });

        const summary: Record<string, unknown> = {
            node_id: nodeId,
            node_type: node.type,
            name: node.name,
            signal_count_7d: count7d,
            signal_count_30d: count30d,
            trending,
            vote_up: voteUp,
            vote_down: voteDown,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (node.velocity) summary.velocity = node.velocity;

        await db.doc(`node_summaries/${nodeId}`).set(summary);
        process.stdout.write('.');
    }
    console.log(`\n  ${nodes.length} node_summaries written`);
}

async function main() {
    console.log('🚀 Seeding v2 graph data for project: ai-4-society\n');
    await migrate();
    await buildGraph();
    console.log('\n✅ Done. Refresh the app to see the graph and risk badges.');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
