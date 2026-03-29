import "server-only";
import OpenAI from "openai";
import { resolveBodyType } from "@/lib/body-type";
import { createHmac } from "node:crypto";
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
    throw new Error("OPENAI_API_KEY nao configurada.");
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
    planVersion: "pt-v4",
    goal: answers.goal,
    experience: answers.experience,
    gender: answers.gender,
    biotype: resolveBodyType(answers),
    days: Number(answers.days) || 0,
    time: Number(answers.time) || 0,
    location: normalizeLocation(typeof answers.location === "string" ? answers.location : "home"),
    equipment: normalizeEquipmentList(answers.equipment),
    restrictionCategories: buildWorkoutRestrictionCategories(answers)
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
    throw new Error("Nenhum exercicio elegivel foi encontrado para a IA.");
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
    "Voce e um personal trainer experiente.",
    "",
    "Monte um plano de treino com logica real de prescricao, nao uma lista aleatoria de exercicios.",
    "O treino precisa parecer prescrito por um personal trainer experiente: com inicio, bloco principal, acessorios e finalizacao coerente.",
    "",
    "REGRAS:",
    "- decida a divisao com base na frequencia, nivel, tempo e equipamentos",
    "- nao assuma full body para todos os perfis",
    "- organize em Treino A, Treino B, Treino C e assim por diante",
    "- respeite recuperacao entre grupamentos primarios e secundarios",
    "- use compostos antes de acessorios e isoladores",
    "- inclua 1 exercicio de mobilidade ou ativacao por sessao",
    "- sempre pense a sessao em 4 momentos: preparacao, bloco principal, acessorios/blocos combinados e finalizacao",
    "- use APENAS os exercicios fornecidos",
    "- nao invente exercicios",
    "- nao repita o mesmo exercicio na mesma sessao",
    "- sets, reps e rest devem ser numeros inteiros fixos",
    "- tecnicas avancadas devem ser pontuais e coerentes",
    "- iniciantes podem receber superserie simples, tempo controlado ou circuito leve apenas quando isso melhorar a aderencia e continuar seguro",
    "- intermediarios devem usar blocos combinados com frequencia moderada quando houver ganho de densidade ou melhor organizacao muscular",
    "- avancados podem usar bi-set, tri-set, drop-set e rest-pause, mas sem transformar a sessao em caos metabolico",
    "- blocos combinados devem ser reais e coerentes, nao apenas exercicios aleatorios com o mesmo rótulo",
    "- evite redundancia e respeite a relacao estimulo/fadiga",
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
    "- una exercicios compativeis entre si",
    "- organize a ordem corretamente",
    "- deixe claro quando o descanso acontece apenas ao final da volta",
    "- reserve tecnicas mais agressivas para exercicios mais seguros e para alunos mais experientes",
    "",
    "ESTRATEGIA BASE OBRIGATORIA:",
    JSON.stringify(buildCoachBrief(strategy), null, 2),
    "",
    "DIAGNOSTICO DO USUARIO:",
    JSON.stringify(diagnosis, null, 2),
    "",
    "DADOS DO USUARIO:",
    JSON.stringify(
      {
        age: answers.age,
        weight: answers.weight,
        height: answers.height,
        goal: answers.goal,
        days: strategy.dayCount,
        time: strategy.timeAvailable,
        injuries: answers.injuries,
        equipment: strategy.equipment,
        gender: answers.gender,
        experience: answers.experience,
        body_type: resolveBodyType(answers)
      },
      null,
      2
    ),
    "",
    "EXERCICIOS DISPONIVEIS:",
    JSON.stringify(availableExercises, null, 2),
    "",
    "RETORNE APENAS JSON NESTE FORMATO:",
    JSON.stringify(
      {
        splitType: strategy.splitType,
        rationale: "justificativa curta da divisao",
        sessionCount: strategy.dayCount,
        progressionNotes: "observacao final de progressao",
        plan: [
          {
            day: "A",
            title: "Treino A",
            splitType: strategy.splitType,
            sessionFocus: "foco da sessao",
            rationale: "por que essa sessao existe",
            exercises: [
              {
                name: "nome do exercicio",
                blockType: "normal",
                trainingTechnique: "tradicional",
                primaryMuscles: ["quadriceps"],
                secondaryMuscles: ["glutes", "abs"],
                sets: 3,
                reps: 10,
                rest: 60,
                notes: "observacao curta",
                rationale: "funcao do exercicio na sessao"
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
          content: "Voce e um personal trainer especialista em treino personalizado."
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
      throw new Error("A OpenAI nao retornou conteudo para o treino.");
    }

    const parsed = extractAiWorkoutResponse(treinoIA);
    const validated = validateAndBuildWorkoutPlan(parsed, answers, diagnosis, filteredLibrary, strategy);

    if (!validated) {
      throw new Error("A resposta da IA nao passou na validacao do backend.");
    }

    return validated;
  } catch (error) {
    logError("AI", "OpenAI request failed", {
      code: typeof error === "object" && error && "code" in error ? (error as OpenAIWorkoutError).code ?? null : null,
      status: typeof error === "object" && error && "status" in error ? (error as OpenAIWorkoutError).status ?? null : null,
      message: error instanceof Error ? error.message : "unknown"
    });

    if (isOpenAIQuotaError(error)) {
      const quotaError = new Error("IA indisponivel no momento. Tente novamente mais tarde.") as OpenAIWorkoutError;
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
    throw new Error("A OpenAI nao retornou conteudo.");
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
          sessionFocus: strategy.sessions[0]?.sessionFocus ?? "Sessao principal",
          rationale: strategy.sessions[0]?.rationale ?? strategy.rationale,
          exercises: responseData.workout as AiWorkoutExercise[]
        }
      ];
    }
  }

  if (!normalizedPlan?.length) {
    throw new Error("Formato invalido da IA");
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

    if (!mobility.length) {
      mobility.unshift(buildFallbackMobility(blueprint));
    }

    if (!exercises.length) {
      logWarn("AI", "Workout AI session adjusted after exercise validation");
      continue;
    }

    const structuredExercises = structureSessionExercises(exercises, strategy, blueprint);
    const sessionFocus =
      buildSessionFocusLabel(
        typeof day.sessionFocus === "string" && day.sessionFocus.trim() ? day.sessionFocus.trim() : undefined,
        structuredExercises,
        blueprint
      ) || blueprint.sessionFocus;
    const progressionTip = buildSectionProgressionTip(strategy, structuredExercises);
    const items = buildWorkoutSectionItems(mobility, structuredExercises);
    const flattened = flattenWorkoutSectionItems(items);

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
      mobility: flattened.mobility,
      exercises: flattened.exercises,
      items
    });
  }

  if (!sections.length) {
    throw new Error("Formato invalido da IA");
  }

  return {
    title: `Plano ${diagnosis.title}`,
    subtitle: `${strategy.splitLabel} pensado para ${formatGoal(answers.goal)} com foco em eficiencia real.`,
    estimatedDuration: `${strategy.timeAvailable} min`,
    focus: [
      `Divisao: ${strategy.splitLabel}`,
      `Objetivo: ${formatGoal(answers.goal)}`,
      `Nivel: ${formatLevel(strategy.level)}`,
      `Frequencia: ${strategy.dayCount} dia(s)`
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
        sets: String(sanitizeFixedNumber(exercise.sets, getDefaultSets(strategy, movementType))),
        reps: String(sanitizeFixedNumber(exercise.reps, getDefaultReps(strategy, movementType))),
        rest: `${sanitizeFixedNumber(exercise.rest, getDefaultRest(strategy, blockType, movementType))}s`,
        type: legacyType,
        method: trainingTechnique,
        technique: trainingTechnique,
        blockType,
        trainingTechnique,
        rationale:
          cleanText(exercise.rationale) || buildExerciseRationale(blockType, blueprint, lookup.profile.primaryMuscles[0]),
        notes: cleanText(exercise.notes) || buildExerciseNotes(blockType, movementType, strategy.level),
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

  if (strategy.level === "beginner") {
    if (strategy.goalStyle === "conditioning" || strategy.timeAvailable <= 35) {
      return 1;
    }

    return exercises.length >= 6 && strategy.allowedBlockTypes.includes("superset") ? 1 : 0;
  }

  if (strategy.level === "intermediate") {
    return strategy.goalStyle === "conditioning" || strategy.timeAvailable <= 45 || exercises.length >= 6 ? 2 : 1;
  }

  if (exercises.length >= 7 || strategy.goalStyle === "conditioning" || strategy.goalStyle === "hypertrophy") {
    return 2;
  }

  return 1;
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
  const maxPrime = strategy.level === "beginner" ? 1 : 2;
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
    strategy.level === "beginner"
      ? 2
      : blockType === "tri-set" || blockType === "circuit"
        ? 3
        : 3;
  const parsedSets = exercises
    .map((exercise) => Number.parseInt(exercise.sets, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!parsedSets.length) {
    return String(base);
  }

  return String(Math.max(2, Math.min(base, Math.min(...parsedSets))));
}

function resolveCombinedBlockRest(blockType: CombinedBlockType, strategy: WorkoutStrategy) {
  if (blockType === "circuit") {
    return strategy.level === "beginner" ? "60-75 segundos" : "45-60 segundos";
  }

  if (blockType === "tri-set") {
    return strategy.level === "advanced" ? "60-75 segundos" : "75 segundos";
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
    abs: "core",
    full_body: "corpo inteiro"
  };

  return value ? labels[value] ?? value : "";
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
  if (movementType === "mobility") return 1;
  if (strategy.goalStyle === "hypertrophy") return movementType === "compound" ? 4 : 3;
  if (strategy.goalStyle === "conditioning") return 3;
  return movementType === "compound" ? 3 : 2;
}

function getDefaultReps(strategy: WorkoutStrategy, movementType: string) {
  if (movementType === "mobility") return 30;
  if (strategy.goalStyle === "hypertrophy") return movementType === "compound" ? 8 : 12;
  if (strategy.goalStyle === "conditioning") return movementType === "compound" ? 12 : 15;
  return movementType === "compound" ? 10 : 12;
}

function getDefaultRest(strategy: WorkoutStrategy, blockType: WorkoutBlockType, movementType: string) {
  if (blockType === "mobility") return 15;
  if (isCombinedBlockType(blockType)) return 30;
  if (blockType === "drop-set" || blockType === "rest-pause") return 20;
  if (movementType === "compound" && strategy.goalStyle === "hypertrophy") return 75;
  if (strategy.goalStyle === "conditioning") return 30;
  return 60;
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

function normalizeDayLabel(value: string | undefined, index: number) {
  const trimmed = (value ?? "").replace("Treino ", "").trim();
  if (!trimmed) {
    return String.fromCharCode(65 + index);
  }
  return trimmed.toUpperCase().slice(0, 1);
}

function normalizeFocus(value: string[] | string | undefined, fallback: string) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]) || fallback;
  }

  return normalizeText(value) || fallback;
}

function normalizeMuscleList(value: string[] | undefined, fallback: string[]) {
  if (!Array.isArray(value) || !value.length) {
    return [...fallback];
  }

  const normalized = value.map((item) => normalizeText(item)).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [...fallback];
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
  const normalized = value?.trim();
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

function buildWorkoutRestrictionCategories(answers: QuizAnswers) {
  const normalized = normalizeText(answers.injuries);

  if (!normalized) {
    return [] as string[];
  }

  const categories = new Set<string>();
  const mappings: Array<{ category: string; patterns: string[] }> = [
    { category: "shoulder", patterns: ["ombro", "manguito", "shoulder"] },
    { category: "knee", patterns: ["joelho", "patela", "knee"] },
    { category: "lower_back", patterns: ["lombar", "coluna", "ciatica", "lower back", "costas"] },
    { category: "hip", patterns: ["quadril", "pelve", "hip"] },
    { category: "ankle_foot", patterns: ["tornozelo", "pe", "plantar", "ankle", "foot"] },
    { category: "wrist_elbow", patterns: ["punho", "cotovelo", "mao", "wrist", "elbow"] },
    { category: "neck", patterns: ["cervical", "pescoco", "neck"] },
    { category: "cardiorespiratory", patterns: ["asma", "card", "pressao", "respirat", "cardio"] },
    { category: "pregnancy_postpartum", patterns: ["gestante", "gravidez", "pos parto", "posparto"] },
    { category: "mobility_limitation", patterns: ["mobilidade", "rigidez", "amplitude", "travamento"] }
  ];

  for (const mapping of mappings) {
    if (mapping.patterns.some((pattern) => normalized.includes(pattern))) {
      categories.add(mapping.category);
    }
  }

  if (!categories.size) {
    categories.add("other_constraint");
  }

  return Array.from(categories).sort();
}

function mobilityNameByFocus(focus: string) {
  const labels: Record<string, string> = {
    chest: "Mobilidade toracica",
    back: "Mobilidade escapular",
    quadriceps: "Mobilidade de quadril",
    hamstrings: "Mobilidade de posterior",
    glutes: "Ativacao de gluteos",
    shoulders: "Rotacao de ombros",
    abs: "Ativacao de core",
    full_body: "Mobilidade global"
  };

  return labels[focus] ?? "Mobilidade global";
}

function formatGoal(goal: QuizAnswers["goal"]) {
  const labels: Record<QuizAnswers["goal"], string> = {
    lose_weight: "emagrecimento",
    gain_muscle: "hipertrofia",
    body_recomposition: "recomposicao corporal",
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


