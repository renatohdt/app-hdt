import { resolveBodyType } from "@/lib/body-type";
import {
  formatExerciseMuscleLabel,
  getExerciseMuscleGroups,
  normalizeExerciseMuscleGroup,
  resolveExerciseMovementType
} from "@/lib/exercise-library";
import {
  buildSessionTimeBudget,
  type SessionTimeBudget
} from "@/lib/workout-time";
import type { ExerciseRecord, FocusRegion, QuizAnswers, TrainingStyle, WorkoutBlockType } from "@/lib/types";

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
  | "body_part_split"
  | "focus_split";

export type SessionBlueprint = {
  day: string;
  title: string;
  sessionFocus: string;
  rationale: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  preferredBlockTypes: WorkoutBlockType[];
  // Estilo de treino deste treino específico (multi-estilo). Preenchido após a
  // distribuição; pode estar ausente em blueprints intermediários.
  trainingStyle?: TrainingStyle;
};

export type WorkoutStrategy = {
  splitType: WorkoutSplitType;
  splitLabel: string;
  rationale: string;
  level: TrainingLevel;
  goalStyle: TrainingGoalStyle;
  // Estilo representativo do plano (primeiro estilo). Para multi-estilo, cada
  // treino tem o seu em sessions[].trainingStyle; o conjunto está em trainingStyles.
  trainingStyle: TrainingStyle;
  trainingStyles: TrainingStyle[];
  dayCount: number;
  uniqueSessionCount: number;
  timeAvailable: number;
  timeBudget: SessionTimeBudget;
  equipment: string[];
  bodyType: string;
  focusRegion: FocusRegion;
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
  "cluster",
  "pre-exaustao",
  "pos-exaustao",
  "circuit"
]);

/**
 * Resolve quantos treinos DISTINTOS devem ser gerados para o usuário.
 *
 * O número de treinos únicos é menor ou igual ao número de dias por semana.
 * Quando menor, o app rotaciona os treinos automaticamente na semana
 * (ex: A→B→A→B para 4 dias com 2 treinos únicos).
 *
 * Critério de decisão: dias × tempo disponível por sessão.
 * Pouco tempo → menos sessões únicas (full body rota melhor).
 * Mais tempo  → mais sessões únicas (split específico vale a pena).
 *
 * Tabela:
 * days | ≤30min | 31–45min | ≥46min
 *   1  |   1    |    1     |   1
 *   2  |   1    |    2     |   2
 *   3  |   2    |    2     |   3
 *   4  |   2    |    3     |   3
 *   5  |   3    |    3     |   4
 *   6  |   3    |    3     |   6
 *   7  |   3    |    3     |   6
 */
function resolveUniqueSessionCount(dayCount: number, timeAvailable: number): number {
  const isShort  = timeAvailable <= 30;
  const isMedium = timeAvailable >= 31 && timeAvailable <= 45;
  const isLong   = timeAvailable >= 46;

  const table: Record<number, [number, number, number]> = {
    // day: [short, medium, long]
    1: [1, 1, 1],
    2: [1, 2, 2],
    3: [2, 2, 3],
    4: [2, 3, 3],
    5: [3, 3, 4],
    6: [3, 3, 6],
    7: [3, 3, 6]
  };

  const row = table[clamp(dayCount, 1, 7)];
  if (!row) return dayCount;

  if (isShort)  return row[0];
  if (isMedium) return row[1];
  if (isLong)   return row[2];
  return row[1];
}

export function buildWorkoutStrategy(answers: QuizAnswers): WorkoutStrategy {
  const level = resolveTrainingLevel(answers.experience);
  const goalStyle = resolveGoalStyle(answers.goal);
  const dayCount = clamp(Number(answers.days) || 1, 1, 7);
  const timeAvailable = clamp(Number(answers.time) || 45, 15, 120);
  const equipment = normalizeEquipmentList(answers.equipment);
  const bodyType = resolveBodyType(answers);
  const focusRegion: FocusRegion = answers.focusRegion ?? "balanced";
  // Conjunto de estilos do plano. Multi-estilo (premium): trainingStyles com 2+
  // estilos concretos. Caso contrário, 1 estilo (resolvendo "personal").
  const explicitSet = Array.isArray(answers.trainingStyles)
    ? Array.from(new Set(answers.trainingStyles.filter((s): s is TrainingStyle => Boolean(s) && s !== "personal")))
    : [];

  let trainingStyles: TrainingStyle[];
  if (explicitSet.length >= 1) {
    trainingStyles = explicitSet;
  } else {
    const requestedStyle: TrainingStyle = answers.trainingStyle ?? "personal";
    const single: TrainingStyle =
      requestedStyle === "personal"
        ? resolveAutoTrainingStyle(goalStyle, level, equipment, timeAvailable)
        : requestedStyle;
    trainingStyles = [single];
  }
  const trainingStyle: TrainingStyle = trainingStyles[0];
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
    equipment,
    focusRegion
  });
  // No multi-estilo, mais treinos DISTINTOS para separar bem os estilos pelos dias
  // (ex.: 4x/sem com 2 estilos → A/B/C/D alternando), em vez de só 2 treinos.
  const isMultiStyle = trainingStyles.length >= 2;
  const requestedUniqueSessions = isMultiStyle
    ? Math.min(dayCount, 6)
    : resolveUniqueSessionCount(dayCount, timeAvailable);
  const sessionStyles = distributeStylesAcrossSessions(trainingStyles, requestedUniqueSessions);
  const sessions = buildSessionBlueprints(splitType, requestedUniqueSessions, goalStyle, focusRegion, sessionStyles);
  // Ajusta ao nº real de blueprints disponíveis para o split (o slice pode reduzir).
  const uniqueSessionCount = sessions.length;

  return {
    splitType,
    splitLabel: formatSplitTypeLabel(splitType),
    rationale: buildSplitRationale(splitType, level, goalStyle, timeAvailable),
    level,
    goalStyle,
    trainingStyle,
    trainingStyles,
    dayCount,
    uniqueSessionCount,
    timeAvailable,
    timeBudget,
    equipment,
    bodyType,
    focusRegion,
    weeklyVolumeTargets: buildWeeklyVolumeTargets(sessions, goalStyle, level),
    allowedBlockTypes: buildAllowedBlockTypes(level, goalStyle, timeAvailable, timeBudget, trainingStyles),
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
    secondaryMuscles: inferSecondaryMuscles(exercise, primary, movementType),
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
  if (normalized === "warmup" || normalized === "aquecimento") return "warmup";

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
    body_part_split: "Divisão por grupamentos",
    focus_split: "Divisão com ênfase regional"
  };

  return value && value in labels ? labels[value as WorkoutSplitType] : "Plano sugerido";
}

export function formatBlockTypeLabel(value?: string | null) {
  const labels: Record<WorkoutBlockType, string> = {
    normal: "Normal",
    mobility: "Mobilidade",
    warmup: "Aquecimento",
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
    focusRegion: strategy.focusRegion !== "balanced" ? strategy.focusRegion : undefined,
    // timeBudget removido do prompt: os mesmos números já aparecem em texto na
    // seção RESTRIÇÕES OBRIGATÓRIAS (tempo-alvo, exercícios/sessão, blocos). Evita
    // duplicação em "código" e reduz tokens.
    weeklyVolumeTargets: strategy.weeklyVolumeTargets,
    // allowedBlockTypes removido do prompt: o bloco é definido pelo estilo de cada
    // treino (módulo de estilo); a validação de blocos continua interna ao app.
    maxAdvancedBlocksPerSession: strategy.maxAdvancedBlocksPerSession,
    sessions: strategy.sessions.map((session) => ({
      day: session.day,
      trainingStyle: session.trainingStyle ?? strategy.trainingStyle,
      primaryMuscles: session.primaryMuscles,
      secondaryMuscles: session.secondaryMuscles
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

/**
 * "Personal Escolhe": resolve um estilo de treino CONCRETO a partir das respostas.
 * Lógica em camadas (ver docs/estilos-de-treino.md, seção 4):
 *   1. Equipamento (viabilidade): sem carga, "tradicional" vira calistenia/funcional.
 *   2. Objetivo × nível (tabela). Regra fixa: iniciante nunca recebe HIIT.
 *   3. Tempo (desempate leve), sem quebrar a regra do iniciante.
 */
function resolveAutoTrainingStyle(
  goalStyle: TrainingGoalStyle,
  level: TrainingLevel,
  equipment: string[],
  timeAvailable: number
): TrainingStyle {
  // Camada 2 — tabela objetivo × nível.
  const table: Record<TrainingGoalStyle, Record<TrainingLevel, TrainingStyle>> = {
    fat_loss:      { beginner: "musculacao", intermediate: "funcional",  advanced: "hiit" },
    hypertrophy:   { beginner: "musculacao", intermediate: "musculacao", advanced: "musculacao" },
    conditioning:  { beginner: "funcional",  intermediate: "funcional",  advanced: "hiit" },
    recomposition: { beginner: "musculacao", intermediate: "funcional",  advanced: "musculacao" }
  };
  let style: TrainingStyle = table[goalStyle][level];

  // Camada 1 — equipamento. "Tradicional" só rende com carga (halteres/caneleira).
  const hasLoad = equipment.some((item) => ["halteres", "caneleira", "machine"].includes(item));
  if (style === "musculacao" && !hasLoad) {
    style = goalStyle === "hypertrophy" || goalStyle === "recomposition" ? "calistenia" : "funcional";
  }

  // Camada 3 — desempate por tempo. Avançado com pouco tempo: funcional → HIIT
  // (mais eficiente). Nunca afeta iniciante (a tabela já não lhe dá HIIT).
  if (style === "funcional" && level === "advanced" && timeAvailable <= 30) {
    style = "hiit";
  }

  return style;
}

/**
 * Distribui um conjunto de estilos pelos treinos únicos, de forma intercalada
 * (round-robin). Ex.: [A,B] em 6 treinos → A,B,A,B,A,B; em 5 → A,B,A,B,A.
 * Sobras vão para os primeiros estilos da lista.
 */
function distributeStylesAcrossSessions(styles: TrainingStyle[], sessionCount: number): TrainingStyle[] {
  const safeStyles = styles.length ? styles : (["musculacao"] as TrainingStyle[]);
  return Array.from({ length: Math.max(1, sessionCount) }, (_, index) => safeStyles[index % safeStyles.length]);
}

function decideSplitType(input: {
  dayCount: number;
  level: TrainingLevel;
  goalStyle: TrainingGoalStyle;
  timeAvailable: number;
  equipment: string[];
  focusRegion: FocusRegion;
}): WorkoutSplitType {
  const limitedEquipment = input.equipment.length <= 1 || input.equipment.includes("nenhum");
  const shortSessions = input.timeAvailable <= 35;

  // Com foco regional definido e pelo menos 3 dias, usa split dedicado
  if (input.focusRegion !== "balanced" && input.dayCount >= 3) {
    return "focus_split";
  }

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
  goalStyle: TrainingGoalStyle,
  focusRegion: FocusRegion = "balanced",
  sessionStyles: TrainingStyle[] = []
): SessionBlueprint[] {
  // HIIT não segue divisão por músculo: é full-body e variado (peito+perna,
  // costas+perna, etc.), evitando sobrecarregar o mesmo grupo no circuito.
  const HIIT_FULLBODY_PRIMARY = ["chest", "back", "quadriceps", "glutes", "abs"];
  const HIIT_FULLBODY_SECONDARY = ["shoulders", "hamstrings", "calves", "triceps", "biceps"];

  const assignStyles = (blueprints: SessionBlueprint[]): SessionBlueprint[] =>
    blueprints.map((blueprint, index) => {
      const style = sessionStyles[index] ?? sessionStyles[sessionStyles.length - 1] ?? blueprint.trainingStyle;
      if (style === "hiit") {
        return {
          ...blueprint,
          trainingStyle: style,
          sessionFocus: "Full body metabólico (HIIT)",
          primaryMuscles: HIIT_FULLBODY_PRIMARY,
          secondaryMuscles: HIIT_FULLBODY_SECONDARY
        };
      }
      return { ...blueprint, trainingStyle: style };
    });

  if (splitType === "focus_split") {
    return assignStyles(buildFocusSplitBlueprints(focusRegion, dayCount, goalStyle));
  }
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
      session("B", "Treino B", "Costas e bíceps com foco em largura e espessura", "Agrupa puxadas e remadas com espaço para acessórios de bíceps.", ["back", "biceps"], ["shoulders"], ["mobility", "normal", "superset", "drop-set"]),
      session("C", "Treino C", "Pernas com dominante de quadríceps", "Cria uma sessão forte para quadríceps e glúteos sem comprometer a recuperação posterior.", ["quadriceps", "glutes"], ["calves", "abs"], ["mobility", "normal", "drop-set"]),
      session("D", "Treino D", "Ombros e parte superior complementar", "Aumenta a frequência dos deltoides e estabilizadores do tronco.", ["shoulders", "chest", "back"], ["triceps", "biceps"], ["mobility", "normal", "bi-set"]),
      session("E", "Treino E", "Posterior, glúteos e braços complementares", "Fecha a semana com posterior e técnicas de intensificação em exercícios mais seguros.", ["hamstrings", "glutes", "biceps"], ["triceps", "abs"], ["mobility", "normal", "drop-set", "bi-set"])
    ],
    // Nunca acessado diretamente — focus_split usa buildFocusSplitBlueprints
    focus_split: []
  };

  return assignStyles(base[splitType].slice(0, dayCount));
}

/**
 * Blueprints de sessão para splits com ênfase regional.
 *
 * Princípio de ordenação: as 2 sessões do grupo foco ficam nas posições 1 e 3
 * (A e C), garantindo que mesmo com apenas 3 dias o músculo prioritário
 * já aparece duas vezes. A partir de 4 dias, o split fica completo.
 *
 * Slicando os primeiros N elementos sempre produz um programa coerente.
 */
function buildFocusSplitBlueprints(
  focusRegion: FocusRegion,
  dayCount: number,
  goalStyle: TrainingGoalStyle
): SessionBlueprint[] {
  const advancedBlocks: WorkoutBlockType[] = ["normal", "superset", "bi-set", "drop-set"];
  const baseBlocks: WorkoutBlockType[] = ["normal", "superset"];
  const condBlocks: WorkoutBlockType[] = goalStyle === "conditioning" ? ["normal", "circuit"] : baseBlocks;

  const blueprints: Record<Exclude<FocusRegion, "balanced">, SessionBlueprint[]> = {
    // ── PEITO ──────────────────────────────────────────────────────────────────
    chest: [
      session("A", "Peito + Ombro + Tríceps", "Push pesado com prioridade para peitoral",
        "Primeira sessão de push: volume alto em compostos de peito antes da fadiga acumular.",
        ["chest", "shoulders", "triceps"], ["abs"], advancedBlocks),
      session("B", "Pernas", "Lower completo — recuperação do tronco",
        "Dia de pernas garante frequência de treino sem comprometer a recuperação do peito.",
        ["quadriceps", "glutes", "hamstrings"], ["calves", "abs"], condBlocks),
      session("C", "Peito + Ombro (volume)", "Segunda sessão de push com ênfase em volume e detalhe de peito",
        "Reforça o estímulo de hipertrofia no peitoral com cargas moderadas e mais repetições.",
        ["chest", "shoulders"], ["triceps", "back"], baseBlocks),
      session("D", "Costas + Bíceps", "Pull completo",
        "Fecha o tronco com puxadas e remadas, dando espaço para peito recuperar.",
        ["back", "biceps"], ["shoulders", "abs"], advancedBlocks),
      session("E", "Posterior + Core", "Lower posterior e reforço de core",
        "Complementa o dia de pernas com cadeia posterior e estabilizadores.",
        ["hamstrings", "glutes", "abs"], ["calves", "lower_back"], condBlocks),
      session("F", "Ombro + Braços", "Dia de detalhamento — deltoides e braços",
        "Aumenta a frequência de ombros e braços sem impacto no volume de peito.",
        ["shoulders", "biceps", "triceps"], ["chest"], baseBlocks)
    ],

    // ── DORSAIS ────────────────────────────────────────────────────────────────
    back: [
      session("A", "Costas + Bíceps (largura)", "Pull com foco em largura — puxadas e dorsais",
        "Primeira sessão de costas: prioriza exercícios de puxada vertical para ganho de largura.",
        ["back", "biceps"], ["shoulders", "abs"], advancedBlocks),
      session("B", "Peito + Ombro + Tríceps", "Push equilibrado",
        "Dia de push complementar que não interfere na recuperação das costas.",
        ["chest", "shoulders", "triceps"], ["abs"], baseBlocks),
      session("C", "Costas + Bíceps (espessura)", "Pull com foco em espessura — remadas e lombares",
        "Segunda sessão de costas: puxada horizontal e remadas para espessura e detalhamento.",
        ["back", "lower_back", "biceps"], ["shoulders"], advancedBlocks),
      session("D", "Pernas", "Lower completo",
        "Dia de pernas fecha o ciclo de 4 dias sem interferir nas costas.",
        ["quadriceps", "glutes", "hamstrings"], ["calves", "abs"], condBlocks),
      session("E", "Posterior + Core", "Lower posterior e lombar",
        "Reforça cadeia posterior e estabilizadores sem sobrecarregar as costas.",
        ["hamstrings", "glutes", "abs"], ["lower_back", "calves"], condBlocks),
      session("F", "Ombro + Braços", "Detalhamento de deltoides e braços",
        "Aumenta frequência dos deltoides e braços no fim do ciclo.",
        ["shoulders", "biceps", "triceps"], ["chest"], baseBlocks)
    ],

    // ── PERNAS ────────────────────────────────────────────────────────────────
    legs: [
      session("A", "Quadriceps + Glúteo + Abdômen", "Lower dominante de joelho e glúteo",
        "Sessão 1 de pernas: foco em squat pattern, leg press e extensores.",
        ["quadriceps", "glutes", "abs"], ["hamstrings", "calves"], condBlocks),
      session("B", "Peito + Ombro + Tríceps", "Push — tronco superior descansa as pernas",
        "Dia de push no tronco garante frequência sem impacto na recuperação de pernas.",
        ["chest", "shoulders", "triceps"], ["abs"], baseBlocks),
      session("C", "Posterior de coxa + Adutores + Abdutores + Panturrilha", "Lower dominante de quadril",
        "Sessão 2 de pernas: foco em hip hinge, deadlifts, panturrilha e estabilizadores.",
        ["hamstrings", "glutes", "adductors", "abductors"], ["calves", "abs"], condBlocks),
      session("D", "Costas + Bíceps + Abdômen", "Pull — tronco superior",
        "Dia de pull fecha o ciclo de 4 dias sem acumular fadiga em pernas.",
        ["back", "biceps", "abs"], ["shoulders"], advancedBlocks),
      session("E", "Quadriceps + Glúteo (volume)", "Terceira sessão de pernas — volume e detalhamento",
        "Aumenta frequência de pernas com carga reduzida e mais repetições.",
        ["quadriceps", "glutes"], ["hamstrings", "calves"], baseBlocks),
      session("F", "Ombro + Tríceps + Bíceps", "Upper complementar leve",
        "Fecha a semana com detalhamento de ombros e braços.",
        ["shoulders", "biceps", "triceps"], ["chest", "back"], baseBlocks)
    ],

    // ── PERNAS E GLÚTEO ───────────────────────────────────────────────────────
    legs_glutes: [
      session("A", "Glúteo + Quadriceps + Adutores", "Lower com foco máximo em glúteo e quad",
        "Sessão 1: squat pattern profundo, hip thrust e adutores para ativar e desenvolver o glúteo.",
        ["glutes", "quadriceps", "adductors"], ["hamstrings", "calves"], condBlocks),
      session("B", "Peito + Ombro + Tríceps", "Push — recuperação da cadeia posterior",
        "Tronco superior mantém frequência sem interferir na recuperação do glúteo.",
        ["chest", "shoulders", "triceps"], ["abs"], baseBlocks),
      session("C", "Glúteo + Posterior de coxa + Abdutores + Panturrilha", "Lower com foco em glúteo e cadeia posterior",
        "Sessão 2: hip hinge, deadlifts e isoladores de glúteo para completar o volume semanal.",
        ["glutes", "hamstrings", "abductors"], ["calves", "abs"], condBlocks),
      session("D", "Costas + Bíceps", "Pull — tronco superior",
        "Pull fecha o ciclo e distribui volume de costas sem conflitar com glúteo.",
        ["back", "biceps"], ["shoulders", "abs"], advancedBlocks),
      session("E", "Glúteo + Core (volume e isolamento)", "Terceira sessão de glúteo — detalhamento e ativação",
        "Sessão leve focada em isoladores de glúteo, abdômen e estabilizadores.",
        ["glutes", "abs"], ["hamstrings", "adductors"], baseBlocks),
      session("F", "Ombro + Braços", "Detalhamento de deltoides e braços",
        "Complementa o ciclo com deltoides e braços no último dia.",
        ["shoulders", "biceps", "triceps"], ["chest"], baseBlocks)
    ],

    // ── BRAÇOS ────────────────────────────────────────────────────────────────
    arms: [
      session("A", "Costas + Bíceps", "Pull com volume elevado de bíceps",
        "Combina o padrão de puxada com isoladores de bíceps para frequência e volume máximos.",
        ["back", "biceps"], ["shoulders", "forearms"], advancedBlocks),
      session("B", "Peito + Tríceps + Ombro", "Push com volume elevado de tríceps",
        "Compostos de empurrar naturalmente carregam o tríceps; acessórios finalizam o volume.",
        ["chest", "triceps", "shoulders"], ["abs"], advancedBlocks),
      session("C", "Ombro + Bíceps + Tríceps", "Dia dedicado a ombros e braços",
        "Sessão isolada de deltoides e braços para maximizar o estímulo sem fadiga acumulada de compostos.",
        ["shoulders", "biceps", "triceps"], ["forearms"], advancedBlocks),
      session("D", "Pernas", "Lower completo",
        "Dia de pernas garante recuperação total do tronco entre as sessões de braços.",
        ["quadriceps", "glutes", "hamstrings"], ["calves", "abs"], condBlocks),
      session("E", "Costas + Bíceps (espessura)", "Pull com ênfase em costas espessa e bíceps",
        "Segunda sessão de puxada: remadas horizontais e mais volume de bíceps.",
        ["back", "biceps"], ["lower_back", "forearms"], advancedBlocks),
      session("F", "Posterior + Core", "Lower leve e core",
        "Complementa o dia de pernas com cadeia posterior e core.",
        ["hamstrings", "glutes", "abs"], ["calves"], baseBlocks)
    ]
  };

  const pool = blueprints[focusRegion as Exclude<FocusRegion, "balanced">];
  return (pool ?? []).slice(0, dayCount);
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
  timeBudget: SessionTimeBudget,
  trainingStyles: TrainingStyle[]
): WorkoutBlockType[] {
  const allowed = new Set<WorkoutBlockType>(["normal", "mobility", "tempo_controlado", "isometria"]);

  allowed.add("superset");

  // HIIT e Funcional são montados em circuitos — liberar 'circuit' se QUALQUER
  // treino do plano usar esses estilos (multi-estilo). Gated: não afeta musculacao/personal.
  if (trainingStyles.some((style) => style === "hiit" || style === "funcional")) {
    allowed.add("circuit");
  }

  if (level !== "beginner" && timeAvailable >= 25) {
    allowed.add("bi-set");
  }

  if (goalStyle === "conditioning" || timeAvailable <= 40) {
    allowed.add("circuit");
    allowed.add("superset");
  }

  if (goalStyle === "hypertrophy" && level !== "beginner" && timeBudget.allowAdvancedTechniques) {
    allowed.add("drop-set");
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
  if (splitType === "focus_split") {
    const density = timeAvailable <= 35 ? "sessões objetivas" : "volume adequado por grupamento";
    return `Divisão personalizada com ênfase regional — o grupo prioritário aparece em duas sessões da semana para garantir maior frequência e volume específico, com ${density}.`;
  }

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
  // Usa o campo `muscle` (músculo principal único) como primário.
  // Fallback: primeiro elemento de muscle_groups, ou "full_body".
  const primary = normalizeExerciseMuscleGroup(exercise.muscle ?? exercise.metadata?.muscle ?? null);
  if (primary) return [primary];
  const groups = getExerciseMuscleGroups(exercise);
  return groups.length ? [groups[0]] : ["full_body"];
}

function inferSecondaryMuscles(exercise: ExerciseRecord, primaryMuscles: string[], movementType: string) {
  // Deriva secundários de muscle_groups: tudo além do músculo primário.
  // Se o personal trainer cadastrou muscle_groups com mais de um músculo,
  // esses extras são os secundários reais do exercício.
  const allGroups = getExerciseMuscleGroups(exercise);
  const fromDb = allGroups.filter((m) => !primaryMuscles.includes(m));
  if (fromDb.length > 0) return fromDb;

  // Fallback: regras hardcoded baseadas no tipo de movimento.
  const compound = movementType === "compound";
  const secondary = new Set<string>();
  primaryMuscles.forEach((primary) => {
    resolveSecondaryCandidates(primary, compound).forEach((muscle) => {
      if (!primaryMuscles.includes(muscle)) secondary.add(muscle);
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
  // Isometria só é recomendada para exercícios cadastrados como isométricos.
  // Isolation executa em movimento — pode ter tempo controlado e drop-set, mas nunca isometria.
  if (movementType === "isometric") return ["normal", "isometria", "tempo_controlado"];
  if (movementType === "isolation") return ["normal", "bi-set", "drop-set", "tempo_controlado"];
  if (movementType === "functional") return ["normal", "superset", "circuit", "tri-set"];
  if (movementPattern === "hinge" || movementPattern === "squat") return ["normal", "drop-set"];
  return ["normal", "superset", "bi-set"];
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
