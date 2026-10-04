"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CreditCard, ExternalLink } from "lucide-react";
import { PremiumBadge } from "@/components/premium-badge";
import type { SubscriptionSummary } from "@/components/use-subscription";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { trackEvent } from "@/lib/analytics-client";
import { getWebPricePerDayLabel } from "@/lib/premium-pricing";

// Páginas oficiais de assinaturas de cada loja (o cancelamento/troca de plano
// de quem assinou pela loja só pode ser feito lá — regra da Apple e do Google).
const APP_STORE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const PLAY_STORE_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions?package=com.horadotreino.app";

const PREMIUM_BENEFITS = [
  "Evolução de carga em gráfico",
  "Minha semana (planejador de treinos)",
  "Programas e substituições ilimitados",
  "Sem anúncios"
];

type Props = {
  subscription: SubscriptionSummary | null;
  isNative: boolean;
  formatDate: (iso: string) => string;
  // Abre o portal do Stripe (site) — já existe na página de perfil.
  onManageStripe: () => void;
  isManagingStripe: boolean;
};

function getPlanLabel(sub: SubscriptionSummary) {
  switch (sub.source) {
    case "app_store":
      return "Premium · App Store";
    case "play_store":
      return "Premium · Google Play";
    case "referral":
      return "Premium cortesia";
    case "program":
      return "Premium do seu programa";
    default:
      return sub.plan === "annual" ? "Premium Anual" : "Premium Mensal";
  }
}

function openExternal(url: string) {
  // No app (Capacitor) links externos abrem no navegador/loja do sistema.
  window.open(url, "_blank", "noopener,noreferrer");
}

export function SubscriptionCard({ subscription, isNative, formatDate, onManageStripe, isManagingStripe }: Props) {
  const router = useRouter();

  // Estado local da assinatura Stripe (cancelar/reativar dentro do app).
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(subscription?.cancelAtPeriodEnd ?? false);
  const [cancelsAt, setCancelsAt] = useState(subscription?.cancelsAt ?? null);
  const [renewsAt, setRenewsAt] = useState(subscription?.renewsAt ?? null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Plano Gratuito ──────────────────────────────────────────────────────
  if (!subscription?.isPremium) {
    return (
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold text-white/60">
            Gratuito
          </span>
          <PremiumBadge size="xs" />
        </div>
        <p className="text-[13px] leading-relaxed text-white/55">
          Libere evolução de carga, Minha semana, programas ilimitados e treine sem anúncios.
        </p>
        <button
          type="button"
          onClick={() => {
            trackEvent("cta_click", null, { source: "upsell_modal_cta_profile_card" });
            router.push("/premium");
          }}
          className="premium-shine flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-premium to-premiumStrong py-3 text-sm font-black text-[#2b1d00] transition hover:opacity-95 active:scale-[0.99]"
        >
          Conhecer o Premium
          <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
        </button>
        <p className="text-center text-[11px] text-white/35">
          {isNative
            ? "Menos que uma dose de whey por dia (e bem mais gostoso 😄)"
            : `${getWebPricePerDayLabel("annual")} por dia: menos que uma dose de whey 😄`}
        </p>
      </div>
    );
  }

  const source = subscription.source ?? (subscription.manageable ? "stripe" : "program");

  async function runStripeAction(action: "cancel" | "reactivate") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth("/api/stripe/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { cancelAtPeriodEnd?: boolean; cancelsAt?: string | null; renewsAt?: string | null }; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Não foi possível atualizar sua assinatura.");
      }
      const d = json?.data ?? {};
      setCancelAtPeriodEnd(Boolean(d.cancelAtPeriodEnd));
      setCancelsAt(d.cancelsAt ?? null);
      setRenewsAt(d.renewsAt ?? null);
      setConfirmingCancel(false);
      trackEvent("cta_click", null, { source: action === "cancel" ? "subscription_cancel" : "subscription_reactivate" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // Linha de status (renova / cancela / válido até).
  let statusText: string | null = null;
  if (source === "stripe") {
    if (cancelAtPeriodEnd && cancelsAt) statusText = `⚠️ Cancelada — você mantém o Premium até ${formatDate(cancelsAt)}`;
    else if (renewsAt) statusText = `Renova em ${formatDate(renewsAt)}`;
  } else if (source === "app_store" || source === "play_store") {
    if (subscription.accessUntil) statusText = `Período atual até ${formatDate(subscription.accessUntil)}`;
  } else if (source === "referral") {
    if (subscription.accessUntil) statusText = `Ativo até ${formatDate(subscription.accessUntil)}`;
  } else if (source === "program") {
    statusText = "Incluso enquanto seu programa estiver ativo";
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PremiumBadge size="xs" />
        <span className="text-[14px] font-bold text-white">{getPlanLabel(subscription)}</span>
      </div>

      {statusText ? <p className="text-[13px] text-white/55">{statusText}</p> : null}

      {/* Benefícios: lembrar o valor do que a pessoa tem reduz cancelamento. */}
      <ul className="space-y-1.5 rounded-2xl border border-premium/15 bg-premium/[0.04] px-3.5 py-3">
        {PREMIUM_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-center gap-2 text-[13px] text-white/70">
            <Check className="h-3.5 w-3.5 shrink-0 text-premium" strokeWidth={3} />
            {benefit}
          </li>
        ))}
      </ul>

      {error ? <p className="text-[13px] text-red-400">{error}</p> : null}

      {/* ── Ações conforme a origem do Premium ── */}
      {source === "stripe" && !isNative ? (
        <button
          type="button"
          onClick={onManageStripe}
          disabled={isManagingStripe}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {isManagingStripe ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white/70" />
              Abrindo...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />
              Gerenciar pagamento e assinatura
            </>
          )}
        </button>
      ) : null}

      {source === "stripe" && isNative && subscription.manageable ? (
        cancelAtPeriodEnd ? (
          <button
            type="button"
            onClick={() => void runStripeAction("reactivate")}
            disabled={loading}
            className="premium-shine w-full rounded-2xl bg-gradient-to-r from-premium to-premiumStrong py-3 text-sm font-black text-[#2b1d00] transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "Reativando..." : "Reativar assinatura"}
          </button>
        ) : confirmingCancel ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-[13px] font-semibold text-white">Tem certeza? Ao cancelar você perde:</p>
            <ul className="space-y-1">
              {PREMIUM_BENEFITS.map((benefit) => (
                <li key={benefit} className="text-[12.5px] text-white/55">
                  ✕ {benefit}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-white/45">
              Você mantém o Premium até o fim do período já pago{renewsAt ? ` (${formatDate(renewsAt)})` : ""}.
            </p>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-premium to-premiumStrong py-3 text-sm font-black text-[#2b1d00] transition hover:opacity-95 disabled:opacity-50"
            >
              Manter meu Premium
            </button>
            <button
              type="button"
              onClick={() => void runStripeAction("cancel")}
              disabled={loading}
              className="w-full rounded-2xl py-2.5 text-sm font-semibold text-red-400/90 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {loading ? "Cancelando..." : "Cancelar mesmo assim"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Cancelar assinatura
          </button>
        )
      ) : null}

      {source === "app_store" || source === "play_store" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => openExternal(source === "app_store" ? APP_STORE_SUBSCRIPTIONS_URL : PLAY_STORE_SUBSCRIPTIONS_URL)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            {source === "app_store" ? "Gerenciar na App Store" : "Gerenciar no Google Play"}
          </button>
          <p className="text-center text-[11.5px] leading-snug text-white/35">
            Você assinou pela {source === "app_store" ? "App Store" : "Google Play"}, então troca de plano e
            cancelamento são feitos por lá.
          </p>
        </div>
      ) : null}

      {source === "referral" ? (
        <button
          type="button"
          onClick={() => {
            trackEvent("cta_click", null, { source: "upsell_modal_cta_profile_referral" });
            router.push("/premium");
          }}
          className="w-full rounded-2xl border border-premium/30 bg-premium/10 py-3 text-sm font-bold text-premium transition hover:bg-premium/15"
        >
          Garantir o Premium depois da cortesia
        </button>
      ) : null}
    </div>
  );
}
