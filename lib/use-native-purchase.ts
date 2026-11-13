"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics-client";
import {
  configureRevenueCat,
  getPremiumPackages,
  purchasePremium,
  type RcPackage,
} from "@/lib/revenuecat-native";
import { useSubscription } from "@/components/use-subscription";
import { getNativePlatformNow } from "@/lib/is-native-app";
import type { PremiumPeriod } from "@/lib/premium-pricing";

/**
 * Hook (função reutilizável do React) da compra Premium DENTRO do app nativo
 * (iOS e Android), via RevenueCat. Usado pelos popups de upsell para comprar
 * direto, sem passar pela página /premium.
 *
 * - `enabled`: só carrega os planos quando estiver no app nativo (na web não faz nada).
 * - Os preços vêm da loja (App Store / Google Play), nunca fixos no código.
 * - Depois de pagar, espera o servidor confirmar o Premium (webhook do RevenueCat),
 *   igual à tela /premium.
 */
export function useNativePurchase(enabled: boolean, origin: string) {
  const { refresh } = useSubscription();
  const [userId, setUserId] = useState<string | null>(null);
  const [packages, setPackages] = useState<{ monthly?: RcPackage; annual?: RcPackage }>({});
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "activating" = pagou e está esperando o servidor; "done" = terminou.
  const [status, setStatus] = useState<"idle" | "activating" | "done">("idle");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    // Rede de segurança: nunca deixa o botão preso em "Carregando".
    const safety = setTimeout(() => {
      if (active) setLoading(false);
    }, 12000);

    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        if (!active) return;
        setUserId(uid);
        if (uid) {
          await configureRevenueCat(uid);
          const pkgs = await getPremiumPackages();
          if (active) setPackages(pkgs);
        }
      } catch {
        // silencioso: sem planos, o popup oferece "Ver planos" (página /premium)
      } finally {
        if (active) setLoading(false);
        clearTimeout(safety);
      }
    })();

    return () => {
      active = false;
      clearTimeout(safety);
    };
  }, [enabled]);

  const hasPackages = Boolean(packages.annual || packages.monthly);

  async function buy(plan: PremiumPeriod): Promise<"ok" | "canceled" | "error" | "no_user" | "no_package"> {
    setError(null);
    if (!userId) return "no_user";

    const pkg = plan === "annual" ? packages.annual : packages.monthly;
    if (!pkg) return "no_package";

    setBusy(true);
    const source = getNativePlatformNow() === "android" ? "android_iap" : "ios_iap";
    trackEvent("checkout_started", null, { plan, source, origin });
    const res = await purchasePremium(pkg);
    setBusy(false);

    if (res.ok) {
      trackEvent("purchase", null, { plan, source, origin });
      setStatus("activating");
      const ok = await refresh();
      setConfirmed(ok);
      setStatus("done");
      return "ok";
    }
    if (res.canceled) return "canceled"; // fechou a tela da loja: não é erro
    setError("Não foi possível concluir a assinatura. Tente novamente.");
    return "error";
  }

  return { packages, hasPackages, loading, busy, error, status, confirmed, buy };
}
