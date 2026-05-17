"use client";

import { useEffect, useRef } from "react";
import { useConsentPreferences } from "@/components/consent-provider";

declare global {
  interface Window {
    __googleAdsenseScriptLoaded?: boolean;
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_SCRIPT_EVENT = "google-adsense:loaded";
const ADSENSE_CLIENT = "ca-pub-1213559545344901";
const AD_SLOT = "7189522393";

/**
 * Anúncio inline fixo 400x60 para a tela de treino.
 * Só renderiza para usuários free com consentimento de anúncios ativo.
 */
export function TrainingInlineAd() {
  const { canUseAds } = useConsentPreferences();
  const adRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!canUseAds) {
      pushed.current = false;
      return;
    }

    const tryPush = () => {
      if (pushed.current || !adRef.current) return;
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        pushed.current = false;
      }
    };

    // Se o script já carregou, dispara imediatamente
    if (window.__googleAdsenseScriptLoaded) {
      tryPush();
      return;
    }

    // Caso contrário, aguarda o evento de carregamento
    window.addEventListener(ADSENSE_SCRIPT_EVENT, tryPush);
    return () => {
      window.removeEventListener(ADSENSE_SCRIPT_EVENT, tryPush);
    };
  }, [canUseAds]);

  if (!canUseAds) return null;

  return (
    <div className="flex w-full justify-center py-1">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "inline-block", width: "400px", height: "60px" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={AD_SLOT}
      />
    </div>
  );
}
