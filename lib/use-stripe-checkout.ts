"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics-client";
import { trackMetaInitiateCheckout } from "@/lib/facebook-pixel";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { WEB_PREMIUM_PRICES, type PremiumPeriod } from "@/lib/premium-pricing";

/**
 * Hook (função reutilizável do React) que inicia o checkout do Stripe na WEB.
 *
 * - Cria a sessão de pagamento em /api/stripe/checkout e redireciona para o Stripe.
 * - Se a pessoa não estiver logada (401), manda para o cadastro e, ao voltar,
 *   a página /premium retoma o checkout do mesmo plano (?checkout=<plano>&auth=1).
 * - NUNCA deve ser chamado dentro do app nativo (regra das lojas) — quem usa
 *   este hook é responsável por só mostrá-lo no navegador.
 */
export function useStripeCheckout(source: string) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: PremiumPeriod) {
    setError(null);
    setLoading(true);

    const value = WEB_PREMIUM_PRICES[plan];
    trackEvent("checkout_started", null, { plan, value, source });
    trackMetaInitiateCheckout({ value, currency: "BRL", content_name: `Premium ${plan}` });

    try {
      const response = await fetchWithAuth("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (response.status === 401) {
        router.push(`/criar-conta?next=${encodeURIComponent(`/premium?checkout=${plan}&auth=1`)}`);
        return;
      }

      let data: { data?: { url?: string }; error?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        throw new Error("Não foi possível iniciar o pagamento. Tente novamente em instantes.");
      }

      if (!response.ok || !data?.data?.url) {
        throw new Error(data?.error ?? "Não foi possível iniciar o pagamento. Tente novamente.");
      }

      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  return { startCheckout, loading, error };
}
