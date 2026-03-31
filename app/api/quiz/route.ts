import { NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { applyHealthConsentToAnswers, normalizeConsentInput, saveUserConsents } from "@/lib/consents";
import type { ConsentScope } from "@/lib/consent-types";
import { diagnoseUser } from "@/lib/diagnosis";
import { sendLeadLoversLead } from "@/lib/leadlovers";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { jsonError } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { QuizAnswers } from "@/lib/types";
import { saveUserAnswers } from "@/lib/user-answers";
import { filterExercisesForAI, generateWorkoutWithAI, isOpenAIQuotaError, buildWorkoutHash } from "@/lib/workout-ai";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";

type QuizSubmissionBody = Partial<QuizAnswers> & {
  name?: string;
  consents?: Partial<Record<ConsentScope, boolean>>;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      logWarn("AUTH", "Quiz submit denied", { reason: "unauthenticated" });
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
    }

    const body = (await request.json()) as QuizSubmissionBody;
    const userId = auth.user.id;
    const requestedConsents = normalizeConsentInput(body.consents);
    const healthConsentGranted = requestedConsents.health === true;

    logInfo("AUTH", "Signup completion flow started", {
      user_id: userId,
      marketing_consent: requestedConsents.marketing === true,
      health_consent: healthConsentGranted
    });

    const bodyTypeFields = normalizeBodyTypeFields({
      wrist: typeof body.wrist === "string" ? body.wrist : undefined,
      body_type_raw: typeof body.body_type_raw === "string" ? body.body_type_raw : undefined,
      body_type: typeof body.body_type === "string" ? body.body_type : undefined
    });

    const rawAnswers = {
      ...body,
      age: toNumber(body.age),
      weight: toNumber(body.weight),
      height: toNumber(body.height),
      profession: toText(body.profession),
      injuries: toText(body.injuries),
      days: toNumber(body.days),
      time: toNumber(body.time),
      equipment: Array.isArray(body.equipment) ? body.equipment : [],
      wrist: bodyTypeFields.wrist,
      body_type_raw: bodyTypeFields.body_type_raw,
      body_type: bodyTypeFields.body_type,
      location: "home"
    } as QuizAnswers;

    const answers = applyHealthConsentToAnswers(rawAnswers, healthConsentGranted) as QuizAnswers;

    logInfo("PROFILE", "Body type normalized", {
      user_id: userId,
      body_type_raw: answers.body_type_raw,
      body_type: answers.body_type
    });

    const rateKey = `workout:${userId}:${getRequestFingerprint(request, userId)}`;
    const rateLimit = enforceRateLimit(rateKey, 3, 10 * 60 * 1000);

    if (!rateLimit.allowed) {
      logWarn("AI", "Workout generation rate limited", { user_id: userId });
      return jsonError("Você atingiu o limite de tentativas. Tente novamente em alguns minutos.", 429);
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
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
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
        return jsonError("Não foi possível salvar seus dados no momento.", 500);
      }

      logInfo("AUTH", "User profile created successfully", {
        user_id: insertedUser.id
      });

      savedUser = insertedUser;
    }

    const consentResult = await saveUserConsents(
      supabase,
      savedUser.id,
      {
        ...requestedConsents,
        health: healthConsentGranted,
        ai_training_notice: true
      },
      {
        source: "onboarding_quiz"
      }
    );

    if (consentResult.error) {
      logError("PRIVACY", "Consent save failed", { user_id: savedUser.id });
      return jsonError("Não foi possível salvar seus consentimentos no momento.", 500);
    }

    const diagnosis = diagnoseUser(answers);
    const workoutHash = buildWorkoutHash(answers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
    }

    const filteredExercises = filterExercisesForAI(answers, exercises ?? []);
    const { data: existingWorkout, error: existingWorkoutError } = await supabase
      .from("workouts")
      .select("id, hash, exercises")
      .eq("user_id", savedUser.id)
      .maybeSingle();

    if (existingWorkoutError) {
      logError("AI", "Workout lookup failed", { user_id: savedUser.id });
      return jsonError("Não foi possível salvar seu treino no momento.", 500);
    }

    const reusableWorkout = existingWorkout?.hash === workoutHash ? existingWorkout : null;
    let workout = normalizeWorkoutPayload(reusableWorkout?.exercises, {
      diagnosis,
      answers
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
          logWarn("AI", "OpenAI unavailable", { user_id: userId });
          return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 503);
        }

        logError("AI", "Workout generation failed", { user_id: userId });
        return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
      }
    }

    if (!workout) {
      logError("AI", "Workout normalization failed", { user_id: userId });
      return jsonError("Não foi possível salvar seu treino no momento.", 500);
    }

    logInfo("AI", "Workout normalized", {
      user_id: userId,
      section_count: workout.sections.length,
      split_type: workout.splitType ?? null
    });

    const answersResult = await saveUserAnswers(supabase, savedUser.id, answers);
    if (answersResult.error) {
      logError("AUTH", "User answers save failed", { user_id: savedUser.id });
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
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

    const workoutPayload = {
      user_id: savedUser.id,
      hash: workoutHash,
      exercises: workout,
      created_at: new Date().toISOString()
    };

    const workoutResult = existingWorkout
      ? await supabase.from("workouts").update(workoutPayload).eq("user_id", savedUser.id)
      : await supabase.from("workouts").insert(workoutPayload);

    if (workoutResult.error) {
      logError("AI", "Workout save failed", { user_id: savedUser.id });
      return jsonError("Não foi possível salvar seu treino no momento.", 500);
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
    return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
  }
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
