"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getScreenCount } from "@/components/app-shell";

const STORAGE_KEY = "push_prompt_shown";
const MIN_SCREENS_BEFORE_PROMPT = 5;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}

// Mesma chave usada no perfil e no NativePushProvider ("usuário desligou o push nativo").
const NATIVE_PUSH_OPTOUT_KEY = "hdt:native-push-optout";

type FirebaseMessagingBridge = {
  checkPermissions?: () => Promise<{ receive?: string }>;
  requestPermissions?: () => Promise<{ receive?: string }>;
  getToken?: () => Promise<{ token?: string }>;
};

// No app nativo (iOS/Android) o push é o do Firebase, acessado pela ponte do
// Capacitor. Retorna null no navegador (lá usamos web push).
function getNativePush(): { fm: FirebaseMessagingBridge; platform: "ios" | "android" } | null {
  if (typeof window === "undefined") return null;
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

export function PushPromptModal() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (getScreenCount() < MIN_SCREENS_BEFORE_PROMPT) return;

    // App nativo (iOS/Android): só mostra se o sistema ainda não perguntou.
    // Se a pessoa já permitiu ou já negou, o popup não serve pra nada.
    const native = getNativePush();
    if (native) {
      if (localStorage.getItem(NATIVE_PUSH_OPTOUT_KEY) === "1") return;
      let timer: number | undefined;
      let cancelled = false;
      native.fm
        .checkPermissions?.()
        .then((perm) => {
          const state = perm?.receive;
          if (cancelled || (state !== "prompt" && state !== "prompt-with-rationale")) return;
          timer = window.setTimeout(() => setVisible(true), 1200);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        if (timer) window.clearTimeout(timer);
      };
    }

    // Navegador: só mostra se suporta push, permissão ainda não foi decidida, e nunca mostrou
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) return;

    if (Notification.permission !== "default") return;

    // Pequeno delay para não aparecer antes da página carregar
    const timer = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }

  async function handleActivate() {
    if (loading) return;
    setLoading(true);

    try {
      // App nativo: abre o pedido de permissão do sistema e registra o aparelho.
      const native = getNativePush();
      if (native) {
        const perm = await native.fm.requestPermissions?.();
        if (perm?.receive !== "granted") return;
        const token = (await native.fm.getToken?.())?.token;
        if (!token) return;
        await fetchWithAuth("/api/push/register-native", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform: native.platform })
        });
        localStorage.removeItem(NATIVE_PUSH_OPTOUT_KEY);
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        dismiss();
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKeyStr = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const vapidKey = urlBase64ToUint8Array(vapidKeyStr);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

      await fetchWithAuth("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson)
      });
    } catch {
      // Silencioso — não queremos travar o usuário por causa do popup
    } finally {
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">

        {/* Ícone */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <Bell className="h-7 w-7 text-primary" />
        </div>

        {/* Texto */}
        <p className="text-lg font-semibold leading-snug text-white">
          Não perca o ritmo do seu treino 💪
        </p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Ative as notificações e receba lembretes na hora certa para manter sua evolução em dia — mesmo quando a motivação estiver baixa.
        </p>

        {/* Ações */}
        <div className="mt-5 flex flex-col items-center gap-3">
          <Button
            onClick={() => void handleActivate()}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Ativando..." : "Ativar notificações"}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-white/36 transition hover:text-white/60"
          >
            Fazer depois
          </button>
        </div>

      </div>
    </div>
  );
}
