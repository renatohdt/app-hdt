"use client";

import { X } from "lucide-react";
import type { Achievement } from "@/lib/achievements";

export function AchievementPopup({
  achievement,
  onClose
}: {
  achievement: Achievement;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-[28px] border border-primary/20 bg-[#0d100d] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-white/30 transition hover:text-white/60"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Troféu */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-4xl">
            🏆
          </div>
        </div>

        {/* Texto */}
        <div className="text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary/80">
            Conquista desbloqueada
          </p>
          <h2 className="mt-2 text-xl font-bold leading-tight text-white">
            {achievement.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            {achievement.description}
          </p>
        </div>

        {/* Botão */}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[16px] bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 active:scale-[0.98]"
        >
          Valeu! 💪
        </button>
      </div>
    </div>
  );
}
