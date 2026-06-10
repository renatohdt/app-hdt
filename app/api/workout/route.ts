import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { normalizeExerciseRecord } from "@/lib/exercise-library";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { Experience, ExerciseRecord, QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";
import { isPremium } from "@/lib/subscription";
import { buildWorkoutHash, generateWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload, syncWorkoutWithExerciseLibrary } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, type WorkoutRecordRow, saveWorkoutRecord } from "@/lib/workout-record-store";
import { getAllTimeWorkoutCount, getWorkoutSessionStats, listWorkoutSessionLogs } from "@/lib/workout-session-store";
import { countWeightIncreases } from "@/lib/exercise-weight-store";
import { getUserLevelSummary } from "@/lib/user-level-store";
import { experienceToInitialPhase, phaseToExperience, type UserPhase } from "@/lib/user-level";
import {
  applyWorkoutPlanSessionConfig,
  buildWorkoutSessionProgress,
  hasWorkoutPlanSessionConfig,
  resolveWorkoutPlanSessionConfig
} from "@/lib/workout-sessions";

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const LOAD_WORKOUT_ERROR_MESSAGE = "Não foi possível carregar seu treino agora.";
const LOAD_ANSWERS_ERROR_MESSAGE = "Não foi possível carregar seus dados agora.";
const GENERATE_WORKOUT_ERROR_MESSAGE = "Não foi possível gerar seu treino agora. Tente novamente.";
const SAVE_WORKOUT_ERROR_MESSAGE = "Não foi possível salvar seu treino no momento.";
const RATE_LIMIT_ERROR_MESSAGE = "Você atingiu o limite de tentativas. Tente novamente em alguns minutos.";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId");
    const userId = auth.user.id;

    if (requestedUserId && requestedUserId !== userId) {
      logWarn("AUTH", "Workout access denied", { user_id: userId });
      return jsonError("Acesso negado.", 403);
    }

    // Todas as queries iniciais rodam em paralelo — nenhuma depende do resultado da outra,
    // pois o userId já está disponível desde o passo de autenticação acima.
    const [
      { data: user, error: userError },
      { data: workoutRecord, error: workoutError },
      savedAnswers,
      exerciseLibrary
    ] = await Promise.all([
      supabase.from("users").select("id, name").eq("id", userId).maybeSingle(),
      fetchLatestWorkoutRecord(supabase, { userId, includeCreatedAt: true, scope: "WORKOUT" }),
      getUserAnswersByUserId(supabase, userId),
      getCachedExerciseCatalog()
    ]);

    if (userError || !user) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 404);
    }

    if (workoutError) {
      logError("WORKOUT", "Workout query failed", {
        user_id: userId,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    if (!savedAnswers) {
      logWarn("WORKOUT", "Workout runtime answers fallback", {
        user_id: userId,
        reason: "user_answers_missing"
      });
    }

    const answers = buildRuntimeQuizAnswers(savedAnswers);
    const diagnosis = diagnoseUser(answers);

    if (!workoutRecord) {
      logInfo("WORKOUT", "Workout not found", { user_id: user.id });
      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: false,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: null,
          sessionProgress: null,
          sessionLogs: []
        }
      });
    }

    const normalizedWorkout = normalizeWorkoutSafely(workoutRecord.exercises, {
      diagnosis,
      answers,
      exerciseLibrary,
      userId: user.id,
      workoutId: workoutRecord.id
    });

    if (!normalizedWorkout) {
      logWarn("WORKOUT", "Workout payload unavailable after parsing", {
        user_id: user.id,
        workout_id: workoutRecord.id
      });

      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: false,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: null,
          sessionProgress: null,
          sessionLogs: []
        }
      });
    }

    const workoutState = resolveWorkoutPlanState({
      workoutRecord,
      workout: normalizedWorkout,
      answers
    });
    const now = new Date().toISOString();
    const [sessionStats, replacementCountResult, totalWorkoutsAllTime, totalWeightIncreasesAllTime, activeGoalResult, completedGoalsResult, userLevelSummary, referralAchievementResult] = await Promise.all([
      getWorkoutSessionStats(supabase, workoutState.sessionFilter),
      supabase
        .from("workout_exercise_replacements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("workout_id", workoutRecord.id),
      getAllTimeWorkoutCount(supabase, user.id),
      countWeightIncreases(supabase, user.id),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .gte("ends_at", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("completed_at", "is", null),
      // Aplica decaimento por inatividade e retorna resumo do nível.
      // Passa a experiência do quiz para inicializar a fase corretamente na 1ª vez.
      getUserLevelSummary(supabase, user.id, savedAnswers?.experience ?? null).catch(() => null),
      // Flag de desbloqueio da conquista de indicação ("Fofoqueiro(a)").
      supabase
        .from("users")
        .select("referral_achievement_unlocked")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    const sessionProgress = buildWorkoutSessionProgress({
      totalSessions: workoutState.sessionConfig.totalSessions,
      completedSessions: sessionStats.completedSessions,
      lastCompletedAt: sessionStats.lastLog?.completedAt ?? null,
      lastCompletedWorkoutKey: sessionStats.lastLog?.workoutKey ?? null,
      lastCompletedSessionNumber: sessionStats.lastLog?.sessionNumber ?? null
    });

    // Processar meta ativa
    let activeGoalData = null;
    if (activeGoalResult.data) {
      const g = activeGoalResult.data;
      const { count: workoutsDone } = await supabase
        .from("workout_session_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("completed_at", g.starts_at)
        .lte("completed_at", g.ends_at);
      activeGoalData = {
        id: g.id,
        targetCount: g.target_count,
        periodDays: g.period_days,
        startsAt: g.starts_at,
        endsAt: g.ends_at,
        completedAt: g.completed_at,
        workoutsDone: workoutsDone ?? 0
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: true,
        workoutId: workoutRecord.id,
        replacementCount: replacementCountResult.count ?? 0,
        totalWorkoutsAllTime,
        totalWeightIncreasesAllTime,
        totalGoalsCompleted: completedGoalsResult.count ?? 0,
        referralAchievementUnlocked: referralAchievementResult.data?.referral_achievement_unlocked === true,
        activeGoal: activeGoalData,
        user: {
          id: user.id,
          name: user.name
        },
        answers: serializeAnswersForResponse(answers),
        diagnosis,
        workout: workoutState.workout,
        sessionProgress,
        // Dados de nível/XP — inclui decay aplicado se havia inatividade
        levelData: userLevelSummary
          ? {
              xpPoints:            userLevelSummary.xpPoints,
              currentPhase:        userLevelSummary.currentPhase,
              phaseStartedAt:      userLevelSummary.phaseStartedAt,
              dotProgress:         userLevelSummary.dotProgress,
              isReadyButWaiting:   userLevelSummary.isReadyButWaiting,
              decayRegressed:      userLevelSummary.decayResult?.regressed ?? false,
              decayRegressedPhase: userLevelSummary.decayResult?.regressedPhase ?? false,
              regressionMessage:   userLevelSummary.decayResult?.regressionMessage ?? null,
            }
          : null,
      }
    });
  } catch {
    logError("WORKOUT", "Workout GET unexpected failure", {});
    return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const body = (await request.json().catch(() => ({}))) as { userId?: string; force?: boolean };
    const userId = auth.user.id;
    const forceRegenerate = body.force === true;

    if (body.userId && body.userId !== userId) {
      logWarn("AUTH", "Workout generation denied", { user_id: userId });
      return jsonError("Acesso negado.", 403);
    }

    const rateKey = `workout:${userId}:${getRequestFingerprint(request, userId)}`;
    const rateLimit = enforceRateLimit(rateKey, 3, 10 * 60 * 1000);

    if (!rateLimit.allowed) {
      logWarn("AI", "Workout generation rate limited", { user_id: userId });
      return jsonError(RATE_LIMIT_ERROR_MESSAGE, 429);
    }

    const { data: user, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !user) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      return jsonError(LOAD_ANSWERS_ERROR_MESSAGE, 404);
    }

    const answers = buildRuntimeQuizAnswers(savedAnswers);

    // ── Trava premium do multi-estilo ───────────────────────────────────────
    // Plano com 2+ estilos distintos é exclusivo Premium. Não-premium é
    // rebaixado para 1 estilo (o primeiro). A trava real fica aqui no backend.
    const requestedStyles = Array.from(
      new Set((answers.trainingStyles ?? []).filter((style) => style && style !== "personal"))
    );
    if (requestedStyles.length >= 2) {
      const userToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
      const premium = await isPremium(userId, userToken);
      if (!premium) {
        answers.trainingStyles = [requestedStyles[0]];
        logWarn("AI", "Multi-estilo negado (não premium); rebaixado para 1 estilo", {
          user_id: userId,
          requested: requestedStyles
        });
      }
    }

    // ── Nível para geração do treino ────────────────────────────────────────
    // O quiz é a fonte primária. O XP só sobrescreve se a fase evoluiu além
    // do que o quiz indicaria — preservando o filtro de exercícios por nível.
    const levelRow = await getUserLevelSummary(supabase, user.id, savedAnswers.experience ?? null).catch(() => null);
    const effectiveAnswers = levelRow
      ? overrideExperienceFromPhase(answers, levelRow.currentPhase)
      : answers;
    const diagnosis = diagnoseUser(effectiveAnswers);
    const workoutHash = buildWorkoutHash(effectiveAnswers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const normalizedExercises = ((exercises ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));

    const { data: excludedRows } = await supabase
      .from("user_excluded_exercises")
      .select("exercise_id")
      .eq("user_id", userId);

    const excludedExerciseIds = (excludedRows ?? []).map((row) => row.exercise_id);

    const { data: existingWorkout, error: existingWorkoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: user.id,
      includeCreatedAt: true,
      scope: "AI"
    });

    if (existingWorkoutError) {
      logError("AI", "Workout lookup query failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(existingWorkoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const existingWorkoutState = buildExistingWorkoutState({
      workoutRecord: existingWorkout,
      answers,
      diagnosis,
      exerciseLibrary: normalizedExercises,
      userId
    });
    const existingSessionStats = existingWorkoutState
      ? await getWorkoutSessionStats(supabase, existingWorkoutState.sessionFilter)
      : null;
    const existingSessionProgress = existingWorkoutState
      ? buildWorkoutSessionProgress({
          totalSessions: existingWorkoutState.sessionConfig.totalSessions,
          completedSessions: existingSessionStats?.completedSessions ?? 0,
          lastCompletedAt: existingSessionStats?.lastLog?.completedAt ?? null,
          lastCompletedWorkoutKey: existingSessionStats?.lastLog?.workoutKey ?? null,
          lastCompletedSessionNumber: existingSessionStats?.lastLog?.sessionNumber ?? null
        })
      : null;

    if (
      !forceRegenerate &&
      existingWorkout &&
      existingWorkoutState &&
      existingWorkout.hash === workoutHash &&
      !existingSessionProgress?.cycleCompleted
    ) {
      logInfo("AI", "Workout cached", { user_id: userId });

      const shouldPersistCurrentPlan =
        existingWorkout.total_sessions !== existingWorkoutState.sessionConfig.totalSessions ||
        !hasWorkoutPlanSessionConfig(existingWorkoutState.normalizedWorkout, existingWorkoutState.sessionConfig);

      if (shouldPersistCurrentPlan) {
        const workoutSaveResult = await saveWorkoutRecord(supabase, {
          userId: user.id,
          existingWorkoutId: existingWorkout.id,
          hash: workoutHash,
          exercises: existingWorkoutState.workout,
          totalSessions: existingWorkoutState.sessionConfig.totalSessions,
          scope: "AI"
        });

        if (workoutSaveResult.error) {
          logError("AI", "Workout save failed", {
            user_id: user.id,
            error_code: getSupabaseErrorCode(workoutSaveResult.error)
          });
          return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
        }
      }

      const sessionLogs = await listWorkoutSessionLogs(supabase, {
        workoutId: existingWorkout.id,
        limit: 180,
        allCycles: true
      });

      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: true,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: existingWorkoutState.workout,
          sessionProgress: existingSessionProgress,
          sessionLogs
        }
      });
    }

    let workout = null as WorkoutPlan | null;

    try {
      logInfo("AI", "Workout generation started", { user_id: userId });

      const { data: feedbackRows } = await supabase
        .from("workout_session_feedbacks")
        .select("liked, intensity_level")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      const _fbRows = feedbackRows ?? [];
      const fbCount = _fbRows.length;
      const avgLiked = fbCount > 0 ? _fbRows.filter((r) => r.liked).length / fbCount : null;
      const avgIntensity = fbCount > 0 ? _fbRows.reduce((s, r) => s + r.intensity_level, 0) / fbCount : null;
      const previousWorkoutSummary = existingWorkoutState?.workout
        ? existingWorkoutState.workout.sections
            .map((s) => `${s.title}:\n${s.exercises.slice(0, 3).map((e) => `  - ${e.name}`).join("\n")}`)
            .join("\n")
        : null;
      const feedbackContext = { avgLiked, avgIntensity, sessionCount: fbCount, previousWorkoutSummary };

      workout = normalizeWorkoutPayload(
        await generateWorkoutWithAI(effectiveAnswers, diagnosis, normalizedExercises, {
          previousWorkout: existingWorkoutState?.workout ?? null,
          lastCompletedWorkoutKey: existingSessionStats?.lastLog?.workoutKey ?? null,
          excludedExerciseIds,
          userId
        }, feedbackContext),
        {
          diagnosis,
          answers: effectiveAnswers
        }
      );
      if (workout) {
        workout = syncWorkoutWithExerciseLibrary(workout, normalizedExercises);
      }
      logInfo("AI", "Workout generation completed", { user_id: userId });
    } catch (error) {
      if (isOpenAIQuotaError(error)) {
        return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 503);
      }

      logError("AI", "Workout generation failed", { user_id: userId });
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    if (!workout) {
      return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
    }

    logInfo("AI", "Workout normalized", {
      user_id: userId,
      section_count: workout.sections.length,
      split_type: workout.splitType ?? null
    });

    const nextWorkoutConfig = {
      ...resolveWorkoutPlanSessionConfig({
        answers,
        workout,
        storedTotalSessions: null,
        fallbackWeeklyFrequency: workout.sessionCount ?? workout.sections.length
      }),
      planCycleId: randomUUID()
    };
    const persistedWorkout = applyWorkoutPlanSessionConfig(workout, nextWorkoutConfig);
    const workoutSaveResult = await saveWorkoutRecord(supabase, {
      userId: user.id,
      existingWorkoutId: existingWorkout?.id ?? null,
      hash: workoutHash,
      exercises: persistedWorkout,
      totalSessions: nextWorkoutConfig.totalSessions,
      createdAt: new Date().toISOString(),
      scope: "AI"
    });

    if (workoutSaveResult.error) {
      logError("AI", "Workout save failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(workoutSaveResult.error)
      });
      return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
    }

    // Quando o usuário regenerou manualmente pelo perfil, registra o timestamp
    // para controlar o limite de 1x a cada 30 dias no plano free.
    if (forceRegenerate) {
      await saveUserAnswers(supabase, user.id, {
        ...savedAnswers,
        lastRegeneratedAt: new Date().toISOString()
      } as QuizAnswers & { lastRegeneratedAt: string });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: true,
        user: {
          id: user.id,
          name: user.name
        },
        answers: serializeAnswersForResponse(answers),
        diagnosis,
        workout: persistedWorkout,
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions: nextWorkoutConfig.totalSessions,
          completedSessions: 0
        }),
        sessionLogs: []
      }
    });
  } catch {
    logError("AI", "Workout POST unexpected failure", {});
    return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
  }
}

function buildExistingWorkoutState(input: {
  workoutRecord: WorkoutRecordRow | null;
  answers: QuizAnswers;
  diagnosis: ReturnType<typeof diagnoseUser>;
  exerciseLibrary: ExerciseRecord[];
  userId: string;
}) {
  if (!input.workoutRecord) {
    return null;
  }

  const normalizedWorkout = normalizeWorkoutSafely(input.workoutRecord.exercises, {
    diagnosis: input.diagnosis,
    answers: input.answers,
    exerciseLibrary: input.exerciseLibrary,
    userId: input.userId,
    workoutId: input.workoutRecord.id
  });

  if (!normalizedWorkout) {
    return null;
  }

  return {
    normalizedWorkout,
    ...resolveWorkoutPlanState({
      workoutRecord: input.workoutRecord,
      workout: normalizedWorkout,
      answers: input.answers
    })
  };
}

function resolveWorkoutPlanState(input: {
  workoutRecord: WorkoutRecordRow;
  workout: WorkoutPlan;
  answers: QuizAnswers;
}) {
  const sessionConfig = resolveWorkoutPlanSessionConfig({
    answers: input.answers,
    workout: input.workout,
    storedTotalSessions: input.workoutRecord.total_sessions,
    fallbackWeeklyFrequency: input.workout.sessionCount ?? input.workout.sections.length
  });

  return {
    workout: applyWorkoutPlanSessionConfig(input.workout, sessionConfig),
    sessionConfig,
    sessionFilter: {
      workoutId: input.workoutRecord.id,
      workoutHash: input.workoutRecord.hash ?? null,
      planCycleId: sessionConfig.planCycleId,
      cycleStartedAt: input.workoutRecord.created_at ?? null
    }
  };
}

/**
 * Sobrescreve o campo `experience` dos answers com o nível derivado da fase XP,
 * MAS SOMENTE se a fase XP for maior que o que o quiz indicaria.
 * Isso preserva o filtro de exercícios por nível do quiz para novos usuários.
 */
function overrideExperienceFromPhase(
  answers: QuizAnswers,
  currentPhase: UserPhase
): QuizAnswers {
  const quizPhase = experienceToInitialPhase(answers.experience);
  const phaseOrder = ["iniciante", "pre_intermediario", "intermediario", "pre_avancado", "avancado"];
  const quizIdx   = phaseOrder.indexOf(quizPhase);
  const xpIdx     = phaseOrder.indexOf(currentPhase);

  // Só sobrescreve se XP evoluiu ALÉM do quiz
  if (xpIdx <= quizIdx) return answers;

  return {
    ...answers,
    experience: phaseToExperience(currentPhase) as Experience,
  };
}

function buildRuntimeQuizAnswers(savedAnswers?: QuizAnswers | null) {
  return normalizeBodyTypeFields({
    goal: savedAnswers?.goal ?? "lose_weight",
    experience: savedAnswers?.experience ?? "no_training",
    gender: savedAnswers?.gender ?? "male",
    age: toNumber(savedAnswers?.age),
    weight: toNumber(savedAnswers?.weight),
    height: toNumber(savedAnswers?.height),
    profession: typeof savedAnswers?.profession === "string" ? savedAnswers.profession : "",
    situation: savedAnswers?.situation ?? "cant_stay_consistent",
    mindMuscle: savedAnswers?.mindMuscle ?? "sometimes",
    days: toNumber(savedAnswers?.days) || 3,
    time: toNumber(savedAnswers?.time) || 45,
    equipment: Array.isArray(savedAnswers?.equipment) ? savedAnswers.equipment : [],
    structuredPlan: savedAnswers?.structuredPlan ?? "no",
    wrist: savedAnswers?.wrist,
    body_type_raw: savedAnswers?.body_type_raw,
    body_type: savedAnswers?.body_type,
    location: savedAnswers?.location ?? "home",
    focusRegion: savedAnswers?.focusRegion ?? "balanced",
    trainingStyle: savedAnswers?.trainingStyle ?? "personal",
    trainingStyles: Array.isArray(savedAnswers?.trainingStyles) ? savedAnswers.trainingStyles : undefined
  }) as QuizAnswers;
}

function serializeAnswersForResponse(answers: QuizAnswers) {
  return {
    goal: answers.goal,
    gender: answers.gender,
    wrist: answers.wrist,
    body_type_raw: answers.body_type_raw,
    body_type: answers.body_type,
    age: answers.age,
    weight: answers.weight,
    height: answers.height,
    profession: answers.profession,
    location: answers.location,
    equipment: answers.equipment,
    time: answers.time,
    days: answers.days,
    experience: answers.experience
  };
}

function normalizeWorkoutSafely(
  rawWorkout: unknown,
  input: {
    diagnosis: ReturnType<typeof diagnoseUser>;
    answers: QuizAnswers;
    exerciseLibrary?: ExerciseRecord[];
    userId: string;
    workoutId?: string | null;
  }
) {
  try {
    const normalizedWorkout = normalizeWorkoutPayload(rawWorkout, {
      diagnosis: input.diagnosis,
      answers: input.answers
    });

    return normalizedWorkout && input.exerciseLibrary?.length
      ? syncWorkoutWithExerciseLibrary(normalizedWorkout, input.exerciseLibrary)
      : normalizedWorkout;
  } catch {
    logWarn("WORKOUT", "Workout payload parsing failed", {
      user_id: input.userId,
      workout_id: input.workoutId ?? null
    });
    return null;
  }
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

async function loadExerciseCatalog(
  supabase: NonNullable<ReturnType<typeof createSupabaseUserClient>>,
  userId: string
) {
  const { data, error } = await supabase.from("exercises").select("*");

  if (error) {
    logWarn("WORKOUT", "Exercise catalog enrichment skipped", {
      user_id: userId,
      error_code: getSupabaseErrorCode(error)
    });
    return [] as ExerciseRecord[];
  }

  return ((data ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
}

// Catálogo de exercícios cacheado por 10 minutos no servidor.
// A tabela "exercises" é gerenciada por admins e raramente muda,
// portanto não faz sentido buscá-la do banco a cada request de usuário.
// Apenas o GET usa este cache — o POST (geração de treino) busca direto do banco.
const getCachedExerciseCatalog = unstable_cache(
  async (): Promise<ExerciseRecord[]> => {
    const adminClient = createSupabaseAdminClient();

    if (!adminClient) {
      return [];
    }

    const { data, error } = await adminClient.from("exercises").select("*");

    if (error) {
      return [];
    }

    return ((data ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
  },
  ["exercises-catalog"],
  { revalidate: 600 } // 10 minutos
);
