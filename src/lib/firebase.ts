import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-4-society.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-4-society",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-4-society.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Only connect to emulators when explicitly enabled (run: VITE_USE_EMULATORS=true npm run dev)
if (import.meta.env.VITE_USE_EMULATORS === "true") {
    try {
        connectFirestoreEmulator(db, 'localhost', 8080);
        connectAuthEmulator(auth, 'http://localhost:9099');
        console.log("Connected to emulators (Firestore :8080, Auth :9099)");
    } catch (e) {
        console.error("Error connecting to emulator", e);
    }
}
