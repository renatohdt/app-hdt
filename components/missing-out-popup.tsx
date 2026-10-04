"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";
import { PremiumBadge, PremiumIcon } from "@/components/premium-badge";
import { trackEvent } from "@/lib/analytics-client";
import { getWebPricePerDayLabel } from "@/lib/premium-pricing";

// Pop-up "o que você está perdendo" (plano free). Usa os números do próprio
// usuário (aversão à perda: é algo que já é dele) e uma prévia borrada do
// gráfico de evolução (curiosidade). Sempre com saída clara: "Agora não".
const LOCKED_FEATURES = [
  "Gráfico da sua evolução de carga",
  "Minha semana: o app organiza seus dias",
  "Programas e substituições ilimitados",
  "Treino em mais de um local, sem anúncios"
];

type Props = {
  firstName: string;
  totalWorkouts: number;
  weightIncreases: number;
  daysUsing: number;
  isNative: boolean;
  onClose: () => void;
};

export function MissingOutPopup({ firstName, totalWorkouts, weightIncreases, daysUsing, isNative, onClose }: Props) {
  const router = useRouter();
  const hasProgress = totalWorkouts > 0;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    trackEvent("cta_click", null, { source: "upsell_modal_view_missing_out", total_workouts: totalWorkouts });
    return () => {
      document.body.style.overflow = "";
    };
  }, [totalWorkouts]);

  function handleCta() {
    trackEvent("cta_click", null, { source: "upsell_modal_cta_missing_out", total_workouts: totalWorkouts });
    onClose();
    router.push("/premium");
  }

  function handleDismiss() {
    trackEvent("cta_click", null, { source: "upsell_modal_dismiss_missing_out" });
    onClose();
  }

  const stats = [
    { value: totalWorkouts, label: totalWorkouts === 1 ? "treino feito" : "treinos feitos" },
    { value: weightIncreases, label: weightIncreases === 1 ? "aumento de carga" : "aumentos de carga" },
    { value: daysUsing, label: daysUsing === 1 ? "dia com a gente" : "dias com a gente" }
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative z-10 max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[32px] border border-premium/20 bg-[#0f0f0d] px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 shadow-2xl sm:rounded-[32px]">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <PremiumIcon />
          <PremiumBadge />
        </div>

        <h2 className="text-xl font-bold leading-snug tracking-tight text-white">
          {hasProgress ? `${firstName}, olha o que você já construiu 💪` : `${firstName}, seu treino pode ir muito além 💪`}
        </h2>

        {hasProgress ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center">
                <p className="text-xl font-black tabular-nums text-white">{stat.value}</p>
                <p className="mt-0.5 text-[10.5px] leading-tight text-white/45">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Prévia borrada do gráfico de evolução */}
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <svg viewBox="0 0 300 90" className="w-full blur-[3px]" aria-hidden>
            <polyline fill="none" stroke="#f5c451" strokeWidth="3" points="0,78 40,72 80,66 120,60 160,47 200,40 240,27 300,12" />
            <polyline fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" points="0,85 300,85" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/35 text-xs font-semibold text-white">
            <Lock className="h-3.5 w-3.5 text-premium" strokeWidth={2.75} />
            {weightIncreases > 0
              ? `Veja seus ${weightIncreases} aumentos de carga em gráfico`
              : "Sua evolução de carga em gráfico"}
          </div>
        </div>

        <p className="mt-4 text-[13px] font-semibold text-white/80">No plano gratuito você está deixando de lado:</p>
        <ul className="mt-2 space-y-1.5">
          {LOCKED_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-[13px] text-white/60">
              <Lock className="h-3.5 w-3.5 shrink-0 text-premium/80" strokeWidth={2.5} />
              {feature}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleCta}
          className="premium-shine mt-5 w-full rounded-2xl bg-gradient-to-r from-premium to-premiumStrong py-3.5 text-sm font-black text-[#2b1d00] shadow-[0_10px_40px_rgba(245,196,81,0.25)] transition hover:opacity-95 active:scale-[0.99]"
        >
          Desbloquear meu Premium
        </button>
        <p className="mt-2 text-center text-[11.5px] text-white/40">
          {isNative
            ? "Menos que uma dose de whey por dia (e bem mais gostoso 😄)"
            : `${getWebPricePerDayLabel("annual")} por dia: menos que uma dose de whey 😄`}
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-2 w-full py-2.5 text-sm font-semibold text-white/45 transition hover:text-white/70"
        >
          Agora não
        </button>
      </div>
    </div>,
    document.body
  );
}
