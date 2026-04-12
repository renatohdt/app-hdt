"use client";

import { type AnalyticsEventName } from "@/lib/analytics-events";
import { trackEvent as trackGoogleAnalyticsEvent } from "@/lib/analytics";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";

const TRACKING_VISITOR_STORAGE_KEY = "hora-do-treino-visitor-id";
const LEGACY_TRACKING_STORAGE_KEY = "hora-do-treino-tracking-id";

type AnalyticsEventMetadata = Record<string, string | number | boolean | null | undefined>;

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
  metadata?: AnalyticsEventMetadata
) {
  forwardEventToGoogleAnalytics(event_name, metadata);

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
      body,
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`track-${response.status}`);
    }
  })().catch((error) => {
    clientLogError("TRACK EVENT ERROR", error);
  });
}

function forwardEventToGoogleAnalytics(eventName: AnalyticsEventName, metadata?: AnalyticsEventMetadata) {
  const canonicalEventName = getGoogleAnalyticsEventName(eventName);

  if (!canonicalEventName) {
    return;
  }

  trackGoogleAnalyticsEvent(canonicalEventName, {
    ...metadata,
    source_event: eventName === canonicalEventName ? undefined : eventName
  });
}

function getGoogleAnalyticsEventName(eventName: AnalyticsEventName) {
  switch (eventName) {
    case "signup":
    case "sign_up":
      return "sign_up";
    case "cta_click":
    case "cta_clicked":
    case "clicked_cta":
      return "cta_click";
    case "article_click":
      return "article_click";
    case "workout_viewed":
    case "viewed_workout":
      return "workout_viewed";
    case "workout_generated":
      return "workout_generated";
    default:
      return null;
  }
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
