"use client";

import { Button } from "@/components/ui";

/**
 * Aparece depois do "Treino concluído" quando o aluno marcou "Não gostei" no treino.
 * Recomenda montar um treino novo (abre o mesmo fluxo do "Gerar novo programa").
 * Mostrado 1 vez por programa (ver shouldShowDislikePopup).
 */
export function DislikeNewWorkoutPopup({ onCreate, onClose }: { onCreate: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#111] px-8 pb-8 pt-7 text-center shadow-2xl">
        <p className="text-lg font-bold text-white">Esse treino não agradou?</p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Sem problema. Posso montar um treino novo para você, com outros exercícios e ajustado à intensidade que você contou.
        </p>
        <Button onClick={onCreate} className="mt-6 w-full">
          Criar treino novo
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

const storageKey = (userId: string, programId: string) => `hdt:dislike-popup:${userId}:${programId}`;

/** true se o pop-up ainda não apareceu neste programa (e marca como mostrado). */
export function claimDislikePopup(userId: string, programId: string | null | undefined) {
  if (!programId || typeof window === "undefined") return true;
  try {
    const key = storageKey(userId, programId);
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, "1");
  } catch {
    // Sem armazenamento (aba anônima etc.): mostra mesmo assim.
  }
  return true;
}
