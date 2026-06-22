"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";
import { supabase } from "@/lib/supabase";

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

    // Sem cliente Supabase (ex: ambiente sem env configurado): faz a busca uma única vez.
    if (!supabase) {
      void fetchSubscription();
      return () => {
        cancelled = true;
      };
    }

    // Reage à sessão do Supabase. O evento INITIAL_SESSION dispara no carregamento
    // (com ou sem sessão) e os demais cobrem login, refresh de token e troca de conta.
    // Antes, se a sessão ainda não estivesse pronta no primeiro instante, o usuário
    // ficava marcado como free até dar um refresh manual.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        setSubscription(DEFAULT);
        setLoading(false);
        return;
      }

      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED: refaz a busca.
      // Não reativa o "loading" para não piscar a UI em refresh de token periódico.
      void fetchSubscription();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { subscription, loading };
}
