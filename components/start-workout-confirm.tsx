"use client";

import { Play } from "lucide-react";

// "Vai começar o treino agora?" — aparece quando a pessoa marca uma série SEM ter
// tocado em "Iniciar treino". Evita que quem está só conhecendo o app comece um
// treino sem querer (que depois seria fechado e registrado automaticamente).
export function StartWorkoutConfirm({
  onConfirm,
  onExplore
}: {
  onConfirm: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 px-4 pb-8 sm:items-center sm:pb-0">
      <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#111] p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white">Vai começar o treino agora?</h3>
        <p className="mt-2 text-sm leading-6 text-white/62">
          Ao começar, contamos o tempo e o treino é registrado quando você finalizar.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-black"
          >
            <Play className="h-4 w-4 fill-current" />
            Sim, começar agora
          </button>
          <button
            type="button"
            onClick={onExplore}
            className="h-12 rounded-2xl border border-white/15 text-[15px] font-semibold text-white"
          >
            Não, só estou explorando
          </button>
        </div>
      </div>
    </div>
  );
}
