import { clientLogInfo } from "@/lib/client-logger";

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
export const GA_DEBUG_STORAGE_KEY = "hdt-ga-debug";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __hdtGaInitializedFor?: string;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

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

  if (typeof window.gtag !== "function") {
    return { ready: false, reason: "gtag_not_ready" } as const;
  }

  return { ready: true, reason: "ready" } as const;
}

function canSendGoogleAnalyticsEvents() {
  return getGoogleAnalyticsStatus().ready;
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

export function initializeGoogleAnalytics() {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) {
    logGoogleAnalyticsDiagnostic("init_skipped", {
      measurement_id: GA_MEASUREMENT_ID || null,
      reason: typeof window === "undefined" ? "server" : "missing_measurement_id"
    });
    return false;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  if (window.__hdtGaInitializedFor === GA_MEASUREMENT_ID) {
    logGoogleAnalyticsDiagnostic("init_already_done", {
      measurement_id: GA_MEASUREMENT_ID
    });
    return true;
  }

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  window.__hdtGaInitializedFor = GA_MEASUREMENT_ID;

  logGoogleAnalyticsDiagnostic("gtag_initialized", {
    measurement_id: GA_MEASUREMENT_ID
  });

  return true;
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
  logGoogleAnalyticsDiagnostic("collection_toggled", {
    enabled,
    measurement_id: GA_MEASUREMENT_ID
  });
}

export function pageview(pagePath: string) {
  const status = getGoogleAnalyticsStatus();
  if (!status.ready) {
    logGoogleAnalyticsDiagnostic("page_view_skipped", {
      page_path: pagePath || null,
      reason: status.reason
    });
    return;
  }

  const normalizedPath = pagePath || `${window.location.pathname}${window.location.search}`;

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
    logGoogleAnalyticsDiagnostic("event_skipped", {
      event_name: eventName,
      reason: status.reason,
      params: normalizeParams(params)
    });
    return;
  }

  const normalizedParams = withDebugMode(params);
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

export {};
