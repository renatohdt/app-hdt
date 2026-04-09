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
  lastCompletedAt: string | null;
  lastCompletedWorkoutKey: string | null;
  lastCompletedSessionNumber: number | null;
};

const SESSION_CYCLE_FACTOR = 4.4;

export function calculateWorkoutTotalSessions(input: {
  daysPerWeek?: number | null;
  distinctWorkoutCount?: number | null;
}) {
  const weeklySessions = Math.max(
    clampPositiveInteger(input.daysPerWeek, 0),
    clampPositiveInteger(input.distinctWorkoutCount, 0),
    1
  );

  return Math.max(weeklySessions, Math.round(weeklySessions * SESSION_CYCLE_FACTOR));
}

export function buildWorkoutSessionProgress(input: {
  totalSessions?: number | null;
  completedSessions?: number | null;
  lastCompletedAt?: string | null;
  lastCompletedWorkoutKey?: string | null;
  lastCompletedSessionNumber?: number | null;
}): WorkoutSessionProgress {
  const totalSessions = Math.max(clampPositiveInteger(input.totalSessions, 1), 1);
  const completedSessions = Math.min(clampPositiveInteger(input.completedSessions, 0), totalSessions);
  const currentSessionNumber = completedSessions >= totalSessions ? totalSessions : completedSessions + 1;

  return {
    totalSessions,
    completedSessions,
    currentSessionNumber,
    remainingSessions: Math.max(totalSessions - completedSessions, 0),
    progressPercentage: Math.round((completedSessions / totalSessions) * 100),
    status: completedSessions > 0 ? "completed" : "not_started",
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

function clampPositiveInteger(value: number | null | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed);
}
