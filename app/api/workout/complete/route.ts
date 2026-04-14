import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import {
  getSupabaseErrorCode,
  getSupabaseErrorMessage,
  isSupabaseMissingRelationError,
  isSupabaseUniqueConstraintError,
  isSupabaseUniqueViolation
} from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, type WorkoutRecordRow } from "@/lib/workout-record-store";
import {
  createWorkoutSessionLog,
  getUserWorkoutSessionForLocalDay,
  getWorkoutSessionStats
} from "@/lib/workout-session-store";
import {
  buildWorkoutSessionProgress,
  normalizeWorkoutKey,
  type WorkoutSessionLogEntry,
  resolveWorkoutPlanSessionConfig
} from "@/lib/workout-sessions";

type CompleteWorkoutBody = {
  workoutKey?: unknown;
};

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const COMPLETE_WORKOUT_ERROR_MESSAGE = "Não foi possível registrar a conclusão do treino.";
const LOAD_CURRENT_WORKOUT_ERROR_MESSAGE = "Não foi possível carregar seu treino atual.";
const WORKOUT_NOT_FOUND_MESSAGE = "Treino não encontrado.";
const INVALID_WORKOUT_MESSAGE = "Treino selecionado inválido.";
const PLAN_ALREADY_COMPLETED_MESSAGE = "Todas as sessões deste plano já foram concluídas.";
const SESSION_LOG_UNAVAILABLE_MESSAGE = "O registro de sessões ainda não está disponível neste ambiente.";
const COMPLETE_MARK_ERROR_MESSAGE = "Não foi possível marcar o treino como concluído.";
const ALREADY_COMPLETED_TODAY_MESSAGE = "Você já treinou hoje. Agora é descansar e voltar amanhã.";

const DAILY_COMPLETION_CONSTRAINT = "workout_session_logs_user_completed_day_sp_key";
const SESSION_NUMBER_CONSTRAINTS = [
  "workout_session_logs_unique_plan_cycle_session_idx",
  "workout_session_logs_unique_legacy_cycle_session_idx"
] as const;

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
    const [sessionStats, todayCompletion] = await Promise.all([
      getWorkoutSessionStats(supabase, workoutState.sessionFilter),
      getUserWorkoutSessionForLocalDay(supabase, {
        userId: auth.user.id
      })
    ]);

    if (todayCompletion.log) {
      return buildAlreadyCompletedTodayResponse({
        totalSessions: workoutState.sessionConfig.totalSessions,
        sessionStats,
        completion: todayCompletion.log,
        workoutKeys: validWorkoutKeys
      });
    }

    if (sessionStats.completedSessions >= workoutState.sessionConfig.totalSessions) {
      return jsonError(PLAN_ALREADY_COMPLETED_MESSAGE, 409);
    }

    const completedAt = new Date().toISOString();
    let activeSessionStats = sessionStats;
    let sessionNumber = getNextSessionNumber(activeSessionStats);
    let completionResult = await createWorkoutSessionLog(supabase, {
      workoutId: workoutRecord.id,
      userId: auth.user.id,
      workoutHash: workoutRecord.hash ?? null,
      workoutKey,
      planCycleId: workoutState.sessionConfig.planCycleId,
      sessionNumber,
      completedAt,
      completedDaySp: todayCompletion.dayKey
    });

    logInfo("WORKOUT", "Workout completion attempt", {
      user_id: auth.user.id,
      workout_id: workoutRecord.id,
      workout_key: workoutKey,
      plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
      completed_day_sp: todayCompletion.dayKey,
      session_number_calculated: sessionNumber,
      completed_sessions_before: activeSessionStats.completedSessions,
      completed_sessions_after: activeSessionStats.completedSessions,
      already_completed_today: false
    });

    if (completionResult.error || !completionResult.data) {
      const alreadyCompletedTodayConflict = isAlreadyCompletedTodayConflict(completionResult.error);
      const sessionNumberConflict = isSessionNumberConflict(completionResult.error);

      logWarn("WORKOUT", "Workout completion insert rejected", {
        user_id: auth.user.id,
        workout_id: workoutRecord.id,
        workout_key: workoutKey,
        plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
        completed_day_sp: todayCompletion.dayKey,
        session_number_calculated: sessionNumber,
        completed_sessions_before: activeSessionStats.completedSessions,
        completed_sessions_after: activeSessionStats.completedSessions,
        already_completed_today: alreadyCompletedTodayConflict,
        supabase_error_code: getSupabaseErrorCode(completionResult.error),
        supabase_error_message: getSupabaseErrorMessage(completionResult.error)
      });

      if (isSupabaseUniqueViolation(completionResult.error)) {
        const [refreshedStats, refreshedTodayCompletion] = await Promise.all([
          getWorkoutSessionStats(supabase, workoutState.sessionFilter),
          getUserWorkoutSessionForLocalDay(supabase, {
            userId: auth.user.id
          })
        ]);
        const alreadyCompletedToday = alreadyCompletedTodayConflict || Boolean(refreshedTodayCompletion.log);

        logInfo("WORKOUT", "Workout completion conflict refreshed", {
          user_id: auth.user.id,
          workout_id: workoutRecord.id,
          workout_key: workoutKey,
          plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
          completed_day_sp: todayCompletion.dayKey,
          session_number_calculated: sessionNumber,
          completed_sessions_before: activeSessionStats.completedSessions,
          completed_sessions_after: refreshedStats.completedSessions,
          already_completed_today: alreadyCompletedToday
        });

        if (alreadyCompletedToday) {
          return buildAlreadyCompletedTodayResponse({
            totalSessions: workoutState.sessionConfig.totalSessions,
            sessionStats: refreshedStats,
            completion: refreshedTodayCompletion.log ?? null,
            workoutKeys: validWorkoutKeys
          });
        }

        if (sessionNumberConflict) {
          const repairedSessionNumber = getNextSessionNumber(refreshedStats);

          if (
            repairedSessionNumber > sessionNumber &&
            refreshedStats.completedSessions < workoutState.sessionConfig.totalSessions
          ) {
            logWarn("WORKOUT", "Workout completion retrying with repaired session_number", {
              user_id: auth.user.id,
              workout_id: workoutRecord.id,
              workout_key: workoutKey,
              plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
              completed_day_sp: todayCompletion.dayKey,
              session_number_calculated: repairedSessionNumber,
              completed_sessions_before: refreshedStats.completedSessions,
              completed_sessions_after: refreshedStats.completedSessions,
              already_completed_today: false
            });

            activeSessionStats = refreshedStats;
            sessionNumber = repairedSessionNumber;
            completionResult = await createWorkoutSessionLog(supabase, {
              workoutId: workoutRecord.id,
              userId: auth.user.id,
              workoutHash: workoutRecord.hash ?? null,
              workoutKey,
              planCycleId: workoutState.sessionConfig.planCycleId,
              sessionNumber,
              completedAt,
              completedDaySp: todayCompletion.dayKey
            });

            if (completionResult.error || !completionResult.data) {
              const [retryStats, retryTodayCompletion] = await Promise.all([
                getWorkoutSessionStats(supabase, workoutState.sessionFilter),
                getUserWorkoutSessionForLocalDay(supabase, {
                  userId: auth.user.id
                })
              ]);
              const retryAlreadyCompletedToday =
                isAlreadyCompletedTodayConflict(completionResult.error) || Boolean(retryTodayCompletion.log);

              logError("WORKOUT", "Workout completion retry failed", {
                user_id: auth.user.id,
                workout_id: workoutRecord.id,
                workout_key: workoutKey,
                plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
                completed_day_sp: todayCompletion.dayKey,
                session_number_calculated: sessionNumber,
                completed_sessions_before: activeSessionStats.completedSessions,
                completed_sessions_after: retryStats.completedSessions,
                already_completed_today: retryAlreadyCompletedToday,
                supabase_error_code: getSupabaseErrorCode(completionResult.error),
                supabase_error_message: getSupabaseErrorMessage(completionResult.error)
              });

              if (retryAlreadyCompletedToday) {
                return buildAlreadyCompletedTodayResponse({
                  totalSessions: workoutState.sessionConfig.totalSessions,
                  sessionStats: retryStats,
                  completion: retryTodayCompletion.log ?? null,
                  workoutKeys: validWorkoutKeys
                });
              }
            } else {
              const retriedStats = await getWorkoutSessionStats(supabase, workoutState.sessionFilter);

              logInfo("WORKOUT", "Workout completion saved after retry", {
                user_id: auth.user.id,
                workout_id: workoutRecord.id,
                workout_key: workoutKey,
                plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
                completed_day_sp: todayCompletion.dayKey,
                session_number_calculated: sessionNumber,
                completed_sessions_before: activeSessionStats.completedSessions,
                completed_sessions_after: retriedStats.completedSessions,
                already_completed_today: false
              });

              return buildWorkoutCompletionSuccessResponse({
                totalSessions: workoutState.sessionConfig.totalSessions,
                sessionStats: retriedStats,
                completion: completionResult.data,
                workoutKeys: validWorkoutKeys
              });
            }
          }
        }

        if (refreshedStats.completedSessions >= workoutState.sessionConfig.totalSessions) {
          return jsonError(PLAN_ALREADY_COMPLETED_MESSAGE, 409);
        }
      }

      if (isSupabaseMissingRelationError(completionResult.error, "workout_session_logs")) {
        return jsonError(SESSION_LOG_UNAVAILABLE_MESSAGE, 503);
      }

      logError("WORKOUT", "Workout completion save failed", {
        user_id: auth.user.id,
        workout_id: workoutRecord.id,
        workout_key: workoutKey,
        plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
        completed_day_sp: todayCompletion.dayKey,
        session_number_calculated: sessionNumber,
        completed_sessions_before: activeSessionStats.completedSessions,
        completed_sessions_after: activeSessionStats.completedSessions,
        already_completed_today: false,
        supabase_error_code: getSupabaseErrorCode(completionResult.error),
        supabase_error_message: getSupabaseErrorMessage(completionResult.error)
      });
      return jsonError(COMPLETE_MARK_ERROR_MESSAGE, 500);
    }

    const updatedStats = await getWorkoutSessionStats(supabase, workoutState.sessionFilter);

    logInfo("WORKOUT", "Workout completion saved", {
      user_id: auth.user.id,
      workout_id: workoutRecord.id,
      workout_key: workoutKey,
      plan_cycle_id_used: workoutState.sessionConfig.planCycleId,
      completed_day_sp: todayCompletion.dayKey,
      session_number_calculated: sessionNumber,
      completed_sessions_before: activeSessionStats.completedSessions,
      completed_sessions_after: updatedStats.completedSessions,
      already_completed_today: false
    });

    return buildWorkoutCompletionSuccessResponse({
      totalSessions: workoutState.sessionConfig.totalSessions,
      sessionStats: updatedStats,
      completion: completionResult.data,
      workoutKeys: validWorkoutKeys
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

function buildAlreadyCompletedTodayResponse(input: {
  totalSessions: number;
  sessionStats: {
    completedSessions: number;
    lastLog: WorkoutSessionLogEntry | null;
  };
  completion: WorkoutSessionLogEntry | null;
  workoutKeys: string[];
}) {
  return NextResponse.json(
    {
      success: false,
      error: ALREADY_COMPLETED_TODAY_MESSAGE,
      message: ALREADY_COMPLETED_TODAY_MESSAGE,
      already_completed_today: true,
      data: {
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions: input.totalSessions,
          completedSessions: input.sessionStats.completedSessions,
          lastCompletedAt: input.sessionStats.lastLog?.completedAt ?? null,
          lastCompletedWorkoutKey: input.sessionStats.lastLog?.workoutKey ?? null,
          lastCompletedSessionNumber: input.sessionStats.lastLog?.sessionNumber ?? null
        }),
        completion: input.completion ? serializeWorkoutCompletion(input.completion) : null,
        nextWorkoutKey: resolveNextWorkoutKey(input.workoutKeys, input.sessionStats.lastLog?.workoutKey ?? null)
      }
    },
    {
      status: 409
    }
  );
}

function buildWorkoutCompletionSuccessResponse(input: {
  totalSessions: number;
  sessionStats: {
    completedSessions: number;
    lastLog: WorkoutSessionLogEntry | null;
  };
  completion: WorkoutSessionLogEntry;
  workoutKeys: string[];
}) {
  return NextResponse.json({
    success: true,
    data: {
      sessionProgress: buildWorkoutSessionProgress({
        totalSessions: input.totalSessions,
        completedSessions: input.sessionStats.completedSessions,
        lastCompletedAt: input.sessionStats.lastLog?.completedAt ?? input.completion.completedAt,
        lastCompletedWorkoutKey: input.sessionStats.lastLog?.workoutKey ?? input.completion.workoutKey,
        lastCompletedSessionNumber: input.sessionStats.lastLog?.sessionNumber ?? input.completion.sessionNumber
      }),
      completion: serializeWorkoutCompletion(input.completion),
      nextWorkoutKey: resolveNextWorkoutKey(
        input.workoutKeys,
        input.sessionStats.lastLog?.workoutKey ?? input.completion.workoutKey
      )
    }
  });
}

function getNextSessionNumber(sessionStats: {
  completedSessions: number;
  lastLog: WorkoutSessionLogEntry | null;
}) {
  return Math.max(sessionStats.completedSessions, sessionStats.lastLog?.sessionNumber ?? 0) + 1;
}

function resolveNextWorkoutKey(workoutKeys: string[], lastCompletedWorkoutKey?: string | null) {
  if (!workoutKeys.length) {
    return null;
  }

  const normalizedLastCompletedKey = normalizeWorkoutKey(lastCompletedWorkoutKey);

  if (!normalizedLastCompletedKey) {
    return workoutKeys[0] ?? null;
  }

  const currentIndex = workoutKeys.findIndex((workoutKey) => normalizeWorkoutKey(workoutKey) === normalizedLastCompletedKey);

  if (currentIndex < 0) {
    return workoutKeys[0] ?? null;
  }

  return workoutKeys[(currentIndex + 1) % workoutKeys.length] ?? workoutKeys[0] ?? null;
}

function isAlreadyCompletedTodayConflict(error: unknown) {
  return (
    isSupabaseUniqueConstraintError(error, DAILY_COMPLETION_CONSTRAINT) ||
    getSupabaseErrorMessage(error).includes("completed_day_sp")
  );
}

function isSessionNumberConflict(error: unknown) {
  return (
    SESSION_NUMBER_CONSTRAINTS.some((constraint) => isSupabaseUniqueConstraintError(error, constraint)) ||
    getSupabaseErrorMessage(error).includes("session_number")
  );
}

function serializeWorkoutCompletion(completion: WorkoutSessionLogEntry) {
  return {
    workoutKey: completion.workoutKey ?? null,
    sessionNumber: completion.sessionNumber,
    completedAt: completion.completedAt
  };
}
