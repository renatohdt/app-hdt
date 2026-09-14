"use client";

// Plugin de avaliação nativa (o "card" de estrelas do Google Play / App Store).
//
// Import ESTÁTICO de propósito: seguimos o mesmo padrão do RevenueCat
// (lib/revenuecat-native.ts). O import dinâmico ("preguiçoso") já nos deu bug de
// timeout dentro do app. O registerPlugin do Capacitor é seguro em SSR — só
// devolve um proxy e não acessa "window" ao importar —, então o build web não
// quebra. Nunca chamamos os métodos no navegador (protegemos por plataforma).
import { AppReview } from "@capawesome/capacitor-app-review";
import { getNativePlatformNow, useNativePlatform } from "@/lib/is-native-app";

// ── Ajustes fáceis de mexer ──────────────────────────────────────────────────

// Vire para `true` quando o app iOS estiver publicado na App Store.
// Enquanto estiver `false`, nada de avaliação é disparado no iOS.
const IOS_STORE_LIVE = false;

// A partir de quantos treinos concluídos pedimos a avaliação.
// (Pode trocar para 4 ou 5 se preferir esperar um pouco mais.)
const WORKOUTS_UNTIL_PROMPT = 3;

// Depois de pedir uma vez, quanto tempo esperar antes de tentar de novo.
// O Google já tem uma cota própria (não mostra o card toda hora); isto é só
// uma trava extra pra nunca insistirmos demais com a mesma pessoa.
const COOLDOWN_DAYS = 120;

// Identificador do app na Play Store (o mesmo do capacitor.config.ts).
const ANDROID_PACKAGE_ID = "com.horadotreino.app";

// Chaves guardadas no aparelho (localStorage), só neste dispositivo.
const WORKOUTS_KEY = "app_review_workout_count";
const LAST_PROMPT_KEY = "app_review_last_prompt_at";

// ── Helpers internos ─────────────────────────────────────────────────────────

// Diz se a avaliação está liberada na plataforma atual.
function reviewEnabled(): boolean {
  const platform = getNativePlatformNow();
  if (platform === "android") return true;
  if (platform === "ios") return IOS_STORE_LIVE;
  return false; // navegador (web) nunca dispara
}

// Evita que uma chamada nativa "trave" a tela pra sempre: se demorar demais,
// a promessa é rejeitada e o app segue normalmente.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// ── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Mostra o card NATIVO de avaliação (o usuário avalia SEM sair do app).
 *
 * Regra do Google: NÃO se pode perguntar nada antes disto (ex.: "gostou do
 * app?"). Também não dá pra saber se o card realmente apareceu — quem decide é o
 * sistema, e existe uma cota. Por isso a chamada é "silenciosa": se der erro ou
 * não aparecer, o app simplesmente segue.
 */
export async function requestNativeReview(): Promise<void> {
  if (!reviewEnabled()) return;
  try {
    await withTimeout(AppReview.requestReview(), 8000);
  } catch {
    // silencioso de propósito: avaliação nunca pode quebrar o app
  }
}

/**
 * Abre a página da loja para a pessoa avaliar. Usado pelo botão manual
 * "Avaliar o app" (perfil). Sempre funciona (não tem cota), mas o usuário sai
 * do app. No navegador, abre a Play Store numa nova aba como reserva.
 */
export async function openStoreReview(): Promise<void> {
  const platform = getNativePlatformNow();
  try {
    if (reviewEnabled()) {
      await withTimeout(AppReview.openAppStore(), 8000);
      return;
    }
  } catch {
    // se a chamada nativa falhar, cai no fallback abaixo
  }

  if (typeof window !== "undefined" && (platform === "android" || platform === "web")) {
    window.open(
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`,
      "_blank",
    );
  }
}

/**
 * Chamado quando o usuário CONCLUI um treino.
 * Conta os treinos e, ao atingir a meta (e respeitando o cooldown), mostra o
 * card de avaliação. No navegador não faz nada.
 */
export async function registerWorkoutAndMaybeAskReview(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!reviewEnabled()) return;

  // Respeita o cooldown: se já pedimos há pouco tempo, não pede de novo.
  try {
    const last = localStorage.getItem(LAST_PROMPT_KEY);
    if (last) {
      const elapsedMs = Date.now() - new Date(last).getTime();
      if (elapsedMs < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
    }
  } catch {
    // ignora falhas de localStorage
  }

  // Conta +1 treino concluído.
  let count = 0;
  try {
    count = (parseInt(localStorage.getItem(WORKOUTS_KEY) || "0", 10) || 0) + 1;
    localStorage.setItem(WORKOUTS_KEY, String(count));
  } catch {
    return; // sem localStorage não temos como contar com segurança
  }

  if (count < WORKOUTS_UNTIL_PROMPT) return;

  await requestNativeReview();

  // Marca que pedimos agora (inicia o cooldown).
  try {
    localStorage.setItem(LAST_PROMPT_KEY, new Date().toISOString());
  } catch {
    // ignora falhas de localStorage
  }
}

/**
 * Hook (SSR-safe) para o botão manual saber se deve aparecer.
 *  - Android: sempre
 *  - iOS: só quando IOS_STORE_LIVE = true
 *  - navegador: não aparece
 */
export function useCanShowStoreButton(): boolean {
  const platform = useNativePlatform();
  if (platform === "android") return true;
  if (platform === "ios") return IOS_STORE_LIVE;
  return false;
}
