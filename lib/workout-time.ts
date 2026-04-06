import type { WorkoutBlockType, WorkoutExercise, WorkoutSectionItem } from "@/lib/types";

export type TimeBudgetBucket = "express" | "short" | "standard" | "extended" | "long";
export type TimeBudgetLevel = "beginner" | "intermediate" | "advanced";
export type TimeBudgetGoalStyle = "fat_loss" | "hypertrophy" | "conditioning" | "recomposition";
export type RestProfile = "short" | "short_to_moderate" | "moderate" | "moderate_to_long";
export type DensityStrategy =
  | "express_compound_focus"
  | "efficient_session"
  | "balanced_session"
  | "volume_expansion"
  | "extended_volume";

export type SessionTimeBudget = {
  bucket: TimeBudgetBucket;
  availableTimeMinutes: number;
  minDurationMinutes: number;
  targetDurationMinutes: number;
  maxDurationMinutes: number;
  exerciseCountRange: { min: number; max: number };
  targetExerciseCount: number;
  combinedBlockRange: { min: number; max: number };
  targetCombinedBlocks: number;
  restProfile: RestProfile;
  densityStrategy: DensityStrategy;
  allowAdvancedTechniques: boolean;
  maxIsolationExercises: number;
  allowExtendedMobility: boolean;
  timeFitRationale: string;
};

export type SessionDurationEstimate = {
  totalMinutes: number;
  totalMinutesExact: number;
  durationRange: string;
  movementCount: number;
  workingExerciseCount: number;
  mobilityCount: number;
  withinAvailableTime: boolean;
};

type TimeBudgetPreset = {
  bucket: TimeBudgetBucket;
  maxMinutes: number;
  targetReduction: number;
  minFloor: number;
  exerciseCountRange: { min: number; max: number };
  targetExerciseCount: number;
  combinedBlockRange: { min: number; max: number };
  targetCombinedBlocks: number;
  restProfile: RestProfile;
  densityStrategy: DensityStrategy;
  allowAdvancedTechniques: boolean;
  maxIsolationExercises: number;
  allowExtendedMobility: boolean;
};

const COMBINED_BLOCKS = new Set<WorkoutBlockType>(["superset", "bi-set", "tri-set", "circuit"]);
const ADVANCED_TIME_ADDERS: Partial<Record<WorkoutBlockType, number>> = {
  "drop-set": 45,
  "rest-pause": 35,
  cluster: 55,
  isometria: 20,
  tempo_controlado: 16,
  parciais: 20,
  "pre-exaustao": 20,
  "pos-exaustao": 20
};

const TIME_BUDGET_PRESETS: TimeBudgetPreset[] = [
  {
    bucket: "express",
    maxMinutes: 20,
    targetReduction: 2,
    minFloor: 12,
    exerciseCountRange: { min: 2, max: 4 },
    targetExerciseCount: 3,
    combinedBlockRange: { min: 0, max: 1 },
    targetCombinedBlocks: 1,
    restProfile: "short",
    densityStrategy: "express_compound_focus",
    allowAdvancedTechniques: false,
    maxIsolationExercises: 1,
    allowExtendedMobility: false
  },
  {
    bucket: "short",
    maxMinutes: 35,
    targetReduction: 3,
    minFloor: 18,
    exerciseCountRange: { min: 3, max: 6 },
    targetExerciseCount: 4,
    combinedBlockRange: { min: 1, max: 2 },
    targetCombinedBlocks: 1,
    restProfile: "short_to_moderate",
    densityStrategy: "efficient_session",
    allowAdvancedTechniques: false,
    maxIsolationExercises: 2,
    allowExtendedMobility: false
  },
  {
    bucket: "standard",
    maxMinutes: 50,
    targetReduction: 4,
    minFloor: 28,
    exerciseCountRange: { min: 6, max: 9 },
    targetExerciseCount: 7,
    combinedBlockRange: { min: 1, max: 2 },
    targetCombinedBlocks: 1,
    restProfile: "moderate",
    densityStrategy: "balanced_session",
    allowAdvancedTechniques: false,
    maxIsolationExercises: 3,
    allowExtendedMobility: false
  },
  {
    bucket: "extended",
    maxMinutes: 70,
    targetReduction: 5,
    minFloor: 40,
    exerciseCountRange: { min: 9, max: 12 },
    targetExerciseCount: 10,
    combinedBlockRange: { min: 1, max: 2 },
    targetCombinedBlocks: 2,
    restProfile: "moderate",
    densityStrategy: "volume_expansion",
    allowAdvancedTechniques: true,
    maxIsolationExercises: 4,
    allowExtendedMobility: true
  },
  {
    bucket: "long",
    maxMinutes: Number.POSITIVE_INFINITY,
    targetReduction: 6,
    minFloor: 55,
    exerciseCountRange: { min: 10, max: 13 },
    targetExerciseCount: 11,
    combinedBlockRange: { min: 1, max: 3 },
    targetCombinedBlocks: 2,
    restProfile: "moderate_to_long",
    densityStrategy: "extended_volume",
    allowAdvancedTechniques: true,
    maxIsolationExercises: 5,
    allowExtendedMobility: true
  }
];

export function buildSessionTimeBudget(input: {
  availableTimeMinutes: number;
  level: TimeBudgetLevel;
  goalStyle: TimeBudgetGoalStyle;
}) {
  const minutes = clamp(Math.round(input.availableTimeMinutes || 45), 15, 120);
  const preset = TIME_BUDGET_PRESETS.find((entry) => minutes <= entry.maxMinutes) ?? TIME_BUDGET_PRESETS[2];
  let targetExerciseCount = preset.targetExerciseCount;

  if (input.level === "beginner" && targetExerciseCount > preset.exerciseCountRange.min) {
    targetExerciseCount -= 1;
  }

  if (input.goalStyle === "hypertrophy" && preset.bucket !== "express") {
    targetExerciseCount = Math.min(targetExerciseCount + 1, preset.exerciseCountRange.max);
  }

  if (input.goalStyle === "conditioning" && preset.bucket === "express") {
    targetExerciseCount = Math.min(targetExerciseCount + 1, preset.exerciseCountRange.max);
  }

  const allowAdvancedTechniques =
    preset.allowAdvancedTechniques && input.level !== "beginner" && input.goalStyle !== "conditioning";
  const targetDurationMinutes = Math.max(preset.minFloor, minutes - preset.targetReduction);
  const minDurationMinutes = Math.max(
    preset.minFloor,
    minutes - (preset.bucket === "express" ? 4 : preset.bucket === "short" ? 6 : preset.bucket === "standard" ? 8 : 10)
  );

  return {
    bucket: preset.bucket,
    availableTimeMinutes: minutes,
    minDurationMinutes,
    targetDurationMinutes,
    maxDurationMinutes: minutes,
    exerciseCountRange: preset.exerciseCountRange,
    targetExerciseCount,
    combinedBlockRange: preset.combinedBlockRange,
    targetCombinedBlocks: clamp(
      input.level === "beginner" ? Math.min(preset.targetCombinedBlocks, 1) : preset.targetCombinedBlocks,
      preset.combinedBlockRange.min,
      preset.combinedBlockRange.max
    ),
    restProfile: preset.restProfile,
    densityStrategy: preset.densityStrategy,
    allowAdvancedTechniques,
    maxIsolationExercises: preset.maxIsolationExercises,
    allowExtendedMobility: preset.allowExtendedMobility,
    timeFitRationale: buildBudgetRationale({
      availableTimeMinutes: minutes,
      bucket: preset.bucket,
      targetExerciseCount,
      exerciseCountRange: preset.exerciseCountRange,
      restProfile: preset.restProfile,
      densityStrategy: preset.densityStrategy,
      allowAdvancedTechniques
    })
  } satisfies SessionTimeBudget;
}

export function buildTimeBudgetBrief(budget: SessionTimeBudget) {
  return {
    availableTimeMinutes: budget.availableTimeMinutes,
    targetDurationMinutes: budget.targetDurationMinutes,
    durationWindowMinutes: `${budget.minDurationMinutes}-${budget.maxDurationMinutes}`,
    targetExerciseCount: `${budget.exerciseCountRange.min}-${budget.exerciseCountRange.max}`,
    preferredExerciseCount: budget.targetExerciseCount,
    combinedBlockRange: `${budget.combinedBlockRange.min}-${budget.combinedBlockRange.max}`,
    preferredCombinedBlocks: budget.targetCombinedBlocks,
    restProfile: budget.restProfile,
    densityStrategy: budget.densityStrategy,
    allowAdvancedTechniques: budget.allowAdvancedTechniques,
    maxIsolationExercises: budget.maxIsolationExercises,
    allowExtendedMobility: budget.allowExtendedMobility,
    timeFitRationale: budget.timeFitRationale
  };
}

export function estimateWorkoutSectionDuration(
  items: WorkoutSectionItem[],
  availableTimeMinutes: number
): SessionDurationEstimate {
  const totalSeconds = items.reduce((sum, item, index) => {
    const transitionSeconds = index < items.length - 1 ? getItemTransitionSeconds(item) : 0;
    return sum + estimateItemSeconds(item) + transitionSeconds;
  }, 0);
  const totalMinutesExact = roundToSingleDecimal(totalSeconds / 60);
  const totalMinutes = Math.max(1, Math.round(totalMinutesExact));
  const movementCount = items.reduce((total, item) => total + (item.type === "combined_block" ? item.exercises.length : 1), 0);
  const mobilityCount = items.filter((item) => item.type !== "combined_block" && item.type === "mobility").length;
  const durationPadding = totalMinutes <= 25 ? 2 : totalMinutes <= 45 ? 3 : 4;

  return {
    totalMinutes,
    totalMinutesExact,
    durationRange: formatDurationRange(Math.max(1, Math.floor(totalMinutesExact - durationPadding)), Math.ceil(totalMinutesExact + durationPadding)),
    movementCount,
    workingExerciseCount: Math.max(0, movementCount - mobilityCount),
    mobilityCount,
    withinAvailableTime: totalMinutesExact <= availableTimeMinutes
  };
}

export function summarizeWorkoutDurations(
  estimates: SessionDurationEstimate[],
  budget: SessionTimeBudget
) {
  if (!estimates.length) {
    return {
      estimatedDurationMinutes: budget.targetDurationMinutes,
      durationRange: formatDurationRange(budget.minDurationMinutes, budget.maxDurationMinutes),
      timeFitRationale: budget.timeFitRationale
    };
  }

  const average = roundToSingleDecimal(
    estimates.reduce((sum, estimate) => sum + estimate.totalMinutesExact, 0) / estimates.length
  );
  const min = Math.floor(Math.min(...estimates.map((estimate) => estimate.totalMinutesExact)));
  const max = Math.ceil(Math.max(...estimates.map((estimate) => estimate.totalMinutesExact)));
  const withinBudgetCount = estimates.filter((estimate) => estimate.withinAvailableTime).length;
  const fitMessage =
    withinBudgetCount === estimates.length
      ? "todas as sessoes cabem no tempo informado"
      : withinBudgetCount > 0
        ? "a maior parte das sessoes foi ajustada para caber no tempo informado"
        : "as sessoes foram comprimidas para respeitar o tempo informado";

  return {
    estimatedDurationMinutes: Math.round(average),
    durationRange: formatDurationRange(min, max),
    timeFitRationale: `${budget.timeFitRationale} Estimativa media de ${Math.round(average)} min por sessao; ${fitMessage}.`
  };
}

function estimateItemSeconds(item: WorkoutSectionItem) {
  if (item.type === "combined_block") {
    return estimateCombinedBlockSeconds(item);
  }

  return estimateSingleExerciseSeconds(item);
}

function estimateSingleExerciseSeconds(exercise: WorkoutExercise & { type?: string }) {
  const sets = parseNumericPrescription(exercise.sets, exercise.type === "mobility" ? 1 : 3);
  const executionSeconds = estimateSetExecutionSeconds(exercise);
  const restSeconds = parseDurationSeconds(exercise.rest, exercise.type === "mobility" ? 15 : 60);
  const advancedExtra = COMBINED_BLOCKS.has(exercise.blockType ?? "normal")
    ? 0
    : ADVANCED_TIME_ADDERS[exercise.blockType ?? "normal"] ?? 0;

  return sets * executionSeconds + Math.max(sets - 1, 0) * restSeconds + advancedExtra;
}

function estimateCombinedBlockSeconds(item: Extract<WorkoutSectionItem, { type: "combined_block" }>) {
  const rounds = parseNumericPrescription(item.rounds, 3);
  const restAfterRound = parseDurationSeconds(item.restAfterRound, item.blockType === "circuit" ? 60 : 75);
  const perRoundExecution = item.exercises.reduce((sum, exercise, index) => {
    const transition = index < item.exercises.length - 1 ? 10 : 0;
    return sum + estimateSetExecutionSeconds(exercise) + transition;
  }, 0);
  const setupSeconds = item.blockType === "tri-set" || item.blockType === "circuit" ? 20 : 12;

  return rounds * perRoundExecution + Math.max(rounds - 1, 0) * restAfterRound + setupSeconds;
}

function estimateSetExecutionSeconds(exercise: WorkoutExercise) {
  const repsText = `${exercise.reps ?? ""}`.trim().toLowerCase();

  if (!repsText) {
    return 40;
  }

  if (repsText.includes("seg")) {
    return clamp(parseDurationSeconds(repsText, 35), 20, 70);
  }

  const reps = parseNumericPrescription(repsText, 10);
  let seconds = clamp(Math.round(reps * 4), 25, 60);

  if (exercise.blockType === "tempo_controlado") {
    seconds += 10;
  }

  if (exercise.blockType === "isometria") {
    seconds += 8;
  }

  return seconds;
}

function getItemTransitionSeconds(item: WorkoutSectionItem) {
  if (item.type === "combined_block") {
    return 35;
  }

  return item.type === "mobility" ? 20 : 30;
}

function parseNumericPrescription(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const matches = value.match(/\d+(?:[.,]\d+)?/g);
  if (!matches?.length) {
    return fallback;
  }

  const numbers = matches
    .map((match) => Number.parseFloat(match.replace(",", ".")))
    .filter((number) => Number.isFinite(number));

  if (!numbers.length) {
    return fallback;
  }

  const average = numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
  return Math.max(1, Math.round(average));
}

function parseDurationSeconds(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  const matches = normalized.match(/\d+(?:[.,]\d+)?/g);
  if (!matches?.length) {
    return fallback;
  }

  const numbers = matches
    .map((match) => Number.parseFloat(match.replace(",", ".")))
    .filter((number) => Number.isFinite(number));

  if (!numbers.length) {
    return fallback;
  }

  const average = numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
  const seconds = normalized.includes("min") ? average * 60 : average;
  return Math.max(0, Math.round(seconds));
}

function buildBudgetRationale(input: {
  availableTimeMinutes: number;
  bucket: TimeBudgetBucket;
  targetExerciseCount: number;
  exerciseCountRange: { min: number; max: number };
  restProfile: RestProfile;
  densityStrategy: DensityStrategy;
  allowAdvancedTechniques: boolean;
}) {
  const styleMap: Record<DensityStrategy, string> = {
    express_compound_focus: "sessao enxuta com foco em compostos e densidade alta",
    efficient_session: "sessao eficiente com principal + complementares sem excesso de volume",
    balanced_session: "sessao equilibrada com bloco principal, secundarios e acessorios uteis",
    volume_expansion: "sessao volumosa com mais refinamento por grupamento e volume util",
    extended_volume: "sessao completa com mais volume total e blocos estrategicos"
  };
  const restMap: Record<RestProfile, string> = {
    short: "descansos curtos",
    short_to_moderate: "descansos curtos a moderados",
    moderate: "descansos moderados",
    moderate_to_long: "descansos moderados a longos"
  };
  const techniqueNote = input.allowAdvancedTechniques
    ? "tecnicas avancadas pontuais quando fizer sentido"
    : "tecnicas avancadas limitadas para nao estourar o tempo";

  return `Sessao calibrada para ${input.availableTimeMinutes} min, buscando ${input.targetExerciseCount} exercicios uteis dentro da faixa ${input.exerciseCountRange.min}-${input.exerciseCountRange.max}, ${restMap[input.restProfile]} e ${styleMap[input.densityStrategy]}; ${techniqueNote}.`;
}

function formatDurationRange(min: number, max: number) {
  if (min === max) {
    return `${min} min`;
  }

  return `${min}-${max} min`;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
