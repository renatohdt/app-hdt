"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";
import { supabase } from "@/lib/supabase";

type SubscriptionSummary = {
  plan: "free" | "monthly" | "annual";
  isPremium: boolean;
  renewsAt: string | null;
  cancelsAt: string | null;
  cancelAtPeriodEnd: boolean;
  manageable: boolean;
};

type UseSubscriptionResult = {
  subscription: SubscriptionSummary | null;
  loading: boolean;
  // Re-consulta o status da assinatura (usado após uma compra), tentando de novo
  // até o premium aparecer. Retorna true se confirmou o premium no servidor.
  refresh: (opts?: { attempts?: number; intervalMs?: number }) => Promise<boolean>;
};

const DEFAULT: SubscriptionSummary = {
  plan: "free",
  isPremium: false,
  renewsAt: null,
  cancelsAt: null,
  cancelAtPeriodEnd: false,
  manageable: false,
};

// Contexto compartilhado: evita multiplas chamadas a /api/subscription
// quando varios componentes na arvore usam useSubscription ao mesmo tempo.
const SubscriptionContext = createContext<UseSubscriptionResult>({
  subscription: null,
  loading: true,
  refresh: async () => false,
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

  // Busca o status atual da assinatura e devolve o resumo, para quem chamou poder
  // decidir se precisa tentar de novo (ex.: esperar o webhook do RevenueCat).
  const fetchSubscription = useCallback(async (): Promise<SubscriptionSummary> => {
    try {
      // Verifica sessao local antes de chamar a API.
      // getAccessToken() le do cache do Supabase (localStorage) -- sem chamada de rede.
      // Evita 401 desnecessario para usuarios nao logados (ex: landing page).
      const token = await getAccessToken();
      if (!token) {
        setSubscription(DEFAULT);
        setLoading(false);
        return DEFAULT;
      }

      const response = await fetchWithAuth("/api/subscription");
      if (!response.ok) {
        setSubscription(DEFAULT);
        return DEFAULT;
      }

      const json = await response.json();
      const summary = (json?.data ?? DEFAULT) as SubscriptionSummary;
      setSubscription(summary);
      return summary;
    } catch {
      setSubscription(DEFAULT);
      return DEFAULT;
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza o status apos uma compra. O premium so e gravado no banco quando o
  // webhook do RevenueCat chega -- no Android isso levou ~1 minuto (Google ->
  // RevenueCat -> nosso servidor). Entao refazemos a busca varias vezes ate o
  // premium aparecer, sem o usuario precisar reabrir o app.
  // Padrao: 30 tentativas a cada 3s (~90s). Retorna true se confirmou.
  const refresh = useCallback(
    async (opts?: { attempts?: number; intervalMs?: number }) => {
      const attempts = opts?.attempts ?? 30;
      const intervalMs = opts?.intervalMs ?? 3000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const summary = await fetchSubscription();
        if (summary.isPremium) return true;
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      return false;
    },
    [fetchSubscription]
  );

  // Quando o app/aba volta para a tela (ex.: reabrir o app, voltar de outro app,
  // voltar da Play Store/App Store), consulta o plano de novo. Assim o status
  // nunca fica "preso" em um valor antigo (compra, renovação ou cancelamento).
  useEffect(() => {
    if (typeof document === "undefined") return;
    let last = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 5000) return; // evita consultas repetidas em sequência
      last = now;
      void fetchSubscription();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchSubscription]);

  useEffect(() => {
    let cancelled = false;

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
  }, [fetchSubscription]);

  return { subscription, loading, refresh };
}
