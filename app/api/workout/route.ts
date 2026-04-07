import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { jsonError } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { ExerciseRecord, QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { buildWorkoutHash, filterExercisesForAI, generateWorkoutWithAI, isOpenAIQuotaError } from "@/lib/workout-ai";
import { normalizeWorkoutPayload } from "@/lib/workout-payload";
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

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return jsonError("Sua sessão expirou. Faça login novamente.", 404);
    }

    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .select("id, exercises, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (workoutError) {
      return jsonError("Não foi possível carregar seu treino agora.", 500);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      return jsonError("Não foi possível carregar seus dados agora.", 404);
    }

    const answers = normalizeBodyTypeFields({
      ...savedAnswers,
      location: "home"
    }) as QuizAnswers;
    const diagnosis = diagnoseUser(answers);
    const normalizedWorkout = normalizeWorkoutPayload(workout?.exercises ?? null, {
      diagnosis,
      answers
    });

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: Boolean(normalizedWorkout),
        user: {
          id: user.id,
          name: user.name
        },
        answers: {
          goal: answers.goal,
          gender: answers.gender,
          wrist: answers.wrist,
          body_type_raw: answers.body_type_raw,
          body_type: answers.body_type,
          age: answers.age,
          weight: answers.weight,
          height: answers.height,
          profession: answers.profession,
          location: "home",
          equipment: answers.equipment,
          time: answers.time,
          days: answers.days,
          experience: answers.experience
        },
        diagnosis,
        workout: normalizedWorkout
      }
    });
  } catch {
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

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return jsonError("Sua sessão expirou. Faça login novamente.", 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      return jsonError("Não foi possível carregar seus dados agora.", 404);
    }

    const answers = normalizeBodyTypeFields({
      ...savedAnswers,
      location: "home"
    }) as QuizAnswers;

    const diagnosis = diagnoseUser(answers);
    const workoutHash = buildWorkoutHash(answers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
    }

    const normalizedExercises = ((exercises ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
    const filteredExercises = filterExercisesForAI(answers, normalizedExercises);
    const { data: existingWorkout, error: existingWorkoutError } = await supabase
      .from("workouts")
      .select("id, hash, exercises")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingWorkoutError) {
      logError("AI", "Workout lookup failed", { user_id: user.id });
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

    const workoutPayload = {
      user_id: user.id,
      hash: workoutHash,
      exercises: workout,
      created_at: new Date().toISOString()
    };

    const workoutResult = existingWorkout
      ? await supabase.from("workouts").update(workoutPayload).eq("user_id", user.id)
      : await supabase.from("workouts").insert(workoutPayload);

    if (workoutResult.error) {
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
        answers: {
          goal: answers.goal,
          gender: answers.gender,
          wrist: answers.wrist,
          body_type_raw: answers.body_type_raw,
          body_type: answers.body_type,
          age: answers.age,
          weight: answers.weight,
          height: answers.height,
          profession: answers.profession,
          location: "home",
          equipment: answers.equipment,
          time: answers.time,
          days: answers.days,
          experience: answers.experience
        },
        diagnosis,
        workout
      }
    });
  } catch {
    return jsonError("Não foi possível gerar seu treino agora. Tente novamente.", 500);
  }
}
