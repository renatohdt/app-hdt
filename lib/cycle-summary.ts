// Resumo do ciclo concluído — exibido na celebração de "Programa concluído".
// Tipos + funções puras (usadas no servidor em /api/workout/cycle-summary).

import {
  CONSISTENCY_MILESTONES,
  GOAL_MILESTONES,
  WEIGHT_MILESTONES,
  WORKOUT_MILESTONES,
  calcConsistencyStats,
  type Achievement,
  type AchievementCategory
} from "@/lib/achievements";
import { PHASE_LABELS, PHASE_ORDER, nextPhase, normalizeUserPhase, type UserPhase } from "@/lib/user-level";

export type CycleLevelStatus = "phased_up" | "max_level" | "almost_there" | "progressing";

export type CycleSummary = {
  // Exercícios distintos em que a carga máxima subiu durante o ciclo.
  exercisesWithLoadIncrease: number;
  level: {
    status: CycleLevelStatus;
    phase: UserPhase;
    phaseLabel: string;
    nextPhaseLabel: string | null;
    dotProgress: 0 | 1 | 2 | 3;
  };
  achievements: Array<{ id: string; title: string; phrase: string | null; category: AchievementCategory }>;
};

// ── Cargas ──────────────────────────────────────────────────────────────────

type WeightLogRow = { exercise_name_normalized: string; max_weight_kg: number; completed_at: string };

/**
 * Mesma regra do countWeightIncreases (nova carga máxima por exercício = 1 aumento),
 * separando o que aconteceu antes e depois do início do ciclo.
 */
export function summarizeWeightIncreases(rows: WeightLogRow[], cycleStartIso: string) {
  const cycleStart = new Date(cycleStartIso).getTime();
  const sorted = [...rows].sort((a, b) =>
    a.exercise_name_normalized === b.exercise_name_normalized
      ? new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
      : a.exercise_name_normalized.localeCompare(b.exercise_name_normalized)
  );
  const lastMax: Record<string, number> = {};
  const increasedInCycle = new Set<string>();
  let before = 0;
  let total = 0;

  for (const row of sorted) {
    const key = row.exercise_name_normalized;
    const weight = Number(row.max_weight_kg) || 0;
    if (key in lastMax && weight > (lastMax[key] ?? 0)) {
      total++;
      if (new Date(row.completed_at).getTime() < cycleStart) before++;
      else increasedInCycle.add(key);
    }
    lastMax[key] = Math.max(lastMax[key] ?? 0, weight);
  }

  return { before, total, exercisesIncreasedInCycle: increasedInCycle.size };
}

// ── Nível ───────────────────────────────────────────────────────────────────

export function buildCycleLevel(input: {
  currentPhase: string;
  dotProgress: 0 | 1 | 2 | 3;
  isReadyButWaiting: boolean;
  // Fase registrada quando o ciclo começou (ausente em ciclos antigos).
  cycleStartPhase?: string | null;
}): CycleSummary["level"] {
  const phase = normalizeUserPhase(input.currentPhase);
  const next = nextPhase(phase);
  const startPhase = input.cycleStartPhase ? normalizeUserPhase(input.cycleStartPhase) : null;
  const phasedUp = startPhase !== null && PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(startPhase);

  const status: CycleLevelStatus = phasedUp
    ? "phased_up"
    : !next
      ? "max_level"
      : input.isReadyButWaiting
        ? "almost_there"
        : "progressing";

  return {
    status,
    phase,
    phaseLabel: PHASE_LABELS[phase],
    nextPhaseLabel: next ? PHASE_LABELS[next] : null,
    dotProgress: input.dotProgress
  };
}

// ── Conquistas ──────────────────────────────────────────────────────────────

function crossed(list: Achievement[], before: number, now: number) {
  return list.filter((a) => before < a.milestone && now >= a.milestone);
}

/**
 * Conquistas cujo marco foi cruzado DURANTE o ciclo (antes do início → agora).
 */
export function findAchievementsUnlockedInCycle(input: {
  cycleStartIso: string;
  sessionDates: string[];
  weeklyTarget: number;
  weightIncreasesBefore: number;
  weightIncreasesTotal: number;
  goalsCompletedBefore: number;
  goalsCompletedTotal: number;
  // Primeiro ciclo concluído da pessoa → "Plano Concluído" é novidade.
  isFirstCompletedCycle: boolean;
}): CycleSummary["achievements"] {
  const cycleStart = new Date(input.cycleStartIso).getTime();
  const allLogs = input.sessionDates.map((completedAt) => ({ completedAt }));
  const beforeLogs = allLogs.filter((l) => new Date(l.completedAt).getTime() < cycleStart);

  const unlocked: Achievement[] = [
    ...crossed(WORKOUT_MILESTONES, beforeLogs.length, allLogs.length),
    ...crossed(WEIGHT_MILESTONES, input.weightIncreasesBefore, input.weightIncreasesTotal),
    ...crossed(GOAL_MILESTONES, input.goalsCompletedBefore, input.goalsCompletedTotal)
  ];

  const statsBefore = calcConsistencyStats(beforeLogs, input.weeklyTarget, 0, 0);
  const statsNow = calcConsistencyStats(allLogs, input.weeklyTarget, 0, 0);
  const byId = (id: string) => CONSISTENCY_MILESTONES.find((a) => a.id === id);
  const push = (id: string, condition: boolean) => {
    const a = byId(id);
    if (a && condition) unlocked.push(a);
  };
  push("perfect_week", !statsBefore.hasPerfectWeek && statsNow.hasPerfectWeek);
  push("streak_7", !statsBefore.hasStreak7Days && statsNow.hasStreak7Days);
  push("monthly_20", statsBefore.maxWorkoutsInMonth < 20 && statsNow.maxWorkoutsInMonth >= 20);
  push("plan_completed", input.isFirstCompletedCycle);

  return unlocked.map((a) => ({ id: a.id, title: a.title, phrase: a.phrase ?? null, category: a.category }));
}
