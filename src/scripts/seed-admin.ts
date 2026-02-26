import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

initializeApp({ projectId: 'ai-4-society' });
const db = getFirestore();

const ADMIN_UID = process.argv[2];

if (!ADMIN_UID) {
    console.error('Usage: npm run seed:admin <firebase-auth-uid>');
    console.error('Get your UID from the Firebase Auth emulator UI at http://localhost:4000/auth');
    process.exit(1);
}

async function seedAdmin() {
    await db.collection('admins').doc(ADMIN_UID).set({
        created_at: new Date().toISOString(),
        role: 'admin',
    });
    console.log(`Admin user ${ADMIN_UID} added.`);
}

seedAdmin().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
