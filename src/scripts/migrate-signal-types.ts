import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault(),
});

const db = getFirestore();

async function migrateSignalTypes() {
    const snap = await db.collection('signals').get();
    const BATCH_SIZE = 400;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const chunk = snap.docs.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const d of chunk) {
            const data = d.data();
            // Skip if already migrated
            if (data.signal_type !== undefined) { skipped++; continue; }

            batch.update(d.ref, {
                signal_type: 'risk',
                solution_ids: [],
            });
            updated++;
        }

        await batch.commit();
        console.log(`Progress: ${i + chunk.length}/${snap.docs.length} processed`);
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} already migrated`);
}

migrateSignalTypes().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
