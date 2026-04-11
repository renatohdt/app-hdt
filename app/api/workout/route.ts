import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { jsonError } from "@/lib/server-response";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { ExerciseRecord, QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { fetchLatestWorkoutRecord, saveWorkoutRecord } from "@/lib/workout-record-store";
import { getWorkoutSessionStats } from "@/lib/workout-session-store";
import { buildWorkoutHash, filterExercisesForAI, generateWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";
import { buildWorkoutSessionProgress, calculateWorkoutTotalSessions } from "@/lib/workout-sessions";
import { normalizeExerciseRecord } from "@/lib/exercise-library";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível carregar seu treino agora.", 500);
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId");
    const userId = auth.user.id;

    if (requestedUserId && requestedUserId !== userId) {
      logWarn("AUTH", "Workout access denied", { user_id: userId });
      return jsonError("Acesso negado.", 403);
    }

    const { data: user, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !user) {
      return jsonError("Sua sessão expirou. Faça login novamente.", 404);
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
      return jsonError("Não foi possível carregar seu treino agora.", 500);
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
          sessionProgress: null
        }
      });
    }

    const normalizedWorkout = normalizeWorkoutSafely(workoutRecord.exercises, {
      diagnosis,
      answers,
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
          sessionProgress: null
        }
      });
    }

    const totalSessions = resolveWorkoutTotalSessions({
      storedTotalSessions: workoutRecord.total_sessions,
      answers,
      distinctWorkoutCount: normalizedWorkout.sessionCount ?? normalizedWorkout.sections.length
    });
    const sessionStats = await getWorkoutSessionStats(supabase, {
      workoutId: workoutRecord.id,
      workoutHash: workoutRecord.hash ?? null
    });
    const sessionProgress = buildWorkoutSessionProgress({
      totalSessions,
      completedSessions: sessionStats.completedSessions,
      lastCompletedAt: sessionStats.lastLog?.completedAt ?? null,
      lastCompletedWorkoutKey: sessionStats.lastLog?.workoutKey ?? null,
      lastCompletedSessionNumber: sessionStats.lastLog?.sessionNumber ?? null
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
        workout: normalizedWorkout,
        sessionProgress
      }
    });
  } catch {
    logError("WORKOUT", "Workout GET unexpected failure", {});
    return jsonError("Não foi possível carregar seu treino agora.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
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
      return jsonError("Você atingiu o limite de tentativas. Tente novamente em alguns minutos.", 429);
    }

    const { data: user, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !user) {
      return jsonError("Sua sessão expirou. Faça login novamente.", 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      return jsonError("Não foi possível carregar seus dados agora.", 404);
    }

    const answers = buildRuntimeQuizAnswers(savedAnswers);
    const diagnosis = diagnoseUser(answers);
    const workoutHash = buildWorkoutHash(answers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
    }

    const normalizedExercises = ((exercises ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
    const filteredExercises = filterExercisesForAI(answers, normalizedExercises);
    const { data: existingWorkout, error: existingWorkoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: user.id,
      scope: "AI"
    });

    if (existingWorkoutError) {
      logError("AI", "Workout lookup query failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(existingWorkoutError)
      });
      return jsonError("Não foi possível carregar seu treino agora.", 500);
    }

    const reusableWorkout = existingWorkout?.hash === workoutHash ? existingWorkout : null;
    let workout = normalizeWorkoutSafely(reusableWorkout?.exercises ?? null, {
      diagnosis,
      answers,
      userId,
      workoutId: reusableWorkout?.id ?? null
    });

    if (workout) {
      logInfo("AI", "Workout cached", { user_id: userId });
    } else {
      try {
        logInfo("AI", "Workout generation started", { user_id: userId });
        workout = normalizeWorkoutPayload(await generateWorkoutWithAI(answers, diagnosis, filteredExercises), {
          diagnosis,
          answers
        });
        logInfo("AI", "Workout generation completed", { user_id: userId });
      } catch (error) {
        if (isOpenAIQuotaError(error)) {
          return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 503);
        }

        logError("AI", "Workout generation failed", { user_id: userId });
        return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
      }
    }

    if (!workout) {
      return jsonError("Não foi possível salvar seu treino no momento.", 500);
    }

    logInfo("AI", "Workout normalized", {
      user_id: userId,
      section_count: workout.sections.length,
      split_type: workout.splitType ?? null
    });

    const totalSessions =
      reusableWorkout?.total_sessions ??
      resolveWorkoutTotalSessions({
        storedTotalSessions: null,
        answers,
        distinctWorkoutCount: workout.sessionCount ?? workout.sections.length
      });
    const workoutSaveResult = await saveWorkoutRecord(supabase, {
      userId: user.id,
      existingWorkoutId: existingWorkout?.id ?? null,
      hash: workoutHash,
      exercises: workout,
      totalSessions,
      createdAt: new Date().toISOString(),
      scope: "AI"
    });

    if (workoutSaveResult.error) {
      logError("AI", "Workout save failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(workoutSaveResult.error)
      });
      return jsonError("Não foi possível salvar seu treino no momento.", 500);
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
        workout,
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions,
          completedSessions: 0
        })
      }
    });
  } catch {
    logError("AI", "Workout POST unexpected failure", {});
    return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
  }
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
    userId: string;
    workoutId?: string | null;
  }
) {
  try {
    return normalizeWorkoutPayload(rawWorkout, {
      diagnosis: input.diagnosis,
      answers: input.answers
    });
  } catch {
    logWarn("WORKOUT", "Workout payload parsing failed", {
      user_id: input.userId,
      workout_id: input.workoutId ?? null
    });
    return null;
  }
}

function resolveWorkoutTotalSessions(input: {
  storedTotalSessions?: number | null;
  answers: QuizAnswers;
  distinctWorkoutCount: number;
}) {
  const storedTotalSessions = toNumber(input.storedTotalSessions);

  if (storedTotalSessions > 0) {
    return storedTotalSessions;
  }

  return calculateWorkoutTotalSessions({
    daysPerWeek: input.answers.days,
    distinctWorkoutCount: input.distinctWorkoutCount
  });
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
