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

export function PushPromptModal() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Só mostra se: suporta push, permissão ainda não foi decidida, e nunca mostrou
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) return;

    if (Notification.permission !== "default") return;

    const alreadyShown = localStorage.getItem(STORAGE_KEY);
    if (alreadyShown) return;

    // Só mostra após o usuário ter visitado pelo menos 5 telas
    if (getScreenCount() < MIN_SCREENS_BEFORE_PROMPT) return;

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
