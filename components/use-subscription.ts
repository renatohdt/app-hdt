"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";

type SubscriptionSummary = {
  plan: "free" | "monthly" | "annual";
  isPremium: boolean;
  renewsAt: string | null;
  cancelsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type UseSubscriptionResult = {
  subscription: SubscriptionSummary | null;
  loading: boolean;
};

const DEFAULT: SubscriptionSummary = {
  plan: "free",
  isPremium: false,
  renewsAt: null,
  cancelsAt: null,
  cancelAtPeriodEnd: false,
};

// Contexto compartilhado: evita multiplas chamadas a /api/subscription
// quando varios componentes na arvore usam useSubscription ao mesmo tempo.
const SubscriptionContext = createContext<UseSubscriptionResult>({
  subscription: null,
  loading: true,
});

export { SubscriptionContext };
export type { SubscriptionSummary };

export function useSubscription(): UseSubscriptionResult {
  return useContext(SubscriptionContext);
}

// Hook interno usado apenas pelo SubscriptionProvider para fazer o fetch uma unica vez
export function useSubscriptionLoader(): UseSubscriptionResult {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        // Verifica sessao local antes de chamar a API.
        // getAccessToken() le do cache do Supabase (localStorage) -- sem chamada de rede.
        // Evita 401 desnecessario para usuarios nao logados (ex: landing page).
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) {
            setSubscription(DEFAULT);
            setLoading(false);
          }
          return;
        }

        const response = await fetchWithAuth("/api/subscription");

        if (!response.ok) {
          if (!cancelled) setSubscription(DEFAULT);
          return;
        }

        const json = await response.json();
        if (!cancelled) setSubscription(json?.data ?? DEFAULT);
      } catch {
        if (!cancelled) setSubscription(DEFAULT);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  return { subscription, loading };
}
