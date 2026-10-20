"use client";

// Convite para rever o nível no popup de "Treino concluído" (Renato, out/2026).
// Aparece quando o usuário diz que NÃO curtiu o treino e marca a intensidade
// como fácil/muito fácil ou difícil/muito difícil — sinal de que o nível pode
// estar errado. Leva direto a Perfil > Dados de Treino (campo "Nível").

import Link from "next/link";
import { Gauge } from "lucide-react";
import { trackEvent } from "@/lib/analytics-client";

export type LevelReviewHint = "easy" | "hard";

/** Rota que abre o Perfil já em "Dados de Treino". */
export const LEVEL_REVIEW_HREF = "/perfil?editar=treino";

/**
 * liked: resposta "Curti / Não muito" · intensity: 1 muito fácil … 5 muito difícil.
 * Só convida quando NÃO curtiu e a intensidade fugiu do "ótimo" (3).
 */
export function getLevelReviewHint(liked: boolean | null, intensity: number | null): LevelReviewHint | null {
  if (liked !== false || intensity === null) return null;
  if (intensity <= 2) return "easy";
  if (intensity >= 4) return "hard";
  return null;
}

const COPY: Record<LevelReviewHint, { title: string; text: string }> = {
  easy: {
    title: "Treino fácil demais?",
    text: "Talvez seu nível esteja abaixo do que você aguenta. Responda 6 perguntas rápidas e eu ajusto para um treino mais preciso."
  },
  hard: {
    title: "Treino pesado demais?",
    text: "Talvez seu nível esteja acima do momento atual. Responda 6 perguntas rápidas e eu ajusto para um treino mais preciso."
  }
};

export function LevelReviewCard({ hint, onNavigate }: { hint: LevelReviewHint; onNavigate: () => void }) {
  const copy = COPY[hint];
  return (
    <div className="rounded-[20px] border border-primary/25 bg-primary/[0.08] p-4 text-left">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Gauge className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{copy.title}</p>
          <p className="mt-1 text-[13px] leading-5 text-white/70">{copy.text}</p>
        </div>
      </div>
      <Link
        href={LEVEL_REVIEW_HREF}
        onClick={() => {
          trackEvent("cta_click", null, { source: `level_review_prompt_${hint}` });
          onNavigate();
        }}
        className="mt-3 flex h-11 w-full items-center justify-center rounded-[14px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
      >
        Rever meu nível
      </Link>
    </div>
  );
}
