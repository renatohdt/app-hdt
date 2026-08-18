"use client";

import { useEffect, useState } from "react";

/**
 * Detecta se a página está sendo aberta DENTRO do app nativo (Capacitor),
 * e não no navegador comum.
 *
 * Usamos isso para esconder o checkout do Stripe quando o usuário está no app,
 * porque as lojas (Google Play e Apple) exigem que a compra de itens digitais
 * feita dentro do app passe pelo sistema de pagamento delas. No navegador,
 * o checkout continua funcionando normalmente.
 *
 * Duas formas de detecção (uma reforça a outra):
 *  1) Marca no "user agent" adicionada pelo capacitor.config.ts (appendUserAgent).
 *  2) Objeto global "Capacitor" injetado pelo app nativo.
 */
export function isNativeAppNow(): boolean {
  if (typeof window === "undefined") return false;

  const uaToken =
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("HoraDoTreinoApp");

  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  const capacitorNative =
    !!w.Capacitor &&
    typeof w.Capacitor.isNativePlatform === "function" &&
    w.Capacitor.isNativePlatform();

  return uaToken || capacitorNative;
}

/**
 * Hook seguro para SSR: começa como `false` (no servidor e na primeira
 * renderização) e só vira `true` depois que a página monta no navegador/app.
 * Isso evita erros de hidratação do Next.js.
 */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeAppNow());
  }, []);

  return isNative;
}

/**
 * Diz em qual plataforma o app está rodando: "ios", "android" ou "web".
 * Usado para escolher o fluxo de Premium certo:
 *  - iOS  → compra nativa (Apple / RevenueCat)
 *  - android → "Tenho interesse" (venda continua no site)
 *  - web  → checkout do Stripe
 */
export function getNativePlatformNow(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";

  const w = window as unknown as {
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  };

  if (!w.Capacitor?.isNativePlatform?.()) return "web";
  return w.Capacitor.getPlatform?.() === "ios" ? "ios" : "android";
}

/** Hook SSR-safe para a plataforma atual (começa como "web" e ajusta ao montar). */
export function useNativePlatform(): "ios" | "android" | "web" {
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");

  useEffect(() => {
    setPlatform(getNativePlatformNow());
  }, []);

  return platform;
}
