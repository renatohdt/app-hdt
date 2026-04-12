"use client";

import {
  type CmpConsentScope,
  type ConsentPreferenceMap,
  DEFAULT_CONSENT_PREFERENCES
} from "@/lib/consent-types";
import { CONSENT_STORAGE_KEY } from "@/lib/consent-constants";

export type StoredConsentPreferences = {
  version: string;
  hasInteracted: boolean;
  preferences: ConsentPreferenceMap;
  updatedAt: string;
};

export function createStoredConsentPreferences(
  version: string,
  preferences: Partial<ConsentPreferenceMap>,
  hasInteracted = true
): StoredConsentPreferences {
  return {
    version,
    hasInteracted,
    preferences: {
      ...DEFAULT_CONSENT_PREFERENCES,
      ...preferences
    },
    updatedAt: new Date().toISOString()
  };
}

export function readStoredConsentPreferences(): StoredConsentPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredConsentPreferences>;
    const preferences = (parsed.preferences ?? {}) as Partial<ConsentPreferenceMap>;

    return {
      version: typeof parsed.version === "string" ? parsed.version : "",
      hasInteracted: Boolean(parsed.hasInteracted),
      preferences: {
        marketing: Boolean(preferences.marketing),
        ads: Boolean(preferences.ads)
      },
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return null;
  }
}

export function writeStoredConsentPreferences(value: StoredConsentPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredConsentPreferences() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CONSENT_STORAGE_KEY);
}

export function hasConsentPreference(scope: CmpConsentScope) {
  const stored = readStoredConsentPreferences();
  return Boolean(stored?.preferences?.[scope]);
}
