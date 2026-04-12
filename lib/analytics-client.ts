"use client";

import { isAnonymousTrackableEventName, type AnalyticsEventName } from "@/lib/analytics-events";
import { trackEvent as trackGoogleAnalyticsEvent, logGoogleAnalyticsDiagnostic } from "@/lib/analytics";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { readStoredConsentPreferences } from "@/lib/consent-storage";
import { clientLogError } from "@/lib/client-logger";

const TRACKING_VISITOR_STORAGE_KEY = "hora-do-treino-visitor-id";
const LEGACY_TRACKING_STORAGE_KEY = "hora-do-treino-tracking-id";
const PENDING_ANALYTICS_EVENTS_STORAGE_KEY = "hora-do-treino-pending-analytics-events";
const GA_EVENT_DEDUPLICATION_WINDOW_MS = 3000;
const MAX_PENDING_ANALYTICS_EVENTS = 20;
const recentGoogleAnalyticsEvents = new Map<string, number>();

type AnalyticsEventMetadata = Record<string, string | number | boolean | null | undefined>;
type PendingAnalyticsEvent = {
  event_name: AnalyticsEventName;
  user_id: string | null;
  metadata: AnalyticsEventMetadata;
  queued_at: string;
};

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
  const storedConsent = readStoredConsentPreferences();
  const hasInteracted = Boolean(storedConsent?.hasInteracted);
  const hasAnalyticsConsent = Boolean(storedConsent?.preferences.analytics);

  if (!hasInteracted) {
    if (isAnonymousTrackableEventName(event_name)) {
      queuePendingAnalyticsEvent(event_name, user_id, metadata);
      logGoogleAnalyticsDiagnostic("product_event_queued_pending_consent", {
        event_name,
        user_id: user_id ?? null
      });
    } else {
      logGoogleAnalyticsDiagnostic("product_event_skipped_pending_consent", {
        event_name,
        user_id: user_id ?? null
      });
    }
    return;
  }

  if (!hasAnalyticsConsent) {
    logGoogleAnalyticsDiagnostic("product_event_skipped_no_consent", {
      event_name,
      user_id: user_id ?? null
    });
    return;
  }

  dispatchAnalyticsEvent(event_name, user_id, metadata);
}

export function flushPendingAnalyticsEvents() {
  const storedConsent = readStoredConsentPreferences();

  if (!storedConsent?.hasInteracted || !storedConsent.preferences.analytics) {
    return;
  }

  const pendingEvents = readPendingAnalyticsEvents();
  if (!pendingEvents.length) {
    return;
  }

  clearPendingAnalyticsEvents();

  pendingEvents.forEach((event) => {
    dispatchAnalyticsEvent(event.event_name, event.user_id, event.metadata);
  });
}

export function clearPendingAnalyticsEvents() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PENDING_ANALYTICS_EVENTS_STORAGE_KEY);
  } catch {
    // Ignore storage failures on cleanup.
  }
}

function dispatchAnalyticsEvent(
  event_name: AnalyticsEventName,
  user_id?: string | null,
  metadata?: AnalyticsEventMetadata
) {
  forwardEventToGoogleAnalytics(event_name, user_id, metadata);

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

function forwardEventToGoogleAnalytics(
  eventName: AnalyticsEventName,
  userId?: string | null,
  metadata?: AnalyticsEventMetadata
) {
  const canonicalEventName = getGoogleAnalyticsEventName(eventName);

  if (!canonicalEventName) {
    return;
  }

  const dedupeKey = buildGoogleAnalyticsDeduplicationKey(canonicalEventName, userId, metadata);
  if (isDuplicateGoogleAnalyticsEvent(dedupeKey)) {
    logGoogleAnalyticsDiagnostic("product_event_deduped", {
      original_event_name: eventName,
      canonical_event_name: canonicalEventName,
      user_id: userId ?? null,
      metadata: metadata ?? {}
    });
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

function buildGoogleAnalyticsDeduplicationKey(
  eventName: string,
  userId?: string | null,
  metadata?: AnalyticsEventMetadata
) {
  const normalizedMetadata = {
    source: metadata?.source ?? null,
    goal: metadata?.goal ?? null,
    location: metadata?.location ?? null,
    article: metadata?.article ?? null,
    url: metadata?.url ?? null,
    workout_key: metadata?.workout_key ?? null,
    session_number: metadata?.session_number ?? null
  };

  return JSON.stringify({
    event_name: eventName,
    user_id: userId ?? null,
    metadata: normalizedMetadata
  });
}

function isDuplicateGoogleAnalyticsEvent(key: string) {
  const now = Date.now();

  for (const [storedKey, storedAt] of recentGoogleAnalyticsEvents.entries()) {
    if (now - storedAt > GA_EVENT_DEDUPLICATION_WINDOW_MS) {
      recentGoogleAnalyticsEvents.delete(storedKey);
    }
  }

  const previous = recentGoogleAnalyticsEvents.get(key);
  if (previous && now - previous <= GA_EVENT_DEDUPLICATION_WINDOW_MS) {
    return true;
  }

  recentGoogleAnalyticsEvents.set(key, now);
  return false;
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

function queuePendingAnalyticsEvent(
  event_name: AnalyticsEventName,
  user_id?: string | null,
  metadata?: AnalyticsEventMetadata
) {
  if (typeof window === "undefined") {
    return;
  }

  const pendingEvents = readPendingAnalyticsEvents();
  const nextEvent: PendingAnalyticsEvent = {
    event_name,
    user_id: user_id ?? null,
    metadata: metadata ?? {},
    queued_at: new Date().toISOString()
  };
  const nextSignature = JSON.stringify({
    event_name: nextEvent.event_name,
    user_id: nextEvent.user_id,
    metadata: nextEvent.metadata
  });

  const dedupedEvents = pendingEvents.filter((event) => {
    const signature = JSON.stringify({
      event_name: event.event_name,
      user_id: event.user_id,
      metadata: event.metadata
    });

    return signature !== nextSignature;
  });

  const nextEvents = [...dedupedEvents, nextEvent].slice(-MAX_PENDING_ANALYTICS_EVENTS);

  try {
    window.sessionStorage.setItem(PENDING_ANALYTICS_EVENTS_STORAGE_KEY, JSON.stringify(nextEvents));
  } catch {
    // Ignore storage failures and fall back to best-effort live tracking.
  }
}

function readPendingAnalyticsEvents() {
  if (typeof window === "undefined") {
    return [] as PendingAnalyticsEvent[];
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_ANALYTICS_EVENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is PendingAnalyticsEvent => {
        return (
          item &&
          typeof item === "object" &&
          typeof item.event_name === "string" &&
          (item.user_id === null || typeof item.user_id === "string") &&
          item.metadata &&
          typeof item.metadata === "object" &&
          !Array.isArray(item.metadata)
        );
      })
      .slice(-MAX_PENDING_ANALYTICS_EVENTS);
  } catch {
    return [];
  }
}
