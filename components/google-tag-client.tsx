"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConsentPreferences } from "@/components/consent-provider";
import {
  GA_MEASUREMENT_ID,
  flushQueuedGoogleAnalyticsEvents,
  logGoogleAnalyticsDiagnostic,
  markGoogleAnalyticsBootstrapReady,
  markGoogleAnalyticsScriptReady,
  pageview,
  setGoogleAnalyticsCollectionEnabled
} from "@/lib/analytics";

export function GoogleTagClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, hasInteracted, preferences, canUseAnalytics } = useConsentPreferences();
  const hasSentInitialDiagnosticRef = useRef(false);
  const lastTrackedPagePathRef = useRef<string | null>(null);
  const pagePath = useMemo(() => {
    const search = searchParams?.toString() ?? "";
    if (!pathname) {
      return "";
    }

    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (hasSentInitialDiagnosticRef.current) {
      return;
    }

    hasSentInitialDiagnosticRef.current = true;
    logGoogleAnalyticsDiagnostic("component_mounted", {
      measurement_id: GA_MEASUREMENT_ID || null
    });
  }, []);

  useEffect(() => {
    function handleBootstrapReady() {
      markGoogleAnalyticsBootstrapReady();
    }

    function handleScriptReady() {
      markGoogleAnalyticsScriptReady();
    }

    window.addEventListener("hdt:ga-bootstrap-ready", handleBootstrapReady);
    window.addEventListener("hdt:ga-script-ready", handleScriptReady);

    if (window.__hdtGaBootstrapReady) {
      handleBootstrapReady();
    }

    if (window.__hdtGaScriptReady) {
      handleScriptReady();
    }

    return () => {
      window.removeEventListener("hdt:ga-bootstrap-ready", handleBootstrapReady);
      window.removeEventListener("hdt:ga-script-ready", handleScriptReady);
    };
  }, []);

  useEffect(() => {
    logGoogleAnalyticsDiagnostic("consent_state", {
      ready,
      has_interacted: hasInteracted,
      analytics_preference: preferences.analytics,
      can_use_analytics: canUseAnalytics,
      measurement_id: GA_MEASUREMENT_ID || null
    });
  }, [ready, hasInteracted, preferences.analytics, canUseAnalytics]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    setGoogleAnalyticsCollectionEnabled(canUseAnalytics);
    flushQueuedGoogleAnalyticsEvents("client_toggle");
  }, [canUseAnalytics, ready]);

  useEffect(() => {
    if (!ready || !GA_MEASUREMENT_ID || !pagePath) {
      return;
    }

    if (!canUseAnalytics) {
      logGoogleAnalyticsDiagnostic("page_view_skipped_no_consent", {
        page_path: pagePath,
        has_interacted: hasInteracted,
        analytics_preference: preferences.analytics
      });
      return;
    }

    if (lastTrackedPagePathRef.current === pagePath) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      lastTrackedPagePathRef.current = pagePath;
      pageview(pagePath);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [canUseAnalytics, hasInteracted, pagePath, preferences.analytics, ready]);

  return null;
}
