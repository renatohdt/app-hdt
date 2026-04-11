import { formatBodyTypeLabel } from "@/lib/body-type";
import { formatExerciseMuscleLabel } from "@/lib/exercise-library";
import { buildWorkoutSectionItems, flattenWorkoutSectionItems } from "@/lib/workout-section-items";
import {
  buildWorkoutSessionProgress,
  normalizeWorkoutKey,
  type WorkoutSessionLogEntry,
  type WorkoutSessionProgress
} from "@/lib/workout-sessions";
import { formatBlockTypeLabel, formatSplitTypeLabel, normalizeBlockType } from "@/lib/workout-strategy";
import type { Goal, WorkoutPlan, WorkoutSection } from "@/lib/types";

type AppWorkoutAnswers = {
  goal?: Goal;
  wrist?: string;
  body_type_raw?: string;
  body_type?: string;
  gender?: string;
  age?: number;
  weight?: number;
  height?: number;
  profession?: string;
  location?: string;
  equipment?: string[];
  time?: number;
  days?: number;
  experience?: string;
};

export type AppWorkoutPayload = {
  hasWorkout?: boolean;
  user: { id: string; name: string };
  answers: AppWorkoutAnswers;
  workout: WorkoutPlan | null;
  sessionProgress?: WorkoutSessionProgress | null;
  sessionLogs?: WorkoutSessionLogEntry[] | null;
};

export type AppWorkoutData = {
  raw: AppWorkoutPayload;
  user: {
    id: string;
    name: string;
    firstName: string;
    goal?: Goal;
    level?: string;
    bodyType?: string;
    location?: string;
  };
  answers: AppWorkoutAnswers;
  workouts: Record<string, WorkoutSection & { day: string }>;
  workoutOrder: string[];
  plan: {
    splitType?: string;
    splitLabel: string;
    rationale?: string | null;
    progressionNotes?: string | null;
    sessionCount: number;
  };
  sessionProgress: WorkoutSessionProgress;
  sessionLogs: WorkoutSessionLogEntry[];
  weeklyTarget: number;
  averageDurationMinutes: number;
  estimatedWeeklyMinutes: number;
  totalExercises: number;
};

export type TrainingExerciseRow = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  technique: string | null;
  blockType: string | null;
  blockOrder: string | null;
  eyebrow: string;
  note: string | null;
  videoUrl: string | null;
  isMobility: boolean;
  muscles: string[];
  plannedSetsCount: number | null;
  plannedRepsLabel: string;
  plannedRestSeconds: number | null;
  mediaDurationLabel: string | null;
};

export type WeeklyScheduleItem = {
  index: number;
  dayLabel: string;
  shortLabel: string;
  isRest: boolean;
  workoutKey: string | null;
  workoutLabel: string | null;
  note: string;
};

const WEEK_DAYS = [
  { label: "Segunda", shortLabel: "Seg" },
  { label: "Terça", shortLabel: "Ter" },
  { label: "Quarta", shortLabel: "Qua" },
  { label: "Quinta", shortLabel: "Qui" },
  { label: "Sexta", shortLabel: "Sex" },
  { label: "Sábado", shortLabel: "Sáb" },
  { label: "Domingo", shortLabel: "Dom" }
] as const;

const WEEKDAY_DISTRIBUTION: Record<number, number[]> = {
  1: [1],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 4, 5],
  5: [0, 1, 3, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6]
};

export function buildAppWorkoutData(payload: AppWorkoutPayload | null) {
  if (!payload?.workout || payload.hasWorkout === false) {
    return null;
  }

  const sections = Array.isArray(payload.workout.sections) && payload.workout.sections.length
    ? payload.workout.sections
    : buildFallbackSections(payload.workout);
  const workouts: Record<string, WorkoutSection & { day: string }> = {};

  sections.forEach((section) => {
    const day = extractWorkoutDay(section.title);
    workouts[day] = {
      day,
      ...section
    };
  });

  const userName = normalizeUserName(payload.user?.name);
  const firstName = userName.split(/\s+/)[0] || userName;
  const workoutOrder = Object.keys(workouts);
  const weeklyTarget = clampNumber(payload.answers?.days, Math.max(workoutOrder.length, 1), 1, 7);
  const totalExercises = sections.reduce((total, section) => total + buildTrainingExerciseRows(section).length, 0);
  const averageDurationMinutes = getAverageDurationMinutes(sections, payload.workout.estimatedDurationMinutes);
  const sessionCount = payload.workout.sessionCount ?? sections.length;
  const fallbackTotalSessions = Math.max(sessionCount, weeklyTarget, 1);
  const sessionProgress = buildWorkoutSessionProgress({
    totalSessions: payload.sessionProgress?.totalSessions ?? fallbackTotalSessions,
    completedSessions: payload.sessionProgress?.completedSessions ?? 0,
    lastCompletedAt: payload.sessionProgress?.lastCompletedAt ?? null,
    lastCompletedWorkoutKey: payload.sessionProgress?.lastCompletedWorkoutKey ?? null,
    lastCompletedSessionNumber: payload.sessionProgress?.lastCompletedSessionNumber ?? null
  });
  const sessionLogs = normalizeWorkoutSessionLogs(payload.sessionLogs);

  return {
    raw: payload,
    user: {
      id: payload.user.id,
      name: userName,
      firstName,
      goal: payload.answers.goal,
      level: payload.answers.experience,
      bodyType: payload.answers.body_type ?? payload.answers.body_type_raw ?? payload.answers.wrist,
      location: payload.answers.location
    },
    answers: payload.answers,
    workouts,
    workoutOrder,
    plan: {
      splitType: payload.workout.splitType,
      splitLabel: formatSplitTypeLabel(payload.workout.splitType),
      rationale: payload.workout.rationale ?? null,
      progressionNotes: payload.workout.progressionNotes ?? null,
      sessionCount
    },
    sessionProgress,
    sessionLogs,
    weeklyTarget,
    averageDurationMinutes,
    estimatedWeeklyMinutes: averageDurationMinutes * sessionCount,
    totalExercises
  } satisfies AppWorkoutData;
}

export function buildTrainingExerciseRows(section?: WorkoutSection | null) {
  if (!section) {
    return [] as TrainingExerciseRow[];
  }

  const items = section.items?.length ? section.items : buildWorkoutSectionItems(section.mobility, section.exercises);
  const flattened = flattenWorkoutSectionItems(items);

  return flattened.allExercises.map((exercise, index) => {
    const normalizedBlockType = normalizeBlockType(
      exercise.blockType ?? exercise.type ?? exercise.trainingTechnique ?? exercise.technique
    );
    const techniqueLabel =
      normalizedBlockType !== "normal"
        ? formatBlockTypeLabel(normalizedBlockType)
        : formatOptionalMethod(exercise.method ?? exercise.trainingTechnique ?? exercise.technique);

    return {
      id: `${section.title}-${exercise.name}-${index}`,
      name: exercise.name,
      sets: exercise.sets || "-",
      reps: exercise.reps || "-",
      rest: formatCompactRestValue(exercise.rest),
      technique: techniqueLabel,
      blockType: normalizedBlockType,
      blockOrder: exercise.order?.trim() || null,
      eyebrow: buildExerciseEyebrow(exercise.order, exercise.blockLabel, normalizedBlockType),
      note: exercise.notes?.trim() || exercise.blockNotes?.trim() || null,
      videoUrl: exercise.videoUrl ?? null,
      isMobility: normalizedBlockType === "mobility" || exercise.type === "mobility",
      muscles: normalizeExerciseMuscles(exercise.muscleGroups, exercise.primaryMuscles, exercise.secondaryMuscles),
      plannedSetsCount: parsePositiveInteger(exercise.sets),
      plannedRepsLabel: exercise.reps || "-",
      plannedRestSeconds: parseRestDurationSeconds(exercise.rest),
      mediaDurationLabel: normalizedBlockType === "mobility" ? normalizeMediaDurationLabel(exercise.reps) : null
    };
  });
}

export function buildWeeklySchedule(data: AppWorkoutData): WeeklyScheduleItem[] {
  const activeIndexes = WEEKDAY_DISTRIBUTION[data.weeklyTarget] ?? WEEKDAY_DISTRIBUTION[3];
  let workoutCursor = 0;

  return WEEK_DAYS.map((day, index) => {
    const isActive = activeIndexes.includes(index);
    const workoutKey = isActive ? data.workoutOrder[workoutCursor % data.workoutOrder.length] ?? null : null;
    const workoutLabel = workoutKey ? formatWorkoutDisplayTitle(data.workouts[workoutKey]?.title, workoutKey) : null;

    if (isActive) {
      workoutCursor += 1;
    }

    return {
      index,
      dayLabel: day.label,
      shortLabel: day.shortLabel,
      isRest: !isActive,
      workoutKey,
      workoutLabel,
      note: isActive ? "Sessão sugerida" : "Recuperação"
    };
  });
}

export function getPlanCoverage(data: AppWorkoutData) {
  const coveredSessions = getSafeInteger(data.sessionProgress?.completedSessions, 0);
  const totalSessions = Math.max(getSafeInteger(data.sessionProgress?.totalSessions, 1), 1);
  const percentage = Math.min(Math.max(getSafeInteger(data.sessionProgress?.progressPercentage, 0), 0), 100);

  return {
    coveredSessions,
    totalSessions,
    percentage
  };
}

export function getAchievementCopy(data: AppWorkoutData) {
  const completedSessions = getSafeInteger(data.sessionProgress?.completedSessions, 0);
  const totalSessions = Math.max(getSafeInteger(data.sessionProgress?.totalSessions, 1), 1);
  const sessionCount = getSafeInteger(data.plan?.sessionCount, 0);
  const weeklyTarget = getSafeInteger(data.weeklyTarget, 0);
  const averageDurationMinutes = getSafeInteger(data.averageDurationMinutes, 0);

  if (completedSessions >= totalSessions) {
    return {
      title: "Ciclo concluído",
      description: "Você finalizou todas as sessões previstas neste plano e já pode evoluir para o próximo ciclo."
    };
  }

  if (completedSessions >= 3) {
    return {
      title: "Sequência em andamento",
      description: "Seu histórico já começou a registrar consistência real dentro do ciclo atual."
    };
  }

  if (sessionCount >= weeklyTarget) {
    return {
      title: "Semana estruturada",
      description: "Seu plano já cobre a meta semanal com uma distribuição pronta para seguir."
    };
  }

  if (averageDurationMinutes >= 55) {
    return {
      title: "Plano de alta dedicação",
      description: "Sua rotina foi ajustada para sessões mais completas e consistentes."
    };
  }

  return {
    title: "Base pronta para evoluir",
    description: "Seu plano já está alinhado ao seu objetivo e ao tempo disponível."
  };
}

export function getMotivationLine(goal?: Goal) {
  if (goal === "gain_muscle") {
    return "Consistência e boa execução fazem a diferença.";
  }

  if (goal === "lose_weight") {
    return "Regularidade vence intensidade aleatória.";
  }

  if (goal === "improve_conditioning") {
    return "Pequenos avanços somados constroem seu ritmo.";
  }

  return "Foco e disciplina te levam mais longe.";
}

export function formatGoalLabel(goal?: Goal) {
  const labels: Record<Goal, string> = {
    lose_weight: "Emagrecimento",
    gain_muscle: "Hipertrofia",
    body_recomposition: "Definição",
    improve_conditioning: "Condicionamento"
  };

  return goal ? labels[goal] ?? "Objetivo" : "Objetivo";
}

export function formatLevelLabel(level?: string) {
  const labels: Record<string, string> = {
    no_training: "Iniciante",
    lt_6_months: "Iniciante",
    "6_to_12_months": "Intermediário",
    gt_1_year: "Avançado"
  };

  return level ? labels[level] ?? "Nível" : "Nível";
}

export function formatBodyTypeChipLabel(bodyType?: string | null) {
  return bodyType ? formatBodyTypeLabel(bodyType) : "Biotipo";
}

export function formatFocusLabel(focus?: string | null) {
  const labels: Record<string, string> = {
    chest: "Peito",
    back: "Costas",
    quadriceps: "Quadríceps",
    hamstrings: "Posterior",
    glutes: "Glúteos",
    shoulders: "Ombros",
    full_body: "Corpo inteiro",
    conditioning: "Condicionamento",
    arms: "Braços",
    core: "Core"
  };

  return focus ? labels[focus] ?? normalizeDisplayLabel(focus) : "Treino completo";
}

export function formatWorkoutDisplayTitle(title?: string | null, day?: string | null) {
  const candidates = [title, day];

  for (const candidate of candidates) {
    const raw = candidate?.trim();
    if (!raw) {
      continue;
    }

    const treinoMatch = raw.match(/treino\s+[a-z0-9]+/i);
    if (treinoMatch?.[0]) {
      const label = treinoMatch[0].replace(/\s+/g, " ").trim();
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    const normalized = raw.replace(/^treino\s+/i, "").split(/[\s-]/)[0]?.trim();
    if (normalized) {
      return `Treino ${normalized.toUpperCase()}`;
    }
  }

  return "Treino";
}

export function formatDurationLabel(minutes?: number | null, fallback?: string | null) {
  if (minutes && Number.isFinite(minutes) && minutes > 0) {
    return `${minutes} min`;
  }

  if (fallback?.trim()) {
    return fallback;
  }

  return "Tempo flexível";
}

export function formatSessionCounter(progress: WorkoutSessionProgress) {
  const currentSessionNumber = Math.max(getSafeInteger(progress?.currentSessionNumber, 1), 1);
  const totalSessions = Math.max(getSafeInteger(progress?.totalSessions, 1), 1);
  return `Sessão ${currentSessionNumber} de ${totalSessions}`;
}

export function formatLastCompletedSession(progress: WorkoutSessionProgress) {
  if (!progress.lastCompletedSessionNumber) {
    return null;
  }

  return `Sessão ${progress.lastCompletedSessionNumber} concluída`;
}

function buildFallbackSections(workout: WorkoutPlan) {
  const sourceExercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const chunks = [sourceExercises.slice(0, 3), sourceExercises.slice(3, 6), sourceExercises.slice(6)];
  const labels = ["Treino A", "Treino B", "Treino C"];
  const subtitles = ["Base principal", "Volume complementar", "Reforço e consistência"];

  return chunks
    .map((items, index) => ({
      title: labels[index],
      subtitle: subtitles[index],
      focus: "full_body",
      mobility: [],
      exercises: items
    }))
    .filter((section) => section.exercises.length > 0);
}

function extractWorkoutDay(title?: string | null) {
  const match = title?.match(/treino\s+([a-z0-9]+)/i);
  return match?.[1]?.toUpperCase() ?? title?.replace(/^treino\s+/i, "").trim() ?? "A";
}

function getAverageDurationMinutes(sections: WorkoutSection[], fallbackMinutes?: number) {
  const values = sections
    .map((section) => section.estimatedDurationMinutes)
    .filter((value): value is number => Boolean(value) && Number.isFinite(value));

  if (values.length) {
    return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
  }

  if (fallbackMinutes && Number.isFinite(fallbackMinutes)) {
    return Math.round(fallbackMinutes);
  }

  return 45;
}

function buildExerciseEyebrow(order?: string | null, blockLabel?: string | null, blockType?: string | null) {
  if (blockType === "mobility") {
    return "Mobilidade";
  }

  if (blockLabel?.trim()) {
    return blockLabel.trim();
  }

  if (order?.trim()) {
    return `Bloco ${order.trim()}`;
  }

  return "Execução";
}

function formatOptionalMethod(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();
  if (normalized === "normal" || normalized === "tradicional") {
    return null;
  }

  return raw;
}

function normalizeExerciseMuscles(
  explicitGroups?: string[] | null,
  primaryMuscles?: string[] | null,
  secondaryMuscles?: string[] | null
) {
  const sourceGroups = explicitGroups?.length ? explicitGroups : [...(primaryMuscles ?? []), ...(secondaryMuscles ?? [])];
  const muscles = sourceGroups
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => formatExerciseMuscleLabel(value));

  return Array.from(new Set(muscles)).slice(0, 4);
}

function parsePositiveInteger(value?: string | null) {
  const match = value?.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseRestDurationSeconds(value?: string | null) {
  const matches = Array.from((value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((item) => Number.isFinite(item) && item > 0);

  if (!matches.length) {
    return null;
  }

  const average = Math.round(matches.reduce((sum, item) => sum + item, 0) / matches.length);
  return /min/i.test(value ?? "") ? average * 60 : average;
}

function formatCompactRestValue(value?: string | null) {
  const raw = value?.trim();

  if (!raw) {
    return "-";
  }

  return raw
    .replace(/\bsegundos?\b/gi, "s")
    .replace(/\bseconds?\b/gi, "s")
    .replace(/\bsecs?\b/gi, "s")
    .replace(/\bseg\b/gi, "s")
    .replace(/\bminutos?\b/gi, "min")
    .replace(/\bminutes?\b/gi, "min")
    .replace(/\bmins?\b/gi, "min")
    .replace(/(\d)\s+s\b/gi, "$1s")
    .replace(/(\d)\s+min\b/gi, "$1min")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeMediaDurationLabel(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  return /\b(seg|s|min)\b/i.test(raw) ? raw : null;
}

function normalizeDisplayLabel(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function normalizeUserName(value: unknown) {
  if (typeof value !== "string") {
    return "Aluno";
  }

  const normalized = value.trim();
  return normalized || "Aluno";
}

function getSafeInteger(value: unknown, fallback: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.round(numericValue);
}

function normalizeWorkoutSessionLogs(value?: WorkoutSessionLogEntry[] | null) {
  if (!Array.isArray(value)) {
    return [] as WorkoutSessionLogEntry[];
  }

  return value
    .filter((entry) => typeof entry?.id === "string" && typeof entry?.completedAt === "string")
    .map((entry) => {
      const status: WorkoutSessionLogEntry["status"] = entry.status === "completed" ? "completed" : "not_started";

      return {
        id: entry.id,
        workoutId: entry.workoutId,
        workoutKey: normalizeWorkoutKey(entry.workoutKey),
        sessionNumber: getSafeInteger(entry.sessionNumber, 0),
        status,
        completedAt: entry.completedAt,
        createdAt: entry.createdAt ?? null
      } satisfies WorkoutSessionLogEntry;
    })
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
}
