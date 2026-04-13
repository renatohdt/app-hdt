import "server-only";
import OpenAI from "openai";
import { resolveBodyType } from "@/lib/body-type";
import { createHmac } from "node:crypto";
import { formatExerciseMuscleLabel, getExerciseMuscleGroups, normalizeExerciseMuscleGroup } from "@/lib/exercise-library";
import { repairPtBrText } from "@/lib/pt-br-text";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import {
  buildCoachBrief,
  buildExerciseProfile,
  buildWorkoutStrategy,
  formatMuscleLabel,
  isAdvancedBlockType,
  isCombinedBlockType,
  normalizeBlockType,
  type SessionBlueprint,
  type WorkoutStrategy
} from "@/lib/workout-strategy";
import {
  estimateWorkoutSectionDuration,
  summarizeWorkoutDurations
} from "@/lib/workout-time";
import { buildWorkoutSectionItems, flattenWorkoutSectionItems } from "@/lib/workout-section-items";
import type {
  CombinedBlockType,
  DiagnosisResult,
  ExerciseRecord,
  QuizAnswers,
  WorkoutBlockType,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutSection
} from "@/lib/types";

type AiWorkoutExercise = {
  name?: string;
  blockType?: string;
  type?: string;
  trainingTechnique?: string;
  technique?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  sets?: number | string;
  reps?: number | string;
  rest?: number | string;
  notes?: string;
  rationale?: string;
};

type AiWorkoutDay = {
  day?: string;
  title?: string;
  name?: string;
  splitType?: string;
  focus?: string[] | string;
  sessionFocus?: string;
  rationale?: string;
  exercises?: AiWorkoutExercise[];
};

type AiWorkoutResponse = {
  splitType?: string;
  rationale?: string;
  sessionCount?: number;
  progressionNotes?: string;
  sessions?: AiWorkoutDay[];
  plan?: AiWorkoutDay[];
  workout?: AiWorkoutDay[] | AiWorkoutExercise[];
};

type OpenAIWorkoutError = Error & {
  code?: string;
  status?: number;
};

type ExerciseLookup = {
  source: ExerciseRecord;
  profile: ReturnType<typeof buildExerciseProfile>;
};

type SanitizedExercise = WorkoutExercise & {
  movementType: string;
};

type BlockWindow = {
  start: number;
  indexes: number[];
  score: number;
};

let hasLoggedMissingWorkoutCacheSecret = false;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  return new OpenAI({ apiKey });
}

export function buildWorkoutHash(answers: QuizAnswers) {
  const secret = process.env.WORKOUT_CACHE_SECRET?.trim();

  if (!secret) {
    if (!hasLoggedMissingWorkoutCacheSecret) {
      hasLoggedMissingWorkoutCacheSecret = true;
      logWarn("PRIVACY", "Workout cache secret missing; cache hash disabled.");
    }

    return null;
  }

  const cacheKey = {
    planVersion: "pt-v6-time-budget",
    goal: answers.goal,
    experience: answers.experience,
    gender: answers.gender,
    biotype: resolveBodyType(answers),
    days: Number(answers.days) || 0,
    time: Number(answers.time) || 0,
    location: normalizeLocation(typeof answers.location === "string" ? answers.location : "home"),
    equipment: normalizeEquipmentList(answers.equipment)
  };

  return createHmac("sha256", secret).update(JSON.stringify(cacheKey)).digest("hex");
}

export function filterExercisesForAI(answers: QuizAnswers, exerciseLibrary: ExerciseRecord[]) {
  const strategy = buildWorkoutStrategy(answers);
  const allowedEquipment = new Set(["bodyweight", ...normalizeEquipmentList(answers.equipment)]);
  const scored = exerciseLibrary
    .filter((exercise) => matchesLocation(exercise, answers.location))
    .filter((exercise) => matchesEquipment(exercise, allowedEquipment))
    .map((exercise) => ({
      exercise,
      profile: buildExerciseProfile(exercise),
      score: scoreExerciseForStrategy(exercise, strategy)
    }))
    .sort((a, b) => b.score - a.score);

  const results: ExerciseRecord[] = [];
  const added = new Set<string>();
  const priorityMuscles = Array.from(
    new Set(strategy.sessions.flatMap((session) => [...session.primaryMuscles, ...session.secondaryMuscles]))
  );

  for (const item of scored.filter((entry) => entry.profile.movementType === "mobility").slice(0, Math.max(2, strategy.sessions.length))) {
    pushExercise(results, added, item.exercise);
  }

  for (const muscle of priorityMuscles) {
    for (const item of scored.filter((entry) => entry.profile.primaryMuscles.includes(muscle)).slice(0, 3)) {
      pushExercise(results, added, item.exercise);
    }
  }

  const limit = Math.min(48, Math.max(24, strategy.dayCount * 10));
  for (const item of scored) {
    if (results.length >= limit) break;
    pushExercise(results, added, item.exercise);
  }

  return results;
}

export async function generateWorkoutWithAI(
  answers: QuizAnswers,
  diagnosis: DiagnosisResult,
  exerciseLibrary: ExerciseRecord[]
): Promise<WorkoutPlan> {
  const openai = getOpenAIClient();
  const strategy = buildWorkoutStrategy(answers);
  const filteredLibrary = filterExercisesForAI(answers, exerciseLibrary);

  if (!filteredLibrary.length) {
    throw new Error("Nenhum exercício elegível foi encontrado para a IA.");
  }

  const availableExercises = filteredLibrary.map((exercise) => {
    const profile = buildExerciseProfile(exercise);

    return {
      id: exercise.id,
      name: exercise.name,
      primaryMuscles: profile.primaryMuscles,
      secondaryMuscles: profile.secondaryMuscles,
      movementPattern: profile.movementPattern,
      movementType: profile.movementType,
      equipment: normalizeStringArray(exercise.equipment ?? exercise.metadata?.equipment).map(normalizeEquipment),
      location: normalizeStringArray(exercise.location ?? exercise.metadata?.location).map(normalizeLocation),
      recommendedBlockTypes: profile.recommendedBlockTypes
    };
  });

  const promptMontagemTreino = [
    "O tempo disponível para treinar é uma restrição operacional dura e obrigatória.",
    "Você é um personal trainer experiente.",
    "",
    "Monte um plano de treino com lógica real de prescrição, não uma lista aleatória de exercícios.",
    "O treino precisa parecer prescrito por um personal trainer experiente: com início, bloco principal, acessórios e finalização coerente.",
    "Responda sempre em português do Brasil, com acentuação, pontuação e caracteres UTF-8 corretos.",
    "",
    "REGRAS:",
    "- cada sessão precisa caber realisticamente no tempo informado; não trate esse campo como mera preferência",
    "- decida a divisão com base na frequência, nível, tempo e equipamentos",
    "- não assuma full body para todos os perfis",
    "- organize em Treino A, Treino B, Treino C e assim por diante",
    "- respeite recuperação entre grupamentos primários e secundários",
    "- use compostos antes de acessórios e isoladores",
    "- inclua 1 exercício de mobilidade ou ativação por sessão",
    "- sempre pense a sessão em 4 momentos: preparação, bloco principal, acessórios/blocos combinados e finalização",
    "- use APENAS os exercícios fornecidos",
    "- não invente exercícios",
    "- não repita o mesmo exercício na mesma sessão",
    "- sets, reps e rest devem ser numeros inteiros fixos",
    "- a quantidade de exercícios, séries, descansos e blocos precisa mudar de verdade conforme o tempo disponível",
    "- treinos de 15-20 min devem ser enxutos, com poucos exercícios úteis e densidade alta",
    "- treinos de 75-90 min devem ter mais volume util, mais refinamento por grupamento e estrutura mais completa",
    "- técnicas avançadas devem ser pontuais e coerentes",
    "- iniciantes podem receber supersérie simples, tempo controlado ou circuito leve apenas quando isso melhorar a aderência e continuar seguro",
    "- intermediários devem usar blocos combinados com frequência moderada quando houver ganho de densidade ou melhor organização muscular",
    "- avançados podem usar bi-set, tri-set, drop-set e rest-pause, mas sem transformar a sessão em caos metabólico",
    "- blocos combinados devem ser reais e coerentes, não apenas exercícios aleatórios com o mesmo rótulo",
    "- evite redundância e respeite a relação estímulo/fadiga",
    "- considere tempo de execução das séries, descansos, transições e tempo extra de técnicas ao decidir o volume",
    "",
    "TIPOS DE BLOCO POSSIVEIS:",
    "- normal",
    "- mobility",
    "- superset",
    "- bi-set",
    "- tri-set",
    "- drop-set",
    "- rest-pause",
    "- cluster",
    "- isometria",
    "- tempo_controlado",
    "- parciais",
    "- pre-exaustao",
    "- pos-exaustao",
    "- circuit",
    "",
    "SE USAR BLOCO COMBINADO:",
    "- una exercícios compatíveis entre si",
    "- organize a ordem corretamente",
    "- deixe claro quando o descanso acontece apenas ao final da volta",
    "- reserve técnicas mais agressivas para exercícios mais seguros e para alunos mais experientes",
    "",
    "ESTRATEGIA BASE OBRIGATORIA:",
    JSON.stringify(buildCoachBrief(strategy), null, 2),
    "",
    "DIAGNÓSTICO DO USUÁRIO:",
    JSON.stringify(diagnosis, null, 2),
    "",
    "DADOS DO USUÁRIO:",
    JSON.stringify(
      {
        age: answers.age,
        weight: answers.weight,
        height: answers.height,
        goal: answers.goal,
        days: strategy.dayCount,
        time: strategy.timeAvailable,
        equipment: strategy.equipment,
        gender: answers.gender,
        experience: answers.experience,
        body_type: resolveBodyType(answers)
      },
      null,
      2
    ),
    "",
    "EXERCÍCIOS DISPONÍVEIS:",
    JSON.stringify(availableExercises, null, 2),
    "",
    "RETORNE APENAS JSON NESTE FORMATO:",
    JSON.stringify(
      {
        splitType: strategy.splitType,
        rationale: "justificativa curta da divisão",
        sessionCount: strategy.dayCount,
        progressionNotes: "observação final de progressão",
        plan: [
          {
            day: "A",
            title: "Treino A",
            splitType: strategy.splitType,
            sessionFocus: "foco da sessão",
            rationale: "por que essa sessão existe",
            exercises: [
              {
                name: "nome do exercício",
                blockType: "normal",
                trainingTechnique: "tradicional",
                primaryMuscles: ["quadriceps"],
                secondaryMuscles: ["glutes", "abs"],
                sets: 3,
                reps: 10,
                rest: 60,
                notes: "observação curta",
                rationale: "função do exercício na sessão"
              }
            ]
          }
        ]
      },
      null,
      2
    )
  ].join("\n");

  try {
    logInfo("AI", "Workout AI request started", {
      split_type: strategy.splitType,
      session_count: strategy.sessions.length,
      body_type_raw: answers.body_type_raw ?? answers.wrist ?? null,
      body_type: resolveBodyType(answers)
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_WORKOUT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: "Você é um personal trainer especialista em treino personalizado e sempre responde em português do Brasil com acentuação correta."
        },
        {
          role: "user",
          content: promptMontagemTreino
        }
      ]
    });

    const treinoIA = response.choices[0]?.message?.content;
    logInfo("AI", "Workout AI response received", {
      has_content: Boolean(treinoIA),
      choice_count: response.choices.length
    });

    if (!treinoIA) {
      throw new Error("A OpenAI não retornou conteúdo para o treino.");
    }

    const parsed = extractAiWorkoutResponse(treinoIA);
    const validated = validateAndBuildWorkoutPlan(parsed, answers, diagnosis, filteredLibrary, strategy);

    if (!validated) {
      throw new Error("A resposta da IA não passou na validação do backend.");
    }

    return validated;
  } catch (error) {
    logError("AI", "OpenAI request failed", {
      code: typeof error === "object" && error && "code" in error ? (error as OpenAIWorkoutError).code ?? null : null,
      status: typeof error === "object" && error && "status" in error ? (error as OpenAIWorkoutError).status ?? null : null,
      message: error instanceof Error ? error.message : "unknown"
    });

    if (isOpenAIQuotaError(error)) {
      const quotaError = new Error("IA indisponível no momento. Tente novamente mais tarde.") as OpenAIWorkoutError;
      quotaError.code = "insufficient_quota";
      quotaError.status = 429;
      throw quotaError;
    }

    throw error;
  }
}

export async function runWorkoutTestPrompt(prompt = "Crie um treino de peito simples") {
  const openai = getOpenAIClient();
  logInfo("AI", "Workout test prompt started");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }]
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("A OpenAI não retornou conteúdo.");
  }

  return content;
}

export function isOpenAIQuotaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    status?: number;
    error?: { code?: string };
  };

  return (
    maybeError.code === "insufficient_quota" ||
    maybeError.status === 429 ||
    maybeError.error?.code === "insufficient_quota"
  );
}

function extractAiWorkoutResponse(content: string): AiWorkoutResponse {
  const raw = content.trim();
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch?.[1]?.trim() ?? raw;
  const data = JSON.parse(jsonText) as AiWorkoutResponse;

  if (Array.isArray(data.sessions) && !data.plan) {
    data.plan = data.sessions;
  }

  if (data.plan && !data.workout) {
    data.workout = data.plan;
  }

  return data;
}

function validateAndBuildWorkoutPlan(
  aiResponse: AiWorkoutResponse,
  answers: QuizAnswers,
  diagnosis: DiagnosisResult,
  exerciseLibrary: ExerciseRecord[],
  strategy: WorkoutStrategy
): WorkoutPlan | null {
  const responseData = aiResponse as AiWorkoutResponse & {
    workout?: AiWorkoutDay[] | AiWorkoutExercise[];
  };

  let normalizedPlan: AiWorkoutDay[] | null = null;

  if (Array.isArray(aiResponse.plan) && aiResponse.plan.length) {
    normalizedPlan = aiResponse.plan;
  } else if (Array.isArray(responseData.workout) && responseData.workout.length) {
    const firstItem = responseData.workout[0];

    if (firstItem && typeof firstItem === "object" && "exercises" in firstItem) {
      normalizedPlan = responseData.workout as AiWorkoutDay[];
    } else {
      normalizedPlan = [
        {
          day: "A",
          title: "Treino A",
          splitType: strategy.splitType,
          sessionFocus: strategy.sessions[0]?.sessionFocus ?? "Sessão principal",
          rationale: strategy.sessions[0]?.rationale ?? strategy.rationale,
          exercises: responseData.workout as AiWorkoutExercise[]
        }
      ];
    }
  }

  if (!normalizedPlan?.length) {
    throw new Error("Formato inválido da IA");
  }

  const exerciseMap = new Map<string, ExerciseLookup>(
    exerciseLibrary.map((exercise) => [
      exercise.name.trim().toLowerCase(),
      {
        source: exercise,
        profile: buildExerciseProfile(exercise)
      }
    ])
  );

  const sections: WorkoutSection[] = [];
  const sectionEstimates: ReturnType<typeof estimateWorkoutSectionDuration>[] = [];

  for (const [index, day] of normalizedPlan.slice(0, strategy.dayCount).entries()) {
    const blueprint = strategy.sessions[index] ?? strategy.sessions[strategy.sessions.length - 1];
    const rawExercises = Array.isArray(day.exercises) ? day.exercises : [];
    const sanitized = sanitizeAiDayExercises(rawExercises, strategy, blueprint, exerciseMap);

    if (!sanitized.length) {
      logWarn("AI", "Workout AI session adjusted after sanitization");
      continue;
    }

    const mobility = sanitized.filter((exercise) => exercise.blockType === "mobility");
    const exercises = sanitized.filter((exercise) => exercise.blockType !== "mobility");

    if (!exercises.length) {
      logWarn("AI", "Workout AI session adjusted after exercise validation");
      continue;
    }

    const fittedSession = fitSessionToTimeBudget({
      mobility,
      exercises,
      strategy,
      blueprint,
      exerciseMap
    });
    const structuredExercises = fittedSession.structuredExercises;
    const sessionFocus =
      buildSessionFocusLabel(
        typeof day.sessionFocus === "string" && day.sessionFocus.trim() ? day.sessionFocus.trim() : undefined,
        structuredExercises,
        blueprint
      ) || blueprint.sessionFocus;
    const progressionTip = buildSectionProgressionTip(strategy, structuredExercises);
    const items = fittedSession.items;
    const flattened = fittedSession.flattened;
    sectionEstimates.push(fittedSession.estimate);

    sections.push({
      title: `Treino ${normalizeDayLabel(day.day ?? day.title ?? day.name, index)}`,
      subtitle: sessionFocus,
      focus: normalizeFocus(day.focus, blueprint.primaryMuscles[0] ?? "full_body"),
      splitType: typeof day.splitType === "string" && day.splitType.trim() ? day.splitType : strategy.splitType,
      sessionFocus,
      focusLabel: sessionFocus,
      rationale:
        typeof day.rationale === "string" && day.rationale.trim() ? day.rationale.trim() : blueprint.rationale,
      progressionTip,
      estimatedDurationMinutes: fittedSession.estimate.totalMinutes,
      durationRange: fittedSession.estimate.durationRange,
      timeFitRationale: buildSectionTimeFitRationale(strategy, fittedSession.estimate, items),
      mobility: flattened.mobility,
      exercises: flattened.exercises,
      items
    });
  }

  if (!sections.length) {
    throw new Error("Formato inválido da IA");
  }

  const durationSummary = summarizeWorkoutDurations(sectionEstimates, strategy.timeBudget);

  return {
    title: `Sugestão ${diagnosis.title}`,
    subtitle: `${strategy.splitLabel} pensado para ${formatGoal(answers.goal)} com foco em eficiencia real.`,
    estimatedDuration: durationSummary.durationRange,
    estimatedDurationMinutes: durationSummary.estimatedDurationMinutes,
    durationRange: durationSummary.durationRange,
    timeFitRationale: durationSummary.timeFitRationale,
    focus: [
      `Divisao: ${strategy.splitLabel}`,
      `Objetivo: ${formatGoal(answers.goal)}`,
      `Nivel: ${formatLevel(strategy.level)}`,
      `Frequencia: ${strategy.dayCount} dia(s)`,
      `Tempo por sessão: ${durationSummary.durationRange}`
    ],
    splitType: strategy.splitType,
    rationale:
      typeof aiResponse.rationale === "string" && aiResponse.rationale.trim() ? aiResponse.rationale.trim() : strategy.rationale,
    sessionCount: sections.length,
    progressionNotes:
      typeof aiResponse.progressionNotes === "string" && aiResponse.progressionNotes.trim()
        ? aiResponse.progressionNotes.trim()
        : buildPlanProgressionNotes(strategy, sections),
    sections,
    exercises: sections.flatMap((section) => [...section.mobility, ...section.exercises])
  };
}

function fitSessionToTimeBudget(input: {
  mobility: SanitizedExercise[];
  exercises: SanitizedExercise[];
  strategy: WorkoutStrategy;
  blueprint: SessionBlueprint;
  exerciseMap: Map<string, ExerciseLookup>;
}) {
  const mobility = normalizeMobilityForTime(input.mobility, input.blueprint, input.strategy);
  let exercises = alignExercisesToTimeBudget(input.exercises, input.strategy, input.blueprint, input.exerciseMap);
  let draft = buildSessionDraft(mobility, exercises, input.strategy, input.blueprint);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (draft.estimate.totalMinutesExact > input.strategy.timeBudget.maxDurationMinutes) {
      const simplified = simplifySessionForTime(exercises, input.strategy, input.blueprint);
      if (!simplified.length || areExercisesEqual(exercises, simplified)) {
        break;
      }
      exercises = alignExercisesToTimeBudget(simplified, input.strategy, input.blueprint, input.exerciseMap);
      draft = buildSessionDraft(mobility, exercises, input.strategy, input.blueprint);
      continue;
    }

    if (draft.estimate.totalMinutesExact < input.strategy.timeBudget.minDurationMinutes) {
      const expanded = expandSessionForTime(exercises, input.strategy, input.blueprint, input.exerciseMap);
      if (!expanded.length || areExercisesEqual(exercises, expanded)) {
        break;
      }
      exercises = alignExercisesToTimeBudget(expanded, input.strategy, input.blueprint, input.exerciseMap);
      draft = buildSessionDraft(mobility, exercises, input.strategy, input.blueprint);
      continue;
    }

    break;
  }

  return draft;
}

function buildSessionDraft(
  mobility: SanitizedExercise[],
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const structuredExercises = structureSessionExercises(exercises, strategy, blueprint);
  const items = buildWorkoutSectionItems(mobility, structuredExercises);
  const flattened = flattenWorkoutSectionItems(items);
  const estimate = estimateWorkoutSectionDuration(items, strategy.timeBudget.availableTimeMinutes);

  return {
    mobility,
    structuredExercises,
    items,
    flattened,
    estimate
  };
}

function normalizeMobilityForTime(
  mobility: SanitizedExercise[],
  blueprint: SessionBlueprint,
  strategy: WorkoutStrategy
) {
  const limitedMobility = mobility
    .map((exercise) => applyExerciseTimePrescription(exercise, strategy))
    .slice(0, strategy.timeBudget.allowExtendedMobility ? 2 : 1);

  if (limitedMobility.length) {
    return limitedMobility;
  }

  return [buildFallbackMobility(blueprint)];
}

function alignExercisesToTimeBudget(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  exerciseMap: Map<string, ExerciseLookup>
) {
  const budget = strategy.timeBudget;
  let normalized = [...exercises].map((exercise) => applyExerciseTimePrescription(exercise, strategy));

  normalized = trimExcessIsolationExercises(normalized, strategy, blueprint);

  if (normalized.length > budget.exerciseCountRange.max) {
    normalized = rankExercisesForRetention(normalized, strategy, blueprint).slice(0, budget.exerciseCountRange.max);
  }

  while (normalized.length < budget.exerciseCountRange.min) {
    const next = pickNextFallbackExercise(normalized, strategy, blueprint, exerciseMap);
    if (!next) {
      break;
    }
    normalized.push(next);
  }

  return normalized;
}

function trimExcessIsolationExercises(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const result = [...exercises];

  while (countExercisesByMovementType(result, "isolation") > strategy.timeBudget.maxIsolationExercises) {
    const removalIndex = result
      .map((exercise, index) => ({ exercise, index }))
      .filter(({ exercise }) => exercise.movementType === "isolation")
      .sort(
        (left, right) =>
          buildRetentionScore(left.exercise, strategy, blueprint) - buildRetentionScore(right.exercise, strategy, blueprint)
      )[0]?.index;

    if (removalIndex === undefined) {
      break;
    }

    result.splice(removalIndex, 1);
  }

  return result;
}

function rankExercisesForRetention(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  return [...exercises].sort(
    (left, right) => buildRetentionScore(right, strategy, blueprint) - buildRetentionScore(left, strategy, blueprint)
  );
}

function buildRetentionScore(
  exercise: SanitizedExercise,
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  let score = scoreExerciseOrder(exercise, blueprint);

  if (exercise.movementType === "compound") {
    score += strategy.timeBudget.bucket === "express" || strategy.timeBudget.bucket === "short" ? 12 : 6;
  }

  if (exercise.movementType === "isolation") {
    score += strategy.timeBudget.bucket === "extended" || strategy.timeBudget.bucket === "long" ? 8 : -6;
  }

  if (exercise.movementType === "functional") {
    score += strategy.goalStyle === "conditioning" ? 8 : strategy.timeBudget.bucket === "express" ? 4 : 0;
  }

  if ((exercise.primaryMuscles ?? []).some((muscle) => blueprint.primaryMuscles.includes(muscle))) {
    score += 10;
  }

  if ((exercise.primaryMuscles ?? []).some((muscle) => blueprint.secondaryMuscles.includes(muscle))) {
    score += strategy.timeBudget.bucket === "extended" || strategy.timeBudget.bucket === "long" ? 6 : 2;
  }

  return score;
}

function pickNextFallbackExercise(
  currentExercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  exerciseMap: Map<string, ExerciseLookup>
) {
  const usedNames = new Set(currentExercises.map((exercise) => exercise.name.trim().toLowerCase()));
  const currentPrimaryCounts = new Map<string, number>();

  currentExercises.forEach((exercise) => {
    (exercise.primaryMuscles ?? []).forEach((muscle) => {
      currentPrimaryCounts.set(muscle, (currentPrimaryCounts.get(muscle) ?? 0) + 1);
    });
  });

  const candidates = Array.from(exerciseMap.values())
    .filter((lookup) => !usedNames.has(lookup.source.name.trim().toLowerCase()))
    .filter((lookup) => lookup.profile.movementType !== "mobility")
    .sort((left, right) => {
      const leftScore = scoreFallbackCandidate(left, currentExercises, strategy, blueprint, currentPrimaryCounts);
      const rightScore = scoreFallbackCandidate(right, currentExercises, strategy, blueprint, currentPrimaryCounts);
      return rightScore - leftScore;
    });

  const next = candidates[0];
  if (!next) {
    return null;
  }

  return buildFallbackExercise(next, strategy, blueprint);
}

function scoreFallbackCandidate(
  lookup: ExerciseLookup,
  currentExercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  currentPrimaryCounts: Map<string, number>
) {
  const { profile } = lookup;
  let score = 0;

  for (const muscle of profile.primaryMuscles) {
    if (blueprint.primaryMuscles.includes(muscle)) {
      score += currentExercises.length < 4 ? 16 : 10;
    }
    if (blueprint.secondaryMuscles.includes(muscle)) {
      score += currentExercises.length >= 5 ? 10 : 4;
    }
    score -= (currentPrimaryCounts.get(muscle) ?? 0) * 2;
  }

  if (profile.movementType === "compound") {
    score += currentExercises.length < 4 || strategy.timeBudget.bucket === "express" ? 18 : 6;
  }

  if (profile.movementType === "isolation") {
    score += strategy.timeBudget.bucket === "extended" || strategy.timeBudget.bucket === "long" ? 14 : -2;
  }

  if (profile.movementType === "functional") {
    score += strategy.goalStyle === "conditioning" ? 12 : strategy.timeBudget.bucket === "express" ? 4 : 0;
  }

  if (
    currentExercises.length >= strategy.timeBudget.targetExerciseCount - 1 &&
    profile.movementType === "compound" &&
    strategy.timeBudget.bucket !== "express"
  ) {
    score -= 6;
  }

  return score;
}

function buildFallbackExercise(
  lookup: ExerciseLookup,
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
): SanitizedExercise {
  const blockType: WorkoutBlockType = "normal";
  const trainingTechnique = resolveTrainingTechnique({}, blockType, blueprint, lookup.profile.primaryMuscles[0]);

  return applyExerciseTimePrescription(
    {
      name: lookup.source.name,
      sets: String(getDefaultSets(strategy, lookup.profile.movementType)),
      reps: String(getDefaultReps(strategy, lookup.profile.movementType)),
      rest: `${getDefaultRest(strategy, blockType, lookup.profile.movementType)}s`,
      type: "normal",
      method: trainingTechnique,
      technique: trainingTechnique,
      blockType,
      trainingTechnique,
      rationale: buildExerciseRationale(blockType, blueprint, lookup.profile.primaryMuscles[0]),
      notes: buildExerciseNotes(blockType, lookup.profile.movementType, strategy.level),
      muscleGroups: getExerciseMuscleGroups(lookup.source),
      primaryMuscles: lookup.profile.primaryMuscles,
      secondaryMuscles: lookup.profile.secondaryMuscles,
      videoUrl: lookup.source.video_url,
      movementType: lookup.profile.movementType
    },
    strategy
  );
}

function simplifySessionForTime(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  if (exercises.length > strategy.timeBudget.targetExerciseCount) {
    return removeLowestPriorityExercise(exercises, strategy, blueprint);
  }

  const reducedSets = reduceSetsOnLowestPriorityExercise(exercises, strategy, blueprint);
  if (!areExercisesEqual(exercises, reducedSets)) {
    return reducedSets;
  }

  const reducedRest = tightenRestOnLowestPriorityExercise(exercises, strategy, blueprint);
  if (!areExercisesEqual(exercises, reducedRest)) {
    return reducedRest;
  }

  if (exercises.length > strategy.timeBudget.exerciseCountRange.min) {
    return removeLowestPriorityExercise(exercises, strategy, blueprint);
  }

  return exercises;
}

function expandSessionForTime(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  exerciseMap: Map<string, ExerciseLookup>
) {
  if (exercises.length < strategy.timeBudget.targetExerciseCount) {
    const next = pickNextFallbackExercise(exercises, strategy, blueprint, exerciseMap);
    if (next) {
      return [...exercises, next];
    }
  }

  const increasedSets = increaseSetsOnHighValueExercise(exercises, strategy, blueprint);
  if (!areExercisesEqual(exercises, increasedSets)) {
    return increasedSets;
  }

  if (exercises.length < strategy.timeBudget.exerciseCountRange.max) {
    const next = pickNextFallbackExercise(exercises, strategy, blueprint, exerciseMap);
    if (next) {
      return [...exercises, next];
    }
  }

  return exercises;
}

function removeLowestPriorityExercise(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const removalIndex = exercises
    .map((exercise, index) => ({ exercise, index }))
    .sort(
      (left, right) =>
        buildRetentionScore(left.exercise, strategy, blueprint) - buildRetentionScore(right.exercise, strategy, blueprint)
    )[0]?.index;

  if (removalIndex === undefined) {
    return exercises;
  }

  return exercises.filter((_, index) => index !== removalIndex);
}

function reduceSetsOnLowestPriorityExercise(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const candidates = exercises
    .map((exercise, index) => ({
      exercise,
      index,
      bounds: resolveSetBounds(strategy, exercise.movementType, exercise.blockType)
    }))
    .filter(({ exercise, bounds }) => parsePrescriptionNumber(exercise.sets, bounds.target) > bounds.min)
    .sort(
      (left, right) =>
        buildRetentionScore(left.exercise, strategy, blueprint) - buildRetentionScore(right.exercise, strategy, blueprint)
    );

  const selected = candidates[0];
  if (!selected) {
    return exercises;
  }

  return exercises.map((exercise, index) =>
    index === selected.index
      ? {
          ...exercise,
          sets: String(Math.max(selected.bounds.min, parsePrescriptionNumber(exercise.sets, selected.bounds.target) - 1))
        }
      : exercise
  );
}

function tightenRestOnLowestPriorityExercise(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const candidates = exercises
    .map((exercise, index) => ({
      exercise,
      index,
      bounds: resolveRestBounds(strategy, exercise.blockType, exercise.movementType)
    }))
    .filter(({ exercise, bounds }) => parsePrescriptionNumber(exercise.rest, bounds.target) > bounds.min)
    .sort(
      (left, right) =>
        buildRetentionScore(left.exercise, strategy, blueprint) - buildRetentionScore(right.exercise, strategy, blueprint)
    );

  const selected = candidates[0];
  if (!selected) {
    return exercises;
  }

  return exercises.map((exercise, index) =>
    index === selected.index
      ? {
          ...exercise,
          rest: `${Math.max(selected.bounds.min, parsePrescriptionNumber(exercise.rest, selected.bounds.target) - 15)}s`
        }
      : exercise
  );
}

function increaseSetsOnHighValueExercise(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const candidates = exercises
    .map((exercise, index) => ({
      exercise,
      index,
      bounds: resolveSetBounds(strategy, exercise.movementType, exercise.blockType)
    }))
    .filter(({ exercise, bounds }) => parsePrescriptionNumber(exercise.sets, bounds.target) < bounds.max)
    .sort(
      (left, right) =>
        buildRetentionScore(right.exercise, strategy, blueprint) - buildRetentionScore(left.exercise, strategy, blueprint)
    );

  const selected = candidates[0];
  if (!selected) {
    return exercises;
  }

  return exercises.map((exercise, index) =>
    index === selected.index
      ? {
          ...exercise,
          sets: String(Math.min(selected.bounds.max, parsePrescriptionNumber(exercise.sets, selected.bounds.target) + 1))
        }
      : exercise
  );
}

function applyExerciseTimePrescription(exercise: SanitizedExercise, strategy: WorkoutStrategy) {
  const setBounds = resolveSetBounds(strategy, exercise.movementType, exercise.blockType);
  const restBounds = resolveRestBounds(strategy, exercise.blockType, exercise.movementType);
  const sets = clamp(
    parsePrescriptionNumber(exercise.sets, setBounds.target),
    setBounds.min,
    setBounds.max
  );
  const rest = clamp(
    parsePrescriptionNumber(exercise.rest, restBounds.target),
    restBounds.min,
    restBounds.max
  );

  return {
    ...exercise,
    sets: String(sets),
    rest: `${rest}s`
  };
}

function resolveSetBounds(
  strategy: WorkoutStrategy,
  movementType: string,
  blockType?: WorkoutBlockType
) {
  if (movementType === "mobility") {
    return {
      min: 1,
      max: strategy.timeBudget.allowExtendedMobility ? 2 : 1,
      target: 1
    };
  }

  if (isCombinedBlockType(blockType)) {
    return {
      min: 2,
      max: strategy.timeBudget.bucket === "express" ? 2 : 3,
      target: strategy.timeBudget.bucket === "express" ? 2 : 3
    };
  }

  if (strategy.timeBudget.bucket === "express") {
    if (movementType === "compound") return { min: 2, max: 3, target: 2 };
    return { min: 1, max: 2, target: 1 };
  }

  if (strategy.timeBudget.bucket === "short") {
    if (movementType === "compound") return { min: 2, max: 3, target: 3 };
    return { min: 2, max: 3, target: 2 };
  }

  if (strategy.timeBudget.bucket === "standard") {
    if (movementType === "compound") return { min: 3, max: 4, target: strategy.goalStyle === "hypertrophy" ? 4 : 3 };
    return { min: 2, max: 3, target: 3 };
  }

  if (strategy.timeBudget.bucket === "extended") {
    if (movementType === "compound") return { min: 3, max: 4, target: 4 };
    return { min: 3, max: 4, target: 3 };
  }

  if (movementType === "compound") {
    return { min: 4, max: 5, target: strategy.goalStyle === "hypertrophy" ? 5 : 4 };
  }

  return { min: 3, max: 4, target: 3 };
}

function resolveRestBounds(
  strategy: WorkoutStrategy,
  blockType: WorkoutBlockType | undefined,
  movementType: string
) {
  if (blockType === "mobility" || movementType === "mobility") {
    return { min: 10, max: 20, target: 15 };
  }

  if (isCombinedBlockType(blockType)) {
    return { min: 0, max: 15, target: 10 };
  }

  if (blockType === "drop-set" || blockType === "rest-pause") {
    return {
      min: strategy.timeBudget.bucket === "express" ? 10 : 15,
      max: 30,
      target: 20
    };
  }

  if (strategy.timeBudget.bucket === "express") {
    return movementType === "compound" ? { min: 30, max: 60, target: 45 } : { min: 20, max: 40, target: 30 };
  }

  if (strategy.timeBudget.bucket === "short") {
    return movementType === "compound" ? { min: 35, max: 75, target: 50 } : { min: 25, max: 45, target: 35 };
  }

  if (strategy.timeBudget.bucket === "standard") {
    return movementType === "compound" ? { min: 45, max: 90, target: 60 } : { min: 30, max: 60, target: 45 };
  }

  if (strategy.timeBudget.bucket === "extended") {
    return movementType === "compound" ? { min: 60, max: 105, target: 75 } : { min: 35, max: 75, target: 50 };
  }

  return movementType === "compound" ? { min: 75, max: 120, target: 90 } : { min: 45, max: 75, target: 60 };
}

function parsePrescriptionNumber(value: string, fallback: number) {
  const numeric = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function countExercisesByMovementType(exercises: SanitizedExercise[], movementType: string) {
  return exercises.filter((exercise) => exercise.movementType === movementType).length;
}

function areExercisesEqual(left: SanitizedExercise[], right: SanitizedExercise[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (exercise, index) =>
      exercise.name === right[index]?.name &&
      exercise.sets === right[index]?.sets &&
      exercise.rest === right[index]?.rest &&
      exercise.blockType === right[index]?.blockType
  );
}

function buildSectionTimeFitRationale(
  strategy: WorkoutStrategy,
  estimate: ReturnType<typeof estimateWorkoutSectionDuration>,
  items: ReturnType<typeof buildWorkoutSectionItems>
) {
  const combinedBlocks = items.filter((item) => item.type === "combined_block").length;
  const combinedNote =
    combinedBlocks > 0 ? `${combinedBlocks} bloco${combinedBlocks === 1 ? "" : "s"} combinado${combinedBlocks === 1 ? "" : "s"}` : "sem bloco combinado obrigatorio";

  return `Sessão ajustada para ${strategy.timeBudget.availableTimeMinutes} min com ${estimate.workingExerciseCount} exercícios úteis, ${combinedNote} e estimativa de ${estimate.durationRange}.`;
}

function sanitizeAiDayExercises(
  exercises: AiWorkoutExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  exerciseMap: Map<string, ExerciseLookup>
) {
  const seen = new Set<string>();
  let advancedBlocks = 0;

  const sanitized = exercises
    .map((exercise) => {
      const rawName = typeof exercise.name === "string" ? exercise.name.trim() : "";
      const key = rawName.toLowerCase();

      if (!rawName || seen.has(key)) {
        return null;
      }

      seen.add(key);
      const lookup = exerciseMap.get(key);
      if (!lookup) {
        return null;
      }

      let blockType = normalizeBlockType(exercise.blockType ?? exercise.type ?? exercise.trainingTechnique ?? exercise.technique);
      if (lookup.profile.movementType === "mobility") {
        blockType = "mobility";
      } else if (!strategy.allowedBlockTypes.includes(blockType)) {
        blockType = "normal";
      } else if (blockType === "drop-set" && lookup.profile.movementType === "compound") {
        blockType = "normal";
      } else if (blockType === "cluster" && strategy.level !== "advanced") {
        blockType = "normal";
      }

      if (isAdvancedBlockType(blockType)) {
        if (advancedBlocks >= strategy.maxAdvancedBlocksPerSession) {
          blockType = "normal";
        } else {
          advancedBlocks += 1;
        }
      }

      const movementType = lookup.profile.movementType;
      const legacyType = blockType === "mobility" ? "mobility" : isCombinedBlockType(blockType) ? "superset" : "normal";
      const trainingTechnique = resolveTrainingTechnique(exercise, blockType, blueprint, lookup.profile.primaryMuscles[0]);

      return {
        name: lookup.source.name,
        sets: String(normalizeSetsForBudget(exercise.sets, strategy, movementType, blockType)),
        reps: String(sanitizeFixedNumber(exercise.reps, getDefaultReps(strategy, movementType))),
        rest: `${normalizeRestForBudget(exercise.rest, strategy, blockType, movementType)}s`,
        type: legacyType,
        method: trainingTechnique,
        technique: trainingTechnique,
        blockType,
        trainingTechnique,
        rationale:
          cleanText(exercise.rationale) || buildExerciseRationale(blockType, blueprint, lookup.profile.primaryMuscles[0]),
        notes: cleanText(exercise.notes) || buildExerciseNotes(blockType, movementType, strategy.level),
        muscleGroups: getExerciseMuscleGroups(lookup.source),
        primaryMuscles: normalizeMuscleList(exercise.primaryMuscles, lookup.profile.primaryMuscles),
        secondaryMuscles: normalizeMuscleList(exercise.secondaryMuscles, lookup.profile.secondaryMuscles),
        videoUrl: lookup.source.video_url,
        movementType
      } satisfies SanitizedExercise;
    })
    .filter(Boolean) as SanitizedExercise[];

  return enforceCombinedRuns(sanitized);
}

function structureSessionExercises(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const ordered = [...exercises].sort((left, right) => scoreExerciseOrder(right, blueprint) - scoreExerciseOrder(left, blueprint));
  const withExistingBlocks = annotateExistingCombinedBlocks(ordered, strategy, blueprint);
  const withContextualBlocks = addContextualCombinedBlocks(withExistingBlocks, strategy, blueprint);
  return applyStandaloneIntensityTechniques(withContextualBlocks, strategy, blueprint);
}

function scoreExerciseOrder(exercise: SanitizedExercise, blueprint: SessionBlueprint) {
  let score = 0;

  if (exercise.movementType === "compound") score += 28;
  if (exercise.movementType === "functional") score -= 8;
  if ((exercise.primaryMuscles ?? []).some((muscle) => blueprint.primaryMuscles.includes(muscle))) score += 16;
  if ((exercise.primaryMuscles ?? []).some((muscle) => blueprint.secondaryMuscles.includes(muscle))) score += 9;
  if ((exercise.secondaryMuscles ?? []).some((muscle) => blueprint.primaryMuscles.includes(muscle))) score += 5;
  if ((exercise.primaryMuscles ?? []).includes("abs")) score -= 6;
  if ((exercise.primaryMuscles ?? []).includes("calves")) score -= 4;
  if (exercise.blockType === "circuit") score -= 10;
  if (isCombinedBlockType(exercise.blockType)) score -= 2;

  return score;
}

function annotateExistingCombinedBlocks(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const result = [...exercises];
  let cursor = 0;
  let blockIndex = 1;

  while (cursor < result.length) {
    const currentBlockType = result[cursor].blockType;

    if (!isCombinedBlockType(currentBlockType)) {
      cursor += 1;
      continue;
    }

    const blockType = currentBlockType as CombinedBlockType;

    const indexes = [cursor];
    let lookahead = cursor + 1;

    while (lookahead < result.length && result[lookahead].blockType === blockType) {
      indexes.push(lookahead);
      lookahead += 1;
    }

    if (indexes.length >= getCombinedBlockSize(blockType)) {
      applyCombinedBlockMetadata(result, indexes, blockType, blockIndex, strategy, blueprint);
      blockIndex += 1;
    }

    cursor = lookahead;
  }

  return result;
}

function addContextualCombinedBlocks(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const result = [...exercises];
  const targetBlocks = resolveTargetCombinedBlocks(strategy, result);
  let currentBlocks = countCombinedBlocks(result);
  let blockSequence = currentBlocks + 1;

  if (currentBlocks >= targetBlocks) {
    return result;
  }

  const desiredTypes = resolveDesiredCombinedTypes(strategy, blueprint, targetBlocks);

  for (const desiredType of desiredTypes) {
    if (currentBlocks >= targetBlocks) {
      break;
    }

    const window = pickCombinedBlockWindow(result, desiredType, strategy, blueprint);
    if (!window) {
      continue;
    }

    applyCombinedBlockMetadata(result, window.indexes, desiredType, blockSequence, strategy, blueprint);
    currentBlocks += 1;
    blockSequence += 1;
  }

  return result;
}

function applyStandaloneIntensityTechniques(
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  if (exercises.some((exercise) => isAdvancedBlockType(exercise.blockType) && !isCombinedBlockType(exercise.blockType))) {
    return exercises;
  }

  const candidateIndex = [...exercises]
    .map((exercise, index) => ({ exercise, index }))
    .reverse()
    .find(({ exercise }) => {
      if (exercise.blockType !== "normal") return false;
      if (exercise.movementType === "mobility") return false;
      if (exercise.movementType === "compound") return false;
      return true;
    })?.index;

  if (candidateIndex === undefined) {
    return exercises;
  }

  let blockType: WorkoutBlockType | null = null;

  if (strategy.level === "beginner") {
    blockType = strategy.allowedBlockTypes.includes("tempo_controlado")
      ? "tempo_controlado"
      : strategy.allowedBlockTypes.includes("isometria")
        ? "isometria"
        : null;
  } else if (strategy.goalStyle === "hypertrophy") {
    blockType = strategy.level === "advanced" && strategy.allowedBlockTypes.includes("rest-pause")
      ? "rest-pause"
      : strategy.allowedBlockTypes.includes("drop-set")
        ? "drop-set"
        : strategy.allowedBlockTypes.includes("tempo_controlado")
          ? "tempo_controlado"
          : null;
  } else if (strategy.goalStyle === "conditioning") {
    blockType = strategy.allowedBlockTypes.includes("tempo_controlado") ? "tempo_controlado" : null;
  }

  if (!blockType) {
    return exercises;
  }

  const result = [...exercises];
  const candidate = result[candidateIndex];
  const trainingTechnique = resolveTrainingTechnique({ trainingTechnique: candidate.trainingTechnique ?? candidate.technique ?? undefined }, blockType, blueprint, candidate.primaryMuscles?.[0]);

  result[candidateIndex] = {
    ...candidate,
    blockType,
    method: trainingTechnique,
    technique: trainingTechnique,
    trainingTechnique,
    notes: candidate.notes || buildExerciseNotes(blockType, candidate.movementType, strategy.level)
  };

  return result;
}

function enforceCombinedRuns(exercises: SanitizedExercise[]) {
  const result = [...exercises];
  let index = 0;

  while (index < result.length) {
    const blockType = result[index].blockType;

    if (!isCombinedBlockType(blockType)) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < result.length && result[end + 1].blockType === blockType) {
      end += 1;
    }

    const runLength = end - index + 1;
    const required = blockType === "tri-set" || blockType === "circuit" ? 3 : 2;

    if (runLength < required) {
      for (let cursor = index; cursor <= end; cursor += 1) {
        result[cursor] = {
          ...result[cursor],
          type: "normal",
          blockType: "normal",
          technique: "tradicional",
          trainingTechnique: "tradicional"
        };
      }
    }

    index = end + 1;
  }

  return result;
}

function countCombinedBlocks(exercises: SanitizedExercise[]) {
  let count = 0;
  let cursor = 0;

  while (cursor < exercises.length) {
    const blockType = exercises[cursor].blockType;
    if (!isCombinedBlockType(blockType)) {
      cursor += 1;
      continue;
    }

    count += 1;

    let lookahead = cursor + 1;
    while (lookahead < exercises.length && exercises[lookahead].blockType === blockType) {
      lookahead += 1;
    }
    cursor = lookahead;
  }

  return count;
}

function resolveTargetCombinedBlocks(strategy: WorkoutStrategy, exercises: SanitizedExercise[]) {
  if (exercises.length < 4) return 0;
  const maxAllowedByLength = Math.max(0, Math.floor(exercises.length / 2));
  const beginnerCap = strategy.level === "beginner" ? 1 : strategy.level === "intermediate" ? 2 : 3;
  const target = Math.min(strategy.timeBudget.targetCombinedBlocks, maxAllowedByLength, beginnerCap);

  if (!strategy.allowedBlockTypes.some(isCombinedBlockType)) {
    return 0;
  }

  if (strategy.timeBudget.bucket === "express" && exercises.length < 5) {
    return Math.min(target, 1);
  }

  return Math.max(strategy.timeBudget.combinedBlockRange.min, target);
}

function resolveDesiredCombinedTypes(
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint,
  targetBlocks: number
): CombinedBlockType[] {
  const preferred = blueprint.preferredBlockTypes.filter(isCombinedBlockType) as CombinedBlockType[];
  const defaults: CombinedBlockType[] =
    strategy.goalStyle === "conditioning"
      ? ["circuit", "superset", "bi-set", "tri-set"]
      : strategy.level === "advanced"
        ? ["bi-set", "superset", "tri-set", "circuit"]
        : ["superset", "bi-set", "circuit", "tri-set"];

  const merged = Array.from(new Set([...preferred, ...defaults])).filter((blockType) =>
    strategy.allowedBlockTypes.includes(blockType)
  );

  while (merged.length < targetBlocks && defaults.length) {
    const next = defaults[merged.length % defaults.length];
    if (!merged.includes(next) && strategy.allowedBlockTypes.includes(next)) {
      merged.push(next);
    } else if (merged.length >= defaults.length) {
      break;
    }
  }

  return merged.slice(0, Math.max(targetBlocks, 1));
}

function pickCombinedBlockWindow(
  exercises: SanitizedExercise[],
  blockType: CombinedBlockType,
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const size = getCombinedBlockSize(blockType);
  const startIndex = resolvePrimeBoundary(exercises, strategy);
  let bestWindow: BlockWindow | null = null;

  for (let cursor = startIndex; cursor <= exercises.length - size; cursor += 1) {
    const indexes = Array.from({ length: size }, (_, offset) => cursor + offset);
    const windowExercises = indexes.map((index) => exercises[index]);

    if (
      windowExercises.some((exercise) => exercise.blockType !== "normal") ||
      windowExercises.some((exercise) => !canUseInAutoCombinedBlock(exercise, blockType, strategy))
    ) {
      continue;
    }

    const score = scoreCombinedWindow(windowExercises, blockType, blueprint, cursor, exercises.length);
    if (!bestWindow || score > bestWindow.score) {
      bestWindow = {
        start: cursor,
        indexes,
        score
      };
    }
  }

  return bestWindow;
}

function canUseInAutoCombinedBlock(
  exercise: SanitizedExercise,
  blockType: CombinedBlockType,
  strategy: WorkoutStrategy
) {
  if (exercise.movementType === "mobility") {
    return false;
  }

  if (exercise.movementType === "compound") {
    if (strategy.level !== "advanced") {
      return false;
    }

    return !((exercise.primaryMuscles ?? []).includes("quadriceps") || (exercise.primaryMuscles ?? []).includes("hamstrings"));
  }

  if (blockType === "circuit") {
    return exercise.movementType === "functional" || exercise.movementType === "isolation" || (exercise.primaryMuscles ?? []).includes("abs");
  }

  return true;
}

function scoreCombinedWindow(
  exercises: SanitizedExercise[],
  blockType: CombinedBlockType,
  blueprint: SessionBlueprint,
  startIndex: number,
  totalExercises: number
) {
  const primaryMuscles = exercises.flatMap((exercise) => exercise.primaryMuscles ?? []);
  const uniquePrimary = new Set(primaryMuscles);
  let score = 0;

  score += primaryMuscles.filter((muscle) => blueprint.primaryMuscles.includes(muscle)).length * 4;
  score += primaryMuscles.filter((muscle) => blueprint.secondaryMuscles.includes(muscle)).length * 2;

  if (blockType === "superset") {
    score += uniquePrimary.size >= 2 ? 8 : 3;
  } else if (blockType === "bi-set") {
    score += uniquePrimary.size === 1 ? 10 : 5;
  } else if (blockType === "tri-set") {
    const lowerBodyHits = primaryMuscles.filter((muscle) => ["quadriceps", "hamstrings", "glutes", "calves"].includes(muscle)).length;
    score += lowerBodyHits >= 2 ? 10 : 6;
  } else if (blockType === "circuit") {
    const functionalHits = exercises.filter((exercise) => exercise.movementType === "functional").length;
    score += uniquePrimary.size >= 2 ? 8 : 4;
    score += functionalHits * 3;
    score += startIndex >= Math.max(1, totalExercises - 4) ? 4 : 0;
  }

  return score;
}

function resolvePrimeBoundary(exercises: SanitizedExercise[], strategy: WorkoutStrategy) {
  const maxPrime =
    strategy.timeBudget.bucket === "express"
      ? 1
      : strategy.timeBudget.bucket === "short"
        ? strategy.level === "beginner"
          ? 1
          : 2
        : strategy.timeBudget.bucket === "long" && strategy.level === "advanced"
          ? 3
          : strategy.level === "beginner"
            ? 1
            : 2;
  let count = 0;

  for (const exercise of exercises) {
    if (exercise.movementType !== "compound") {
      break;
    }
    count += 1;
    if (count >= maxPrime) {
      break;
    }
  }

  return count;
}

function applyCombinedBlockMetadata(
  exercises: SanitizedExercise[],
  indexes: number[],
  blockType: CombinedBlockType,
  blockSequence: number,
  strategy: WorkoutStrategy,
  blueprint: SessionBlueprint
) {
  const blockId = `${blockType}-${blockSequence}`;
  const blockExercises = indexes.map((index) => exercises[index]);
  const blockLabel = buildContextualBlockLabel(blockType, blockExercises);
  const rounds = resolveCombinedBlockRounds(blockType, blockExercises, strategy);
  const restAfterRound = resolveCombinedBlockRest(blockType, strategy);
  const blockNotes = buildContextualBlockNotes(blockType);

  indexes.forEach((index, exerciseIndex) => {
    const current = exercises[index];
    const trainingTechnique = resolveTrainingTechnique(
      { trainingTechnique: current.trainingTechnique ?? current.technique ?? undefined },
      blockType,
      blueprint,
      current.primaryMuscles?.[0]
    );

    exercises[index] = {
      ...current,
      type: "normal",
      method: trainingTechnique,
      technique: trainingTechnique,
      trainingTechnique,
      blockType,
      blockId,
      blockLabel,
      rounds,
      restAfterRound,
      blockNotes,
      order: buildCombinedExerciseOrder(blockType, exerciseIndex),
      rest: exerciseIndex === 0 ? "0-15 segundos" : "0 segundos"
    };
  });
}

function buildContextualBlockLabel(blockType: CombinedBlockType, exercises: SanitizedExercise[]) {
  const labels = Array.from(
    new Set(
      exercises
        .flatMap((exercise) => exercise.primaryMuscles ?? [])
        .map((muscle) => formatFocusMuscleLabel(muscle))
        .filter(Boolean)
    )
  ).slice(0, 3);

  if (!labels.length) {
    return getCombinedBlockDisplayLabel(blockType);
  }

  return `${getCombinedBlockDisplayLabel(blockType)} de ${joinHumanLabels(labels)}`;
}

function resolveCombinedBlockRounds(
  blockType: CombinedBlockType,
  exercises: SanitizedExercise[],
  strategy: WorkoutStrategy
) {
  const base =
    strategy.timeBudget.bucket === "express"
      ? 2
      : strategy.level === "beginner"
        ? 2
        : blockType === "tri-set" || blockType === "circuit"
          ? strategy.timeBudget.bucket === "long" ? 4 : 3
          : strategy.timeBudget.bucket === "extended" || strategy.timeBudget.bucket === "long"
            ? 4
            : 3;
  const parsedSets = exercises
    .map((exercise) => Number.parseInt(exercise.sets, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!parsedSets.length) {
    return String(base);
  }

  const minRounds = strategy.timeBudget.bucket === "express" ? 2 : 2;
  return String(Math.max(minRounds, Math.min(base, Math.min(...parsedSets))));
}

function resolveCombinedBlockRest(blockType: CombinedBlockType, strategy: WorkoutStrategy) {
  if (blockType === "circuit") {
    if (strategy.timeBudget.bucket === "express" || strategy.timeBudget.bucket === "short") {
      return "45-60 segundos";
    }

    return strategy.level === "beginner" ? "60-75 segundos" : "45-60 segundos";
  }

  if (blockType === "tri-set") {
    if (strategy.timeBudget.bucket === "long") {
      return strategy.level === "advanced" ? "75-90 segundos" : "75 segundos";
    }

    return strategy.level === "advanced" ? "60-75 segundos" : "75 segundos";
  }

  if (strategy.timeBudget.bucket === "express") {
    return "45-60 segundos";
  }

  if (strategy.timeBudget.bucket === "short") {
    return strategy.level === "beginner" ? "60-75 segundos" : "45-60 segundos";
  }

  if (strategy.timeBudget.bucket === "long") {
    return strategy.level === "advanced" ? "75-90 segundos" : "60-75 segundos";
  }

  return strategy.level === "beginner" ? "75-90 segundos" : "60-75 segundos";
}

function buildContextualBlockNotes(blockType: CombinedBlockType) {
  if (blockType === "circuit") {
    return "Complete todos os exercícios em sequência e só então descanse ao final da volta.";
  }

  return "Execute a sequência completa antes de descansar ao final da volta.";
}

function buildCombinedExerciseOrder(blockType: CombinedBlockType, exerciseIndex: number) {
  const prefixMap: Record<CombinedBlockType, string> = {
    superset: "A",
    "bi-set": "B",
    "tri-set": "C",
    circuit: "D"
  };

  return `${prefixMap[blockType]}${exerciseIndex + 1}`;
}

function getCombinedBlockSize(blockType: CombinedBlockType) {
  return blockType === "tri-set" || blockType === "circuit" ? 3 : 2;
}

function getCombinedBlockDisplayLabel(blockType: CombinedBlockType) {
  if (blockType === "superset") return "Supersérie";
  if (blockType === "bi-set") return "Bi-set";
  if (blockType === "tri-set") return "Tri-set";
  return "Circuito";
}

function buildSessionFocusLabel(
  rawFocus: string | undefined,
  exercises: SanitizedExercise[],
  blueprint: SessionBlueprint
) {
  const manualFocus = cleanText(rawFocus);
  if (manualFocus && !normalizeText(manualFocus).includes("full body")) {
    return manualFocus;
  }

  const weightedMuscles = new Map<string, number>();

  exercises.forEach((exercise) => {
    (exercise.primaryMuscles ?? []).forEach((muscle) => {
      weightedMuscles.set(muscle, (weightedMuscles.get(muscle) ?? 0) + 3);
    });
    (exercise.secondaryMuscles ?? []).forEach((muscle) => {
      weightedMuscles.set(muscle, (weightedMuscles.get(muscle) ?? 0) + 1);
    });
  });

  const rankedPrimary = Array.from(weightedMuscles.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([muscle]) => muscle)
    .filter((muscle) => blueprint.primaryMuscles.includes(muscle))
    .slice(0, 3);

  const rankedSecondary = Array.from(weightedMuscles.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([muscle]) => muscle)
    .filter((muscle) => !rankedPrimary.includes(muscle) && blueprint.secondaryMuscles.includes(muscle))
    .slice(0, 2);

  const primaryLabel = joinHumanLabels(rankedPrimary.map(formatFocusMuscleLabel).filter(Boolean));
  const secondaryLabel = joinHumanLabels(rankedSecondary.map(formatFocusMuscleLabel).filter(Boolean));

  if (primaryLabel && secondaryLabel) {
    return `${primaryLabel} e ${secondaryLabel} complementares`;
  }

  return primaryLabel || blueprint.sessionFocus;
}

function buildSectionProgressionTip(strategy: WorkoutStrategy, exercises: SanitizedExercise[]) {
  const hasCombinedBlock = exercises.some((exercise) => isCombinedBlockType(exercise.blockType));
  const hasAdvancedTechnique = exercises.some(
    (exercise) => isAdvancedBlockType(exercise.blockType) && !isCombinedBlockType(exercise.blockType)
  );

  if (strategy.level === "beginner") {
    if (hasCombinedBlock || strategy.goalStyle === "conditioning") {
      return "Complete as voltas com boa técnica e respiração controlada antes de reduzir descansos ou acelerar o ritmo.";
    }

    return "Quando completar todas as séries com boa técnica e sem perder controle do movimento, aumente levemente a carga na próxima sessão.";
  }

  if (strategy.level === "intermediate") {
    if (strategy.goalStyle === "conditioning") {
      return "Tente manter a mesma qualidade de movimento enquanto reduz ligeiramente os descansos ou aumenta uma repetição por exercício a cada 1-2 semanas.";
    }

    if (hasCombinedBlock) {
      return "Tente progredir em carga ou repetições a cada 1-2 semanas, mantendo execução consistente e descansos controlados entre os blocos.";
    }

    return "Progrida em carga ou repetições a cada 1-2 semanas, preservando técnica limpa e estabilidade nas séries principais.";
  }

  if (hasAdvancedTechnique || hasCombinedBlock) {
    return "Priorize progressão dupla: aumente repetições dentro da faixa proposta antes de subir a carga. Nos blocos intensificadores, mantenha a execução antes de buscar mais peso.";
  }

  return "Use progressão dupla nas séries principais: feche o topo da faixa de repetições com técnica consistente antes de subir a carga.";
}

function buildPlanProgressionNotes(strategy: WorkoutStrategy, sections: WorkoutSection[]) {
  const firstSpecificTip = sections.find((section) => section.progressionTip)?.progressionTip;
  if (firstSpecificTip) {
    return firstSpecificTip;
  }

  if (strategy.level === "beginner") {
    return "Quando completar todas as séries com boa técnica e sem perder controle do movimento, aumente levemente a carga na próxima sessão.";
  }

  if (strategy.level === "intermediate") {
    return "Tente progredir em carga ou repetições a cada 1-2 semanas, mantendo execução consistente e descansos controlados.";
  }

  return "Priorize progressão dupla: aumente repetições dentro da faixa proposta antes de subir a carga e preserve a técnica nas técnicas intensificadoras.";
}

function formatFocusMuscleLabel(value?: string | null) {
  const normalized = normalizeWorkoutMuscle(value);
  const labels: Record<string, string> = {
    chest: "peito",
    back: "costas",
    quadriceps: "quadríceps",
    hamstrings: "posterior de coxa",
    glutes: "glúteos",
    shoulders: "ombros",
    biceps: "bíceps",
    triceps: "tríceps",
    calves: "panturrilhas",
    abs: "abdômen",
    lower_back: "lombar",
    hip_flexors: "flexores do quadril",
    full_body: "corpo inteiro"
  };

  if (!normalized) {
    return "";
  }

  return labels[normalized] ?? formatExerciseMuscleLabel(normalized).toLowerCase();
}

function joinHumanLabels(values: string[]) {
  if (!values.length) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

function buildFallbackMobility(blueprint: SessionBlueprint): SanitizedExercise {
  return {
    name: mobilityNameByFocus(blueprint.primaryMuscles[0] ?? "full_body"),
    sets: "1",
    reps: "30-40 segundos",
    rest: "15s",
    type: "mobility",
    method: "mobilidade",
    technique: "mobilidade",
    blockType: "mobility",
    trainingTechnique: "mobilidade",
    rationale: "Prepara articulações e melhora a qualidade do primeiro movimento principal.",
    notes: "Use ritmo controlado e respiração constante.",
    muscleGroups: [blueprint.primaryMuscles[0] ?? "full_body"],
    primaryMuscles: [blueprint.primaryMuscles[0] ?? "full_body"],
    secondaryMuscles: [],
    videoUrl: null,
    movementType: "mobility"
  };
}

function resolveTrainingTechnique(
  exercise: AiWorkoutExercise,
  blockType: WorkoutBlockType,
  blueprint: SessionBlueprint,
  primaryMuscle: string | undefined
) {
  const raw = cleanText(exercise.trainingTechnique ?? exercise.technique);
  if (raw) {
    return raw;
  }

  if (blockType === "normal") return "tradicional";
  if (blockType === "mobility") return "mobilidade";
  if (blockType === "superset") return "supersérie para otimizar tempo";
  if (blockType === "bi-set") return `bi-set focado em ${formatMuscleLabel(primaryMuscle)}`;
  if (blockType === "tri-set") return "tri-set metabólico controlado";
  if (blockType === "drop-set") return "drop-set na última série";
  if (blockType === "rest-pause") return "rest-pause para manter tensão";
  if (blockType === "cluster") return "cluster técnico";
  if (blockType === "isometria") return "isometria no pico da contração";
  if (blockType === "tempo_controlado") return "tempo controlado na fase excêntrica";
  if (blockType === "parciais") return "repetições parciais controladas";
  if (blockType === "pre-exaustao") return `pré-exaustão para ${formatMuscleLabel(primaryMuscle)}`;
  if (blockType === "pos-exaustao") return `pós-exaustão para ${formatMuscleLabel(primaryMuscle)}`;
  return `circuito para ${blueprint.sessionFocus.toLowerCase()}`;
}

function buildExerciseRationale(blockType: WorkoutBlockType, blueprint: SessionBlueprint, primaryMuscle: string | undefined) {
  if (blockType === "mobility") {
    return "Abre a sessão com preparação articular e ativação específica.";
  }

  if (isCombinedBlockType(blockType)) {
    return `Aumenta a densidade do treino sem perder o foco em ${formatMuscleLabel(primaryMuscle)}.`;
  }

  if (blockType === "drop-set" || blockType === "rest-pause" || blockType === "cluster") {
    return `Intensifica ${formatMuscleLabel(primaryMuscle)} sem inflar o volume total da sessão.`;
  }

  return `Exercício alinhado ao foco da sessão: ${blueprint.sessionFocus.toLowerCase()}.`;
}

function buildExerciseNotes(blockType: WorkoutBlockType, movementType: string, level: WorkoutStrategy["level"]) {
  if (blockType === "mobility") {
    return "Sem fadiga alta. Foque amplitude e controle.";
  }

  if (blockType === "drop-set" || blockType === "rest-pause") {
    return "Aplique a técnica apenas na última série planejada.";
  }

  if (movementType === "compound") {
    return level === "beginner"
      ? "Priorize técnica, amplitude segura e carga controlada."
      : "Mantenha execução estável antes de aumentar a carga.";
  }

  return "Mantenha tensão contínua na musculatura alvo.";
}

function scoreExerciseForStrategy(exercise: ExerciseRecord, strategy: WorkoutStrategy) {
  const profile = buildExerciseProfile(exercise);
  const targetWeights: Record<string, number> = {};

  for (const session of strategy.sessions) {
    for (const muscle of session.primaryMuscles) {
      targetWeights[muscle] = (targetWeights[muscle] ?? 0) + 4;
    }
    for (const muscle of session.secondaryMuscles) {
      targetWeights[muscle] = (targetWeights[muscle] ?? 0) + 2;
    }
  }

  let score = 0;
  for (const muscle of profile.primaryMuscles) {
    score += targetWeights[muscle] ?? 0;
  }
  for (const muscle of profile.secondaryMuscles) {
    score += Math.max(0, (targetWeights[muscle] ?? 0) - 1);
  }

  if (profile.movementType === "mobility") score += 6;
  if (profile.movementType === "compound") score += 5;
  if (profile.movementType === "functional") score += strategy.goalStyle === "conditioning" ? 4 : 1;
  if (profile.movementType === "isolation") score += 2;

  return score;
}

function getDefaultSets(strategy: WorkoutStrategy, movementType: string) {
  return resolveSetBounds(strategy, movementType, "normal").target;
}

function getDefaultReps(strategy: WorkoutStrategy, movementType: string) {
  if (movementType === "mobility") return 30;
  if (strategy.goalStyle === "hypertrophy") return movementType === "compound" ? 8 : 12;
  if (strategy.goalStyle === "conditioning") return movementType === "compound" ? 12 : 15;
  return movementType === "compound" ? 10 : 12;
}

function getDefaultRest(strategy: WorkoutStrategy, blockType: WorkoutBlockType, movementType: string) {
  return resolveRestBounds(strategy, blockType, movementType).target;
}

function normalizeSetsForBudget(
  value: unknown,
  strategy: WorkoutStrategy,
  movementType: string,
  blockType: WorkoutBlockType
) {
  const bounds = resolveSetBounds(strategy, movementType, blockType);
  return clamp(sanitizeFixedNumber(value, bounds.target), bounds.min, bounds.max);
}

function normalizeRestForBudget(
  value: unknown,
  strategy: WorkoutStrategy,
  blockType: WorkoutBlockType,
  movementType: string
) {
  const bounds = resolveRestBounds(strategy, blockType, movementType);
  return clamp(sanitizeFixedNumber(value, bounds.target), bounds.min, bounds.max);
}

function sanitizeFixedNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }

  if (typeof value === "string") {
    const numeric = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(numeric)) {
      return Math.max(1, Math.round(numeric));
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDayLabel(value: string | undefined, index: number) {
  const trimmed = (value ?? "").replace("Treino ", "").trim();
  if (!trimmed) {
    return String.fromCharCode(65 + index);
  }
  return trimmed.toUpperCase().slice(0, 1);
}

function normalizeFocus(value: string[] | string | undefined, fallback: string) {
  const normalized = normalizeWorkoutMuscle(Array.isArray(value) ? value[0] : value);
  return normalized || fallback;
}

function normalizeMuscleList(value: string[] | undefined, fallback: string[]) {
  if (!Array.isArray(value) || !value.length) {
    return [...fallback];
  }

  const normalized = value
    .map((item) => normalizeWorkoutMuscle(item))
    .filter((item): item is string => Boolean(item));
  return normalized.length ? Array.from(new Set(normalized)) : [...fallback];
}

function normalizeWorkoutMuscle(value?: string | null) {
  const normalized = normalizeExerciseMuscleGroup(value);

  if (normalized) {
    return normalized;
  }

  const raw = normalizeText(value);
  if (raw === "full body" || raw === "full_body") {
    return "full_body";
  }

  return raw || null;
}

function pushExercise(target: ExerciseRecord[], added: Set<string>, exercise: ExerciseRecord) {
  if (added.has(exercise.id)) {
    return;
  }

  added.add(exercise.id);
  target.push(exercise);
}

function matchesLocation(exercise: ExerciseRecord, location: QuizAnswers["location"]) {
  const locations = normalizeStringArray(exercise.location ?? exercise.metadata?.location).map(normalizeLocation);
  if (!locations.length) return true;
  return locations.includes(location);
}

function matchesEquipment(exercise: ExerciseRecord, allowedEquipment: Set<string>) {
  const equipment = normalizeStringArray(exercise.equipment ?? exercise.metadata?.equipment).map(normalizeEquipment);
  if (!equipment.length) return true;
  return equipment.some((item) => allowedEquipment.has(item));
}

function cleanText(value?: string | null) {
  const normalized = repairPtBrText(value);
  return normalized ? normalized : "";
}

function normalizeStringArray(value?: string | string[] | null) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}

function normalizeLocation(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "academia") return "gym";
  if (normalized === "casa") return "home";
  return normalized;
}

function normalizeEquipment(value: string) {
  const normalized = normalizeText(value).replaceAll(" ", "_");

  const map: Record<string, string> = {
    peso_corporal: "bodyweight",
    "peso-corporal": "bodyweight",
    bodyweight: "bodyweight",
    halteres: "halteres",
    dumbbell: "halteres",
    elasticos: "elasticos",
    elastico: "elasticos",
    fita_suspensa: "fita_suspensa",
    fitball: "fitball",
    caneleira: "caneleira",
    kettlebell: "kettlebell",
    nenhum: "nenhum"
  };

  return map[normalized] ?? normalized;
}

function normalizeEquipmentList(values?: string[] | null) {
  return Array.from(new Set((values ?? []).map(normalizeEquipment))).sort();
}

function mobilityNameByFocus(focus: string) {
  const labels: Record<string, string> = {
    chest: "Mobilidade torácica",
    back: "Mobilidade escapular",
    quadriceps: "Mobilidade de quadril",
    hamstrings: "Mobilidade de posterior",
    glutes: "Ativação de glúteos",
    shoulders: "Rotação de ombros",
    abs: "Ativação de core",
    lower_back: "Mobilidade de coluna lombar",
    full_body: "Mobilidade global"
  };

  return labels[focus] ?? "Mobilidade global";
}

function formatGoal(goal: QuizAnswers["goal"]) {
  const labels: Record<QuizAnswers["goal"], string> = {
    lose_weight: "emagrecimento",
    gain_muscle: "hipertrofia",
    body_recomposition: "recomposição corporal",
    improve_conditioning: "condicionamento"
  };

  return labels[goal];
}

function formatLevel(level: WorkoutStrategy["level"]) {
  const labels = {
    beginner: "Iniciante",
    intermediate: "Intermediario",
    advanced: "Avancado"
  };

  return labels[level];
}


