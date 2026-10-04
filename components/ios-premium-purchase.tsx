"use client";

import clsx from "clsx";
import { Check, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics-client";
import {
  configureRevenueCat,
  getPremiumPackages,
  purchasePremium,
  restorePremium,
  type RcPackage,
} from "@/lib/revenuecat-native";
import { useSubscription } from "@/components/use-subscription";
import { getStorePricePerDayLabel } from "@/lib/premium-pricing";
import { getNativePlatformNow, useNativePlatform } from "@/lib/is-native-app";

type Plan = "annual" | "monthly";

/**
 * Tela de assinatura Premium DENTRO do app nativo (iOS e Android), com compra
 * nativa via RevenueCat. Os preços vêm da loja (App Store / Google Play), não
 * são fixos no código.
 *
 * `fallback`: se informado, é mostrado no lugar da tela de compra quando os
 * planos não carregam (ex.: chave do Android ainda não cadastrada). No Android
 * usamos o antigo "Tenho interesse" — assim ninguém vê um botão quebrado.
 */
export function IosPremiumPurchase({ fallback }: { fallback?: ReactNode } = {}) {
  const router = useRouter();
  const platform = useNativePlatform();
  const isAndroid = platform === "android";
  const { refresh } = useSubscription();
  const [userId, setUserId] = useState<string | null>(null);
  const [packages, setPackages] = useState<{ monthly?: RcPackage; annual?: RcPackage }>({});
  const [selected, setSelected] = useState<Plan>("annual");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Após pagar: esperando o servidor confirmar o premium (webhook do RevenueCat).
  const [activating, setActivating] = useState(false);
  // O servidor confirmou o premium? (false = pagamento ok, mas ainda propagando)
  const [confirmed, setConfirmed] = useState(false);

  // Espera o servidor confirmar o premium antes de liberar o "Continuar".
  // No Android o aviso da loja levou ~1 min para chegar; esperamos até ~90s.
  async function waitForPremium() {
    setActivating(true);
    const ok = await refresh();
    setConfirmed(ok);
    setActivating(false);
    setDone(true);
  }

  // Carrega os planos (configura o RevenueCat + busca os pacotes).
  // Reutilizado pelo botão "Tentar novamente".
  async function loadPackagesFor(uid: string) {
    setLoading(true);
    try {
      await configureRevenueCat(uid);
      const pkgs = await getPremiumPackages();
      setPackages(pkgs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    // Rede de segurança: nunca deixa a tela presa em "Carregando".
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
        // silencioso: se falhar, mostramos a mensagem de "não carregou" abaixo
      } finally {
        if (active) setLoading(false);
        clearTimeout(safety);
      }
    })();

    return () => {
      active = false;
      clearTimeout(safety);
    };
  }, []);

  async function handleRetry() {
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }
    setError(null);
    await loadPackagesFor(userId);
  }

  async function handleBuy() {
    setError(null);

    // Precisa estar logado pra vincular a compra à conta (senão o premium não
    // é liberado no servidor). Sem sessão, manda pro login e volta pra cá.
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }

    const pkg = selected === "annual" ? packages.annual : packages.monthly;
    if (!pkg) {
      setError("Não foi possível carregar os planos. Tente novamente em instantes.");
      return;
    }

    setBusy(true);
    const source = getNativePlatformNow() === "android" ? "android_iap" : "ios_iap";
    trackEvent("checkout_started", null, { plan: selected, source });
    const res = await purchasePremium(pkg);
    setBusy(false);

    if (res.ok) {
      trackEvent("purchase", null, { plan: selected, source });
      await waitForPremium();
    } else if (res.canceled) {
      // usuário fechou o pop-up da loja: não é erro
    } else {
      setError("Não foi possível concluir a assinatura. Tente novamente.");
    }
  }

  async function handleRestore() {
    setError(null);
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }

    setBusy(true);
    const res = await restorePremium();
    setBusy(false);

    if (res.ok) {
      await waitForPremium();
    } else {
      setError(
        isAndroid
          ? "Nenhuma assinatura anterior encontrada nesta conta Google."
          : "Nenhuma assinatura anterior encontrada nesta conta Apple."
      );
    }
  }

  if (activating) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
        <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-semibold text-primary">Ativando seu Premium...</p>
        <p className="mt-1 text-sm text-white/70">
          Pagamento aprovado! Estamos liberando seus recursos. Isso pode levar até 1 minuto.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
        <p className="text-sm font-semibold text-primary">
          {confirmed ? "Premium ativado! ✨" : "Pagamento confirmado! ✨"}
        </p>
        <p className="mt-1 text-sm text-white/70">
          {confirmed
            ? "Aproveite todos os recursos do Hora do Treino."
            : "Seu Premium será liberado em instantes. Se ainda aparecer o plano gratuito, feche e abra o app."}
        </p>
        <button
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black"
        >
          Continuar
        </button>
      </div>
    );
  }

  // Planos não carregaram e há um fallback (Android): mostra o fallback.
  if (fallback && !loading && !packages.annual && !packages.monthly) {
    return <>{fallback}</>;
  }

  const annualPrice = packages.annual?.product.priceString;
  const monthlyPrice = packages.monthly?.product.priceString;
  const selectedPrice = selected === "annual" ? annualPrice : monthlyPrice;
  const selectedPeriod = selected === "annual" ? "ano" : "mês";
  // Preço por dia calculado a partir do preço real da loja (só referência; o
  // valor cobrado continua em destaque, como pede a Apple).
  const annualPerDay = getStorePricePerDayLabel(annualPrice, "annual");
  const monthlyPerDay = getStorePricePerDayLabel(monthlyPrice, "monthly");

  return (
    <>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Escolha seu plano</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Anual */}
        <button
          onClick={() => setSelected("annual")}
          className={clsx(
            "relative flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
            selected === "annual" ? "border-primary bg-primary/10 shadow-glow" : "border-white/10 bg-white/5"
          )}
        >
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-black text-black whitespace-nowrap">
            Mais popular
          </span>
          <div className="mt-1 w-full text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Anual</p>
            <p className="mt-1 text-2xl font-black text-white">{annualPrice ?? "—"}</p>
            <p className="text-[11px] text-white/40">/ano</p>
            {annualPerDay ? <p className="mt-1.5 text-[11px] font-bold text-premium">só {annualPerDay} por dia</p> : null}
          </div>
          {selected === "annual" && (
            <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check size={11} className="text-black" strokeWidth={3} />
            </div>
          )}
        </button>

        {/* Mensal */}
        <button
          onClick={() => setSelected("monthly")}
          className={clsx(
            "flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
            selected === "monthly" ? "border-primary bg-primary/10 shadow-glow" : "border-white/10 bg-white/5"
          )}
        >
          <div className="w-full text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Mensal</p>
            <p className="mt-1 text-2xl font-black text-white">{monthlyPrice ?? "—"}</p>
            <p className="text-[11px] text-white/40">/mês</p>
            {monthlyPerDay ? <p className="mt-1.5 text-[11px] font-semibold text-white/55">{monthlyPerDay} por dia</p> : null}
          </div>
          {selected === "monthly" && (
            <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check size={11} className="text-black" strokeWidth={3} />
            </div>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Planos não carregaram (ex.: App Store ainda propagando): mensagem clara + tentar de novo */}
      {!loading && !packages.annual && !packages.monthly && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/70">
          <p>Não foi possível carregar os planos agora.</p>
          <button
            onClick={handleRetry}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <button
        onClick={handleBuy}
        disabled={busy || loading || (!packages.annual && !packages.monthly)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Zap size={16} strokeWidth={2.5} />
        {busy ? "Processando..." : loading ? "Carregando..." : "Assinar Premium"}
      </button>

      <button
        onClick={handleRestore}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white/70 transition hover:text-white disabled:opacity-60"
      >
        <RotateCcw size={14} />
        Restaurar compras
      </button>

      {/* Texto obrigatório de assinatura (Apple 3.1.2 / Google Play) */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-white/40">
        {selectedPrice
          ? `Assinatura ${selected === "annual" ? "anual" : "mensal"} de ${selectedPrice}/${selectedPeriod}. `
          : ""}
        {isAndroid
          ? "A assinatura renova automaticamente por igual período, a menos que seja cancelada antes do fim do período atual, em Google Play › Pagamentos e assinaturas. O pagamento é processado pelo Google Play."
          : "A assinatura renova automaticamente por igual período, a menos que seja cancelada até 24h antes do fim do período atual, nos Ajustes da App Store. O pagamento é processado pela Apple."}{" "}
        <Link href="/termos-de-uso" className="underline hover:text-white/60">
          Termos de Uso
        </Link>{" "}
        ·{" "}
        <Link href="/politica-de-privacidade" className="underline hover:text-white/60">
          Política de Privacidade
        </Link>
      </p>
    </>
  );
}
