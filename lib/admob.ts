"use client";

import { Capacitor } from "@capacitor/core";
import { capturePostHog } from "@/lib/posthog-client";
import { clientLogError } from "@/lib/client-logger";

/**
 * AdMob (anúncios NATIVOS do Google) — só funciona dentro do app das lojas
 * que já tiver o plugin @capacitor-community/admob instalado.
 *
 * Como o app carrega o site ao vivo, esta lógica chega pela Vercel. Versões
 * antigas do app (sem o plugin) continuam com o AdSense: veja isAdMobAvailable().
 */

// ── IDs dos blocos de anúncio ───────────────────────────────────────────────
// Preencha com os IDs reais do AdMob (formato ca-app-pub-XXXX/YYYY).
// Enquanto algum estiver vazio, o app usa os blocos de TESTE do Google
// (anúncios de exemplo, que não geram receita) — seguro para testar.
const AD_UNITS = {
  android: {
    banner: "ca-app-pub-1213559545344901/3677237071",
    rewarded: "ca-app-pub-1213559545344901/4851462807"
  },
  ios: {
    banner: "ca-app-pub-1213559545344901/8063949502",
    rewarded: "ca-app-pub-1213559545344901/7986173863"
  }
} as const;

const TEST_AD_UNITS = {
  android: {
    banner: "ca-app-pub-3940256099942544/9214589741",
    rewarded: "ca-app-pub-3940256099942544/5224354917"
  },
  ios: {
    banner: "ca-app-pub-3940256099942544/2435281174",
    rewarded: "ca-app-pub-3940256099942544/1712485313"
  }
} as const;

type AdKind = "banner" | "rewarded";
type NativePlatform = "android" | "ios";

function getPlatform(): NativePlatform {
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

function getAdUnit(kind: AdKind): { adId: string; isTesting: boolean } {
  const platform = getPlatform();
  const real = AD_UNITS[platform][kind];
  if (real) return { adId: real, isTesting: false };
  return { adId: TEST_AD_UNITS[platform][kind], isTesting: true };
}

/** true quando o app nativo tem o plugin do AdMob (versão nova do app). */
export function isAdMobAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("AdMob");
  } catch {
    return false;
  }
}

let pluginPromise: Promise<typeof import("@capacitor-community/admob")> | null = null;
function loadPlugin() {
  pluginPromise ??= import("@capacitor-community/admob");
  return pluginPromise;
}

// ── Inicialização + permissão de rastreamento (iOS) ────────────────────────
let initPromise: Promise<void> | null = null;
let iosTrackingAuthorized = false;

/**
 * Inicializa o AdMob uma vez. No iOS mostra o aviso da Apple
 * "Permitir que o app rastreie..." (só na primeira vez).
 */
export function initAdMob(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const { AdMob } = await loadPlugin();

      if (getPlatform() === "ios") {
        try {
          let { status } = await AdMob.trackingAuthorizationStatus();
          if (status === "notDetermined") {
            await AdMob.requestTrackingAuthorization();
            ({ status } = await AdMob.trackingAuthorizationStatus());
          }
          iosTrackingAuthorized = status === "authorized";
        } catch {
          iosTrackingAuthorized = false;
        }
      }

      const anyTest = getAdUnit("banner").isTesting || getAdUnit("rewarded").isTesting;
      await AdMob.initialize({ initializeForTesting: anyTest });
    })().catch((error) => {
      initPromise = null; // permite tentar de novo depois
      throw error;
    });
  }
  return initPromise;
}

/**
 * Anúncio NÃO personalizado quando:
 *  - iOS: a pessoa não autorizou o rastreamento no aviso da Apple;
 *  - Android: a pessoa não aceitou anúncios no aviso de privacidade do app.
 */
function shouldUseNonPersonalized(adsConsent: boolean): boolean {
  return getPlatform() === "ios" ? !iosTrackingAuthorized : !adsConsent;
}

// ── Banner fixo (acima do menu inferior) ───────────────────────────────────
let bannerState: "none" | "shown" | "hidden" = "none";
let bannerMargin = -1;
let sizeListenerAttached = false;

function setBannerHeightVar(height: number) {
  document.documentElement.style.setProperty("--admob-banner-h", `${Math.max(0, Math.round(height))}px`);
}

/**
 * Mostra o banner adaptativo. `margin` = distância (em px/dp) entre a borda
 * segura inferior da tela e o banner — ou seja, a altura do menu do app.
 */
export async function showAdMobBanner(margin: number, adsConsent: boolean): Promise<void> {
  const { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } = await loadPlugin();
  await initAdMob();

  if (!sizeListenerAttached) {
    sizeListenerAttached = true;
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info) => setBannerHeightVar(info.height));
  }

  const roundedMargin = Math.max(0, Math.round(margin));

  if (bannerState === "hidden" && roundedMargin === bannerMargin) {
    await AdMob.resumeBanner();
    bannerState = "shown";
    return;
  }
  if (bannerState === "shown" && roundedMargin === bannerMargin) return;
  if (bannerState !== "none") await AdMob.removeBanner();

  const { adId, isTesting } = getAdUnit("banner");
  await AdMob.showBanner({
    adId,
    isTesting,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: roundedMargin,
    npa: shouldUseNonPersonalized(adsConsent)
  });
  bannerState = "shown";
  bannerMargin = roundedMargin;
}

/** Esconde o banner sem destruí-lo (volta rápido com showAdMobBanner). */
export async function hideAdMobBanner(): Promise<void> {
  if (bannerState !== "shown") return;
  bannerState = "hidden";
  setBannerHeightVar(0);
  try {
    const { AdMob } = await loadPlugin();
    await AdMob.hideBanner();
  } catch (error) {
    clientLogError("ADMOB HIDE BANNER ERROR", error);
  }
}

// ── Anúncio com recompensa (vídeo) ─────────────────────────────────────────
export type RewardedResult = "rewarded" | "dismissed" | "unavailable";

// Pré-carregamento: o vídeo é baixado ANTES de a pessoa tocar no botão, para
// abrir na hora (carregar sob demanda podia levar quase 1 minuto).
// O Google descarta vídeos carregados há mais de 1 hora; renovamos aos 50 min.
const REWARDED_MAX_AGE_MS = 50 * 60 * 1000;
let rewardedPreload: Promise<boolean> | null = null;
let rewardedLoadedAt = 0;

/** Baixa um vídeo com recompensa em segundo plano (pode chamar várias vezes). */
export function preloadRewardedAd(adsConsent: boolean): Promise<boolean> {
  if (!isAdMobAvailable()) return Promise.resolve(false);

  const expired = rewardedLoadedAt > 0 && Date.now() - rewardedLoadedAt > REWARDED_MAX_AGE_MS;
  if (rewardedPreload && !expired) return rewardedPreload;

  rewardedPreload = (async () => {
    const { AdMob } = await loadPlugin();
    await initAdMob();
    const { adId, isTesting } = getAdUnit("rewarded");
    await AdMob.prepareRewardVideoAd({ adId, isTesting, npa: shouldUseNonPersonalized(adsConsent) });
    rewardedLoadedAt = Date.now();
    return true;
  })().catch((error) => {
    clientLogError("ADMOB REWARDED PRELOAD ERROR", error);
    rewardedPreload = null;
    rewardedLoadedAt = 0;
    return false;
  });

  return rewardedPreload;
}

/**
 * Mostra um vídeo com recompensa. Resolve:
 *  - "rewarded": a pessoa assistiu até ganhar a recompensa;
 *  - "dismissed": fechou antes;
 *  - "unavailable": não havia vídeo disponível / erro.
 * `purpose` identifica o que o vídeo libera (vai para o PostHog).
 */
export async function showRewardedAd(purpose: string, adsConsent: boolean): Promise<RewardedResult> {
  if (!isAdMobAvailable()) return "unavailable";

  const { AdMob, RewardAdPluginEvents } = await loadPlugin();
  const handles: Array<{ remove: () => Promise<void> }> = [];
  let rewarded = false;

  try {
    await initAdMob();

    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; }));
    const closed = new Promise<void>((resolve) => {
      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) => handles.push(h));
    });

    // Usa o vídeo pré-carregado (ou espera terminar de carregar).
    const ready = await preloadRewardedAd(adsConsent);
    // O vídeo é de uso único: libera para o próximo pré-carregamento.
    rewardedPreload = null;
    rewardedLoadedAt = 0;
    if (!ready) throw new Error("rewarded_not_loaded");
    capturePostHog("admob_rewarded_shown", { purpose });

    // No iOS a promessa de showRewardVideoAd só termina se houver recompensa;
    // por isso o fim do vídeo é detectado pelo evento "Dismissed".
    void AdMob.showRewardVideoAd().then(() => { rewarded = true; }).catch(() => undefined);
    await Promise.race([closed, new Promise((resolve) => window.setTimeout(resolve, 5 * 60 * 1000))]);

    const result: RewardedResult = rewarded ? "rewarded" : "dismissed";
    capturePostHog("admob_rewarded_result", { purpose, result });
    return result;
  } catch (error) {
    clientLogError("ADMOB REWARDED ERROR", error);
    capturePostHog("admob_rewarded_result", { purpose, result: rewarded ? "rewarded" : "unavailable" });
    return rewarded ? "rewarded" : "unavailable";
  } finally {
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
    // Já deixa o próximo vídeo carregando para a próxima vez.
    void preloadRewardedAd(adsConsent);
  }
}
