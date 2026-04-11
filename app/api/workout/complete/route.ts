import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { getSupabaseErrorCode, isSupabaseMissingRelationError } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, type WorkoutRecordRow } from "@/lib/workout-record-store";
import { createWorkoutSessionLog, getWorkoutSessionStats } from "@/lib/workout-session-store";
import {
  buildWorkoutSessionProgress,
  normalizeWorkoutKey,
  resolveWorkoutPlanSessionConfig
} from "@/lib/workout-sessions";

type CompleteWorkoutBody = {
  workoutKey?: unknown;
};

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sess\u00e3o expirou. Fa\u00e7a login novamente.";
const COMPLETE_WORKOUT_ERROR_MESSAGE = "N\u00e3o foi poss\u00edvel registrar a conclus\u00e3o do treino.";
const LOAD_CURRENT_WORKOUT_ERROR_MESSAGE = "N\u00e3o foi poss\u00edvel carregar seu treino atual.";
const WORKOUT_NOT_FOUND_MESSAGE = "Treino n\u00e3o encontrado.";
const INVALID_WORKOUT_MESSAGE = "Treino selecionado inv\u00e1lido.";
const PLAN_ALREADY_COMPLETED_MESSAGE = "Todas as sess\u00f5es deste plano j\u00e1 foram conclu\u00eddas.";
const SESSION_LOG_UNAVAILABLE_MESSAGE = "O registro de sess\u00f5es ainda n\u00e3o est\u00e1 dispon\u00edvel neste ambiente.";
const COMPLETE_MARK_ERROR_MESSAGE = "N\u00e3o foi poss\u00edvel marcar o treino como conclu\u00eddo.";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(COMPLETE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const body = (await request.json().catch(() => ({}))) as CompleteWorkoutBody;
    const selectedWorkoutKey = normalizeWorkoutKey(typeof body.workoutKey === "string" ? body.workoutKey : null);
    const { data: workoutRecord, error: workoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: auth.user.id,
      includeCreatedAt: true,
      scope: "WORKOUT"
    });

    if (workoutError) {
      logError("WORKOUT", "Workout completion lookup failed", {
        user_id: auth.user.id,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError(LOAD_CURRENT_WORKOUT_ERROR_MESSAGE, 500);
    }

    if (!workoutRecord) {
      return jsonError(WORKOUT_NOT_FOUND_MESSAGE, 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, auth.user.id);
    const answers = buildRuntimeQuizAnswers(savedAnswers);
    const diagnosis = diagnoseUser(answers);
    const normalizedWorkout = normalizeWorkoutSafely(workoutRecord.exercises, {
      diagnosis,
      answers
    });

    if (!normalizedWorkout) {
      return jsonError(LOAD_CURRENT_WORKOUT_ERROR_MESSAGE, 404);
    }

    const validWorkoutKeys = normalizedWorkout.sections
      .map((section) => normalizeWorkoutKey(section.title))
      .filter((value): value is string => Boolean(value));
    const workoutKey = selectedWorkoutKey ?? validWorkoutKeys[0] ?? null;

    if (selectedWorkoutKey && !validWorkoutKeys.includes(selectedWorkoutKey)) {
      return jsonError(INVALID_WORKOUT_MESSAGE, 400);
    }

    const workoutState = resolveWorkoutPlanState({
      workoutRecord,
      workout: normalizedWorkout,
      answers
    });
    const sessionStats = await getWorkoutSessionStats(supabase, workoutState.sessionFilter);

    if (sessionStats.completedSessions >= workoutState.sessionConfig.totalSessions) {
      return jsonError(PLAN_ALREADY_COMPLETED_MESSAGE, 409);
    }

    const completedAt = new Date().toISOString();
    const sessionNumber = sessionStats.completedSessions + 1;
    const completionResult = await createWorkoutSessionLog(supabase, {
      workoutId: workoutRecord.id,
      userId: auth.user.id,
      workoutHash: workoutRecord.hash ?? null,
      workoutKey,
      planCycleId: workoutState.sessionConfig.planCycleId,
      sessionNumber,
      completedAt
    });

    if (completionResult.error || !completionResult.data) {
      const errorCode = (completionResult.error as { code?: string } | null)?.code;

      if (errorCode === "23505") {
        const refreshedStats = await getWorkoutSessionStats(supabase, workoutState.sessionFilter);

        return NextResponse.json({
          success: true,
          data: {
            sessionProgress: buildWorkoutSessionProgress({
              totalSessions: workoutState.sessionConfig.totalSessions,
              completedSessions: refreshedStats.completedSessions,
              lastCompletedAt: refreshedStats.lastLog?.completedAt ?? null,
              lastCompletedWorkoutKey: refreshedStats.lastLog?.workoutKey ?? null,
              lastCompletedSessionNumber: refreshedStats.lastLog?.sessionNumber ?? null
            }),
            completion: refreshedStats.lastLog
          }
        });
      }

      if (isSupabaseMissingRelationError(completionResult.error, "workout_session_logs")) {
        return jsonError(SESSION_LOG_UNAVAILABLE_MESSAGE, 503);
      }

      logError("WORKOUT", "Workout completion save failed", {
        user_id: auth.user.id,
        workout_id: workoutRecord.id,
        error_code: getSupabaseErrorCode(completionResult.error)
      });
      return jsonError(COMPLETE_MARK_ERROR_MESSAGE, 500);
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions: workoutState.sessionConfig.totalSessions,
          completedSessions: sessionStats.completedSessions + 1,
          lastCompletedAt: completionResult.data.completedAt,
          lastCompletedWorkoutKey: completionResult.data.workoutKey,
          lastCompletedSessionNumber: completionResult.data.sessionNumber
        }),
        completion: completionResult.data
      }
    });
  } catch {
    logError("WORKOUT", "Workout completion unexpected failure", {});
    return jsonError(COMPLETE_WORKOUT_ERROR_MESSAGE, 500);
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

function normalizeWorkoutSafely(
  rawWorkout: unknown,
  input: {
    diagnosis: ReturnType<typeof diagnoseUser>;
    answers: QuizAnswers;
  }
) {
  try {
    return normalizeWorkoutPayload(rawWorkout, {
      diagnosis: input.diagnosis,
      answers: input.answers
    });
  } catch {
    return null;
  }
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
    sessionConfig,
    sessionFilter: {
      workoutId: input.workoutRecord.id,
      workoutHash: input.workoutRecord.hash ?? null,
      planCycleId: sessionConfig.planCycleId,
      cycleStartedAt: input.workoutRecord.created_at ?? null
    }
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
