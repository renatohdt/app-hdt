"use client";

import { Button } from "@/components/ui";

// "Você já treinou hoje!" — regra de 1 treino por dia (programa ou extra).
// Usado na tela de treino e no Treino Extra.
export function AlreadyTrainedTodayPopup({
  onClose,
  onOpenExtra,
  showExtraOption
}: {
  onClose: () => void;
  onOpenExtra?: () => void;
  showExtraOption: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#111] px-8 pb-8 pt-7 text-center shadow-2xl">
        <p className="text-4xl">💪</p>
        <p className="mt-4 text-lg font-bold text-white">Você já treinou hoje!</p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Seu programa conta 1 treino por dia, em qualquer local. Agora é descansar e voltar amanhã: a recuperação também faz parte do treino.
        </p>
        {showExtraOption ? (
          <p className="mt-3 text-xs leading-relaxed text-white/50">
            Ainda com energia? Faça um Treino Extra. Ele fica registrado, mas não altera a sequência do seu programa.
          </p>
        ) : null}
        <Button onClick={onClose} className="mt-6 w-full">
          Entendi
        </Button>
        {showExtraOption ? (
          <button
            type="button"
            onClick={onOpenExtra}
            className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-yellow-300/90 transition hover:text-yellow-200"
          >
            ⚡ Fazer um Treino Extra
          </button>
        ) : null}
      </div>
    </div>
  );
}
