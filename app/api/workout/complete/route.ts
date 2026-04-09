import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError } from "@/lib/server-response";
import { getSupabaseErrorCode, isSupabaseMissingRelationError } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { fetchLatestWorkoutRecord } from "@/lib/workout-record-store";
import { createWorkoutSessionLog, getWorkoutSessionStats } from "@/lib/workout-session-store";
import {
  buildWorkoutSessionProgress,
  calculateWorkoutTotalSessions,
  normalizeWorkoutKey
} from "@/lib/workout-sessions";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";

type CompleteWorkoutBody = {
  workoutKey?: unknown;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível registrar a conclusão do treino.", 500);
    }

    const body = (await request.json().catch(() => ({}))) as CompleteWorkoutBody;
    const selectedWorkoutKey = normalizeWorkoutKey(typeof body.workoutKey === "string" ? body.workoutKey : null);
    const { data: workout, error: workoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: auth.user.id,
      includeCreatedAt: true,
      scope: "WORKOUT"
    });

    if (workoutError) {
      logError("WORKOUT", "Workout completion lookup failed", {
        user_id: auth.user.id,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError("Não foi possível carregar seu treino atual.", 500);
    }

    if (!workout) {
      return jsonError("Treino não encontrado.", 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, auth.user.id);
    const answers = buildRuntimeQuizAnswers(savedAnswers);
    const diagnosis = diagnoseUser(answers);
    const normalizedWorkout = normalizeWorkoutPayload(workout.exercises, {
      diagnosis,
      answers
    });

    if (!normalizedWorkout) {
      return jsonError("Não foi possível carregar seu treino atual.", 404);
    }

    const validWorkoutKeys = normalizedWorkout.sections
      .map((section) => normalizeWorkoutKey(section.title))
      .filter((value): value is string => Boolean(value));
    const workoutKey = selectedWorkoutKey ?? validWorkoutKeys[0] ?? null;

    if (selectedWorkoutKey && !validWorkoutKeys.includes(selectedWorkoutKey)) {
      return jsonError("Treino selecionado inválido.", 400);
    }

    const totalSessions = resolveWorkoutTotalSessions({
      storedTotalSessions: workout.total_sessions,
      answers,
      distinctWorkoutCount: normalizedWorkout.sessionCount ?? normalizedWorkout.sections.length
    });
    const sessionStats = await getWorkoutSessionStats(supabase, {
      workoutId: workout.id,
      workoutHash: workout.hash ?? null
    });

    if (sessionStats.completedSessions >= totalSessions) {
      return jsonError("Todas as sessões deste plano já foram concluídas.", 409);
    }

    const completedAt = new Date().toISOString();
    const sessionNumber = sessionStats.completedSessions + 1;
    const completionResult = await createWorkoutSessionLog(supabase, {
      workoutId: workout.id,
      userId: auth.user.id,
      workoutHash: workout.hash ?? null,
      workoutKey,
      sessionNumber,
      completedAt
    });

    if (completionResult.error || !completionResult.data) {
      const errorCode = (completionResult.error as { code?: string } | null)?.code;

      if (errorCode === "23505") {
        const refreshedStats = await getWorkoutSessionStats(supabase, {
          workoutId: workout.id,
          workoutHash: workout.hash ?? null
        });

        return NextResponse.json({
          success: true,
          data: {
            sessionProgress: buildWorkoutSessionProgress({
              totalSessions,
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
        return jsonError("O registro de sessões ainda não está disponível neste ambiente.", 503);
      }

      logError("WORKOUT", "Workout completion save failed", {
        user_id: auth.user.id,
        workout_id: workout.id,
        error_code: getSupabaseErrorCode(completionResult.error)
      });
      return jsonError("Não foi possível marcar o treino como concluído.", 500);
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions,
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
    return jsonError("Não foi possível registrar a conclusão do treino.", 500);
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
