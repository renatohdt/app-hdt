"use client";

import { type AnalyticsEventName } from "@/lib/analytics-events";
import { trackEvent as trackGoogleAnalyticsEvent } from "@/lib/analytics";
import { getAccessToken } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";

const TRACKING_VISITOR_STORAGE_KEY = "hora-do-treino-visitor-id";
const LEGACY_TRACKING_STORAGE_KEY = "hora-do-treino-tracking-id";

type AnalyticsEventMetadata = Record<string, string | number | boolean | null | undefined>;

type QueuedAnalyticsEvent = {
  event_name: AnalyticsEventName;
  user_id: string | null;
  visitor_id: string;
  metadata: AnalyticsEventMetadata;
};

// Fila de eventos: em vez de 1 request por evento, acumulamos e enviamos
// em lote (1 request a cada ~10s ou quando a fila enche). Isso reduz o
// número de invocações de função no Vercel sem perder nenhum evento.
const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE_SIZE = 10;

const eventQueue: QueuedAnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenersRegistered = false;
// Guarda o último token conhecido para conseguir enviar a fila de forma
// síncrona quando a página está sendo fechada (não dá para esperar async).
let lastKnownAccessToken: string | null = null;

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

  if (typeof window === "undefined") {
    return;
  }

  eventQueue.push({
    event_name,
    user_id: user_id ?? null,
    visitor_id: getTrackingVisitorId(),
    metadata: metadata ?? {}
  });

  registerFlushListeners();

  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    void flushEventQueue();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flushEventQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

async function flushEventQueue(options: { sync?: boolean } = {}) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) {
    return;
  }

  // Esvazia a fila antes do request: novos eventos entram numa fila nova.
  const events = eventQueue.splice(0, eventQueue.length);

  try {
    let token = lastKnownAccessToken;

    // No fechamento da página (sync) não dá para esperar o getAccessToken,
    // então usamos o último token em cache.
    if (!options.sync) {
      const freshToken = await getAccessToken().catch(() => null);
      if (freshToken) {
        lastKnownAccessToken = freshToken;
        token = freshToken;
      }
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // keepalive: true permite que o navegador conclua o envio mesmo se a
    // página estiver sendo fechada.
    const response = await fetch("/api/track", {
      method: "POST",
      headers,
      body: JSON.stringify({ events }),
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`track-${response.status}`);
    }
  } catch (error) {
    clientLogError("TRACK EVENT ERROR", error);
  }
}

function registerFlushListeners() {
  if (flushListenersRegistered || typeof window === "undefined") {
    return;
  }

  flushListenersRegistered = true;

  // Aquece o cache do token para o envio síncrono no fechamento da página.
  void getAccessToken()
    .then((token) => {
      if (token) {
        lastKnownAccessToken = token;
      }
    })
    .catch(() => {});

  window.addEventListener("pagehide", () => {
    void flushEventQueue({ sync: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushEventQueue({ sync: true });
    }
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
    case "premium_page_view":
      return "premium_page_view";
    case "checkout_started":
      return "begin_checkout";
    case "purchase":
      return "purchase";
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
