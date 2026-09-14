"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui";
import { openStoreReview, useCanShowStoreButton } from "@/lib/app-review";

/**
 * Card "Avalie o app" na tela de perfil.
 *
 * Aparece só quando dá pra avaliar na plataforma atual:
 *  - Android: sempre (app publicado na Play Store)
 *  - iOS: só quando o app estiver publicado (controlado em lib/app-review.ts)
 *  - Navegador: não aparece
 *
 * Ao tocar, abre a página da loja para avaliar.
 */
export function RateAppCard() {
  const canShow = useCanShowStoreButton();
  const [opening, setOpening] = useState(false);

  if (!canShow) return null;

  async function handleClick() {
    if (opening) return;
    setOpening(true);
    try {
      await openStoreReview();
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
          <Star className="h-5 w-5 text-primary" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Avalie o app
        </p>
      </div>
      <p className="text-[13px] leading-5 text-white/62">
        Curtindo os treinos? Sua avaliação na loja ajuda demais o Hora do Treino
        a crescer — leva menos de 30 segundos.
      </p>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={opening}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:text-primary/80 disabled:opacity-50"
      >
        {opening ? "Abrindo a loja..." : "Avaliar agora ⭐"}
      </button>
    </Card>
  );
}
