"use client";

import { useEffect, useRef } from "react";
import { AdFrame } from "@/components/AdFrame";
import { useConsentPreferences } from "@/components/consent-provider";
import { ADSENSE_CLIENT, ADSENSE_SCRIPT_EVENT, pushAdSlot } from "@/lib/ads";

declare global {
  interface Window {
    __googleAdsenseScriptLoaded?: boolean;
    adsbygoogle?: unknown[];
  }
}

const AD_SLOT = "7189522393";

/**
 * Anúncio pequeno fixo (320x50) para o meio da lista de exercícios na tela de
 * treino — formato discreto de propósito, para não atrapalhar o treino.
 * Só renderiza para usuários free com anúncios liberados.
 */
export function TrainingInlineAd() {
  const { canUseAds, preferences } = useConsentPreferences();
  const adsConsent = preferences.ads;
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
        pushAdSlot(adsConsent);
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
  }, [adsConsent, canUseAds]);

  if (!canUseAds) return null;

  return (
    // Sem "Remover anúncios" aqui: no meio do treino não tiramos a pessoa da tela.
    <AdFrame placement="treino" showRemoveLink={false} className="py-1">
    <div className="flex w-full justify-center">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "inline-block", width: "320px", height: "50px" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={AD_SLOT}
      />
    </div>
    </AdFrame>
  );
}
