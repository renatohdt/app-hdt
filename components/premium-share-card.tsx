"use client";

// Card "Compartilhe a Hora do Treino com seus amigos!" — fica no Dashboard e só aparece para o
// plano PREMIUM (no lugar do "Indique e Ganhe", que é só para o free).
// Sem cupom nem link especial: o link passa pela rota /go com m=premium,
// que marca utm_medium=premium_share para identificarmos a origem.

import { Card } from "@/components/ui";
import { ShareButton } from "@/components/share-button";

const PREMIUM_SHARE_TEXT = "Tô treinando com a Hora do Treino, monta seu treino você também!";

export function PremiumShareCard() {
  return (
    <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none sm:p-4">
      <p className="text-[13px] font-semibold leading-snug text-white">Compartilhe a Hora do Treino com seus amigos!</p>
      <div className="mt-3">
        <ShareButton context="workout" medium="premium" customText={PREMIUM_SHARE_TEXT} />
      </div>
    </Card>
  );
}
