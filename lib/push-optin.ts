"use client";

// Convite para ativar notificações DEPOIS de um treino concluído (out/2026).
//
// Quando aparece: ao fechar o popup de "Treino Concluído".
//   1ª vez → no primeiro treino concluído
//   2ª vez → se disse "Depois", 7 dias depois (no próximo treino concluído)
//   3ª vez → 21 dias depois da 2ª. Depois disso, não pergunta mais
//            (o botão do Perfil continua disponível).
// Só aparece se o sistema ainda NÃO perguntou (permissão "pendente"). Quem já
// permitiu ou negou não vê. Quem desligou no Perfil também não.
// O pedido do sistema (que no iOS só aparece UMA vez) só acontece quando a pessoa
// toca em "Ativar notificações".

import { fetchWithAuth } from "@/lib/authenticated-fetch";

export const PUSH_OPTIN_EVENT = "hdt-offer-push-optin";
const STATE_KEY = "hdt:push-optin";
const LEGACY_PROMPT_KEY = "push_prompt_shown"; // popup antigo ("Fazer depois")
const NATIVE_PUSH_OPTOUT_KEY = "hdt:native-push-optout"; // mesma chave do Perfil
const DAY = 86_400_000;
const WAIT_BEFORE_ASK = [0, 7 * DAY, 21 * DAY];
export const MAX_ASKS = WAIT_BEFORE_ASK.length;

type OptInState = { asks: number; lastAskAt: number; done?: boolean };

type FirebaseMessagingBridge = {
  checkPermissions?: () => Promise<{ receive?: string }>;
  requestPermissions?: () => Promise<{ receive?: string }>;
  getToken?: () => Promise<{ token?: string }>;
};

function readState(): OptInState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as OptInState;
    // Quem fechou o popup antigo conta como 1 pergunta (a próxima já é a 2ª frase).
    if (localStorage.getItem(LEGACY_PROMPT_KEY)) return { asks: 1, lastAskAt: 0 };
  } catch {
    // ignora
  }
  return { asks: 0, lastAskAt: 0 };
}

function writeState(state: OptInState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // ignora
  }
}

function getNativePush(): { fm: FirebaseMessagingBridge; platform: "ios" | "android" } | null {
  const w = window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: { FirebaseMessaging?: FirebaseMessagingBridge };
    };
  };
  if (!w.Capacitor?.isNativePlatform?.()) return null;
  const fm = w.Capacitor.Plugins?.FirebaseMessaging;
  if (!fm?.getToken) return null;
  return { fm, platform: w.Capacitor.getPlatform?.() === "ios" ? "ios" : "android" };
}

/** O sistema ainda vai perguntar? (true = dá para oferecer o convite) */
async function permissionStillPending(): Promise<boolean> {
  const native = getNativePush();
  if (native) {
    if (localStorage.getItem(NATIVE_PUSH_OPTOUT_KEY) === "1") return false;
    const state = (await native.fm.checkPermissions?.())?.receive;
    return state === "prompt" || state === "prompt-with-rationale";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  return Notification.permission === "default";
}

/** Devolve qual pergunta mostrar agora (0, 1 ou 2) ou null se não for a hora. */
export async function getOptInAttempt(now = Date.now()): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const state = readState();
    if (state.done || state.asks >= MAX_ASKS) return null;
    if (now - state.lastAskAt < WAIT_BEFORE_ASK[state.asks]) return null;
    if (!(await permissionStillPending())) return null;
    return state.asks;
  } catch {
    return null;
  }
}

/** A pessoa viu o convite e tocou em "Depois". */
export function recordOptInLater() {
  const state = readState();
  writeState({ asks: state.asks + 1, lastAskAt: Date.now() });
}

/** Pede a permissão do sistema e registra o aparelho. Devolve true se ativou. */
export async function activatePushNotifications(): Promise<boolean> {
  const state = readState();
  // Depois do pedido do sistema não adianta perguntar de novo (aceitando ou não).
  writeState({ asks: state.asks + 1, lastAskAt: Date.now(), done: true });

  const native = getNativePush();
  if (native) {
    const perm = await native.fm.requestPermissions?.();
    if (perm?.receive !== "granted") return false;
    const token = (await native.fm.getToken?.())?.token;
    if (!token) return false;
    await fetchWithAuth("/api/push/register-native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: native.platform })
    });
    localStorage.removeItem(NATIVE_PUSH_OPTOUT_KEY);
    return true;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
  });
  await fetchWithAuth("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON())
  });
  return true;
}

/** Chamado ao fechar o popup de Treino Concluído. */
export function requestPushOptIn() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PUSH_OPTIN_EVENT));
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const view = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return view;
}
