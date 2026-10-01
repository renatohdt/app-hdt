// Cálculos da página Evolução (/calendario) — funções puras, usadas no cliente.

import { MIN_PHASE_MONTHS, nextPhase, PHASE_LABELS, XP_THRESHOLD, normalizeUserPhase } from "@/lib/user-level";

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── Semana ──────────────────────────────────────────────────────────────────

// Chave da semana começando no DOMINGO (padrão brasileiro): data do domingo.
function sundayWeekKey(date: Date) {
  const sunday = new Date(date);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return toLocalDateKey(sunday);
}

/**
 * Progresso da semana atual (dom–sáb) e sequência de semanas perfeitas
 * (semanas seguidas, terminando na atual ou na anterior, com treinos >= meta).
 */
export function buildWeekProgress(sessionDates: Date[], weeklyTarget: number, now = new Date()) {
  const target = Math.max(1, weeklyTarget || 3);
  const perWeek = new Map<string, number>();
  const trainingDays = new Set<string>();
  for (const date of sessionDates) {
    // Conta no máximo 1 treino por dia (treino extra no mesmo dia não infla a semana).
    const dayKey = toLocalDateKey(date);
    if (trainingDays.has(dayKey)) continue;
    trainingDays.add(dayKey);
    const key = sundayWeekKey(date);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }

  const currentKey = sundayWeekKey(now);
  const done = perWeek.get(currentKey) ?? 0;

  let streak = done >= target ? 1 : 0;
  const cursor = new Date(now);
  for (let i = 0; i < 104; i++) {
    cursor.setDate(cursor.getDate() - 7);
    if ((perWeek.get(sundayWeekKey(cursor)) ?? 0) >= target) streak++;
    else break;
  }

  let perfectWeeks = 0;
  for (const count of perWeek.values()) if (count >= target) perfectWeeks++;

  return { done, target, remaining: Math.max(target - done, 0), perfectStreak: streak, perfectWeeks };
}

// ── Sugestão dos próximos treinos ───────────────────────────────────────────

/**
 * Sugere os próximos treinos a partir de hoje: usa os dias da semana do plano
 * (distribuição padrão pela frequência) e segue a ordem A → B → C a partir do
 * próximo treino em destaque. Dias passados nunca recebem sugestão.
 */
export function buildSuggestedDays(input: {
  activeWeekdays: number[]; // 0 = seg … 6 = dom
  workoutOrder: string[];
  nextWorkoutKey: string | null;
  trainedToday: boolean;
  daysAhead?: number;
  now?: Date;
}) {
  const result = new Map<string, string>();
  const order = input.workoutOrder;
  if (!order.length || !input.activeWeekdays.length) return result;

  let cursorIndex = Math.max(order.indexOf(input.nextWorkoutKey ?? ""), 0);
  const start = input.now ? new Date(input.now) : new Date();
  start.setHours(0, 0, 0, 0);
  if (input.trainedToday) start.setDate(start.getDate() + 1);

  const days = input.daysAhead ?? 62;
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekday = (date.getDay() + 6) % 7;
    if (!input.activeWeekdays.includes(weekday)) continue;
    result.set(toLocalDateKey(date), order[cursorIndex % order.length]!);
    cursorIndex++;
  }
  return result;
}

// ── Nível ───────────────────────────────────────────────────────────────────

export function buildLevelProgress(level: {
  xpPoints: number;
  currentPhase: string;
  phaseStartedAt: string;
  dotProgress: number;
  isReadyButWaiting: boolean;
} | null) {
  if (!level) return null;
  const phase = normalizeUserPhase(level.currentPhase);
  const next = nextPhase(phase);
  const startedAt = new Date(level.phaseStartedAt);
  const now = new Date();
  const monthsInPhase = Number.isNaN(startedAt.getTime())
    ? 0
    : Math.max(0, (now.getFullYear() - startedAt.getFullYear()) * 12 + (now.getMonth() - startedAt.getMonth()) - (now.getDate() < startedAt.getDate() ? 1 : 0));

  return {
    phaseLabel: PHASE_LABELS[phase],
    nextPhaseLabel: next ? PHASE_LABELS[next] : null,
    isMaxLevel: !next,
    dotProgress: Math.max(0, Math.min(3, level.dotProgress)),
    isReadyButWaiting: level.isReadyButWaiting,
    pointsPct: Math.min(100, Math.round((Math.max(0, level.xpPoints) / XP_THRESHOLD) * 100)),
    monthsInPhase: Math.min(monthsInPhase, MIN_PHASE_MONTHS),
    monthsRequired: MIN_PHASE_MONTHS,
    timePct: Math.min(100, Math.round((monthsInPhase / MIN_PHASE_MONTHS) * 100))
  };
}
