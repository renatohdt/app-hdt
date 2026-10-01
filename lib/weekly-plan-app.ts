// Ponte entre a "Minha semana" e o resto do app (Home e tela de Treino):
// calcula o próximo treino pelo plano usando só os dados que essas telas já têm.

import { buildWeeklySchedule, getFeaturedWorkoutKey, type AppWorkoutData } from "@/lib/app-workout";
import { toLocalDateKey } from "@/lib/evolution";
import { buildWeeklyPlan, type PlannedDay } from "@/lib/weekly-plan";
import { normalizeWorkoutKey, type WorkoutSessionProgress } from "@/lib/workout-sessions";

export function getDefaultWeekdays(data: AppWorkoutData) {
  return buildWeeklySchedule(data)
    .filter((item) => !item.isRest)
    .map((item) => item.index);
}

export type PlannedNext = {
  workoutKey: string;
  dateKey: string;
  isToday: boolean;
  // Hoje é dia de descanso no plano (e a pessoa ainda não treinou hoje).
  todayIsRest: boolean;
};

/**
 * Próximo treino segundo a "Minha semana".
 * `sessionProgress` pode ser passado atualizado (ex.: logo após finalizar um treino).
 */
export function getPlannedNext(input: {
  data: AppWorkoutData;
  chosenDays?: number[] | null;
  sessionProgress?: WorkoutSessionProgress;
  now?: Date;
}): PlannedNext | null {
  const { data } = input;
  const progress = input.sessionProgress ?? data.sessionProgress;
  if (!data.workoutOrder.length || progress.cycleCompleted) return null;

  const now = input.now ?? new Date();
  const todayKey = toLocalDateKey(now);
  const lastKey = progress.lastCompletedWorkoutKey
    ? data.workoutOrder.find((k) => normalizeWorkoutKey(k) === normalizeWorkoutKey(progress.lastCompletedWorkoutKey)) ?? null
    : null;
  const lastDate = progress.lastCompletedAt ? new Date(progress.lastCompletedAt) : null;
  const lastDateKey = lastDate && !Number.isNaN(lastDate.getTime()) ? toLocalDateKey(lastDate) : null;

  const history = new Map<string, string>();
  if (lastKey && lastDateKey) history.set(lastDateKey, lastKey);

  const plan: PlannedDay[] = buildWeeklyPlan({
    chosenWeekdays: input.chosenDays ?? data.weeklyPlanDays ?? getDefaultWeekdays(data),
    workouts: data.workoutOrder.map((key) => ({
      key,
      focus: data.workouts[key]?.focus ?? null,
      splitType: data.workouts[key]?.splitType ?? null
    })),
    nextWorkoutKey: getFeaturedWorkoutKey(data.workoutOrder, progress.lastCompletedWorkoutKey),
    history,
    trainedToday: lastDateKey === todayKey,
    daysAhead: 21,
    now
  });

  const next = plan.find((day) => day.workoutKey);
  if (!next?.workoutKey) return null;
  const today = plan[0];
  return {
    workoutKey: next.workoutKey,
    dateKey: next.dateKey,
    isToday: next.dateKey === todayKey,
    todayIsRest: Boolean(today && today.dateKey === todayKey && !today.workoutKey && lastDateKey !== todayKey)
  };
}
