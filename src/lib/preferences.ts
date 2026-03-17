import type { UserPreferences } from "../types/user";
import { auth } from "./firebase";
import { setFirestorePreferences } from "../data/preferences";

const STORAGE_KEY = "ai4s_preferences";

export function getLocalPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { interests: [] };
    return JSON.parse(raw) as UserPreferences;
  } catch {
    return { interests: [] };
  }
}

export function setLocalPreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function hasPreferences(): boolean {
  return getLocalPreferences().interests.length > 0;
}

/**
 * Save preferences to localStorage always, and to Firestore if authenticated.
 */
export async function savePreferences(prefs: UserPreferences): Promise<void> {
  setLocalPreferences(prefs);
  const user = auth.currentUser;
  if (user) {
    await setFirestorePreferences(user.uid, prefs, "manual");
  }
}
