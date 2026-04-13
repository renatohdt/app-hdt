import type { Goal, QuizAnswers, WorkoutPlan } from "@/lib/types";

export type WorkoutSessionStatus = "not_started" | "completed";

export type WorkoutSessionLogEntry = {
  id: string;
  workoutId: string;
  workoutKey: string | null;
  sessionNumber: number;
  status: WorkoutSessionStatus;
  completedAt: string;
  createdAt?: string | null;
};

export type WorkoutSessionProgress = {
  totalSessions: number;
  completedSessions: number;
  currentSessionNumber: number;
  remainingSessions: number;
  progressPercentage: number;
  status: WorkoutSessionStatus;
  cycleCompleted: boolean;
  lastCompletedAt: string | null;
  lastCompletedWorkoutKey: string | null;
  lastCompletedSessionNumber: number | null;
};

export type WorkoutExperienceBand = "beginner" | "intermediate" | "advanced";

export type WorkoutPlanSessionConfig = {
  weeklyFrequency: number;
  experienceBand: WorkoutExperienceBand;
  blockDurationWeeks: number;
  totalSessions: number;
  sessionStrategyReason: string;
  planCycleId: string | null;
};

const MIN_TOTAL_SESSIONS = 8;
const MAX_TOTAL_SESSIONS = 24;

export function calculateWorkoutTotalSessions(input: {
  daysPerWeek?: number | null;
  fallbackWeeklyFrequency?: number | null;
  blockDurationWeeks?: number | null;
  goal?: Goal | null;
  experience?: QuizAnswers["experience"] | null;
}) {
  const weeklyFrequency = resolveWeeklyFrequency(input.daysPerWeek, input.fallbackWeeklyFrequency);
  const blockDurationWeeks =
    clampBlockDurationWeeks(input.blockDurationWeeks, 0) ||
    determineWorkoutBlockDurationWeeks({
      weeklyFrequency,
      goal: input.goal,
      experience: input.experience
    });

  return clampTotalSessions(weeklyFrequency * blockDurationWeeks);
}

export function determineWorkoutBlockDurationWeeks(input: {
  weeklyFrequency?: number | null;
  goal?: Goal | null;
  experience?: QuizAnswers["experience"] | null;
}) {
  const weeklyFrequency = resolveWeeklyFrequency(input.weeklyFrequency, 1);
  const experienceBand = resolveWorkoutExperienceBand(input.experience);
  const range = getBlockDurationRange(experienceBand);
  const frequencyBucket = weeklyFrequency <= 2 ? 0 : weeklyFrequency >= 5 ? 2 : 1;
  const baseWeeksByBand: Record<WorkoutExperienceBand, [number, number, number]> = {
    beginner: [6, 5, 4],
    intermediate: [5, 4, 3],
    advanced: [4, 3, 2]
  };
  const goalDelta = getGoalAdjustment(input.goal, weeklyFrequency);
  const baseWeeks = baseWeeksByBand[experienceBand][frequencyBucket] ?? range.max;

  return Math.min(Math.max(baseWeeks + goalDelta, range.min), range.max);
}

export function resolveWorkoutPlanSessionConfig(input: {
  answers?: Partial<QuizAnswers> | null;
  workout?: Partial<WorkoutPlan> | null;
  storedTotalSessions?: number | null;
  fallbackWeeklyFrequency?: number | null;
}) {
  const weeklyFrequency = resolveWeeklyFrequency(input.answers?.days, input.fallbackWeeklyFrequency);
  const experienceBand = resolveWorkoutExperienceBand(input.answers?.experience);
  const persistedBlockDurationWeeks = readWorkoutPlanNumberField(input.workout, "blockDurationWeeks");
  const persistedTotalSessions =
    clampPositiveInteger(input.storedTotalSessions, 0) || readWorkoutPlanNumberField(input.workout, "totalSessions");
  const persistedSessionStrategyReason = readWorkoutPlanTextField(input.workout, "sessionStrategyReason");
  const planCycleId = normalizePlanCycleId(readWorkoutPlanTextField(input.workout, "planCycleId"));

  if (persistedBlockDurationWeeks > 0 && persistedTotalSessions > 0) {
    return {
      weeklyFrequency,
      experienceBand,
      blockDurationWeeks: persistedBlockDurationWeeks,
      totalSessions: persistedTotalSessions,
      sessionStrategyReason:
        persistedSessionStrategyReason ||
        buildWorkoutSessionStrategyReason({
          weeklyFrequency,
          experienceBand,
          goal: input.answers?.goal,
          blockDurationWeeks: persistedBlockDurationWeeks,
          totalSessions: persistedTotalSessions
        }),
      planCycleId
    } satisfies WorkoutPlanSessionConfig;
  }

  const blockDurationWeeks = determineWorkoutBlockDurationWeeks({
    weeklyFrequency,
    goal: input.answers?.goal,
    experience: input.answers?.experience
  });
  const totalSessions = clampTotalSessions(weeklyFrequency * blockDurationWeeks);

  return {
    weeklyFrequency,
    experienceBand,
    blockDurationWeeks,
    totalSessions,
    sessionStrategyReason: buildWorkoutSessionStrategyReason({
      weeklyFrequency,
      experienceBand,
      goal: input.answers?.goal,
      blockDurationWeeks,
      totalSessions
    }),
    planCycleId
  } satisfies WorkoutPlanSessionConfig;
}

export function applyWorkoutPlanSessionConfig(
  workout: WorkoutPlan,
  config: Pick<WorkoutPlanSessionConfig, "blockDurationWeeks" | "totalSessions" | "sessionStrategyReason" | "planCycleId">
) {
  return {
    ...workout,
    blockDurationWeeks: config.blockDurationWeeks,
    totalSessions: config.totalSessions,
    sessionStrategyReason: config.sessionStrategyReason,
    planCycleId: config.planCycleId ?? null
  } satisfies WorkoutPlan;
}

export function hasWorkoutPlanSessionConfig(
  workout: Partial<WorkoutPlan> | null | undefined,
  config: Pick<WorkoutPlanSessionConfig, "blockDurationWeeks" | "totalSessions" | "sessionStrategyReason" | "planCycleId">
) {
  return (
    readWorkoutPlanNumberField(workout, "blockDurationWeeks") === config.blockDurationWeeks &&
    readWorkoutPlanNumberField(workout, "totalSessions") === config.totalSessions &&
    readWorkoutPlanTextField(workout, "sessionStrategyReason") === config.sessionStrategyReason &&
    normalizePlanCycleId(readWorkoutPlanTextField(workout, "planCycleId")) === (config.planCycleId ?? null)
  );
}

export function buildWorkoutSessionProgress(input: {
  totalSessions?: number | null;
  completedSessions?: number | null;
  lastCompletedAt?: string | null;
  lastCompletedWorkoutKey?: string | null;
  lastCompletedSessionNumber?: number | null;
}): WorkoutSessionProgress {
  const totalSessions = Math.max(clampPositiveInteger(input.totalSessions, MIN_TOTAL_SESSIONS), 1);
  const completedSessions = Math.min(clampPositiveInteger(input.completedSessions, 0), totalSessions);
  const cycleCompleted = completedSessions >= totalSessions;
  const currentSessionNumber = cycleCompleted ? totalSessions : completedSessions + 1;

  return {
    totalSessions,
    completedSessions,
    currentSessionNumber,
    remainingSessions: Math.max(totalSessions - completedSessions, 0),
    progressPercentage: Math.round((completedSessions / totalSessions) * 100),
    status: completedSessions > 0 ? "completed" : "not_started",
    cycleCompleted,
    lastCompletedAt: input.lastCompletedAt ?? null,
    lastCompletedWorkoutKey: input.lastCompletedWorkoutKey ?? null,
    lastCompletedSessionNumber: input.lastCompletedSessionNumber ?? null
  };
}

export function normalizeWorkoutKey(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/treino\s+([a-z0-9]+)/i);
  if (match?.[1]) {
    return match[1].toUpperCase();
  }

  return raw.replace(/^treino\s+/i, "").trim().toUpperCase();
}

export function normalizePlanCycleId(value?: string | null) {
  const raw = value?.trim();
  return raw ? raw : null;
}

export function resolveWorkoutExperienceBand(experience?: QuizAnswers["experience"] | string | null): WorkoutExperienceBand {
  if (experience === "6_to_12_months") {
    return "intermediate";
  }

  if (experience === "gt_1_year") {
    return "advanced";
  }

  return "beginner";
}

function getBlockDurationRange(experienceBand: WorkoutExperienceBand) {
  const ranges: Record<WorkoutExperienceBand, { min: number; max: number }> = {
    beginner: { min: 4, max: 6 },
    intermediate: { min: 3, max: 5 },
    advanced: { min: 2, max: 4 }
  };

  return ranges[experienceBand];
}

function buildWorkoutSessionStrategyReason(input: {
  weeklyFrequency: number;
  experienceBand: WorkoutExperienceBand;
  goal?: Goal | null;
  blockDurationWeeks: number;
  totalSessions: number;
}) {
  const rawTotalSessions = input.weeklyFrequency * input.blockDurationWeeks;
  const limitApplied = rawTotalSessions !== input.totalSessions;
  const limitReason =
    input.totalSessions === MIN_TOTAL_SESSIONS
      ? `, ajustado para ${MIN_TOTAL_SESSIONS} pelo mínimo de sessões`
      : `, ajustado para ${MAX_TOTAL_SESSIONS} pelo máximo de sessões`;

  return `Frequência semanal de ${input.weeklyFrequency} treino(s), nível ${formatExperienceBandLabel(input.experienceBand)} e objetivo ${formatGoalLabel(input.goal)} definem bloco de ${input.blockDurationWeeks} semana(s). Total do plano: ${input.weeklyFrequency} x ${input.blockDurationWeeks} = ${rawTotalSessions}${limitApplied ? limitReason : ""}.`;
}

function formatExperienceBandLabel(value: WorkoutExperienceBand) {
  if (value === "intermediate") return "intermediário";
  if (value === "advanced") return "avançado";
  return "iniciante";
}

function formatGoalLabel(value?: Goal | null) {
  if (value === "gain_muscle") return "hipertrofia";
  if (value === "body_recomposition") return "recomposição corporal";
  if (value === "improve_conditioning") return "condicionamento";
  return "emagrecimento";
}

function getGoalAdjustment(goal: Goal | null | undefined, weeklyFrequency: number) {
  if (goal === "gain_muscle" && weeklyFrequency <= 3) {
    return 1;
  }

  if (goal === "improve_conditioning" && weeklyFrequency >= 4) {
    return -1;
  }

  if (goal === "lose_weight" && weeklyFrequency >= 5) {
    return -1;
  }

  return 0;
}

function resolveWeeklyFrequency(daysPerWeek: number | null | undefined, fallbackWeeklyFrequency: number | null | undefined) {
  const preferred = clampPositiveInteger(daysPerWeek, 0);
  if (preferred > 0) {
    return Math.min(preferred, 7);
  }

  const fallback = clampPositiveInteger(fallbackWeeklyFrequency, 1);
  return Math.min(Math.max(fallback, 1), 7);
}

function clampTotalSessions(value: number) {
  return Math.min(Math.max(Math.round(value), MIN_TOTAL_SESSIONS), MAX_TOTAL_SESSIONS);
}

function clampBlockDurationWeeks(value: number | null | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function clampPositiveInteger(value: number | null | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function readWorkoutPlanNumberField(workout: Partial<WorkoutPlan> | null | undefined, field: "blockDurationWeeks" | "totalSessions") {
  const value = workout?.[field];
  return clampPositiveInteger(typeof value === "number" ? value : Number(value), 0);
}

function readWorkoutPlanTextField(
  workout: Partial<WorkoutPlan> | null | undefined,
  field: "sessionStrategyReason" | "planCycleId"
) {
  const value = workout?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
