"use client";

import { type AnalyticsEventName } from "@/lib/analytics-events";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { hasConsentPreference } from "@/lib/consent-storage";
import { clientLogError } from "@/lib/client-logger";

const TRACKING_VISITOR_STORAGE_KEY = "hora-do-treino-visitor-id";
const LEGACY_TRACKING_STORAGE_KEY = "hora-do-treino-tracking-id";

export function getTrackingVisitorId(explicitUserId?: string | null) {
  if (explicitUserId) {
    return explicitUserId;
  }

  if (typeof window === "undefined") {
    return "anonymous";
  }

  const existing = readTrackingStorage(TRACKING_VISITOR_STORAGE_KEY) ?? readTrackingStorage(LEGACY_TRACKING_STORAGE_KEY);
  if (existing) {
    writeTrackingStorage(TRACKING_VISITOR_STORAGE_KEY, existing);
    writeTrackingStorage(LEGACY_TRACKING_STORAGE_KEY, existing);
    return existing;
  }

  const nextId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}`;

  writeTrackingStorage(TRACKING_VISITOR_STORAGE_KEY, nextId);
  writeTrackingStorage(LEGACY_TRACKING_STORAGE_KEY, nextId);
  return nextId;
}

export function getTrackingUserId(explicitUserId?: string | null) {
  return getTrackingVisitorId(explicitUserId);
}

export function trackEvent(
  event_name: AnalyticsEventName,
  user_id?: string | null,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  if (!hasConsentPreference("analytics")) {
    return;
  }

  void (async () => {
    const body = JSON.stringify({
      event_name,
      user_id: user_id ?? null,
      visitor_id: getTrackingVisitorId(),
      metadata: metadata ?? {}
    });

    const response = await fetchWithAuth("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`track-${response.status}`);
    }
  })().catch((error) => {
    clientLogError("TRACK EVENT ERROR", error);
  });
}

function readTrackingStorage(key: string) {
  try {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTrackingStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures and try the session bucket.
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures and fall back to the in-memory return value.
  }
}
