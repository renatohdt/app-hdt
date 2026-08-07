"use client";

import { useEffect } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

/**
 * Registra o token de push NATIVO (FCM) do aparelho no backend.
 * Só age no app nativo (iOS/Android). No navegador não faz nada.
 *
 * Chama o plugin pela ponte global (window.Capacitor.Plugins.FirebaseMessaging)
 * em vez de importar @capacitor-firebase/messaging. Isso evita que o webpack
 * empacote a implementação WEB do plugin (que depende do SDK firebase/messaging),
 * mantendo o build do site limpo. No app nativo o plugin já está registrado na ponte.
 */
export function NativePushProvider() {
  useEffect(() => {
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        Plugins?: {
          FirebaseMessaging?: {
            requestPermissions?: () => Promise<{ receive?: string }>;
            getToken?: () => Promise<{ token?: string }>;
          };
        };
      };
    };

    const cap = w.Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    const fm = cap.Plugins?.FirebaseMessaging;
    if (!fm?.getToken) return;

    let cancelled = false;
    (async () => {
      try {
        const perm = await fm.requestPermissions?.();
        if (perm?.receive !== "granted") return;

        const res = await fm.getToken?.();
        const token = res?.token;
        if (!token || cancelled) return;

        await fetchWithAuth("/api/push/register-native", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform }),
        });
      } catch {
        // Silencioso: plugin ausente (navegador) ou usuário não logado.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
