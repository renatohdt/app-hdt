"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, PlayCircle } from "lucide-react";
import { useConsentPreferences } from "@/components/consent-provider";
import { trackEvent } from "@/lib/analytics-client";
import { preloadRewardedAd, showRewardedAd } from "@/lib/admob";
import { unlockWorkoutTabs } from "@/lib/workout-tabs-unlock";

/**
 * Plano free no app: tocar numa aba de treino que não é a do dia abre este aviso.
 * Vídeo com recompensa libera todas as abas por 24h (o vídeo só toca se a pessoa escolher).
 */
export function WorkoutTabGate({
  userId,
  workoutLabel,
  workoutKey,
  onUnlocked,
  onClose
}: {
  userId: string;
  workoutLabel: string;
  workoutKey: string;
  onUnlocked: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { preferences } = useConsentPreferences();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void preloadRewardedAd(preferences.ads);
  }, [preferences.ads]);

  async function handleWatch() {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    const result = await showRewardedAd("view_other_workout", preferences.ads);
    setLoading(false);

    if (result === "rewarded") {
      unlockWorkoutTabs(userId);
      onUnlocked();
    } else if (result === "dismissed") {
      setMessage("Assista o vídeo até o fim para liberar os treinos.");
    } else {
      // Sem vídeo disponível agora: não trava a pessoa por falta de anúncio.
      onUnlocked();
    }
  }

  function handlePremium() {
    trackEvent("cta_click", userId, { source: "workout_tab_gate_premium", workout_key: workoutKey });
    router.push("/premium");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12">
          <PlayCircle className="h-5 w-5 text-primary" />
        </div>
        <p className="mb-1 text-base font-semibold text-white">Ver o {workoutLabel}?</p>
        <p className="mb-5 text-sm leading-5 text-white/56">
          Assista um vídeo curto e veja <strong className="text-white/80">todos os treinos da semana por 24 horas</strong>.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleWatch()}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {loading ? "Carregando vídeo..." : "Assistir vídeo e liberar"}
          </button>
          <button
            type="button"
            onClick={handlePremium}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-white/12 bg-white/[0.05] text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            <Crown className="h-4 w-4 text-yellow-300" />
            Premium: veja sempre, sem anúncios
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
          >
            Agora não
          </button>
        </div>
        {message ? <p className="mt-2 text-center text-xs leading-4 text-white/50">{message}</p> : null}
      </div>
    </div>
  );
}
