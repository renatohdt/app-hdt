import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { normalizeConsentInput, saveUserConsents } from "@/lib/consents";
import type { ConsentScope } from "@/lib/consent-types";
import { diagnoseUser } from "@/lib/diagnosis";
import { normalizeExerciseRecord } from "@/lib/exercise-library";
import { recordTermsOfUseAcceptance } from "@/lib/legal-log";
import { sendLeadLoversLead } from "@/lib/leadlovers";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { ExerciseRecord, QuizAnswers, WorkoutPlan } from "@/lib/types";
import { saveUserAnswers } from "@/lib/user-answers";
import { buildWorkoutHash, filterExercisesForAI, generateWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload, syncWorkoutWithExerciseLibrary } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, type WorkoutRecordRow, saveWorkoutRecord } from "@/lib/workout-record-store";
import { getWorkoutSessionStats } from "@/lib/workout-session-store";
import {
  applyWorkoutPlanSessionConfig,
  buildWorkoutSessionProgress,
  hasWorkoutPlanSessionConfig,
  resolveWorkoutPlanSessionConfig
} from "@/lib/workout-sessions";

type QuizSubmissionBody = Partial<QuizAnswers> & {
  name?: string;
  acceptedTerms?: boolean;
  consents?: Partial<Record<ConsentScope, boolean>>;
};

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const SAVE_PROFILE_ERROR_MESSAGE = "Não foi possível salvar seus dados no momento.";
const ACCEPT_TERMS_ERROR_MESSAGE = "Você precisa aceitar os Termos de Uso para continuar.";
const RATE_LIMIT_ERROR_MESSAGE = "Você atingiu o limite de tentativas. Tente novamente em alguns minutos.";
const GENERATE_WORKOUT_ERROR_MESSAGE = "Não foi possível gerar seu treino agora. Tente novamente.";
const LOAD_WORKOUT_ERROR_MESSAGE = "Não foi possível carregar seu treino agora.";
const SAVE_WORKOUT_ERROR_MESSAGE = "Não foi possível salvar seu treino no momento.";
const SAVE_CONSENTS_ERROR_MESSAGE = "Não foi possível salvar seus consentimentos no momento.";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      logWarn("AUTH", "Quiz submit denied", { reason: "unauthenticated" });
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    const body = (await request.json()) as QuizSubmissionBody;
    const userId = auth.user.id;
    const requestedConsents = normalizeConsentInput(body.consents);

    if (body.acceptedTerms !== true) {
      return jsonError(ACCEPT_TERMS_ERROR_MESSAGE, 400);
    }

    logInfo("AUTH", "Signup completion flow started", {
      user_id: userId,
      marketing_consent: requestedConsents.marketing === true
    });

    const bodyTypeFields = normalizeBodyTypeFields({
      wrist: typeof body.wrist === "string" ? body.wrist : undefined,
      body_type_raw: typeof body.body_type_raw === "string" ? body.body_type_raw : undefined,
      body_type: typeof body.body_type === "string" ? body.body_type : undefined
    });

    const answers = {
      goal: typeof body.goal === "string" ? body.goal : "lose_weight",
      experience: typeof body.experience === "string" ? body.experience : "no_training",
      gender: typeof body.gender === "string" ? body.gender : "male",
      age: toNumber(body.age),
      weight: toNumber(body.weight),
      height: toNumber(body.height),
      profession: toText(body.profession),
      situation: typeof body.situation === "string" ? body.situation : "cant_stay_consistent",
      mindMuscle: typeof body.mindMuscle === "string" ? body.mindMuscle : "sometimes",
      days: toNumber(body.days),
      time: toNumber(body.time),
      equipment: Array.isArray(body.equipment) ? body.equipment : [],
      structuredPlan: typeof body.structuredPlan === "string" ? body.structuredPlan : "no",
      wrist: bodyTypeFields.wrist,
      body_type_raw: bodyTypeFields.body_type_raw,
      body_type: bodyTypeFields.body_type,
      location: "home"
    } as QuizAnswers;

    logInfo("PROFILE", "Body type normalized", {
      user_id: userId,
      body_type_raw: answers.body_type_raw,
      body_type: answers.body_type
    });

    const rateKey = `workout:${userId}:${getRequestFingerprint(request, userId)}`;
    const rateLimit = enforceRateLimit(rateKey, 3, 10 * 60 * 1000);

    if (!rateLimit.allowed) {
      logWarn("AI", "Workout generation rate limited", { user_id: userId });
      return jsonError(RATE_LIMIT_ERROR_MESSAGE, 429);
    }

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Aluno";
    const userData = { id: userId, name };

    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", userId)
      .maybeSingle();

    if (existingUserError) {
      logError("AUTH", "User profile lookup failed", { user_id: userId });
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    let savedUser = existingUser;

    if (!savedUser) {
      const { data: insertedUser, error: insertUserError } = await supabase
        .from("users")
        .insert(userData)
        .select("id, name")
        .single();

      if (insertUserError || !insertedUser) {
        logError("AUTH", "User profile insert failed", { user_id: userId });
        return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
      }

      logInfo("AUTH", "User profile created successfully", {
        user_id: insertedUser.id
      });

      savedUser = insertedUser;
    }

    const consentResult = await saveUserConsents(supabase, savedUser.id, requestedConsents, {
      source: "onboarding_quiz"
    });

    if (consentResult.error) {
      logError("PRIVACY", "Consent save failed", { user_id: savedUser.id });
      return jsonError(SAVE_CONSENTS_ERROR_MESSAGE, 500);
    }

    await recordTermsOfUseAcceptance(savedUser.id, new Date().toISOString());

    const diagnosis = diagnoseUser(answers);
    const workoutHash = buildWorkoutHash(answers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const normalizedExercises = ((exercises ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
    const filteredExercises = filterExercisesForAI(answers, normalizedExercises);
    const { data: existingWorkout, error: existingWorkoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: savedUser.id,
      includeCreatedAt: true,
      scope: "AI"
    });

    if (existingWorkoutError) {
      logError("AI", "Workout lookup query failed", {
        user_id: savedUser.id,
        error_code: getSupabaseErrorCode(existingWorkoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const existingWorkoutState = buildExistingWorkoutState({
      workoutRecord: existingWorkout,
      answers,
      diagnosis,
      exerciseLibrary: normalizedExercises
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
    const canReuseCurrentPlan =
      Boolean(existingWorkoutState) &&
      existingWorkout?.hash === workoutHash &&
      !existingSessionProgress?.cycleCompleted;

    let workout = canReuseCurrentPlan && existingWorkoutState ? existingWorkoutState.workout : null;

    if (workout) {
      logInfo("AI", "Workout cached", { user_id: userId });
    } else {
      try {
        logInfo("AI", "Workout generation started", { user_id: userId });
        const generatedWorkout = normalizeWorkoutPayload(await generateWorkoutWithAI(answers, diagnosis, filteredExercises), {
          diagnosis,
          answers
        });

        if (!generatedWorkout) {
          workout = null;
        } else {
          const catalogSyncedWorkout = syncWorkoutWithExerciseLibrary(generatedWorkout, normalizedExercises);
          const nextWorkoutConfig = {
            ...resolveWorkoutPlanSessionConfig({
              answers,
              workout: catalogSyncedWorkout,
              storedTotalSessions: null,
              fallbackWeeklyFrequency: catalogSyncedWorkout.sessionCount ?? catalogSyncedWorkout.sections.length
            }),
            planCycleId: randomUUID()
          };
          workout = applyWorkoutPlanSessionConfig(catalogSyncedWorkout, nextWorkoutConfig);
        }

        logInfo("AI", "Workout generation completed", { user_id: userId });
      } catch (error) {
        if (isOpenAIQuotaError(error)) {
          logWarn("AI", "OpenAI unavailable", { user_id: userId });
          return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 503);
        }

        logError("AI", "Workout generation failed", { user_id: userId });
        return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
      }
    }

    if (!workout) {
      logError("AI", "Workout normalization failed", { user_id: userId });
      return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
    }

    logInfo("AI", "Workout normalized", {
      user_id: userId,
      section_count: workout.sections.length,
      split_type: workout.splitType ?? null
    });

    const answersResult = await saveUserAnswers(supabase, savedUser.id, answers);
    if (answersResult.error) {
      logError("AUTH", "User answers save failed", { user_id: savedUser.id });
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    if (requestedConsents.marketing === true) {
      logInfo("LEADLOVERS", "LeadLovers dispatch requested", {
        user_id: savedUser.id
      });

      try {
        await sendLeadLoversLead({
          email: auth.user.email,
          name,
          answers
        });
      } catch {
        logError("LEADLOVERS", "Lead send failed", { user_id: savedUser.id });
      }
    } else {
      logInfo("LEADLOVERS", "LeadLovers dispatch skipped", {
        user_id: savedUser.id,
        reason: "marketing_consent_not_granted"
      });
    }

    const currentWorkoutConfig = resolveWorkoutPlanSessionConfig({
      answers,
      workout,
      storedTotalSessions: canReuseCurrentPlan && existingWorkout ? existingWorkout.total_sessions : null,
      fallbackWeeklyFrequency: workout.sessionCount ?? workout.sections.length
    });
    const shouldPersistWorkout =
      !canReuseCurrentPlan ||
      !existingWorkoutState ||
      existingWorkout?.total_sessions !== currentWorkoutConfig.totalSessions ||
      !hasWorkoutPlanSessionConfig(existingWorkoutState.normalizedWorkout, currentWorkoutConfig);

    if (shouldPersistWorkout) {
      const workoutResult = await saveWorkoutRecord(supabase, {
        userId: savedUser.id,
        existingWorkoutId: existingWorkout?.id ?? null,
        hash: workoutHash,
        exercises: workout,
        totalSessions: currentWorkoutConfig.totalSessions,
        createdAt: canReuseCurrentPlan ? undefined : new Date().toISOString(),
        scope: "AI"
      });

      if (workoutResult.error) {
        logError("AI", "Workout save failed", {
          user_id: savedUser.id,
          error_code: getSupabaseErrorCode(workoutResult.error)
        });
        return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: savedUser.id,
        profile: diagnosis.profile
      }
    });
  } catch {
    logError("AI", "Workout validation failed", {});
    return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
  }
}

function buildExistingWorkoutState(input: {
  workoutRecord: WorkoutRecordRow | null;
  answers: QuizAnswers;
  diagnosis: ReturnType<typeof diagnoseUser>;
  exerciseLibrary: ExerciseRecord[];
}) {
  if (!input.workoutRecord) {
    return null;
  }

  let normalizedWorkout = null as WorkoutPlan | null;

  try {
    normalizedWorkout = normalizeWorkoutPayload(input.workoutRecord.exercises, {
      diagnosis: input.diagnosis,
      answers: input.answers
    });
    if (normalizedWorkout) {
      normalizedWorkout = syncWorkoutWithExerciseLibrary(normalizedWorkout, input.exerciseLibrary);
    }
  } catch {
    normalizedWorkout = null;
  }

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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
