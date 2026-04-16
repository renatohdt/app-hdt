import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { normalizeExerciseRecord } from "@/lib/exercise-library";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { ExerciseRecord, QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { buildWorkoutHash, generateWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload, syncWorkoutWithExerciseLibrary } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, type WorkoutRecordRow, saveWorkoutRecord } from "@/lib/workout-record-store";
import { getAllTimeWorkoutCount, getWorkoutSessionStats, listWorkoutSessionLogs } from "@/lib/workout-session-store";
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

    const { data: user, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !user) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 404);
    }

    const { data: workoutRecord, error: workoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: user.id,
      includeCreatedAt: true,
      scope: "WORKOUT"
    });

    if (workoutError) {
      logError("WORKOUT", "Workout query failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      logWarn("WORKOUT", "Workout runtime answers fallback", {
        user_id: user.id,
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

    const exerciseLibrary = await loadExerciseCatalog(supabase, user.id);
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
    const [sessionStats, sessionLogs, replacementCountResult, totalWorkoutsAllTime] = await Promise.all([
      getWorkoutSessionStats(supabase, workoutState.sessionFilter),
      listWorkoutSessionLogs(supabase, {
        workoutId: workoutRecord.id,
        limit: 180,
        allCycles: true
      }),
      supabase
        .from("workout_exercise_replacements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("workout_id", workoutRecord.id),
      getAllTimeWorkoutCount(supabase, user.id)
    ]);
    const sessionProgress = buildWorkoutSessionProgress({
      totalSessions: workoutState.sessionConfig.totalSessions,
      completedSessions: sessionStats.completedSessions,
      lastCompletedAt: sessionStats.lastLog?.completedAt ?? null,
      lastCompletedWorkoutKey: sessionStats.lastLog?.workoutKey ?? null,
      lastCompletedSessionNumber: sessionStats.lastLog?.sessionNumber ?? null
    });

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: true,
        workoutId: workoutRecord.id,
        replacementCount: replacementCountResult.count ?? 0,
        totalWorkoutsAllTime,
        user: {
          id: user.id,
          name: user.name
        },
        answers: serializeAnswersForResponse(answers),
        diagnosis,
        workout: workoutState.workout,
        sessionProgress,
        sessionLogs
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

    const body = (await request.json().catch(() => ({}))) as { userId?: string };
    const userId = auth.user.id;

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
    const diagnosis = diagnoseUser(answers);
    const workoutHash = buildWorkoutHash(answers);
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
      workout = normalizeWorkoutPayload(
        await generateWorkoutWithAI(answers, diagnosis, normalizedExercises, {
          previousWorkout: existingWorkoutState?.workout ?? null,
          lastCompletedWorkoutKey: existingSessionStats?.lastLog?.workoutKey ?? null,
          excludedExerciseIds
        }),
        {
          diagnosis,
          answers
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
    location: savedAnswers?.location ?? "home"
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
