"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useConsentPreferences } from "@/components/consent-provider";
import {
  GA_MEASUREMENT_ID,
  initializeGoogleAnalytics,
  logGoogleAnalyticsDiagnostic,
  pageview,
  setGoogleAnalyticsCollectionEnabled
} from "@/lib/analytics";

export function GoogleTag() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, hasInteracted, preferences, canUseAnalytics } = useConsentPreferences();
  const search = searchParams?.toString() ?? "";
  const [hasRequestedScript, setHasRequestedScript] = useState(false);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [isGoogleAnalyticsReady, setIsGoogleAnalyticsReady] = useState(false);
  const hasSentInitialDiagnosticRef = useRef(false);

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
    logGoogleAnalyticsDiagnostic("consent_state", {
      ready,
      has_interacted: hasInteracted,
      analytics_preference: preferences.analytics,
      can_use_analytics: canUseAnalytics,
      measurement_id: GA_MEASUREMENT_ID || null
    });
  }, [ready, hasInteracted, preferences.analytics, canUseAnalytics]);

  useEffect(() => {
    if (GA_MEASUREMENT_ID && canUseAnalytics) {
      setHasRequestedScript(true);
    }
  }, [canUseAnalytics]);

  useEffect(() => {
    setGoogleAnalyticsCollectionEnabled(canUseAnalytics);
  }, [canUseAnalytics]);

  useEffect(() => {
    if (!hasRequestedScript || !isScriptReady || !canUseAnalytics) {
      return;
    }

    if (initializeGoogleAnalytics()) {
      setIsGoogleAnalyticsReady(true);
    }
  }, [canUseAnalytics, hasRequestedScript, isScriptReady]);

  useEffect(() => {
    if (!canUseAnalytics || !GA_MEASUREMENT_ID || !pathname || !isGoogleAnalyticsReady) {
      return;
    }

    const pagePath = search ? `${pathname}?${search}` : pathname;
    const frame = window.requestAnimationFrame(() => {
      pageview(pagePath);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [canUseAnalytics, isGoogleAnalyticsReady, pathname, search]);

  if (!GA_MEASUREMENT_ID || !hasRequestedScript) {
    return null;
  }

  return (
    <>
      <Script
        id="google-tag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => {
          setIsScriptReady(true);
          logGoogleAnalyticsDiagnostic("script_loaded", {
            measurement_id: GA_MEASUREMENT_ID
          });
        }}
        onReady={() => {
          setIsScriptReady(true);
          logGoogleAnalyticsDiagnostic("script_ready", {
            measurement_id: GA_MEASUREMENT_ID
          });
        }}
        onError={() => {
          logGoogleAnalyticsDiagnostic("script_load_error", {
            measurement_id: GA_MEASUREMENT_ID
          });
        }}
      />
    </>
  );
}
