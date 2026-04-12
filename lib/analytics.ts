import { clientLogInfo } from "@/lib/client-logger";

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
export const GA_DEBUG_STORAGE_KEY = "hdt-ga-debug";
const GA_EVENT_QUEUE_LIMIT = 50;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __hdtGaBootstrapReady?: boolean;
    __hdtGaScriptReady?: boolean;
    __hdtGaHasLoggedGtagAvailable?: boolean;
    __hdtGaEventQueue?: GoogleAnalyticsQueuedCall[];
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

type GoogleAnalyticsQueuedCall =
  | {
      type: "page_view";
      pagePath: string;
      queuedAt: string;
      dedupeKey: string;
    }
  | {
      type: "event";
      eventName: string;
      params?: AnalyticsParams;
      queuedAt: string;
      dedupeKey: string;
    };

function getGoogleAnalyticsDisableKey() {
  return `ga-disable-${GA_MEASUREMENT_ID}` as const;
}

function normalizeParams(params?: AnalyticsParams) {
  if (!params) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

function withDebugMode(params?: AnalyticsParams) {
  const normalizedParams = normalizeParams(params) ?? {};

  if (!isGoogleAnalyticsDebugEnabled()) {
    return normalizedParams;
  }

  return {
    ...normalizedParams,
    debug_mode: true
  };
}

function getGoogleAnalyticsStatus() {
  if (typeof window === "undefined") {
    return { ready: false, reason: "server" } as const;
  }

  if (!GA_MEASUREMENT_ID) {
    return { ready: false, reason: "missing_measurement_id" } as const;
  }

  if (window[getGoogleAnalyticsDisableKey()]) {
    return { ready: false, reason: "collection_disabled" } as const;
  }

  if (!window.__hdtGaBootstrapReady) {
    return { ready: false, reason: "bootstrap_not_ready" } as const;
  }

  if (typeof window.gtag !== "function") {
    return { ready: false, reason: "gtag_not_ready" } as const;
  }

  return { ready: true, reason: "ready" } as const;
}

export function isGoogleAnalyticsDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const searchFlag = searchParams.get("ga_debug");
    if (searchFlag === "1") {
      window.sessionStorage.setItem(GA_DEBUG_STORAGE_KEY, "1");
      return true;
    }

    return (
      window.sessionStorage.getItem(GA_DEBUG_STORAGE_KEY) === "1" ||
      window.localStorage.getItem(GA_DEBUG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function logGoogleAnalyticsDiagnostic(message: string, meta?: Record<string, unknown>) {
  if (!isGoogleAnalyticsDebugEnabled()) {
    return;
  }

  clientLogInfo(`[GA4] ${message}`, meta);
}

export function setGoogleAnalyticsCollectionEnabled(enabled: boolean) {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) {
    logGoogleAnalyticsDiagnostic("collection_toggle_skipped", {
      enabled,
      measurement_id: GA_MEASUREMENT_ID || null
    });
    return;
  }

  window[getGoogleAnalyticsDisableKey()] = !enabled;

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: enabled ? "granted" : "denied"
    });
  }

  logGoogleAnalyticsDiagnostic("collection_toggled", {
    enabled,
    measurement_id: GA_MEASUREMENT_ID,
    disable_flag: window[getGoogleAnalyticsDisableKey()] ?? null
  });

  if (enabled) {
    flushQueuedGoogleAnalyticsEvents("collection_enabled");
  }
}

export function pageview(pagePath: string) {
  const status = getGoogleAnalyticsStatus();
  if (!status.ready) {
    if (status.reason === "bootstrap_not_ready" || status.reason === "gtag_not_ready") {
      enqueueGoogleAnalyticsCall({
        type: "page_view",
        pagePath,
        queuedAt: new Date().toISOString(),
        dedupeKey: `page_view:${pagePath}`
      });
      logGoogleAnalyticsDiagnostic("page_view_queued", {
        page_path: pagePath || null,
        reason: status.reason,
        queue_length: window.__hdtGaEventQueue?.length ?? 0
      });
      return;
    }

    logGoogleAnalyticsDiagnostic("page_view_skipped", {
      page_path: pagePath || null,
      reason: status.reason
    });
    return;
  }

  const normalizedPath = pagePath || `${window.location.pathname}${window.location.search}`;
  logGoogleAnalyticsDiagnostic("gtag_available", {
    source: "page_view",
    script_ready: window.__hdtGaScriptReady ?? false,
    bootstrap_ready: window.__hdtGaBootstrapReady ?? false
  });

  const pageViewParams = withDebugMode({
    page_path: normalizedPath,
    page_location: new URL(normalizedPath, window.location.origin).toString(),
    page_title: document.title
  });

  window.gtag!("event", "page_view", pageViewParams);

  logGoogleAnalyticsDiagnostic("page_view_sent", {
    page_path: normalizedPath,
    measurement_id: GA_MEASUREMENT_ID,
    params: pageViewParams
  });
}

export function trackEvent(eventName: string, params?: AnalyticsParams) {
  const status = getGoogleAnalyticsStatus();
  if (!status.ready) {
    if (status.reason === "bootstrap_not_ready" || status.reason === "gtag_not_ready") {
      enqueueGoogleAnalyticsCall({
        type: "event",
        eventName,
        params,
        queuedAt: new Date().toISOString(),
        dedupeKey: JSON.stringify({
          event_name: eventName,
          params: normalizeParams(params) ?? {}
        })
      });
      logGoogleAnalyticsDiagnostic("event_queued", {
        event_name: eventName,
        reason: status.reason,
        params: normalizeParams(params),
        queue_length: window.__hdtGaEventQueue?.length ?? 0
      });
      return;
    }

    logGoogleAnalyticsDiagnostic("event_skipped", {
      event_name: eventName,
      reason: status.reason,
      params: normalizeParams(params)
    });
    return;
  }

  const normalizedParams = withDebugMode(params);
  logGoogleAnalyticsDiagnostic("gtag_available", {
    source: "event",
    event_name: eventName,
    script_ready: window.__hdtGaScriptReady ?? false,
    bootstrap_ready: window.__hdtGaBootstrapReady ?? false
  });
  window.gtag!("event", eventName, normalizedParams);
  logGoogleAnalyticsDiagnostic("event_sent", {
    event_name: eventName,
    params: normalizedParams,
    measurement_id: GA_MEASUREMENT_ID
  });
}

export function trackSignUpSuccess(params?: AnalyticsParams) {
  trackEvent("sign_up", {
    method: "app_form",
    ...params
  });
}

export function markGoogleAnalyticsBootstrapReady() {
  if (typeof window === "undefined") {
    return;
  }

  window.__hdtGaBootstrapReady = true;
  logGoogleAnalyticsDiagnostic("gtag_bootstrap_ready", {
    script_ready: window.__hdtGaScriptReady ?? false,
    gtag_available: typeof window.gtag === "function"
  });

  if (typeof window.gtag === "function" && !window.__hdtGaHasLoggedGtagAvailable) {
    window.__hdtGaHasLoggedGtagAvailable = true;
    logGoogleAnalyticsDiagnostic("gtag_available", {
      source: "bootstrap_ready",
      script_ready: window.__hdtGaScriptReady ?? false,
      bootstrap_ready: true
    });
  }

  flushQueuedGoogleAnalyticsEvents("bootstrap_ready");
}

export function markGoogleAnalyticsScriptReady() {
  if (typeof window === "undefined") {
    return;
  }

  window.__hdtGaScriptReady = true;
  logGoogleAnalyticsDiagnostic("gtag_script_ready", {
    gtag_available: typeof window.gtag === "function",
    bootstrap_ready: window.__hdtGaBootstrapReady ?? false
  });

  if (typeof window.gtag === "function" && !window.__hdtGaHasLoggedGtagAvailable) {
    window.__hdtGaHasLoggedGtagAvailable = true;
    logGoogleAnalyticsDiagnostic("gtag_available", {
      source: "script_ready",
      script_ready: true,
      bootstrap_ready: window.__hdtGaBootstrapReady ?? false
    });
  }

  flushQueuedGoogleAnalyticsEvents("script_ready");
}

export function flushQueuedGoogleAnalyticsEvents(trigger: string) {
  if (typeof window === "undefined") {
    return;
  }

  const queue = window.__hdtGaEventQueue ?? [];
  if (!queue.length) {
    return;
  }

  const status = getGoogleAnalyticsStatus();
  if (!status.ready) {
    logGoogleAnalyticsDiagnostic("queue_flush_blocked", {
      trigger,
      reason: status.reason,
      queue_length: queue.length
    });
    return;
  }

  const pendingQueue = [...queue];
  window.__hdtGaEventQueue = [];

  logGoogleAnalyticsDiagnostic("queue_flush_started", {
    trigger,
    queue_length: pendingQueue.length
  });

  pendingQueue.forEach((item) => {
    if (item.type === "page_view") {
      pageview(item.pagePath);
      return;
    }

    trackEvent(item.eventName, item.params);
  });
}

function enqueueGoogleAnalyticsCall(call: GoogleAnalyticsQueuedCall) {
  if (typeof window === "undefined") {
    return;
  }

  const queue = window.__hdtGaEventQueue ?? [];
  const nextQueue = [...queue.filter((item) => item.dedupeKey !== call.dedupeKey), call].slice(-GA_EVENT_QUEUE_LIMIT);
  window.__hdtGaEventQueue = nextQueue;
}

export {};
