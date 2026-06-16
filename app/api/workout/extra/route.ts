import { NextRequest, NextResponse } from "next/server";
import { diagnoseUser } from "@/lib/diagnosis";
import { normalizeExerciseRecord } from "@/lib/exercise-library";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { isPremium } from "@/lib/subscription";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { ExerciseRecord, HomeEquipment, QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { generateExtraWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload, syncWorkoutWithExerciseLibrary } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord } from "@/lib/workout-record-store";

export const dynamic = "force-dynamic";

const EXTRA_WORKOUT_EXPIRES_MS = 4 * 60 * 60 * 1000;
const MONTHLY_LIMIT = 5;

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const PREMIUM_REQUIRED_MESSAGE = "O Treino Extra é exclusivo para assinantes Premium.";
const MONTHLY_LIMIT_MESSAGE = `Você atingiu o limite de ${MONTHLY_LIMIT} treinos extras neste mês.`;
const ACTIVE_EXTRA_MESSAGE = "Você já tem um treino extra ativo. Aguarde ele expirar para gerar outro.";
const GENERATE_ERROR_MESSAGE = "Não foi possível gerar seu treino extra agora. Tente novamente.";
const RATE_LIMIT_MESSAGE = "Você atingiu o limite de tentativas. Tente novamente em alguns minutos.";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 500);
    }

    const userId = auth.user.id;
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    const [premiumStatus, activeExtraResult, monthlyCountResult] = await Promise.all([
      isPremium(userId, userToken),
      supabase
        .from("workouts")
        .select("id, exercises, expires_at")
        .eq("user_id", userId)
        .eq("type", "extra")
        .gt("expires_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "extra")
        .gte("created_at", startOfCurrentMonth())
    ]);

    const activeExtra = activeExtraResult.data ?? null;
    const usedThisMonth = monthlyCountResult.count ?? 0;

    let workout = null;
    if (activeExtra) {
      try {
        const raw = normalizeWorkoutPayload(activeExtra.exercises, {
          diagnosis: diagnoseUser(buildFallbackAnswers()),
          answers: buildFallbackAnswers()
        });
        workout = raw ?? null;
      } catch {
        workout = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        isPremium: premiumStatus,
        hasExtraWorkout: Boolean(activeExtra),
        workoutId: activeExtra?.id ?? null,
        workout,
        expiresAt: activeExtra?.expires_at ?? null,
        usedThisMonth,
        monthlyLimit: MONTHLY_LIMIT
      }
    });
  } catch {
    logError("EXTRA_WORKOUT", "GET unexpected failure", {});
    return jsonError(SESSION_EXPIRED_MESSAGE, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(GENERATE_ERROR_MESSAGE, 500);
    }

    const userId = auth.user.id;
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    const rateKey = `extra_workout:${userId}:${getRequestFingerprint(request, userId)}`;
    const rateLimit = enforceRateLimit(rateKey, 3, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      logWarn("EXTRA_WORKOUT", "Rate limited", { user_id: userId });
      return jsonError(RATE_LIMIT_MESSAGE, 429);
    }

    const premiumStatus = await isPremium(userId, userToken);
    if (!premiumStatus) {
      return jsonError(PREMIUM_REQUIRED_MESSAGE, 403);
    }

    // Verifica limite mensal
    const { count: monthlyCount } = await supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "extra")
      .gte("created_at", startOfCurrentMonth());

    if ((monthlyCount ?? 0) >= MONTHLY_LIMIT) {
      return jsonError(MONTHLY_LIMIT_MESSAGE, 429);
    }

    // Verifica se já tem um treino extra ativo
    const { data: activeExtra } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "extra")
      .gt("expires_at", new Date().toISOString())
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (activeExtra) {
      return jsonError(ACTIVE_EXTRA_MESSAGE, 409);
    }

    const body = await request.json().catch(() => ({})) as {
      availableMinutes?: unknown;
      equipment?: unknown;
      focusMuscleGroup?: unknown;
      trainingStyle?: unknown;
    };

    const availableMinutes = validateAvailableMinutes(body.availableMinutes);
    const equipment = validateEquipment(body.equipment);
    const focusMuscleGroup = typeof body.focusMuscleGroup === "string" && body.focusMuscleGroup.trim()
      ? body.focusMuscleGroup.trim()
      : "Sem preferência";
    const VALID_STYLES = ["musculacao", "funcional", "hiit", "calistenia", "personal"] as const;
    const trainingStyle = (typeof body.trainingStyle === "string" && VALID_STYLES.includes(body.trainingStyle as (typeof VALID_STYLES)[number])
      ? body.trainingStyle
      : "personal") as (typeof VALID_STYLES)[number];

    const [savedAnswers, exercisesResult, excludedResult, regularWorkoutResult] = await Promise.all([
      getUserAnswersByUserId(supabase, userId),
      supabase.from("exercises").select("*"),
      supabase.from("user_excluded_exercises").select("exercise_id").eq("user_id", userId),
      fetchLatestWorkoutRecord(supabase, { userId, includeCreatedAt: false, scope: "EXTRA" })
    ]);

    const answers = buildRuntimeQuizAnswers(savedAnswers);
    const diagnosis = diagnoseUser(answers);
    const exercises = ((exercisesResult.data ?? []) as ExerciseRecord[]).map(normalizeExerciseRecord);
    const excludedIds = (excludedResult.data ?? []).map((r) => r.exercise_id);

    const regularWorkout = regularWorkoutResult.data
      ? (() => {
          try {
            return normalizeWorkoutPayload(regularWorkoutResult.data.exercises, { diagnosis, answers }) ?? null;
          } catch {
            return null;
          }
        })()
      : null;

    // Últimas sessões para calibrar intensidade
    const { data: recentLogs } = await supabase
      .from("workout_session_logs")
      .select("workout_key")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(5);

    const recentSessionKeys = (recentLogs ?? [])
      .map((l) => l.workout_key as string | null)
      .filter((k): k is string => Boolean(k));

    logInfo("EXTRA_WORKOUT", "Generation started", { user_id: userId });

    let workout = null;
    try {
      const raw = await generateExtraWorkoutWithAI(answers, diagnosis, exercises, {
        availableMinutes,
        availableEquipment: equipment,
        focusMuscleGroup,
        trainingStyle,
        previousWorkout: regularWorkout,
        recentSessionKeys,
        excludedExerciseIds: excludedIds,
        userId
      });
      workout = normalizeWorkoutPayload(raw, { diagnosis, answers });
      if (workout) {
        workout = syncWorkoutWithExerciseLibrary(workout, exercises);
      }
    } catch (error) {
      if (isOpenAIQuotaError(error)) {
        return jsonError(GENERATE_ERROR_MESSAGE, 503);
      }
      logError("EXTRA_WORKOUT", "Generation failed", { user_id: userId });
      return jsonError(GENERATE_ERROR_MESSAGE, 500);
    }

    if (!workout) {
      return jsonError(GENERATE_ERROR_MESSAGE, 500);
    }

    logInfo("EXTRA_WORKOUT", "Generation completed", { user_id: userId });

    const expiresAt = new Date(Date.now() + EXTRA_WORKOUT_EXPIRES_MS).toISOString();

    const { data: savedRow, error: saveError } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        hash: null,
        exercises: workout,
        total_sessions: 1,
        type: "extra",
        expires_at: expiresAt
      })
      .select("id")
      .single();

    if (saveError || !savedRow) {
      logError("EXTRA_WORKOUT", "Save failed", {
        user_id: userId,
        error_code: saveError?.code ?? null,
        error_message: saveError?.message ?? null,
        error_details: saveError?.details ?? null,
        error_hint: saveError?.hint ?? null
      });
      return jsonError(GENERATE_ERROR_MESSAGE, 500);
    }

    const { count: usedThisMonth } = await supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "extra")
      .gte("created_at", startOfCurrentMonth());

    return NextResponse.json({
      success: true,
      data: {
        isPremium: true,
        hasExtraWorkout: true,
        workoutId: savedRow.id,
        workout,
        expiresAt,
        usedThisMonth: usedThisMonth ?? 0,
        monthlyLimit: MONTHLY_LIMIT
      }
    });
  } catch {
    logError("EXTRA_WORKOUT", "POST unexpected failure", {});
    return jsonError(GENERATE_ERROR_MESSAGE, 500);
  }
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function validateAvailableMinutes(value: unknown): 20 | 30 | 45 | 60 {
  if (value === 20 || value === 30 || value === 45 || value === 60) return value;
  return 45;
}

function validateEquipment(value: unknown): HomeEquipment[] {
  const valid: HomeEquipment[] = ["halteres", "elasticos", "fitball", "fita_suspensa", "caneleira", "kettlebell", "rolo_abdominal", "barra_fixa", "nenhum"];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is HomeEquipment => valid.includes(v as HomeEquipment));
}

function buildFallbackAnswers(): QuizAnswers {
  return {
    goal: "gain_muscle",
    experience: "6_to_12_months",
    gender: "male",
    age: 0,
    weight: 0,
    height: 0,
    profession: "",
    situation: "cant_stay_consistent",
    mindMuscle: "sometimes",
    days: 1,
    time: 45,
    equipment: [],
    structuredPlan: "no",
    location: "home",
    focusRegion: "balanced"
  } as unknown as QuizAnswers;
}

function buildRuntimeQuizAnswers(savedAnswers?: QuizAnswers | null): QuizAnswers {
  return {
    goal: savedAnswers?.goal ?? "gain_muscle",
    experience: savedAnswers?.experience ?? "6_to_12_months",
    gender: savedAnswers?.gender ?? "male",
    age: Number(savedAnswers?.age) || 0,
    weight: Number(savedAnswers?.weight) || 0,
    height: Number(savedAnswers?.height) || 0,
    profession: typeof savedAnswers?.profession === "string" ? savedAnswers.profession : "",
    situation: savedAnswers?.situation ?? "cant_stay_consistent",
    mindMuscle: savedAnswers?.mindMuscle ?? "sometimes",
    days: Number(savedAnswers?.days) || 3,
    time: Number(savedAnswers?.time) || 45,
    equipment: Array.isArray(savedAnswers?.equipment) ? savedAnswers.equipment : [],
    structuredPlan: savedAnswers?.structuredPlan ?? "no",
    wrist: savedAnswers?.wrist,
    body_type_raw: savedAnswers?.body_type_raw,
    body_type: savedAnswers?.body_type,
    location: savedAnswers?.location ?? "home",
    focusRegion: savedAnswers?.focusRegion ?? "balanced",
    trainingStyle: savedAnswers?.trainingStyle ?? "personal",
    trainingStyles: Array.isArray(savedAnswers?.trainingStyles) ? savedAnswers.trainingStyles : undefined
  } as unknown as QuizAnswers;
}


