import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
    projectId: 'ai-4-society',
    credential: applicationDefault(),
});

const db = getFirestore();

async function seedLeadUser() {
    console.log('Migrating existing admins to /users collection...');

    const adminsSnap = await db.collection('admins').get();
    console.log(`Found ${adminsSnap.size} admin(s) to migrate.`);

    for (const adminDoc of adminsSnap.docs) {
        const uid = adminDoc.id;
        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
            console.log(`  ${uid}: already has /users doc, skipping.`);
            continue;
        }

        const authUser = await getAuth().getUser(uid);

        await userRef.set({
            email: authUser.email ?? '',
            displayName: authUser.displayName ?? '',
            photoURL: authUser.photoURL ?? null,
            roles: ['lead'],
            status: 'active',
            appliedRoles: ['lead'],
            applicationNote: 'Migrated from legacy admin',
            appliedAt: FieldValue.serverTimestamp(),
            approvedAt: FieldValue.serverTimestamp(),
            approvedBy: 'system-migration',
            lastActiveAt: FieldValue.serverTimestamp(),
            totalReviews: 0,
        });
        console.log(`  ${uid} (${authUser.email}): migrated as lead.`);
    }

    console.log('Migration complete.');
}

seedLeadUser()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    });
