import type { UserPreferences } from "../types/user";

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
