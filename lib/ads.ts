"use client";

import { getNativePlatformNow } from "@/lib/is-native-app";

/**
 * Regras centrais dos anúncios do Google AdSense.
 * Tudo que decide "onde" e "como" o anúncio é pedido fica aqui, para os
 * componentes de anúncio (GoogleAd, TrainingInlineAd) seguirem a mesma regra.
 */

export const ADSENSE_CLIENT = "ca-pub-1213559545344901";
export const ADSENSE_SCRIPT_EVENT = "google-adsense:loaded";

// Só pedimos anúncios no endereço oficial do app (o app das lojas também abre
// este endereço). Evita anúncio em links de teste da Vercel (*.vercel.app).
const ADS_ALLOWED_HOSTS = new Set(["app.horadotreino.com.br", "localhost"]);

export function isAdsAllowedHost(): boolean {
  if (typeof window === "undefined") return false;
  return ADS_ALLOWED_HOSTS.has(window.location.hostname);
}

/**
 * Anúncio NÃO personalizado (sem usar histórico da pessoa) quando:
 *  - iOS: sempre (a Apple exige o aviso de rastreamento para personalizar).
 *  - Android: quando a pessoa não aceitou anúncios no aviso de privacidade.
 *  - Navegador: o anúncio só aparece com consentimento, então é personalizado.
 */
export function shouldRequestNonPersonalizedAds(adsConsent: boolean): boolean {
  const platform = getNativePlatformNow();
  if (platform === "ios") return true;
  if (platform === "android") return !adsConsent;
  return false;
}

/** Pede ao Google para preencher um espaço de anúncio (<ins class="adsbygoogle">). */
export function pushAdSlot(adsConsent: boolean): { nonPersonalized: boolean } {
  const nonPersonalized = shouldRequestNonPersonalizedAds(adsConsent);
  const adsQueue = (window.adsbygoogle = window.adsbygoogle || []) as unknown[] & {
    requestNonPersonalizedAds?: number;
  };
  adsQueue.requestNonPersonalizedAds = nonPersonalized ? 1 : 0;
  adsQueue.push({});
  return { nonPersonalized };
}
