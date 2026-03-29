"use client";

import { useEffect } from "react";
import { useConsentPreferences } from "@/components/consent-provider";
import { clientLogError } from "@/lib/client-logger";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function GoogleAd() {
  const { canUseAds } = useConsentPreferences();

  useEffect(() => {
    if (!canUseAds) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      clientLogError("ADS ERROR", error);
    }
  }, [canUseAds]);

  if (!canUseAds) {
    return null;
  }

  return (
    <div className="mt-8 text-center">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-1213559545344901"
        data-ad-slot="7658583800"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
