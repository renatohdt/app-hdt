export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
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

function canSendGoogleAnalyticsEvents() {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) {
    return false;
  }

  if (window[getGoogleAnalyticsDisableKey()]) {
    return false;
  }

  return typeof window.gtag === "function";
}

export function setGoogleAnalyticsCollectionEnabled(enabled: boolean) {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) {
    return;
  }

  window[getGoogleAnalyticsDisableKey()] = !enabled;
}

export function pageview(pagePath: string) {
  if (!canSendGoogleAnalyticsEvents()) {
    return;
  }

  const normalizedPath = pagePath || `${window.location.pathname}${window.location.search}`;

  window.gtag!("event", "page_view", normalizeParams({
    page_path: normalizedPath,
    page_location: new URL(normalizedPath, window.location.origin).toString(),
    page_title: document.title
  }));
}

export function trackEvent(eventName: string, params?: AnalyticsParams) {
  if (!canSendGoogleAnalyticsEvents()) {
    return;
  }

  window.gtag!("event", eventName, normalizeParams(params));
}

export function trackSignUpSuccess(params?: AnalyticsParams) {
  trackEvent("sign_up", {
    method: "app_form",
    ...params
  });
}

export {};
