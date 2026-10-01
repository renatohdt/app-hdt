// "Minha semana" (Premium): distribui os treinos do programa nos dias que a
// pessoa escolheu, com regras simples de recuperação:
//  1. Só treina nos dias escolhidos (os outros são day off).
//  2. Depois de um treino de corpo inteiro (full body), o dia seguinte é day off.
//  3. Não repete o mesmo grupo muscular em dias seguidos (ex.: peito → costas).
//     Se o próximo da fila repetiria o grupo, puxa o seguinte que não repete;
//     se nenhum serve, o dia vira descanso.
//     Cada treino acontece 1x por rodada (A, B, C…) antes de repetir, para
//     nenhum treino ser feito com mais frequência que os outros.
//  4. Perdeu um dia? Nada se perde: a fila continua de onde parou, a partir de hoje.
// Funções puras (sem I/O) — usadas no cliente.

import { toLocalDateKey } from "@/lib/evolution";

export type PlanWorkoutInfo = {
  key: string;
  focus?: string | null;
  splitType?: string | null;
};

export type PlannedDay = {
  dateKey: string;
  weekday: number; // 0 = seg … 6 = dom
  workoutKey: string | null;
  // Por que não há treino num dia escolhido (para explicar na interface).
  restReason: "not_chosen" | "after_full_body" | "same_group" | null;
};

const MUSCLE_GROUP: Record<string, string> = {
  chest: "peito",
  back: "costas",
  lower_back: "costas",
  quadriceps: "pernas",
  hamstrings: "pernas",
  glutes: "pernas",
  calves: "pernas",
  legs: "pernas",
  shoulders: "ombros",
  biceps: "bracos",
  triceps: "bracos",
  arms: "bracos",
  abs: "core",
  core: "core",
  full_body: "full"
};

export function isFullBody(info?: PlanWorkoutInfo | null) {
  if (!info) return false;
  return info.focus === "full_body" || Boolean(info.splitType?.startsWith("full_body"));
}

export function muscleGroupOf(info?: PlanWorkoutInfo | null) {
  if (!info) return null;
  if (isFullBody(info)) return "full";
  const focus = (info.focus ?? "").toLowerCase();
  return MUSCLE_GROUP[focus] ?? (focus || null);
}

/**
 * Monta o plano dos próximos dias.
 * - `history`: treinos do programa já feitos (dateKey → workoutKey), usado para
 *   aplicar as regras no dia seguinte a um treino real (ex.: fez full body ontem).
 */
export function buildWeeklyPlan(input: {
  chosenWeekdays: number[];
  workouts: PlanWorkoutInfo[]; // na ordem do programa (A, B, C…)
  nextWorkoutKey: string | null;
  history: Map<string, string>;
  trainedToday: boolean;
  daysAhead?: number;
  now?: Date;
}): PlannedDay[] {
  const chosen = new Set(input.chosenWeekdays);
  const byKey = new Map(input.workouts.map((w) => [w.key, w]));
  const days = input.daysAhead ?? 62;
  const result: PlannedDay[] = [];
  if (!input.workouts.length) return result;

  // Rodada a partir do próximo treino da rotação. `pending` = o que falta nesta rodada.
  const startIndex = Math.max(input.workouts.findIndex((w) => w.key === input.nextWorkoutKey), 0);
  const rotation = [...input.workouts.slice(startIndex), ...input.workouts.slice(0, startIndex)].map((w) => w.key);
  let pending = [...rotation];

  const start = input.now ? new Date(input.now) : new Date();
  start.setHours(0, 0, 0, 0);

  // O que aconteceu no dia anterior ao primeiro dia planejado (treino real).
  const previous = new Date(start);
  previous.setDate(previous.getDate() - 1);
  let prevKey: string | null = input.history.get(toLocalDateKey(previous)) ?? null;

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateKey = toLocalDateKey(date);
    const weekday = (date.getDay() + 6) % 7;

    // Hoje já treinou: o dia conta como treino real para a regra de amanhã.
    if (i === 0 && input.trainedToday) {
      prevKey = input.history.get(dateKey) ?? prevKey;
      result.push({ dateKey, weekday, workoutKey: null, restReason: null });
      continue;
    }

    if (!chosen.has(weekday)) {
      result.push({ dateKey, weekday, workoutKey: null, restReason: "not_chosen" });
      prevKey = null;
      continue;
    }

    const prevInfo = prevKey ? byKey.get(prevKey) : undefined;
    if (prevInfo && isFullBody(prevInfo)) {
      result.push({ dateKey, weekday, workoutKey: null, restReason: "after_full_body" });
      prevKey = null;
      continue;
    }

    if (!pending.length) pending = [...rotation];
    const prevGroup = muscleGroupOf(prevInfo);
    const pickIndex = pending.findIndex((key) => !prevGroup || muscleGroupOf(byKey.get(key)) !== prevGroup);
    if (pickIndex < 0) {
      result.push({ dateKey, weekday, workoutKey: null, restReason: "same_group" });
      prevKey = null;
      continue;
    }

    const [picked] = pending.splice(pickIndex, 1);
    result.push({ dateKey, weekday, workoutKey: picked!, restReason: null });
    prevKey = picked!;
  }

  return result;
}

export function sanitizeWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = Array.from(new Set(value.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort();
  return days.length ? days : null;
}
