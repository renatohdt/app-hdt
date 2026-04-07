import type { ExerciseRecord } from "@/lib/types";

export const EXERCISE_MUSCLE_OPTIONS = [
  { value: "chest", label: "Peito" },
  { value: "back", label: "Costas" },
  { value: "shoulders", label: "Ombros" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "abs", label: "Abdômen" },
  { value: "lower_back", label: "Lombar" },
  { value: "quadriceps", label: "Quadríceps" },
  { value: "glutes", label: "Glúteos" },
  { value: "hamstrings", label: "Posterior de coxa" },
  { value: "calves", label: "Panturrilhas" },
  { value: "forearms", label: "Antebraços" },
  { value: "adductors", label: "Adutores" },
  { value: "abductors", label: "Abdutores" },
  { value: "tibialis", label: "Tibial" },
  { value: "hip_flexors", label: "Flexores do Quadril" }
] as const;

export const EXERCISE_TYPE_OPTIONS = [
  { value: "compound", label: "Composto" },
  { value: "isolation", label: "Isolado" },
  { value: "functional", label: "Funcional" },
  { value: "mobility", label: "Mobilidade" },
  { value: "cardio", label: "Cardio" }
] as const;

export const EXERCISE_LEVEL_OPTIONS = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" }
] as const;

export const EXERCISE_LOCATION_OPTIONS = [
  { value: "home", label: "Casa" },
  { value: "gym", label: "Academia" }
] as const;

export const EXERCISE_EQUIPMENT_OPTIONS = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "halteres", label: "Halteres" },
  { value: "machine", label: "Máquina" },
  { value: "elasticos", label: "Elásticos" },
  { value: "fitball", label: "Fitball" },
  { value: "fita_suspensa", label: "Fita Suspensa" },
  { value: "caneleira", label: "Caneleira" },
  { value: "kettlebell", label: "Kettlebell" }
] as const;

const MUSCLE_LABELS = new Map<string, string>(EXERCISE_MUSCLE_OPTIONS.map((option) => [option.value, option.label]));
const TYPE_LABELS = new Map<string, string>(EXERCISE_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const LEVEL_LABELS = new Map<string, string>(EXERCISE_LEVEL_OPTIONS.map((option) => [option.value, option.label]));
const LOCATION_LABELS = new Map<string, string>(EXERCISE_LOCATION_OPTIONS.map((option) => [option.value, option.label]));
const EQUIPMENT_LABELS = new Map<string, string>(EXERCISE_EQUIPMENT_OPTIONS.map((option) => [option.value, option.label]));

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
  bicep: "biceps",
  triceps: "triceps",
  tricep: "triceps",
  abs: "abs",
  abdomen: "abs",
  abdominal: "abs",
  abdominais: "abs",
  core: "abs",
  lower_back: "lower_back",
  "lower back": "lower_back",
  lombar: "lower_back",
  lombares: "lower_back",
  lumbar: "lower_back",
  quadriceps: "quadriceps",
  glutes: "glutes",
  gluteo: "glutes",
  gluteos: "glutes",
  hamstrings: "hamstrings",
  posterior: "hamstrings",
  "posterior de coxa": "hamstrings",
  calves: "calves",
  gemeos: "calves",
  panturrilha: "calves",
  panturrilhas: "calves",
  forearms: "forearms",
  antebraco: "forearms",
  antebracos: "forearms",
  adductors: "adductors",
  adutor: "adductors",
  adutores: "adductors",
  abductors: "abductors",
  abdutor: "abductors",
  abdutores: "abductors",
  tibial: "tibialis",
  tibiais: "tibialis",
  tibialis: "tibialis",
  "flexor do quadril": "hip_flexors",
  "flexores do quadril": "hip_flexors",
  "flexor de quadril": "hip_flexors",
  "flexores de quadril": "hip_flexors",
  "hip flexor": "hip_flexors",
  "hip flexors": "hip_flexors",
  hip_flexors: "hip_flexors",
  hip_flexor: "hip_flexors",
  iliopsoas: "hip_flexors"
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
  aerobico: "cardio"
};

const LEVEL_ALIASES: Record<string, string> = {
  beginner: "beginner",
  iniciante: "beginner",
  intermediate: "intermediate",
  intermediario: "intermediate",
  advanced: "advanced",
  avancado: "advanced"
};

const LOCATION_ALIASES: Record<string, string> = {
  home: "home",
  casa: "home",
  gym: "gym",
  academia: "gym"
};

const EQUIPMENT_ALIASES: Record<string, string> = {
  bodyweight: "bodyweight",
  "peso corporal": "bodyweight",
  peso_corporal: "bodyweight",
  nenhum: "bodyweight",
  dumbbell: "halteres",
  dumbbells: "halteres",
  halter: "halteres",
  halteres: "halteres",
  machine: "machine",
  maquina: "machine",
  maquinas: "machine",
  machines: "machine",
  elastico: "elasticos",
  elasticos: "elasticos",
  bands: "elasticos",
  band: "elasticos",
  fitball: "fitball",
  swissball: "fitball",
  "fita suspensa": "fita_suspensa",
  fita_suspensa: "fita_suspensa",
  trx: "fita_suspensa",
  caneleira: "caneleira",
  caneleiras: "caneleira",
  kettlebell: "kettlebell",
  kettlebells: "kettlebell",
  other: ""
};

export function normalizeExerciseCatalogText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() ?? "";
}

export function normalizeExerciseName(value?: string | null) {
  return normalizeExerciseCatalogText(value);
}

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

export function normalizeExerciseRecord(exercise: ExerciseRecord): ExerciseRecord {
  const muscleGroups = getExerciseMuscleGroups(exercise);
  const primaryMuscle =
    muscleGroups[0] ??
    normalizeExerciseMuscleGroup(exercise.muscle ?? exercise.metadata?.muscle ?? null) ??
    exercise.muscle ??
    undefined;
  const metadata = exercise.metadata
    ? {
        ...exercise.metadata,
        muscle: primaryMuscle ?? "",
        muscle_groups: muscleGroups,
        muscles: muscleGroups
      }
    : exercise.metadata;

  return {
    ...exercise,
    muscle: primaryMuscle,
    muscle_groups: muscleGroups,
    metadata
  };
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

export function normalizeExerciseLevel(value?: string | null) {
  const normalized = normalizeExerciseCatalogText(value);
  return normalized ? LEVEL_ALIASES[normalized] ?? normalized : null;
}

export function normalizeExerciseLevels(value?: string | string[] | null) {
  const normalized = toInputList(value)
    .map((item) => normalizeExerciseLevel(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(normalized));
}

export function getExerciseLevels(exercise?: Pick<ExerciseRecord, "level" | "metadata"> | null) {
  if (!exercise) {
    return [];
  }

  return normalizeExerciseLevels(exercise.level ?? exercise.metadata?.level ?? null);
}

export function formatExerciseLevelLabel(value?: string | null) {
  const normalized = normalizeExerciseLevel(value);
  return normalized ? LEVEL_LABELS.get(normalized) ?? value ?? normalized : "Não informado";
}

export function normalizeExerciseLocation(value?: string | null) {
  const normalized = normalizeExerciseCatalogText(value);
  return normalized ? LOCATION_ALIASES[normalized] ?? normalized : null;
}

export function normalizeExerciseLocations(value?: string | string[] | null) {
  const normalized = toInputList(value)
    .map((item) => normalizeExerciseLocation(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(normalized));
}

export function getExerciseLocations(exercise?: Pick<ExerciseRecord, "location" | "metadata"> | null) {
  if (!exercise) {
    return [];
  }

  return normalizeExerciseLocations(exercise.location ?? exercise.metadata?.location ?? null);
}

export function formatExerciseLocationLabel(value?: string | null) {
  const normalized = normalizeExerciseLocation(value);
  return normalized ? LOCATION_LABELS.get(normalized) ?? value ?? normalized : "Não informado";
}

export function normalizeExerciseEquipment(value?: string | null) {
  const normalized = normalizeExerciseCatalogText(value);
  if (!normalized) {
    return null;
  }

  const resolved = EQUIPMENT_ALIASES[normalized] ?? normalized;
  return resolved || null;
}

export function normalizeExerciseEquipmentList(value?: string | string[] | null) {
  const normalized = toInputList(value)
    .map((item) => normalizeExerciseEquipment(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(normalized));
}

export function getExerciseEquipment(exercise?: Pick<ExerciseRecord, "equipment" | "metadata"> | null) {
  if (!exercise) {
    return [];
  }

  return normalizeExerciseEquipmentList(exercise.equipment ?? exercise.metadata?.equipment ?? null);
}

export function formatExerciseEquipmentLabel(value?: string | null) {
  const normalized = normalizeExerciseEquipment(value);
  return normalized ? EQUIPMENT_LABELS.get(normalized) ?? value ?? normalized : "Não informado";
}

export function buildExerciseSearchBlob(
  exercise: Pick<
    ExerciseRecord,
    "name" | "muscle" | "muscle_groups" | "type" | "tags" | "metadata" | "equipment" | "level" | "location"
  >
) {
  const muscleGroups = getExerciseMuscleGroups(exercise);
  const levels = getExerciseLevels(exercise);
  const equipment = getExerciseEquipment(exercise);
  const locations = getExerciseLocations(exercise);

  return normalizeExerciseCatalogText(
    [
      exercise.name,
      exercise.type,
      formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null),
      exercise.muscle,
      exercise.metadata?.muscle,
      ...(exercise.tags ?? []),
      ...muscleGroups,
      ...muscleGroups.map((group) => formatExerciseMuscleLabel(group)),
      ...levels,
      ...levels.map((item) => formatExerciseLevelLabel(item)),
      ...equipment,
      ...equipment.map((item) => formatExerciseEquipmentLabel(item)),
      ...locations,
      ...locations.map((item) => formatExerciseLocationLabel(item))
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
