"use client";

import { X } from "lucide-react";
import { getAllAchievementsUnified } from "@/lib/achievements";
import type { AppWorkoutData } from "@/lib/app-workout";

const CATEGORY_ICONS: Record<string, string> = {
  "Volume de treinos": "🏆",
  "Consistência": "🔥",
  "Aumento de carga": "🏋️",
  "Metas pessoais": "🎯"
};

export function AchievementsModal({
  data,
  onClose
}: {
  data: AppWorkoutData;
  onClose: () => void;
}) {
  const groups = getAllAchievementsUnified(
    data.totalWorkoutsAllTime,
    data.totalWeightIncreasesAllTime,
    data.consistencyStats,
    data.totalGoalsCompleted
  );

  const totalAchievements = groups.reduce((sum, g) => sum + g.achievements.length, 0);
  const unlockedCount = groups.reduce((sum, g) => sum + g.achievements.filter((a) => a.unlocked).length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-[32px] border border-white/10 bg-[#0d100d] pb-8 pt-6 shadow-2xl sm:rounded-[32px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle de arraste (mobile) */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary/90">
              Conquistas
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-white">Suas medalhas</h2>
            <p className="mt-1 text-sm text-white/48">
              {unlockedCount} de {totalAchievements} desbloqueadas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/40 transition hover:bg-white/14 hover:text-white/70"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Barra de progresso geral */}
        <div className="mx-6 mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${totalAchievements > 0 ? Math.round((unlockedCount / totalAchievements) * 100) : 0}%` }}
          />
        </div>

        {/* Lista de conquistas */}
        <div className="mt-5 max-h-[60vh] space-y-5 overflow-y-auto px-6 pb-1">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Título do grupo */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">{CATEGORY_ICONS[group.label] ?? "🏅"}</span>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {group.label}
                </p>
                <div className="flex-1 border-t border-white/8" />
              </div>

              <div className="space-y-2">
                {group.achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={
                      achievement.unlocked
                        ? "flex items-start gap-3 rounded-[18px] border border-primary/20 bg-primary/[0.07] p-3.5"
                        : "flex items-start gap-3 rounded-[18px] border border-white/6 bg-white/[0.02] p-3.5 opacity-45"
                    }
                  >
                    {/* Ícone */}
                    <div
                      className={
                        achievement.unlocked
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/15 text-base"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/6 text-base"
                      }
                    >
                      {achievement.unlocked
                        ? (CATEGORY_ICONS[group.label] ?? "🏅")
                        : "🔒"}
                    </div>

                    {/* Textos */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-snug text-white">
                        {achievement.title}
                      </p>
                      {achievement.unlocked && achievement.phrase && (
                        <p className="mt-1 text-[11px] leading-[1.45] text-white/50">
                          &ldquo;{achievement.phrase}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Badge de desbloqueada */}
                    {achievement.unlocked && (
                      <span className="mt-0.5 shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        ✓
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
