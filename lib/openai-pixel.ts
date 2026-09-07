"use client";

// Helper do pixel de conversão da OpenAI (anúncios do ChatGPT).
//
// Segurança: só funciona quando o pixel foi carregado, o que só acontece na
// WEB e com consentimento de marketing (ver consent-provider.tsx). No app
// nativo (iOS/Android) e sem consentimento, window.oaiq não existe, então
// todas as funções aqui viram um "no-op" seguro — não quebram o fluxo nem
// disparam rastreamento onde não devem.

declare global {
  interface Window {
    oaiq?: (...args: unknown[]) => void;
  }
}

function measure(
  eventName: string,
  eventData: Record<string, unknown>,
  options?: Record<string, unknown>
): void {
  if (typeof window === "undefined" || typeof window.oaiq !== "function") return;
  try {
    if (options) {
      window.oaiq("measure", eventName, eventData, options);
    } else {
      window.oaiq("measure", eventName, eventData);
    }
  } catch {
    // Nunca deixar o pixel quebrar o fluxo do usuário.
  }
}

/** Cadastro concluído (conta criada). */
export function trackOpenAiRegistration(): void {
  measure("registration_completed", { type: "customer_action" });
}

/**
 * Compra concluída (assinatura ou programa).
 * @param amountCents valor em CENTAVOS, inteiro (ex.: R$118,80 => 11880).
 */
export function trackOpenAiPurchase(params?: {
  amountCents?: number;
  currency?: string;
  contentName?: string;
}): void {
  const data: Record<string, unknown> = { type: "contents", currency: params?.currency ?? "BRL" };
  if (typeof params?.amountCents === "number" && Number.isFinite(params.amountCents)) {
    data.amount = Math.round(params.amountCents);
  }
  if (params?.contentName) {
    data.contents = [
      { id: params.contentName, name: params.contentName, content_type: "product", quantity: 1 },
    ];
  }
  measure("order_created", data);
}
