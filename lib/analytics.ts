export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function normalizeParams(params?: AnalyticsParams) {
  if (!params) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

function canTrackWithGoogleAnalytics() {
  return typeof window !== "undefined" && Boolean(GA_MEASUREMENT_ID) && typeof window.gtag === "function";
}

export function pageview(pagePath: string) {
  if (!canTrackWithGoogleAnalytics()) {
    return;
  }

  const normalizedPath = pagePath || `${window.location.pathname}${window.location.search}`;

  window.gtag!("event", "page_view", {
    page_path: normalizedPath,
    page_location: new URL(normalizedPath, window.location.origin).toString(),
    page_title: document.title
  });
}

export function trackEvent(eventName: string, params?: AnalyticsParams) {
  if (!canTrackWithGoogleAnalytics()) {
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
