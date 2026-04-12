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

  if (process.env.NODE_ENV === "development") {
    console.log("[GA4 Debug] pageview:", normalizedPath);
  }

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

  if (process.env.NODE_ENV === "development") {
    console.log("[GA4 Debug] trackEvent:", eventName, params);
  }

  window.gtag!("event", eventName, normalizeParams(params));
}

export function trackSignUpSuccess(params?: AnalyticsParams) {
  trackEvent("sign_up", {
    method: "app_form",
    ...params
  });
}

/**
 * Atualiza o Consent Mode v2 do GA4 quando o usuário muda as preferências de cookies.
 * Deve ser chamado sempre que o consentimento for aceito, recusado ou personalizado.
 */
export function updateGtagConsent(preferences: { ads: boolean; marketing: boolean }) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: preferences.ads ? "granted" : "denied",
    ad_user_data: preferences.ads ? "granted" : "denied",
    ad_personalization: preferences.marketing ? "granted" : "denied"
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[GA4 Debug] consent update:", preferences);
  }
}

export {};
