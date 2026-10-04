"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PremiumBadge } from "@/components/premium-badge";
import { trackEvent } from "@/lib/analytics-client";
import { useIsNativeApp } from "@/lib/is-native-app";
import { getWebPricePerDayLabel } from "@/lib/premium-pricing";

// Em quais treinos concluídos (total da vida) o usuário free vê o convite Premium.
// Momento de pico de motivação: logo depois de treinar, e só 2 vezes.
export const PREMIUM_NUDGE_AT_WORKOUTS = [2, 5];

const COPY: Record<number, { title: string; text: string }> = {
  2: {
    title: "2 treinos feitos! 🔥 Agora vem a parte boa.",
    text: "No Premium você vê sua força crescendo em gráfico, monta sua semana e treina sem anúncios."
  },
  5: {
    title: "5 treinos! Isso já é constância 💪",
    text: "Quem chega aqui evolui mais rápido com o Premium: evolução de carga, Minha semana e programas ilimitados."
  }
};

// Cartão Premium dentro do popup de treino concluído (só plano free).
export function WorkoutPremiumNudge({ totalWorkouts, onNavigate }: { totalWorkouts: number; onNavigate: () => void }) {
  const router = useRouter();
  const isNative = useIsNativeApp();
  const copy = COPY[totalWorkouts] ?? COPY[2]!;

  useEffect(() => {
    trackEvent("cta_click", null, { source: "upsell_modal_view_workout_complete", total_workouts: totalWorkouts });
  }, [totalWorkouts]);

  function handleClick() {
    trackEvent("cta_click", null, { source: "upsell_modal_cta_workout_complete", total_workouts: totalWorkouts });
    onNavigate();
    router.push("/premium");
  }

  return (
    <div className="rounded-2xl border border-premium/30 bg-[radial-gradient(circle_at_top,rgba(245,196,81,0.14),transparent_65%)] p-4 text-left">
      <PremiumBadge size="xs" />
      <p className="mt-2 text-[15px] font-bold leading-snug text-white">{copy.title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{copy.text}</p>
      <button
        type="button"
        onClick={handleClick}
        className="premium-shine mt-3 w-full rounded-xl bg-gradient-to-r from-premium to-premiumStrong py-3 text-sm font-black text-[#2b1d00] transition hover:opacity-95 active:scale-[0.99]"
      >
        Conhecer o Premium
      </button>
      <p className="mt-2 text-center text-[11px] text-white/35">
        {isNative
          ? "Menos que uma dose de whey por dia (e bem mais gostoso 😄)"
          : `${getWebPricePerDayLabel("annual")} por dia: menos que uma dose de whey 😄`}
      </p>
    </div>
  );
}
