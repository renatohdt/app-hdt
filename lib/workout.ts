import {
  formatExerciseMuscleLabel,
  getExerciseMuscleGroups,
  resolveExerciseMovementType
} from "@/lib/exercise-library";
import {
  DiagnosisResult,
  ExerciseRecord,
  Goal,
  QuizAnswers,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutSection
} from "@/lib/types";

const PRIMARY_MUSCLES = ["chest", "back", "quadriceps", "hamstrings", "glutes"] as const;
const SECONDARY_MUSCLES = [
  "shoulders",
  "biceps",
  "triceps",
  "calves",
  "abs",
  "lower_back",
  "forearms",
  "adductors",
  "abductors",
  "tibialis",
  "hip_flexors"
] as const;
const MAX_PER_WEEK: Record<string, number> = {
  chest: 2,
  back: 2,
  quadriceps: 2,
  hamstrings: 2,
  glutes: 2,
  shoulders: 2,
  biceps: 2,
  triceps: 2,
  calves: 2,
  abs: 3,
  lower_back: 2,
  forearms: 2,
  adductors: 2,
  abductors: 2,
  tibialis: 2,
  hip_flexors: 2
};

const volumePresets = [
  { max: 30, sets: "1-2", duration: "25 min", mainLimit: 4 },
  { max: 45, sets: "2-3", duration: "40 min", mainLimit: 5 },
  { max: 60, sets: "3-4", duration: "55 min", mainLimit: 6 },
  { max: Number.POSITIVE_INFINITY, sets: "4-5", duration: "75 min", mainLimit: 7 }
] as const;

const defaultExerciseLibrary: ExerciseRecord[] = [
  { id: "1", name: "Agachamento Goblet", muscle: "quadriceps", type: "compound", location: ["home"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=6xwGFn-J_QY" },
  { id: "2", name: "Levantamento Romeno com Halteres", muscle: "hamstrings", type: "compound", location: ["home"], level: ["intermediate", "advanced"], video_url: "https://www.youtube.com/watch?v=0YONJFPQW10" },
  { id: "3", name: "Flexao de Bracos", muscle: "chest", type: "compound", location: ["home"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=IODxDxX7oi4" },
  { id: "4", name: "Supino Reto", muscle: "chest", type: "compound", location: ["gym"], level: ["intermediate", "advanced"], video_url: "https://www.youtube.com/watch?v=rT7DgCr-3pg" },
  { id: "5", name: "Puxada Frontal", muscle: "back", type: "compound", location: ["gym"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=CAwf7n6Luuc" },
  { id: "6", name: "Remada Unilateral com Halter", muscle: "back", type: "compound", location: ["home"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=pYcpY20QaE8" },
  { id: "7", name: "Agachamento Afundo", muscle: "glutes", type: "compound", location: ["home", "gym"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=2C-uNgKwPLE" },
  { id: "8", name: "Remada na Polia", muscle: "back", type: "compound", location: ["gym"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=GZbfZ033f74" },
  { id: "9", name: "Desenvolvimento com Halteres", muscle: "shoulders", type: "compound", location: ["home", "gym"], level: ["intermediate", "advanced"], video_url: "https://www.youtube.com/watch?v=qEwKCR5JCog" },
  { id: "10", name: "Avanco Caminhando", muscle: "quadriceps", type: "functional", location: ["home", "gym"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=L8fvypPrzzs" },
  { id: "11", name: "Escalador", muscle: "abs", type: "functional", location: ["home", "gym"], level: ["beginner", "intermediate"], video_url: "https://www.youtube.com/watch?v=nmwgirgXLYM" },
  { id: "12", name: "Intervalos na Bike", muscle: "quadriceps", type: "functional", location: ["gym"], level: ["beginner", "intermediate", "advanced"], video_url: "https://www.youtube.com/watch?v=Q1q4TQnP9PY" },
  { id: "13", name: "Cadeira Extensora", muscle: "quadriceps", type: "isolation", location: ["gym"], level: ["beginner", "intermediate"], video_url: null },
  { id: "14", name: "Mesa Flexora", muscle: "hamstrings", type: "isolation", location: ["gym"], level: ["beginner", "intermediate"], video_url: null },
  { id: "15", name: "Remada Curvada", muscle: "back", type: "compound", location: ["gym"], level: ["intermediate", "advanced"], video_url: null },
  { id: "16", name: "Saltos no Caixote", muscle: "quadriceps", type: "functional", location: ["home", "gym"], level: ["intermediate", "advanced"], video_url: null },
  { id: "17", name: "Rosca Direta", muscle: "biceps", type: "isolation", location: ["home", "gym"], level: ["beginner", "intermediate"], video_url: null },
  { id: "18", name: "Tríceps Corda", muscle: "triceps", type: "isolation", location: ["gym"], level: ["beginner", "intermediate"], video_url: null },
  { id: "19", name: "Polichinelo", muscle: "abs", type: "functional", location: ["home"], level: ["beginner", "intermediate"], video_url: null },
  { id: "20", name: "Agachamento com Salto", muscle: "glutes", type: "functional", location: ["home"], level: ["intermediate", "advanced"], video_url: null }
];

type TrainingLevel = "beginner" | "intermediate" | "advanced";
type TrainingStyle = "fat_loss" | "hypertrophy" | "conditioning";
type DayPlan = {
  title: string;
  focus: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
};
type WorkoutProfile = {
  level: TrainingLevel;
  style: TrainingStyle;
  dayCount: number;
  volume: (typeof volumePresets)[number];
  includeFunctional: boolean;
  reps: string;
  rest: string;
  split: DayPlan[];
};

export function buildProfile(answers: QuizAnswers): WorkoutProfile {
  const level =
    answers.experience === "no_training" || answers.experience === "lt_6_months"
      ? "beginner"
      : answers.experience === "6_to_12_months"
        ? "intermediate"
        : "advanced";

  const style =
    answers.goal === "gain_muscle"
      ? "hypertrophy"
      : answers.goal === "improve_conditioning"
        ? "conditioning"
        : "fat_loss";

  const dayCount = resolveDayCount(answers.days);

  return {
    level,
    style,
    dayCount,
    volume: resolveVolume(answers.time),
    includeFunctional: style !== "hypertrophy",
    reps: getRepRange(style, level),
    rest: getRest(style),
    split: buildAdaptiveSplit(dayCount, style)
  };
}

export function generateWorkout(
  answers: QuizAnswers,
  diagnosis: DiagnosisResult,
  exerciseLibrary: ExerciseRecord[] = defaultExerciseLibrary
): WorkoutPlan {
  const profile = buildProfile(answers);
  const usedExerciseIds = new Set<string>();

  const sections = profile.split.map((dayPlan) =>
    buildWorkoutDay(dayPlan, answers, profile, exerciseLibrary, usedExerciseIds)
  );

  return {
    title: `Sugestao ${diagnosis.title}`,
    subtitle: "Treino montado por prioridade muscular, frequencia semanal e disponibilidade real.",
    estimatedDuration: profile.volume.duration,
    focus: [
      `Objetivo: ${formatGoal(answers.goal)}`,
      `Nivel: ${formatLevel(profile.level)}`,
      `Frequencia: ${profile.dayCount} dia(s)`,
      `Estilo: ${formatStyle(profile.style)}`
    ],
    sections,
    exercises: sections.flatMap((section) => section.exercises)
  };
}

function buildAdaptiveSplit(dayCount: number, style: TrainingStyle) {
  const muscleCount: Record<string, number> = {};
  const plans: DayPlan[] = [];
  let lastPrimary: string | null = null;

  for (let index = 0; index < dayCount; index += 1) {
    const primaryMuscles = selectPrimaryMuscles(dayCount, index, muscleCount, lastPrimary, style);
    const secondaryMuscles = selectSecondaryMuscles(primaryMuscles, muscleCount, style);
    const focus = primaryMuscles[0] ?? secondaryMuscles[0] ?? "chest";

    incrementMuscleUsage(primaryMuscles, muscleCount);
    incrementMuscleUsage(secondaryMuscles, muscleCount);
    lastPrimary = focus;

    plans.push({
      title: getDayTitle(index),
      focus,
      primaryMuscles,
      secondaryMuscles
    });
  }

  return plans;
}

function buildWorkoutDay(
  dayPlan: DayPlan,
  answers: QuizAnswers,
  profile: WorkoutProfile,
  library: ExerciseRecord[],
  usedExerciseIds: Set<string>
): WorkoutSection {
  const eligibleExercises = library
    .filter((exercise) => matchesLocation(exercise, answers.location))
    .filter((exercise) => matchesLevel(exercise, profile.level))
    .filter((exercise) => !usedExerciseIds.has(exercise.id))
    .filter((exercise) => matchesDayMuscles(exercise, dayPlan))
    .sort((a, b) => scoreExerciseForDay(b, dayPlan, profile) - scoreExerciseForDay(a, dayPlan, profile));

  const mobility = getMobilityByFocus(dayPlan.focus);
  const mainCompoundCount = profile.style === "hypertrophy" ? 3 : 2;
  const compounds = pickUniqueExercises(eligibleExercises, "compound", dayPlan, mainCompoundCount, usedExerciseIds);
  const isolations = pickUniqueExercises(eligibleExercises, "isolation", dayPlan, 2, usedExerciseIds);
  const functionals = profile.includeFunctional
    ? pickUniqueExercises(eligibleExercises, "functional", dayPlan, getFunctionalTarget(profile.style), usedExerciseIds)
    : [];

  const selectedExercises = [...compounds, ...isolations, ...functionals]
    .slice(0, profile.volume.mainLimit);
  selectedExercises.forEach((exercise) => usedExerciseIds.add(exercise.id));
  const exercises = selectedExercises.map((exercise, index) => toWorkoutExercise(exercise, profile, index, dayPlan));

  return {
    title: dayPlan.title,
    subtitle: buildSubtitle(dayPlan),
    focus: dayPlan.focus,
    mobility,
    exercises
  };
}

function selectPrimaryMuscles(
  dayCount: number,
  dayIndex: number,
  muscleCount: Record<string, number>,
  lastPrimary: string | null,
  style: TrainingStyle
) {
  if (dayCount <= 2) {
    const upper = pickMuscleFromPool(["chest", "back"], muscleCount, lastPrimary);
    const lower = pickMuscleFromPool(["quadriceps", "hamstrings", "glutes"], muscleCount, null);
    return uniqueMuscles([upper, lower]);
  }

  if (dayCount === 3) {
    const rotatedPrimaryPools = [
      ["chest", "quadriceps"],
      ["back", "hamstrings"],
      ["glutes", style === "conditioning" ? "back" : "chest"]
    ];

    const pool = rotatedPrimaryPools[dayIndex] ?? PRIMARY_MUSCLES;
    const first = pickMuscleFromPool(pool, muscleCount, lastPrimary);
    const second = pickMuscleFromPool(pool.filter((muscle) => muscle !== first), muscleCount, first);
    return uniqueMuscles([first, second]);
  }

  if (dayCount <= 5) {
    const pool = dayIndex % 2 === 0 ? ["chest", "back", "shoulders"] : ["quadriceps", "hamstrings", "glutes"];
    const first = pickMuscleFromPool(pool, muscleCount, lastPrimary);
    const second = pickMuscleFromPool(pool.filter((muscle) => muscle !== first), muscleCount, null);
    return uniqueMuscles([first, second]);
  }

  const advancedPool =
    style === "conditioning"
      ? ["chest", "back", "quadriceps", "hamstrings", "glutes", "shoulders", "abs"]
      : ["chest", "back", "quadriceps", "hamstrings", "glutes", "shoulders"];

  const first = pickMuscleFromPool(advancedPool, muscleCount, lastPrimary);
  const second = pickMuscleFromPool(advancedPool.filter((muscle) => muscle !== first), muscleCount, null);
  return uniqueMuscles([first, second]);
}

function selectSecondaryMuscles(
  primaryMuscles: string[],
  muscleCount: Record<string, number>,
  style: TrainingStyle
) {
  const candidates = getSecondaryCandidates(primaryMuscles, style);
  const first = pickMuscleFromPool(candidates, muscleCount, null);
  const second = pickMuscleFromPool(candidates.filter((muscle) => muscle !== first), muscleCount, null);
  return uniqueMuscles([first, second]);
}

function pickMuscleFromPool(
  pool: readonly string[],
  muscleCount: Record<string, number>,
  blockedPrimary: string | null
) {
  const sortedPool = [...pool].sort((a, b) => (muscleCount[a] ?? 0) - (muscleCount[b] ?? 0));

  const available = sortedPool.find((muscle) => {
    if (blockedPrimary && muscle === blockedPrimary) return false;
    return (muscleCount[muscle] ?? 0) < (MAX_PER_WEEK[muscle] ?? 2);
  });

  if (available) {
    return available;
  }

  return sortedPool.find((muscle) => muscle !== blockedPrimary) ?? sortedPool[0] ?? "abs";
}

function getSecondaryCandidates(primaryMuscles: string[], style: TrainingStyle) {
  const candidates = new Set<string>();

  for (const muscle of primaryMuscles) {
    if (muscle === "chest") {
      candidates.add("triceps");
      candidates.add("shoulders");
    } else if (muscle === "back") {
      candidates.add("biceps");
      candidates.add("lower_back");
    } else if (muscle === "quadriceps" || muscle === "hamstrings" || muscle === "glutes") {
      candidates.add("calves");
      candidates.add("abs");
      candidates.add("lower_back");
    } else if (muscle === "abs") {
      candidates.add("lower_back");
    } else if (muscle === "shoulders") {
      candidates.add("triceps");
    }
  }

  if (style !== "hypertrophy") {
    candidates.add("abs");
  }

  return [...candidates].filter((muscle) => SECONDARY_MUSCLES.includes(muscle as (typeof SECONDARY_MUSCLES)[number]));
}

function incrementMuscleUsage(muscles: string[], muscleCount: Record<string, number>) {
  for (const muscle of muscles) {
    muscleCount[muscle] = (muscleCount[muscle] ?? 0) + 1;
  }
}

function uniqueMuscles(muscles: Array<string | undefined>) {
  return Array.from(new Set(muscles.filter(Boolean))) as string[];
}

function pickUniqueExercises(
  exercises: ExerciseRecord[],
  type: "compound" | "isolation" | "functional",
  dayPlan: DayPlan,
  limit: number,
  usedExerciseIds: Set<string>
) {
  return exercises
    .filter((exercise) => !usedExerciseIds.has(exercise.id))
    .filter((exercise) => getExerciseType(exercise) === type)
    .filter((exercise) => matchesDayMuscles(exercise, dayPlan))
    .slice(0, limit);
}

function matchesDayMuscles(exercise: ExerciseRecord, dayPlan: DayPlan) {
  const muscles = getNormalizedExerciseMuscles(exercise);
  const tags = exercise.tags ?? [];
  const dayMuscles = [...dayPlan.primaryMuscles, ...dayPlan.secondaryMuscles];

  if (muscles.some((muscle) => dayMuscles.includes(muscle))) return true;
  if (muscles.some((muscle) => getRelatedMuscles(muscle).some((related) => dayMuscles.includes(related)))) {
    return true;
  }
  if (dayPlan.primaryMuscles.includes("chest") && tags.includes("push")) return true;
  if (dayPlan.primaryMuscles.includes("back") && tags.includes("pull")) return true;
  if (dayPlan.primaryMuscles.some((item) => ["quadriceps", "hamstrings", "glutes"].includes(item)) && (tags.includes("legs") || tags.includes("lower"))) return true;
  if (getExerciseType(exercise) === "functional" && dayPlan.secondaryMuscles.includes("abs")) return true;

  return false;
}

function scoreExerciseForDay(exercise: ExerciseRecord, dayPlan: DayPlan, profile: WorkoutProfile) {
  const muscles = getNormalizedExerciseMuscles(exercise);
  const type = getExerciseType(exercise);
  let score = 0;

  const primaryHits = muscles.filter((muscle) => dayPlan.primaryMuscles.includes(muscle)).length;
  const secondaryHits = muscles.filter((muscle) => dayPlan.secondaryMuscles.includes(muscle)).length;
  const relatedPrimaryHits = muscles.filter(
    (muscle) =>
      !dayPlan.primaryMuscles.includes(muscle) &&
      getRelatedMuscles(muscle).some((related) => dayPlan.primaryMuscles.includes(related))
  ).length;
  const relatedSecondaryHits = muscles.filter(
    (muscle) =>
      !dayPlan.secondaryMuscles.includes(muscle) &&
      getRelatedMuscles(muscle).some((related) => dayPlan.secondaryMuscles.includes(related))
  ).length;

  score += primaryHits * 5;
  score += secondaryHits * 3;
  score += relatedPrimaryHits * 2;
  score += relatedSecondaryHits;
  if (type === "compound") score += profile.style === "hypertrophy" ? 4 : 2;
  if (type === "isolation") score += 2;
  if (type === "functional" && profile.includeFunctional) score += 3;
  if (profile.level === "beginner" && isSimpleExercise(exercise)) score += 3;

  return score;
}

function getMobilityByFocus(focus: string): WorkoutExercise[] {
  const mobilityMap: Record<string, string[]> = {
    chest: ["Mobilidade toracica na parede", "Alongamento dinamico de peitoral"],
    back: ["Mobilidade escapular", "Rotacao toracica"],
    quadriceps: ["Mobilidade de tornozelo", "Alongamento dinamico de quadril"],
    hamstrings: ["Mobilidade de quadril", "Alongamento dinamico de posterior"],
    glutes: ["Mobilidade de quadril", "Ativacao de gluteos"],
    shoulders: ["Rotacao de ombros", "Mobilidade toracica"],
    conditioning: ["Mobilidade global", "Ativacao de core"]
  };

  return (mobilityMap[focus] ?? ["Mobilidade de quadril", "Rotacao de ombros"]).slice(0, 2).map((name) => ({
    name,
    sets: "1-2",
    reps: "30-45s",
    rest: "15s",
    technique: "mobilidade"
  }));
}

function toWorkoutExercise(
  exercise: ExerciseRecord,
  profile: WorkoutProfile,
  index: number,
  dayPlan: DayPlan
): WorkoutExercise {
  return {
    name: exercise.name,
    sets: profile.volume.sets,
    reps: profile.reps,
    rest: profile.rest,
    technique: getTechnique(profile, index, exercise, dayPlan),
    videoUrl: exercise.video_url
  };
}

function getTechnique(
  profile: WorkoutProfile,
  index: number,
  exercise: ExerciseRecord,
  dayPlan: DayPlan
) {
  const type = getExerciseType(exercise);
  const muscles = getNormalizedExerciseMuscles(exercise);

  if (profile.level === "beginner") return "adaptacao";
  if (profile.style === "hypertrophy" && type === "compound") return index % 2 === 0 ? "piramide" : "rest-pause";
  if (profile.includeFunctional && type === "functional") return "circuito";
  if (muscles.some((muscle) => dayPlan.secondaryMuscles.includes(muscle))) return "controle";

  return "tradicional";
}

function resolveDayCount(days: QuizAnswers["days"]) {
  return Math.min(Math.max(Number(days) || 1, 1), 7);
}

function resolveVolume(time: QuizAnswers["time"]) {
  const minutes = Number(time) || 45;
  return volumePresets.find((preset) => minutes <= preset.max) ?? volumePresets[1];
}

function getRepRange(style: TrainingStyle, level: TrainingLevel) {
  if (level === "beginner") return "12-15";
  if (style === "hypertrophy") return "6-12";
  if (style === "conditioning") return "12-20";
  return "8-15";
}

function getRest(style: TrainingStyle) {
  if (style === "hypertrophy") return "60-90s";
  if (style === "conditioning") return "30-45s";
  return "45-60s";
}

function getFunctionalTarget(style: TrainingStyle) {
  if (style === "conditioning") return 2;
  if (style === "fat_loss") return 1;
  return 0;
}

function getExerciseType(exercise: ExerciseRecord) {
  const rawType = exercise.type ?? exercise.metadata?.type;
  if (rawType) {
    return resolveExerciseMovementType(rawType);
  }

  const tags = exercise.tags ?? [];
  if (tags.includes("functional") || tags.includes("cardio")) return "functional";
  if (tags.includes("isolation")) return "isolation";
  return "compound";
}

function matchesLocation(exercise: ExerciseRecord, location: QuizAnswers["location"]) {
  const locations = normalizeStringArray(exercise.location ?? exercise.metadata?.location).map(normalizeLocation);
  if (!locations.length) return true;
  return locations.includes(location);
}

function matchesLevel(exercise: ExerciseRecord, level: TrainingLevel) {
  const levels = normalizeStringArray(exercise.level ?? exercise.metadata?.level).map(normalizeLevel);
  if (!levels.length) return true;
  if (level === "advanced") return true;
  if (level === "intermediate") return levels.includes("beginner") || levels.includes("intermediate");
  return levels.includes("beginner");
}

function isSimpleExercise(exercise: ExerciseRecord) {
  const tags = exercise.tags ?? [];
  const type = getExerciseType(exercise);
  return type === "isolation" || tags.includes("machine") || tags.includes("bodyweight") || tags.includes("dumbbell");
}

function buildSubtitle(dayPlan: DayPlan) {
  return `Primario: ${dayPlan.primaryMuscles.map(formatMuscle).join(", ")} | Secundario: ${dayPlan.secondaryMuscles.map(formatMuscle).join(", ")}`;
}

function getDayTitle(index: number) {
  return `Treino ${String.fromCharCode(65 + index)}`;
}

function normalizeStringArray(value?: string | string[] | null) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeLocation(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "academia") return "gym";
  if (normalized === "casa") return "home";
  return normalized;
}

function normalizeLevel(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "iniciante") return "beginner";
  if (normalized === "intermediario") return "intermediate";
  if (normalized === "avancado") return "advanced";
  return normalized;
}

function normalizeMuscle(value?: string | null) {
  const normalized = normalizeText(value);

  const map: Record<string, string> = {
    peito: "chest",
    costas: "back",
    ombro: "shoulders",
    ombros: "shoulders",
    biceps: "biceps",
    triceps: "triceps",
    abdomen: "abs",
    quadriceps: "quadriceps",
    gluteo: "glutes",
    gluteos: "glutes",
    "posterior de coxa": "hamstrings",
    gemeos: "calves",
    antebraco: "forearms"
  };

  return map[normalized] ?? normalized;
}

function normalizeType(value?: string | null) {
  const normalized = normalizeText(value);
  if (normalized === "composto") return "compound";
  if (normalized === "isolado") return "isolation";
  if (normalized === "funcional") return "functional";
  if (normalized === "mobilidade") return "mobility";
  return normalized;
}

function formatGoal(goal: Goal) {
  const labels: Record<Goal, string> = {
    lose_weight: "Emagrecimento",
    gain_muscle: "Hipertrofia",
    body_recomposition: "Definição",
    improve_conditioning: "Condicionamento"
  };

  return labels[goal];
}

function formatLevel(level: TrainingLevel) {
  const labels: Record<TrainingLevel, string> = {
    beginner: "Iniciante",
    intermediate: "Intermediário",
    advanced: "Avançado"
  };

  return labels[level];
}

function formatStyle(style: TrainingStyle) {
  const labels: Record<TrainingStyle, string> = {
    fat_loss: "Maior gasto calórico",
    hypertrophy: "Maior tensão mecânica",
    conditioning: "Maior condicionamento"
  };

  return labels[style];
}

function formatMuscle(muscle: string) {
  if (muscle === "conditioning") return "Condicionamento";
  if (muscle === "full_body") return "Corpo inteiro";
  return formatExerciseMuscleLabel(muscle);
}

function getNormalizedExerciseMuscles(exercise: ExerciseRecord) {
  const muscles = getExerciseMuscleGroups(exercise);
  return muscles.length ? muscles : ["full_body"];
}

function getRelatedMuscles(muscle: string) {
  const related: Record<string, string[]> = {
    chest: ["shoulders", "triceps"],
    back: ["biceps", "forearms", "lower_back"],
    quadriceps: ["glutes", "calves", "adductors", "hip_flexors", "lower_back"],
    hamstrings: ["glutes", "calves", "adductors", "lower_back"],
    glutes: ["hamstrings", "quadriceps", "abductors", "adductors", "lower_back"],
    shoulders: ["chest", "triceps"],
    biceps: ["back", "forearms"],
    triceps: ["chest", "shoulders"],
    calves: ["tibialis", "quadriceps"],
    abs: ["hip_flexors", "glutes", "lower_back"],
    lower_back: ["back", "glutes", "hamstrings", "abs"],
    forearms: ["back", "biceps"],
    adductors: ["quadriceps", "glutes", "hamstrings"],
    abductors: ["glutes", "quadriceps"],
    tibialis: ["calves", "quadriceps"],
    hip_flexors: ["abs", "quadriceps"]
  };

  return related[muscle] ?? [];
}
