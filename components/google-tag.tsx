"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useConsentPreferences } from "@/components/consent-provider";
import {
  GA_MEASUREMENT_ID,
  pageview,
  setGoogleAnalyticsCollectionEnabled
} from "@/lib/analytics";

export function GoogleTag() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canUseAnalytics } = useConsentPreferences();
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    setGoogleAnalyticsCollectionEnabled(canUseAnalytics);
  }, [canUseAnalytics]);

  useEffect(() => {
    if (!canUseAnalytics || !GA_MEASUREMENT_ID || !pathname) {
      return;
    }

    const pagePath = search ? `${pathname}?${search}` : pathname;
    const frame = window.requestAnimationFrame(() => {
      pageview(pagePath);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [canUseAnalytics, pathname, search]);

  if (!canUseAnalytics || !GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        id="google-tag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};
          window.gtag('js', new Date());
          window.gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
