import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { UserPreferences, UserPreferencesDoc } from "../types/user";
import { getLocalPreferences, setLocalPreferences } from "../lib/preferences";

/**
 * Read preferences from Firestore for an authenticated user.
 * Returns null if no Firestore preferences exist yet.
 */
export async function getFirestorePreferences(
  uid: string
): Promise<UserPreferencesDoc | null> {
  const ref = doc(db, "users", uid, "preferences", "current");
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserPreferencesDoc) : null;
}

/**
 * Write preferences to Firestore for an authenticated user.
 */
export async function setFirestorePreferences(
  uid: string,
  prefs: UserPreferences,
  source: "localStorage" | "manual" = "manual"
): Promise<void> {
  const ref = doc(db, "users", uid, "preferences", "current");
  await setDoc(ref, {
    interests: prefs.interests,
    source,
    syncedAt: serverTimestamp(),
  });
}

/**
 * Sync localStorage preferences to Firestore on first sign-in.
 * - If Firestore has preferences → use Firestore (overwrite localStorage)
 * - If only localStorage has preferences → push to Firestore
 * - If neither has preferences → no-op
 *
 * Returns the resolved preferences.
 */
export async function syncPreferences(
  uid: string
): Promise<UserPreferences> {
  const firestorePrefs = await getFirestorePreferences(uid);
  const localPrefs = getLocalPreferences();

  if (firestorePrefs && firestorePrefs.interests.length > 0) {
    // Firestore wins — update localStorage to match
    setLocalPreferences({ interests: firestorePrefs.interests });
    return { interests: firestorePrefs.interests };
  }

  if (localPrefs.interests.length > 0) {
    // localStorage has preferences, Firestore doesn't — push up
    await setFirestorePreferences(uid, localPrefs, "localStorage");
    return localPrefs;
  }

  // Neither has preferences
  return { interests: [] };
}
