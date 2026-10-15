"use client";

// "Quadro de medalhas" da Home: as medalhas já conquistadas, os espaços das
// próximas (com cadeado) e a próxima medalha com a barra do que falta.
// Toque abre o modal "Suas medalhas" (o mesmo da Evolução).

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { ChevronRight, Dumbbell, Flame, Lock, Target, Trophy, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import {
  calcConsistencyStats,
  getAllAchievementsUnified,
  WEIGHT_MILESTONES,
  WORKOUT_MILESTONES,
  type AchievementCategory
} from "@/lib/achievements";
import type { AppWorkoutData } from "@/lib/app-workout";
import type { WorkoutSessionLogEntry } from "@/lib/workout-sessions";

const AchievementsModal = dynamic(() =>
  import("@/components/achievements-modal").then((m) => ({ default: m.AchievementsModal }))
);

const CATEGORY_STYLE: Record<AchievementCategory, { icon: LucideIcon; className: string }> = {
  workout: { icon: Trophy, className: "bg-premium/15 text-premium" },
  consistency: { icon: Flame, className: "bg-orange-400/15 text-orange-300" },
  weight: { icon: Dumbbell, className: "bg-primary/15 text-primary" },
  goal: { icon: Target, className: "bg-sky-400/15 text-sky-300" }
};

const SLOTS = 6;

export function MedalBoard({ data, sessionLogs }: { data: AppWorkoutData; sessionLogs: WorkoutSessionLogEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  // Consistência calculada com o histórico completo (igual à Evolução).
  const consistencyStats = useMemo(() => {
    const stats = calcConsistencyStats(
      sessionLogs,
      data.weeklyTarget,
      data.sessionProgress.completedSessions,
      data.sessionProgress.totalSessions
    );
    return { ...stats, planCompleted: stats.planCompleted || data.hasCompletedCycleBefore };
  }, [sessionLogs, data.weeklyTarget, data.sessionProgress, data.hasCompletedCycleBefore]);

  const { unlocked, total } = useMemo(() => {
    const all = getAllAchievementsUnified(
      data.totalWorkoutsAllTime,
      data.totalWeightIncreasesAllTime,
      consistencyStats,
      data.totalGoalsCompleted,
      data.referralAchievementUnlocked
    ).flatMap((group) => group.achievements);
    return { unlocked: all.filter((a) => a.unlocked), total: all.length };
  }, [data, consistencyStats]);

  const next = useMemo(
    () => getNextMedal(data.totalWorkoutsAllTime, data.totalWeightIncreasesAllTime),
    [data.totalWorkoutsAllTime, data.totalWeightIncreasesAllTime]
  );

  // Mais recentes primeiro (as últimas da lista são os marcos maiores).
  const shown = [...unlocked].reverse().slice(0, SLOTS);
  const lockedSlots = Math.max(SLOTS - shown.length, 0);

  return (
    <>
      <button type="button" onClick={() => setShowAll(true)} className="block w-full text-left">
        <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none transition hover:border-white/12 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">
              Quadro de medalhas
              <span className="ml-1.5 text-[12px] font-semibold normal-case tracking-normal text-white/50">
                · {unlocked.length} de {total}
              </span>
            </p>
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-white/45">
              Ver todas <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-1.5">
            {shown.map((medal) => {
              const style = CATEGORY_STYLE[medal.category];
              const Icon = style.icon;
              return (
                <span
                  key={medal.id}
                  title={medal.title}
                  className={clsx("flex h-11 w-11 items-center justify-center rounded-full", style.className)}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
              );
            })}
            {Array.from({ length: lockedSlots }, (_, i) => (
              <span
                key={`locked-${i}`}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/15 text-white/25"
              >
                <Lock className="h-4 w-4" aria-hidden />
              </span>
            ))}
          </div>

          {next ? (
            <div className="mt-3">
              <p className="text-[12px] text-white/55">
                Próxima: <span className="font-semibold text-white">{next.title}</span> · {next.remainingLabel}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-premium/80" style={{ width: `${next.pct}%` }} />
              </div>
            </div>
          ) : null}
        </Card>
      </button>

      {showAll ? (
        <AchievementsModal data={{ ...data, consistencyStats }} onClose={() => setShowAll(false)} />
      ) : null}
    </>
  );
}

// A medalha mensurável mais perto de sair (treinos ou aumentos de carga).
function getNextMedal(totalWorkouts: number, totalIncreases: number) {
  const candidates: Array<{ title: string; pct: number; remainingLabel: string }> = [];

  const nextWorkout = WORKOUT_MILESTONES.find((m) => totalWorkouts < m.milestone);
  if (nextWorkout) {
    const remaining = nextWorkout.milestone - totalWorkouts;
    candidates.push({
      title: nextWorkout.title,
      pct: Math.round((totalWorkouts / nextWorkout.milestone) * 100),
      remainingLabel: `faltam ${remaining} ${remaining === 1 ? "treino" : "treinos"}`
    });
  }

  // Carga só entra depois do 1º registro (antes disso a dica é treinar).
  const nextWeight = WEIGHT_MILESTONES.find((m) => totalIncreases < m.milestone);
  if (nextWeight && totalIncreases > 0) {
    const remaining = nextWeight.milestone - totalIncreases;
    candidates.push({
      title: nextWeight.title,
      pct: Math.round((totalIncreases / nextWeight.milestone) * 100),
      remainingLabel: `${remaining} ${remaining === 1 ? "aumento" : "aumentos"} de carga`
    });
  }

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.pct - a.pct)[0]!;
}
