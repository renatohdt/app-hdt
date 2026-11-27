"use client";

import { Trophy, X } from "lucide-react";
import { avatarSrc } from "@/lib/avatar";
import type { Achievement } from "@/lib/achievements";
import { ShareButton } from "@/components/share-button";

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

        {/* Renato comemorando (sai pelo topo do card) com o selo do troféu */}
        <div className="relative mx-auto -mt-20 mb-3 w-[160px]">
          <img src={avatarSrc("bora")} alt="Renato comemorando" className="h-auto w-[160px]" />
          <span className="absolute -right-1 bottom-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#0d100d] bg-primary text-white shadow-lg">
            <Trophy className="h-5 w-5" strokeWidth={2.4} />
          </span>
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

        {/* Botão compartilhar */}
        <div className="mt-4">
          <ShareButton context="achievement" achievementTitle={achievement.title} />
        </div>

        {/* Botão fechar principal */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-[16px] bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 active:scale-[0.98]"
        >
          Valeu! 💪
        </button>
      </div>
    </div>
  );
}
