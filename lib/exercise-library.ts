import type { ExerciseRecord } from "@/lib/types";

export const EXERCISE_MUSCLE_OPTIONS = [
  { value: "chest", label: "Peito" },
  { value: "back", label: "Costas" },
  { value: "shoulders", label: "Ombros" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "abs", label: "Core" },
  { value: "quadriceps", label: "Quadríceps" },
  { value: "glutes", label: "Glúteos" },
  { value: "hamstrings", label: "Posterior de coxa" },
  { value: "calves", label: "Panturrilhas" },
  { value: "forearms", label: "Antebraços" },
  { value: "adductors", label: "Adutores" },
  { value: "abductors", label: "Abdutores" },
  { value: "tibialis", label: "Tibial" },
  { value: "hip_flexors", label: "Flexores de quadril" }
] as const;

export const EXERCISE_TYPE_OPTIONS = [
  { value: "compound", label: "Composto" },
  { value: "isolation", label: "Isolado" },
  { value: "functional", label: "Funcional" },
  { value: "mobility", label: "Mobilidade" },
  { value: "cardio", label: "Cardio" }
] as const;

const MUSCLE_LABELS = new Map<string, string>(EXERCISE_MUSCLE_OPTIONS.map((option) => [option.value, option.label]));
const TYPE_LABELS = new Map<string, string>(EXERCISE_TYPE_OPTIONS.map((option) => [option.value, option.label]));

const MUSCLE_ALIASES: Record<string, string> = {
  chest: "chest",
  peito: "chest",
  peitoral: "chest",
  back: "back",
  costas: "back",
  dorsal: "back",
  dorsais: "back",
  shoulders: "shoulders",
  ombro: "shoulders",
  ombros: "shoulders",
  deltoide: "shoulders",
  deltoides: "shoulders",
  biceps: "biceps",
  bíceps: "biceps",
  triceps: "triceps",
  tríceps: "triceps",
  abs: "abs",
  abdomen: "abs",
  abdominal: "abs",
  abdominais: "abs",
  core: "abs",
  quadriceps: "quadriceps",
  quadríceps: "quadriceps",
  glutes: "glutes",
  gluteo: "glutes",
  glúteo: "glutes",
  gluteos: "glutes",
  glúteos: "glutes",
  hamstrings: "hamstrings",
  posterior: "hamstrings",
  "posterior de coxa": "hamstrings",
  calves: "calves",
  gemeos: "calves",
  gêmeos: "calves",
  panturrilha: "calves",
  panturrilhas: "calves",
  forearms: "forearms",
  antebraco: "forearms",
  antebraço: "forearms",
  antebracos: "forearms",
  antebraços: "forearms",
  adductors: "adductors",
  adutor: "adductors",
  adutores: "adductors",
  abductors: "abductors",
  abdutor: "abductors",
  abdutores: "abductors",
  tibial: "tibialis",
  tibiais: "tibialis",
  tibialis: "tibialis",
  "flexor de quadril": "hip_flexors",
  "flexores de quadril": "hip_flexors",
  hip_flexors: "hip_flexors",
  hip_flexor: "hip_flexors"
};

const TYPE_ALIASES: Record<string, string> = {
  compound: "compound",
  composto: "compound",
  isolation: "isolation",
  isolado: "isolation",
  functional: "functional",
  funcional: "functional",
  mobility: "mobility",
  mobilidade: "mobility",
  cardio: "cardio",
  cardiovascular: "cardio",
  aeróbico: "cardio",
  aerobico: "cardio"
};

export function normalizeExerciseMuscleGroup(value?: string | null) {
  const normalized = normalizeExerciseCatalogText(value);
  return normalized ? MUSCLE_ALIASES[normalized] ?? normalized : null;
}

export function normalizeExerciseMuscleGroups(value?: string | string[] | null) {
  const normalized = toInputList(value)
    .map((item) => normalizeExerciseMuscleGroup(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(normalized));
}

export function getExerciseMuscleGroups(exercise?: Pick<ExerciseRecord, "muscle" | "muscle_groups" | "metadata"> | null) {
  if (!exercise) {
    return [];
  }

  const explicitGroups = normalizeExerciseMuscleGroups(
    exercise.muscle_groups ??
      exercise.metadata?.muscle_groups ??
      exercise.metadata?.muscles ??
      null
  );

  if (explicitGroups.length) {
    return explicitGroups;
  }

  return normalizeExerciseMuscleGroups(exercise.muscle ?? exercise.metadata?.muscle ?? null);
}

export function getPrimaryExerciseMuscle(exercise?: Pick<ExerciseRecord, "muscle" | "muscle_groups" | "metadata"> | null) {
  return getExerciseMuscleGroups(exercise)[0] ?? null;
}

export function formatExerciseMuscleLabel(value?: string | null) {
  const normalized = normalizeExerciseMuscleGroup(value);
  return normalized ? MUSCLE_LABELS.get(normalized) ?? value ?? normalized : "Não informado";
}

export function formatExerciseMuscleGroups(
  exercise?: Pick<ExerciseRecord, "muscle" | "muscle_groups" | "metadata"> | null,
  separator = ", "
) {
  const groups = getExerciseMuscleGroups(exercise);
  return groups.length ? groups.map((group) => formatExerciseMuscleLabel(group)).join(separator) : "-";
}

export function normalizeStoredExerciseType(value?: string | null) {
  const normalized = normalizeExerciseCatalogText(value);
  return normalized ? TYPE_ALIASES[normalized] ?? normalized : null;
}

export function resolveExerciseMovementType(value?: string | null) {
  const normalized = normalizeStoredExerciseType(value);
  if (normalized === "cardio") {
    return "functional";
  }

  return normalized || "compound";
}

export function formatExerciseTypeLabel(value?: string | null) {
  const normalized = normalizeStoredExerciseType(value);
  return normalized ? TYPE_LABELS.get(normalized) ?? value ?? normalized : "Não informado";
}

export function buildExerciseSearchBlob(
  exercise: Pick<ExerciseRecord, "name" | "muscle" | "muscle_groups" | "type" | "tags" | "metadata">
) {
  return normalizeExerciseCatalogText(
    [
      exercise.name,
      exercise.type,
      formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null),
      exercise.muscle,
      exercise.metadata?.muscle,
      ...(exercise.tags ?? []),
      ...getExerciseMuscleGroups(exercise),
      ...getExerciseMuscleGroups(exercise).map((group) => formatExerciseMuscleLabel(group))
    ].join(" ")
  );
}

function toInputList(value?: string | string[] | null) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeExerciseCatalogText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() ?? "";
}
