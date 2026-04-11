import { resolveBodyType } from "@/lib/body-type";
import {
  formatExerciseMuscleLabel,
  getExerciseMuscleGroups,
  resolveExerciseMovementType
} from "@/lib/exercise-library";
import {
  buildSessionTimeBudget,
  buildTimeBudgetBrief,
  type SessionTimeBudget
} from "@/lib/workout-time";
import type { ExerciseRecord, QuizAnswers, WorkoutBlockType } from "@/lib/types";

export type TrainingLevel = "beginner" | "intermediate" | "advanced";
export type TrainingGoalStyle = "fat_loss" | "hypertrophy" | "conditioning" | "recomposition";
export type WorkoutSplitType =
  | "full_body_single"
  | "full_body_repeated"
  | "full_body_ab"
  | "full_body_emphasis"
  | "upper_lower_full"
  | "upper_lower"
  | "push_pull_legs_plus"
  | "body_part_split";

export type SessionBlueprint = {
  day: string;
  title: string;
  sessionFocus: string;
  rationale: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  preferredBlockTypes: WorkoutBlockType[];
};

export type WorkoutStrategy = {
  splitType: WorkoutSplitType;
  splitLabel: string;
  rationale: string;
  level: TrainingLevel;
  goalStyle: TrainingGoalStyle;
  dayCount: number;
  timeAvailable: number;
  timeBudget: SessionTimeBudget;
  equipment: string[];
  bodyType: string;
  weeklyVolumeTargets: Record<string, number>;
  allowedBlockTypes: WorkoutBlockType[];
  maxAdvancedBlocksPerSession: number;
  sessions: SessionBlueprint[];
};

type ExerciseProfile = {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementPattern: string;
  movementType: string;
  recommendedBlockTypes: WorkoutBlockType[];
};

const ALL_MUSCLES = [
  "chest",
  "back",
  "quadriceps",
  "hamstrings",
  "glutes",
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

const COMBINED_BLOCKS = new Set<WorkoutBlockType>(["superset", "bi-set", "tri-set", "circuit"]);
const ADVANCED_BLOCKS = new Set<WorkoutBlockType>([
  "superset",
  "bi-set",
  "tri-set",
  "drop-set",
  "rest-pause",
  "cluster",
  "pre-exaustao",
  "pos-exaustao",
  "circuit"
]);

export function buildWorkoutStrategy(answers: QuizAnswers): WorkoutStrategy {
  const level = resolveTrainingLevel(answers.experience);
  const goalStyle = resolveGoalStyle(answers.goal);
  const dayCount = clamp(Number(answers.days) || 1, 1, 7);
  const timeAvailable = clamp(Number(answers.time) || 45, 15, 120);
  const equipment = normalizeEquipmentList(answers.equipment);
  const bodyType = resolveBodyType(answers);
  const timeBudget = buildSessionTimeBudget({
    availableTimeMinutes: timeAvailable,
    level,
    goalStyle
  });
  const splitType = decideSplitType({
    dayCount,
    level,
    goalStyle,
    timeAvailable,
    equipment
  });
  const sessions = buildSessionBlueprints(splitType, dayCount, goalStyle);

  return {
    splitType,
    splitLabel: formatSplitTypeLabel(splitType),
    rationale: buildSplitRationale(splitType, level, goalStyle, timeAvailable),
    level,
    goalStyle,
    dayCount,
    timeAvailable,
    timeBudget,
    equipment,
    bodyType,
    weeklyVolumeTargets: buildWeeklyVolumeTargets(sessions, goalStyle, level),
    allowedBlockTypes: buildAllowedBlockTypes(level, goalStyle, timeAvailable, timeBudget),
    maxAdvancedBlocksPerSession: buildTechniqueBudget(level, goalStyle, timeAvailable, timeBudget),
    sessions
  };
}

export function buildExerciseProfile(exercise: ExerciseRecord): ExerciseProfile {
  const primary = inferPrimaryMuscles(exercise);
  const movementType = resolveExerciseMovementType(exercise.type ?? exercise.metadata?.type);
  const movementPattern = inferMovementPattern(exercise, primary[0] ?? "full_body", movementType);

  return {
    primaryMuscles: primary,
    secondaryMuscles: inferSecondaryMuscles(primary, movementType),
    movementPattern,
    movementType,
    recommendedBlockTypes: inferRecommendedBlockTypes(movementType, movementPattern)
  };
}

export function normalizeBlockType(value?: string | null): WorkoutBlockType {
  const normalized = normalizeText(value).replaceAll("_", "-");

  if (!normalized || normalized === "normal" || normalized === "tradicional") return "normal";
  if (normalized === "mobility" || normalized === "mobilidade") return "mobility";
  if (normalized === "superset" || normalized === "superserie" || normalized === "superserie") return "superset";
  if (normalized === "bi-set" || normalized === "biset") return "bi-set";
  if (normalized === "tri-set" || normalized === "triset") return "tri-set";
  if (normalized === "drop-set" || normalized === "dropset") return "drop-set";
  if (normalized === "rest-pause" || normalized === "restpause") return "rest-pause";
  if (normalized === "cluster") return "cluster";
  if (normalized === "isometria" || normalized === "isometric") return "isometria";
  if (normalized === "tempo-controlado" || normalized === "tempo" || normalized === "tempo_controlado") {
    return "tempo_controlado";
  }
  if (normalized === "parciais" || normalized === "parcial") return "parciais";
  if (normalized === "pre-exaustao" || normalized === "preexaustao" || normalized === "pre-exhaust") {
    return "pre-exaustao";
  }
  if (normalized === "pos-exaustao" || normalized === "posexaustao" || normalized === "post-exhaust") {
    return "pos-exaustao";
  }
  if (normalized === "circuit" || normalized === "circuito") return "circuit";

  return "normal";
}

export function isCombinedBlockType(value?: string | null) {
  return COMBINED_BLOCKS.has(normalizeBlockType(value));
}

export function isAdvancedBlockType(value?: string | null) {
  return ADVANCED_BLOCKS.has(normalizeBlockType(value));
}

export function formatSplitTypeLabel(value?: string | null) {
  const labels: Record<WorkoutSplitType, string> = {
    full_body_single: "Full body único",
    full_body_repeated: "Full body repetido",
    full_body_ab: "Full body A/B",
    full_body_emphasis: "Full body com ênfases",
    upper_lower_full: "Upper / Lower / Full",
    upper_lower: "Upper / Lower",
    push_pull_legs_plus: "Push / Pull / Legs + complementares",
    body_part_split: "Divisão por grupamentos"
  };

  return value && value in labels ? labels[value as WorkoutSplitType] : "Plano sugerido";
}

export function formatBlockTypeLabel(value?: string | null) {
  const labels: Record<WorkoutBlockType, string> = {
    normal: "Normal",
    mobility: "Mobilidade",
    superset: "Supersérie",
    "bi-set": "Bi-set",
    "tri-set": "Tri-set",
    "drop-set": "Drop-set",
    "rest-pause": "Rest-pause",
    cluster: "Cluster",
    isometria: "Isometria",
    tempo_controlado: "Tempo controlado",
    parciais: "Parciais",
    "pre-exaustao": "Pré-exaustão",
    "pos-exaustao": "Pós-exaustão",
    circuit: "Circuito"
  };

  return labels[normalizeBlockType(value)];
}

export function formatMuscleLabel(value?: string | null) {
  if (value === "full_body") {
    return "Corpo inteiro";
  }

  return formatExerciseMuscleLabel(value);
}

export function buildCoachBrief(strategy: WorkoutStrategy) {
  return {
    splitType: strategy.splitType,
    splitLabel: strategy.splitLabel,
    rationale: strategy.rationale,
    timeBudget: buildTimeBudgetBrief(strategy.timeBudget),
    weeklyVolumeTargets: strategy.weeklyVolumeTargets,
    allowedBlockTypes: strategy.allowedBlockTypes,
    maxAdvancedBlocksPerSession: strategy.maxAdvancedBlocksPerSession,
    sessions: strategy.sessions.map((session) => ({
      day: session.day,
      title: session.title,
      sessionFocus: session.sessionFocus,
      rationale: session.rationale,
      primaryMuscles: session.primaryMuscles,
      secondaryMuscles: session.secondaryMuscles,
      preferredBlockTypes: session.preferredBlockTypes
    }))
  };
}

function resolveTrainingLevel(experience: QuizAnswers["experience"]): TrainingLevel {
  if (experience === "no_training" || experience === "lt_6_months") return "beginner";
  if (experience === "6_to_12_months") return "intermediate";
  return "advanced";
}

function resolveGoalStyle(goal: QuizAnswers["goal"]): TrainingGoalStyle {
  if (goal === "gain_muscle") return "hypertrophy";
  if (goal === "improve_conditioning") return "conditioning";
  if (goal === "body_recomposition") return "recomposition";
  return "fat_loss";
}

function decideSplitType(input: {
  dayCount: number;
  level: TrainingLevel;
  goalStyle: TrainingGoalStyle;
  timeAvailable: number;
  equipment: string[];
}): WorkoutSplitType {
  const limitedEquipment = input.equipment.length <= 1 || input.equipment.includes("nenhum");
  const shortSessions = input.timeAvailable <= 35;

  if (input.dayCount === 1) return "full_body_single";
  if (input.dayCount === 2) {
    return input.level === "beginner" || shortSessions ? "full_body_repeated" : "full_body_ab";
  }

  if (input.dayCount === 3) {
    if (input.level === "advanced" && !limitedEquipment && input.goalStyle === "hypertrophy") {
      return "upper_lower_full";
    }

    return limitedEquipment || shortSessions ? "full_body_emphasis" : "upper_lower_full";
  }

  if (input.dayCount === 4) {
    return "upper_lower";
  }

  if (input.level === "advanced" && !limitedEquipment && input.goalStyle === "hypertrophy") {
    return "body_part_split";
  }

  return "push_pull_legs_plus";
}

function buildSessionBlueprints(
  splitType: WorkoutSplitType,
  dayCount: number,
  goalStyle: TrainingGoalStyle
): SessionBlueprint[] {
  const base: Record<WorkoutSplitType, SessionBlueprint[]> = {
    full_body_single: [
      session("A", "Treino A", "Full body completo com foco em grandes padrões", "Um único treino precisa cobrir empurrar, puxar e pernas sem inflar o volume.", ["quadriceps", "chest", "back"], ["glutes", "shoulders", "abs"], ["mobility", "normal"])
    ],
    full_body_repeated: [
      session("A", "Treino A", "Full body base com ênfase em agachar e empurrar", "A repetição controlada acelera aprendizado motor e consistência.", ["quadriceps", "chest", "back"], ["glutes", "triceps", "abs"], ["mobility", "normal"]),
      session("B", "Treino B", "Full body base com ênfase em puxar e cadeia posterior", "Mantém o corpo inteiro estimulado, mas alterna o foco para recuperar melhor.", ["hamstrings", "back", "glutes"], ["shoulders", "biceps", "abs"], ["mobility", "normal"])
    ],
    full_body_ab: [
      session("A", "Treino A", "Full body com ênfase em quadríceps, peito e costas", "Distribui volume alto nos grandes grupamentos sem sobrecarregar os mesmos secundários no treino seguinte.", ["quadriceps", "chest", "back"], ["glutes", "triceps", "abs"], ["mobility", "normal", "superset"]),
      session("B", "Treino B", "Full body com ênfase em posterior, ombros e braços", "Completa a semana com dominante de quadril e mais espaço para ombros e braços.", ["hamstrings", "glutes", "shoulders"], ["back", "biceps", "triceps"], ["mobility", "normal", "superset"])
    ],
    full_body_emphasis: [
      session("A", "Treino A", "Full body com ênfase em quadríceps e empurrar", "Abre a semana com exercícios multiarticulares e volume controlado nas prioridades.", ["quadriceps", "chest", "shoulders"], ["triceps", "abs", "glutes"], ["mobility", "normal", "superset"]),
      session("B", "Treino B", "Full body com ênfase em puxar e posterior", "Equilibra a recuperação dos ombros e melhora o volume de costas e cadeia posterior.", ["back", "hamstrings", "glutes"], ["biceps", "abs", "shoulders"], ["mobility", "normal", "superset"]),
      session("C", "Treino C", "Full body com densidade e foco complementar", "Fecha a rotação reforçando pontos fracos sem repetir o mesmo padrão pesado em dias seguidos.", ["chest", "back", "glutes"], ["quadriceps", "shoulders", "abs"], ["mobility", "normal", goalStyle === "conditioning" ? "circuit" : "bi-set"])
    ],
    upper_lower_full: [
      session("A", "Treino A", "Upper equilibrado com prioridade para compostos", "Concentra os maiores movimentos de empurrar e puxar na mesma sessão.", ["chest", "back", "shoulders"], ["triceps", "biceps", "abs"], ["mobility", "normal", "superset"]),
      session("B", "Treino B", "Lower com ênfase em quadríceps e cadeia posterior", "Agrupa os movimentos de pernas para dar recuperação real ao tronco e aos secundários.", ["quadriceps", "hamstrings", "glutes"], ["calves", "abs"], ["mobility", "normal"]),
      session("C", "Treino C", "Full body de reforço com foco em eficiência", "Mantém frequência alta dos básicos sem repetir o mesmo stress dos dois treinos anteriores.", ["back", "chest", "glutes"], ["shoulders", "biceps", "triceps"], ["mobility", "normal", goalStyle === "conditioning" ? "circuit" : "bi-set"])
    ],
    upper_lower: [
      session("A", "Treino A", "Upper com ênfase em empurrar e dorsais", "Combina presses e remadas para melhor custo-benefício de volume.", ["chest", "back", "shoulders"], ["triceps", "biceps"], ["mobility", "normal", "superset"]),
      session("B", "Treino B", "Lower dominante de quadríceps", "Prioriza joelho e glúteos sem misturar fadiga excessiva de tronco.", ["quadriceps", "glutes", "calves"], ["abs", "hamstrings"], ["mobility", "normal"]),
      session("C", "Treino C", "Upper com ênfase em costas e ombros", "Redistribui os secundários para reduzir sobreposição com o treino A.", ["back", "shoulders", "biceps"], ["chest", "triceps"], ["mobility", "normal", "bi-set"]),
      session("D", "Treino D", "Lower dominante de quadril e posterior", "Fecha a rotação com maior foco em cadeia posterior e estabilidade.", ["hamstrings", "glutes", "abs"], ["quadriceps", "calves"], ["mobility", "normal"])
    ],
    push_pull_legs_plus: [
      session("A", "Treino A", "Push com foco em peitoral, deltoide anterior e tríceps", "Agrupa os movimentos de empurrar para progressão mais objetiva.", ["chest", "shoulders", "triceps"], ["abs"], ["mobility", "normal", "superset"]),
      session("B", "Treino B", "Pull com foco em dorsais, romboides e bíceps", "Mantém a recuperação do peitoral e melhora a densidade de costas.", ["back", "biceps", "shoulders"], ["abs"], ["mobility", "normal", "superset"]),
      session("C", "Treino C", "Legs com foco em quadríceps e glúteos", "Reserva um dia inteiro para pernas com melhor controle de volume.", ["quadriceps", "glutes", "hamstrings"], ["calves", "abs"], ["mobility", "normal"]),
      session("D", "Treino D", "Upper complementar com ênfase em ombros e braços", "Aumenta a frequência do tronco sem repetir o mesmo stress pesado do início da rotação.", ["shoulders", "biceps", "triceps"], ["chest", "back"], ["mobility", "normal", "bi-set"]),
      session("E", "Treino E", goalStyle === "conditioning" ? "Sessão metabólica controlada" : "Lower posterior e reforço do core", goalStyle === "conditioning" ? "Usa densidade para gasto energético sem virar cardio aleatório." : "Complementa a semana com posterior e estabilidade.", goalStyle === "conditioning" ? ["glutes", "hamstrings", "abs"] : ["hamstrings", "glutes", "abs"], ["calves", "back"], ["mobility", goalStyle === "conditioning" ? "circuit" : "normal", goalStyle === "hypertrophy" ? "drop-set" : "superset"])
    ],
    body_part_split: [
      session("A", "Treino A", "Peito e tríceps com presses pesados e complementares", "Permite maior especificidade para hipertrofia sem misturar demandas conflitantes.", ["chest", "triceps"], ["shoulders"], ["mobility", "normal", "superset", "drop-set"]),
      session("B", "Treino B", "Costas e bíceps com foco em largura e espessura", "Agrupa puxadas e remadas com espaço para acessórios de bíceps.", ["back", "biceps"], ["shoulders"], ["mobility", "normal", "superset", "rest-pause"]),
      session("C", "Treino C", "Pernas com dominante de quadríceps", "Cria uma sessão forte para quadríceps e glúteos sem comprometer a recuperação posterior.", ["quadriceps", "glutes"], ["calves", "abs"], ["mobility", "normal", "drop-set"]),
      session("D", "Treino D", "Ombros e parte superior complementar", "Aumenta a frequência dos deltoides e estabilizadores do tronco.", ["shoulders", "chest", "back"], ["triceps", "biceps"], ["mobility", "normal", "bi-set"]),
      session("E", "Treino E", "Posterior, glúteos e braços complementares", "Fecha a semana com posterior e técnicas de intensificação em exercícios mais seguros.", ["hamstrings", "glutes", "biceps"], ["triceps", "abs"], ["mobility", "normal", "rest-pause", "drop-set"])
    ]
  };

  return base[splitType].slice(0, dayCount);
}

function buildWeeklyVolumeTargets(
  sessions: SessionBlueprint[],
  goalStyle: TrainingGoalStyle,
  level: TrainingLevel
) {
  const targets: Record<string, number> = {};

  for (const muscle of ALL_MUSCLES) {
    targets[muscle] = 0;
  }

  const primaryBase = goalStyle === "hypertrophy" ? (level === "beginner" ? 8 : level === "intermediate" ? 10 : 12) : goalStyle === "conditioning" ? 5 : 7;
  const secondaryBase = goalStyle === "hypertrophy" ? (level === "advanced" ? 4 : 3) : 2;

  for (const session of sessions) {
    for (const muscle of session.primaryMuscles) {
      targets[muscle] = (targets[muscle] ?? 0) + primaryBase;
    }
    for (const muscle of session.secondaryMuscles) {
      targets[muscle] = (targets[muscle] ?? 0) + secondaryBase;
    }
  }

  return targets;
}

function buildAllowedBlockTypes(
  level: TrainingLevel,
  goalStyle: TrainingGoalStyle,
  timeAvailable: number,
  timeBudget: SessionTimeBudget
): WorkoutBlockType[] {
  const allowed = new Set<WorkoutBlockType>(["normal", "mobility", "tempo_controlado", "isometria"]);

  allowed.add("superset");

  if (level !== "beginner" && timeAvailable >= 25) {
    allowed.add("bi-set");
  }

  if (goalStyle === "conditioning" || timeAvailable <= 40) {
    allowed.add("circuit");
    allowed.add("superset");
  }

  if (goalStyle === "hypertrophy" && level !== "beginner" && timeBudget.allowAdvancedTechniques) {
    allowed.add("drop-set");
    allowed.add("rest-pause");
    allowed.add("pre-exaustao");
    allowed.add("pos-exaustao");
  }

  if (level === "advanced" && timeBudget.allowAdvancedTechniques && timeAvailable >= 55) {
    allowed.add("tri-set");
    allowed.add("cluster");
    allowed.add("parciais");
  }

  return Array.from(allowed);
}

function buildTechniqueBudget(
  level: TrainingLevel,
  goalStyle: TrainingGoalStyle,
  timeAvailable: number,
  timeBudget: SessionTimeBudget
) {
  if (level === "beginner") {
    return timeBudget.bucket === "express" ? 1 : Math.max(1, timeBudget.targetCombinedBlocks);
  }

  if (level === "advanced") {
    if (goalStyle === "conditioning") {
      return Math.max(1, timeBudget.targetCombinedBlocks);
    }

    return timeBudget.allowAdvancedTechniques
      ? Math.max(2, timeBudget.targetCombinedBlocks + (timeAvailable >= 70 ? 1 : 0))
      : Math.max(1, timeBudget.targetCombinedBlocks);
  }

  return timeBudget.allowAdvancedTechniques ? Math.max(2, timeBudget.targetCombinedBlocks) : Math.max(1, timeBudget.targetCombinedBlocks);
}

function buildSplitRationale(
  splitType: WorkoutSplitType,
  level: TrainingLevel,
  goalStyle: TrainingGoalStyle,
  timeAvailable: number
) {
  const base = formatSplitTypeLabel(splitType);
  const density = timeAvailable <= 35 ? "com sessões mais densas e objetivas" : "com volume suficiente para cada grupamento";
  const levelNote =
    level === "beginner"
      ? "favorecendo aprendizado motor e segurança"
      : level === "intermediate"
        ? "equilibrando progressão e recuperação"
        : "permitindo mais especificidade e refinamento";
  const goalNote =
    goalStyle === "hypertrophy"
      ? "com foco em volume eficiente"
      : goalStyle === "conditioning"
        ? "com foco em densidade e condicionamento"
        : "com foco em eficiência e preservação muscular";

  return `${base} ${density}, ${levelNote} e ${goalNote}.`;
}

function inferPrimaryMuscles(exercise: ExerciseRecord) {
  const muscles = getExerciseMuscleGroups(exercise);
  return muscles.length ? muscles : ["full_body"];
}

function inferSecondaryMuscles(primaryMuscles: string[], movementType: string) {
  const compound = movementType === "compound";
  const secondary = new Set<string>();

  primaryMuscles.forEach((primary) => {
    resolveSecondaryCandidates(primary, compound).forEach((muscle) => {
      if (!primaryMuscles.includes(muscle)) {
        secondary.add(muscle);
      }
    });
  });

  return [...secondary];
}

function inferMovementPattern(exercise: ExerciseRecord, primaryMuscle: string, movementType: string) {
  const name = normalizeText(exercise.name);

  if (movementType === "mobility") return "mobility";
  if (name.includes("agach")) return "squat";
  if (name.includes("afundo") || name.includes("avanco") || name.includes("passada")) return "lunge";
  if (name.includes("terra") || name.includes("romeno") || name.includes("stiff")) return "hinge";
  if (name.includes("supino") || name.includes("flexao") || name.includes("crucifixo")) return "horizontal_push";
  if (name.includes("desenvolvimento") || name.includes("ombro")) return "vertical_push";
  if (name.includes("remada")) return "row";
  if (name.includes("puxada") || name.includes("barra")) return "vertical_pull";
  if (movementType === "functional") return "conditioning";
  if (primaryMuscle === "abs") return "core";
  return primaryMuscle;
}

function inferRecommendedBlockTypes(movementType: string, movementPattern: string): WorkoutBlockType[] {
  if (movementType === "mobility") return ["mobility"];
  if (movementType === "isolation") return ["normal", "bi-set", "drop-set", "tempo_controlado", "isometria"];
  if (movementType === "functional") return ["normal", "superset", "circuit", "tri-set"];
  if (movementPattern === "hinge" || movementPattern === "squat") return ["normal", "rest-pause"];
  return ["normal", "superset", "bi-set", "rest-pause"];
}

function normalizeEquipmentList(values?: string[] | null) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeText(value).replaceAll(" ", "_"))
        .filter(Boolean)
    )
  );
}

function resolveSecondaryCandidates(primary: string, compound: boolean) {
  if (primary === "chest") return compound ? ["shoulders", "triceps"] : ["triceps"];
  if (primary === "back") return compound ? ["biceps", "shoulders", "forearms", "lower_back"] : ["biceps", "forearms", "lower_back"];
  if (primary === "quadriceps") return compound ? ["glutes", "abs", "adductors", "lower_back"] : ["glutes"];
  if (primary === "hamstrings") return compound ? ["glutes", "abs", "adductors", "lower_back"] : ["glutes", "lower_back"];
  if (primary === "glutes") return compound ? ["hamstrings", "quadriceps", "abductors", "lower_back"] : ["hamstrings", "abductors"];
  if (primary === "shoulders") return compound ? ["triceps", "chest"] : ["triceps"];
  if (primary === "biceps") return ["back", "forearms"];
  if (primary === "triceps") return ["chest", "shoulders"];
  if (primary === "abs") return ["glutes", "hip_flexors", "lower_back"];
  if (primary === "lower_back") return ["back", "glutes", "hamstrings", "abs"];
  if (primary === "calves") return ["tibialis"];
  if (primary === "forearms") return ["biceps", "back"];
  if (primary === "adductors") return ["glutes", "quadriceps"];
  if (primary === "abductors") return ["glutes", "quadriceps"];
  if (primary === "tibialis") return ["calves"];
  if (primary === "hip_flexors") return ["abs", "quadriceps"];
  return [];
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}

function session(
  day: string,
  title: string,
  sessionFocus: string,
  rationale: string,
  primaryMuscles: string[],
  secondaryMuscles: string[],
  preferredBlockTypes: WorkoutBlockType[]
): SessionBlueprint {
  return {
    day,
    title,
    sessionFocus,
    rationale,
    primaryMuscles,
    secondaryMuscles,
    preferredBlockTypes
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
