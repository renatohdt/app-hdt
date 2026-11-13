"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Zap } from "lucide-react";
import { trackEvent } from "@/lib/analytics-client";
import { useNativePlatform } from "@/lib/is-native-app";
import { PremiumIcon } from "@/components/premium-badge";
import {
  getStorePricePerDayLabel,
  getWebPricePerDayLabel,
  type PremiumPeriod,
} from "@/lib/premium-pricing";
import { useStripeCheckout } from "@/lib/use-stripe-checkout";
import { useNativePurchase } from "@/lib/use-native-purchase";

type Props = {
  /** Identifica de onde veio a compra (vai para o analytics). Ex.: "upsell_modal_weekly_plan". */
  origin: string;
  /** Nome do clique no botão verde no analytics (mantém os nomes antigos de cada popup). */
  ctaSource?: string;
  /** Texto do botão verde. Padrão: "Assinar Premium". */
  ctaLabel?: string;
  /** Chamado quando o fluxo sai da tela (página /premium ou login): o popup pai deve fechar. */
  onNavigate: () => void;
  /** Chamado no "Continuar" depois que o Premium foi ativado (app nativo). */
  onDone: () => void;
  /** Avisa o popup pai quando está pagando/ativando (para não fechar por toque fora). */
  onLockChange?: (locked: boolean) => void;
};

/**
 * Bloco PADRÃO de assinatura: os 2 planos (anual já marcado), o botão verde
 * que vai DIRETO ao pagamento e o rodapé obrigatório.
 *  - Web: checkout do Stripe (se não estiver logado, cria conta e volta ao checkout).
 *  - App iOS/Android: compra da Apple/Google (RevenueCat), com preço vindo da loja.
 * Usado pelo UpsellModal e por popups que têm conteúdo próprio (ex.: "o que você está perdendo").
 */
export function PremiumCheckoutPanel({ origin, ctaSource, ctaLabel = "Assinar Premium", onNavigate, onDone, onLockChange }: Props) {
  const router = useRouter();
  const platform = useNativePlatform();
  const isNative = platform !== "web";
  const isAndroid = platform === "android";

  const [selected, setSelected] = useState<PremiumPeriod>("annual");
  const stripe = useStripeCheckout(origin);
  const native = useNativePurchase(isNative, origin);

  const locked = stripe.loading || native.busy || native.status === "activating";
  useEffect(() => {
    onLockChange?.(locked);
  }, [locked, onLockChange]);

  function selectPlan(plan: PremiumPeriod) {
    setSelected(plan);
    trackEvent("plan_selected", null, { plan, source: origin });
  }

  function goToPremiumPage() {
    trackEvent("cta_click", null, { source: `${origin}_details` });
    router.push("/premium");
    onNavigate();
  }

  async function handleCTA() {
    trackEvent("cta_click", null, { source: ctaSource ?? `${origin}_cta`, plan: selected });

    if (!isNative) {
      if (!stripe.loading) void stripe.startCheckout(selected);
      return;
    }

    // App: planos carregando → espera; não carregaram → página Premium.
    if (native.loading || native.busy) return;
    if (!native.hasPackages) {
      goToPremiumPage();
      return;
    }
    const result = await native.buy(selected);
    if (result === "no_user") {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      onNavigate();
    } else if (result === "no_package") {
      goToPremiumPage();
    }
  }

  function handleFinish() {
    onDone();
    router.refresh();
  }

  // ── App: pagou, esperando o servidor liberar o Premium ──
  if (native.status === "activating") {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto mb-3 block h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-base font-bold text-primary">Ativando seu Premium...</p>
        <p className="mt-1 text-sm text-white/60">
          Pagamento aprovado! Estamos liberando seus recursos. Isso pode levar até 1 minuto.
        </p>
      </div>
    );
  }

  // ── App: terminou ──
  if (native.status === "done") {
    return (
      <div className="py-4 text-center">
        <div className="mb-3 flex justify-center"><PremiumIcon /></div>
        <p className="text-lg font-bold text-white">
          {native.confirmed ? "Premium ativado! ✨" : "Pagamento confirmado! ✨"}
        </p>
        <p className="mt-1 text-sm text-white/60">
          {native.confirmed
            ? "Aproveite todos os recursos do Hora do Treino."
            : "Seu Premium será liberado em instantes. Se ainda aparecer o plano gratuito, feche e abra o app."}
        </p>
        <button
          onClick={handleFinish}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99]"
        >
          Continuar
        </button>
      </div>
    );
  }

  // ── Preços exibidos nos cards ──
  const annualStore = native.packages.annual?.product.priceString;
  const monthlyStore = native.packages.monthly?.product.priceString;
  const plans: Record<PremiumPeriod, { price: string; unit: string; perDay: string | null }> = isNative
    ? {
        annual: { price: annualStore ?? "—", unit: "/ano", perDay: getStorePricePerDayLabel(annualStore, "annual") },
        monthly: { price: monthlyStore ?? "—", unit: "/mês", perDay: getStorePricePerDayLabel(monthlyStore, "monthly") },
      }
    : {
        annual: { price: "R$ 9,90", unit: "/mês", perDay: getWebPricePerDayLabel("annual") },
        monthly: { price: "R$ 14,90", unit: "/mês", perDay: getWebPricePerDayLabel("monthly") },
      };

  const nativeUnavailable = isNative && !native.loading && !native.hasPackages;
  const label = isNative
    ? native.busy
      ? "Processando..."
      : native.loading
        ? "Carregando..."
        : nativeUnavailable
          ? "Ver planos"
          : ctaLabel
    : stripe.loading
      ? "Abrindo pagamento..."
      : ctaLabel;
  const error = isNative ? native.error : stripe.error;

  return (
    <div>
      {/* Planos (clicáveis). Anual já vem marcado. */}
      {!nativeUnavailable && (
        <div className="mb-4 grid grid-cols-2 gap-2 pt-1 text-center">
          {(["annual", "monthly"] as const).map((plan) => {
            const isSelected = selected === plan;
            const info = plans[plan];
            return (
              <button
                key={plan}
                type="button"
                onClick={() => selectPlan(plan)}
                disabled={locked}
                aria-pressed={isSelected}
                className={clsx(
                  "relative rounded-2xl border-2 px-2 pb-2.5 pt-3 transition-all",
                  isSelected ? "border-primary bg-primary/10" : "border-white/10 bg-white/5"
                )}
              >
                {plan === "annual" && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase text-black">
                    Mais popular
                  </span>
                )}
                {isSelected && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                    <Check size={10} className="text-black" strokeWidth={3} />
                  </span>
                )}
                <p className={clsx("text-[11px] font-semibold uppercase tracking-wider", isSelected ? "text-primary" : "text-white/40")}>
                  {plan === "annual" ? "Anual" : "Mensal"}
                </p>
                <p className="text-lg font-bold text-white">
                  {native.loading && isNative ? "…" : info.price}
                  <span className="text-xs font-normal text-white/40">{info.unit}</span>
                </p>
                {info.perDay ? (
                  <p className={clsx("text-[10px]", plan === "annual" ? "font-semibold text-premium" : "text-white/40")}>
                    {plan === "annual" ? `só ${info.perDay}/dia` : `${info.perDay}/dia`}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {nativeUnavailable && (
        <p className="mb-4 text-center text-sm text-white/50">
          Não foi possível carregar os planos agora. Veja as opções na página Premium.
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* CTA verde padrão: vai direto ao pagamento */}
      <button
        type="button"
        onClick={() => void handleCTA()}
        disabled={locked || (isNative && native.loading)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Zap size={15} strokeWidth={2.5} />
        {label}
      </button>

      {/* Rodapé */}
      {isNative ? (
        // Texto obrigatório de assinatura (Apple 3.1.2 / Google Play)
        <p className="mt-3 text-center text-[10px] leading-relaxed text-white/35">
          {plans[selected].price !== "—"
            ? `Assinatura ${selected === "annual" ? "anual" : "mensal"} de ${plans[selected].price}${plans[selected].unit}, renovada automaticamente. `
            : "Renovação automática. "}
          {isAndroid
            ? "Cancele quando quiser no Google Play."
            : "Cancele até 24h antes da renovação nos Ajustes da App Store."}{" "}
          <Link href="/termos-de-uso" className="underline">Termos de Uso</Link> ·{" "}
          <Link href="/politica-de-privacidade" className="underline">Privacidade</Link>
        </p>
      ) : (
        <p className="mt-3 text-center text-xs text-white/30">
          {selected === "annual" ? "Cobrança anual de R$ 118,80 · " : ""}Cancele quando quiser · Garantia de 7 dias
        </p>
      )}

      <button
        type="button"
        onClick={goToPremiumPage}
        disabled={locked}
        className="mx-auto mt-2 block text-xs font-semibold text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
      >
        Ver tudo que o Premium inclui
      </button>
    </div>
  );
}
