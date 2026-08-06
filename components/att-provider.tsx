"use client";

import { useEffect } from "react";

/**
 * Dispara o pedido de App Tracking Transparency (ATT) da Apple, exigido porque
 * o app exibe anúncios. Só age quando roda no app iOS nativo (via ponte do
 * Capacitor). No navegador e no Android não faz nada.
 *
 * Chama o plugin nativo pela ponte global (window.Capacitor.Plugins) para
 * funcionar mesmo com o site carregado remotamente (server.url), sem precisar
 * empacotar o plugin no bundle do site.
 */
export function AttProvider() {
  useEffect(() => {
    const w = window as unknown as {
      Capacitor?: {
        getPlatform?: () => string;
        Plugins?: {
          AppTrackingTransparency?: {
            getStatus?: () => Promise<{ status?: string }>;
            requestPermission?: () => Promise<{ status?: string }>;
          };
        };
      };
    };

    const cap = w.Capacitor;
    if (!cap || cap.getPlatform?.() !== "ios") return;

    const att = cap.Plugins?.AppTrackingTransparency;
    if (!att?.requestPermission) return;

    // Pede só se ainda não foi decidido; o iOS lembra a resposta do usuário.
    Promise.resolve(att.getStatus?.())
      .then((res) => {
        if (!res || res.status === "notDetermined") {
          return att.requestPermission?.();
        }
        return undefined;
      })
      .catch(() => {
        // Silencioso: se o plugin não estiver disponível, não faz nada.
      });
  }, []);

  return null;
}
