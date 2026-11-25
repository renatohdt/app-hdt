"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";
import { supabase } from "@/lib/supabase";

type SubscriptionSummary = {
  plan: "free" | "monthly" | "annual";
  isPremium: boolean;
  renewsAt: string | null;
  cancelsAt: string | null;
  cancelAtPeriodEnd: boolean;
  manageable: boolean;
  // Origem do Premium e até quando vale (loja/cortesia). Opcionais para
  // compatibilidade com respostas antigas em cache.
  source?: "free" | "stripe" | "app_store" | "play_store" | "referral" | "program";
  accessUntil?: string | null;
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
  source: "free",
  accessUntil: null,
};

// Por quanto tempo uma resposta de /api/subscription é reaproveitada antes de
// consultar de novo (abrir o app, voltar para a tela, trocar de página).
// Compra e troca de conta sempre consultam na hora (force).
const SUBSCRIPTION_FRESH_MS = 60_000;

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
  // Quando a última consulta deu certo e qual consulta está em andamento.
  // Evita disparar várias chamadas iguais ao mesmo tempo (login + foco + aba visível).
  const lastFetchedAtRef = useRef(0);
  const lastSummaryRef = useRef<SubscriptionSummary | null>(null);
  const inflightRef = useRef<Promise<SubscriptionSummary> | null>(null);

  // Busca o status atual da assinatura e devolve o resumo, para quem chamou poder
  // decidir se precisa tentar de novo (ex.: esperar o webhook do RevenueCat).
  const fetchSubscriptionNow = useCallback(async (): Promise<SubscriptionSummary> => {
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
      lastFetchedAtRef.current = Date.now();
      lastSummaryRef.current = summary;
      setSubscription(summary);
      return summary;
    } catch {
      setSubscription(DEFAULT);
      return DEFAULT;
    } finally {
      setLoading(false);
    }
  }, []);

  // Porta de entrada única: junta chamadas simultâneas numa só e, sem `force`,
  // reaproveita a resposta recente em vez de ir ao servidor de novo.
  const fetchSubscription = useCallback(
    (opts?: { force?: boolean }): Promise<SubscriptionSummary> => {
      if (inflightRef.current) return inflightRef.current;
      const isFresh = Date.now() - lastFetchedAtRef.current < SUBSCRIPTION_FRESH_MS;
      if (!opts?.force && isFresh && lastSummaryRef.current) {
        return Promise.resolve(lastSummaryRef.current);
      }
      const request = fetchSubscriptionNow().finally(() => {
        inflightRef.current = null;
      });
      inflightRef.current = request;
      return request;
    },
    [fetchSubscriptionNow]
  );

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
        const summary = await fetchSubscription({ force: true });
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
    let lastUserId: string | null = null;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const userId = session?.user?.id ?? null;
      const switchedAccount = userId !== lastUserId;
      lastUserId = userId;

      if (event === "SIGNED_OUT") {
        lastFetchedAtRef.current = 0;
        lastSummaryRef.current = null;
        setSubscription(DEFAULT);
        setLoading(false);
        return;
      }

      // Entrou numa conta: até saber o plano dela, não trata como free (evita
      // banner/anúncio piscando para quem é Premium logo após o login).
      // (O Supabase também manda SIGNED_IN ao voltar para o app; só conta se mudou a conta.)
      if (event === "SIGNED_IN" && switchedAccount) setLoading(true);

      // Renovar o token (a cada ~1h) não muda o plano: não consulta de novo.
      if (event === "TOKEN_REFRESHED") return;

      // INITIAL_SESSION, SIGNED_IN, USER_UPDATED: refaz a busca. Troca de conta
      // força a consulta; nos demais casos vale a resposta recente (até 60 s).
      void fetchSubscription({ force: switchedAccount });
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [fetchSubscription]);

  return { subscription, loading, refresh };
}
