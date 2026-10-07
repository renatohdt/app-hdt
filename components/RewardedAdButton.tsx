"use client";

import { useEffect, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { useConsentPreferences } from "@/components/consent-provider";
import { isAdMobAvailable, preloadRewardedAd, showRewardedAd } from "@/lib/admob";

/** Hook: o app tem AdMob (anúncio com recompensa disponível)? Começa false (SSR). */
export function useAdMobAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(isAdMobAvailable()), []);
  return available;
}

/**
 * Botão "Assistir um vídeo e ..." (anúncio com recompensa do AdMob).
 * Só aparece no app com o plugin do AdMob. Chama `onRewarded` quando a pessoa
 * assiste até o fim. Se não houver vídeo disponível, mostra um aviso.
 */
export function RewardedAdButton({
  purpose,
  label,
  onRewarded,
  className
}: {
  purpose: string;
  label: string;
  onRewarded: () => void;
  className?: string;
}) {
  const available = useAdMobAvailable();
  const { preferences } = useConsentPreferences();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Começa a baixar o vídeo assim que o botão aparece.
  useEffect(() => {
    if (available) void preloadRewardedAd(preferences.ads);
  }, [available, preferences.ads]);

  if (!available) return null;

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    const result = await showRewardedAd(purpose, preferences.ads);
    setLoading(false);

    if (result === "rewarded") {
      onRewarded();
    } else if (result === "dismissed") {
      setMessage("Assista o vídeo até o fim para liberar.");
    } else {
      setMessage("Nenhum vídeo disponível agora. Tente de novo em alguns minutos.");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-white/12 bg-white/[0.05] text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-primary" />}
        {loading ? "Carregando vídeo..." : label}
      </button>
      {message ? <p className="mt-2 text-center text-xs leading-4 text-white/50">{message}</p> : null}
    </div>
  );
}
