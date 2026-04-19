import { NextRequest, NextResponse } from "next/server";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { getPrimaryExerciseMuscle, normalizeExerciseRecord } from "@/lib/exercise-library";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { isPremium } from "@/lib/subscription";
import type { ExerciseRecord, QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { callAIForReplacement, filterReplacementCandidates } from "@/lib/workout-ai";
import { buildWorkoutSectionItems } from "@/lib/workout-section-items";

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const REPLACE_ERROR_MESSAGE = "Não foi possível substituir o exercício agora. Tente novamente.";
const WORKOUT_NOT_FOUND_MESSAGE = "Treino não encontrado.";
const EXERCISE_NOT_FOUND_MESSAGE = "Exercício não encontrado nessa sessão.";
const FREE_LIMIT_REACHED_MESSAGE = "Você atingiu o limite de substituições deste plano.";
const NO_CANDIDATES_MESSAGE = "Não há exercícios disponíveis como substitutos para esse perfil.";
const REPLACEMENT_NOT_FOUND_MESSAGE = "A IA não encontrou um substituto válido. Tente novamente.";

const VALID_REASONS = ["too_hard", "too_easy", "no_equipment", "dont_like"] as const;
type ReplacementReason = (typeof VALID_REASONS)[number];

type ReplaceExerciseBody = {
  workoutId?: unknown;
  workoutDayId?: unknown;
  exerciseName?: unknown;
  exerciseIndex?: unknown;
  reason?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const userId = auth.user.id;
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(REPLACE_ERROR_MESSAGE, 500);
    }

    // --- Validar body ---
    const body = (await request.json().catch(() => ({}))) as ReplaceExerciseBody;

    if (typeof body.workoutId !== "string" || !body.workoutId.trim()) {
      return jsonError("workoutId é obrigatório.", 400);
    }
    if (typeof body.workoutDayId !== "string" || !body.workoutDayId.trim()) {
      return jsonError("workoutDayId é obrigatório.", 400);
    }
    if (typeof body.exerciseName !== "string" || !body.exerciseName.trim()) {
      return jsonError("exerciseName é obrigatório.", 400);
    }
    if (!VALID_REASONS.includes(body.reason as ReplacementReason)) {
      return jsonError("reason inválido. Use: too_hard, too_easy, no_equipment, dont_like.", 400);
    }

    const workoutId = body.workoutId.trim();
    const workoutDayId = body.workoutDayId.trim();
    const exerciseName = body.exerciseName.trim();
    const reason = body.reason as ReplacementReason;

    // --- Buscar workout do usuário ---
    const { data: workoutRow, error: workoutError } = await supabase
      .from("workouts")
      .select("id, exercises")
      .eq("id", workoutId)
      .eq("user_id", userId)
      .maybeSingle();

    if (workoutError) {
      logError("REPLACE_EXERCISE", "Workout lookup failed", {
        user_id: userId,
        workout_id: workoutId,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError(REPLACE_ERROR_MESSAGE, 500);
    }

    if (!workoutRow) {
      return jsonError(WORKOUT_NOT_FOUND_MESSAGE, 404);
    }

    // --- Parsear o workout ---
    const workout = workoutRow.exercises as WorkoutPlan | null;
    if (!workout || !Array.isArray(workout.sections)) {
      logWarn("REPLACE_EXERCISE", "Workout payload invalid or unreadable", {
        user_id: userId,
        workout_id: workoutId
      });
      return jsonError(WORKOUT_NOT_FOUND_MESSAGE, 404);
    }

    const dayIndex = parseInt(workoutDayId, 10);
    const section = workout.sections[dayIndex];
    if (!section) {
      return jsonError("Sessão não encontrada neste treino.", 404);
    }

    const normalizedTargetName = exerciseName.trim().toLowerCase();
    const exerciseIndex = section.exercises.findIndex(
      (ex) => ex.name.trim().toLowerCase() === normalizedTargetName
    );

    if (exerciseIndex === -1) {
      logWarn("REPLACE_EXERCISE", "Exercise not found in section by name", {
        user_id: userId,
        workout_id: workoutId,
        exercise_name: exerciseName
      });
      return jsonError(EXERCISE_NOT_FOUND_MESSAGE, 404);
    }

    const originalExercise = section.exercises[exerciseIndex];

    // --- Bloquear mobilidade ---
    if (originalExercise.blockType === "mobility" || originalExercise.type === "mobility") {
      return jsonError("Não é possível substituir exercícios de mobilidade.", 400);
    }

    // --- Verificar limite de substituições baseado no plano real do usuário ---
    // Free:    2 substituições por programa de treino (workout_id)
    // Premium: 2 substituições por sessão de treino (workout_id + workout_day_id)
    const userIsPremium = await isPremium(userId, userToken);

    if (!userIsPremium) {
      // Free: conta total de substituições no programa
      const { count: replacementCount, error: countError } = await supabase
        .from("workout_exercise_replacements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("workout_id", workoutId);

      if (countError) {
        logError("REPLACE_EXERCISE", "Replacement count query failed", {
          user_id: userId,
          workout_id: workoutId,
          error_code: getSupabaseErrorCode(countError)
        });
        return jsonError(REPLACE_ERROR_MESSAGE, 500);
      }

      if ((replacementCount ?? 0) >= 2) {
        logInfo("REPLACE_EXERCISE", "Free plan replacement limit reached", {
          user_id: userId,
          workout_id: workoutId,
          count: replacementCount
        });
        return NextResponse.json({ success: false, error: "replacement_limit_reached", plan: "free" }, { status: 403 });
      }
    } else {
      // Premium: conta substituições apenas desta sessão (Treino A, B, C... independentes)
      const { count: dayReplacementCount, error: dayCountError } = await supabase
        .from("workout_exercise_replacements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("workout_id", workoutId)
        .eq("workout_day_id", workoutDayId);

      if (dayCountError) {
        logError("REPLACE_EXERCISE", "Premium day replacement count query failed", {
          user_id: userId,
          workout_id: workoutId,
          workout_day_id: workoutDayId,
          error_code: getSupabaseErrorCode(dayCountError)
        });
        return jsonError(REPLACE_ERROR_MESSAGE, 500);
      }

      if ((dayReplacementCount ?? 0) >= 2) {
        logInfo("REPLACE_EXERCISE", "Premium per-day replacement limit reached", {
          user_id: userId,
          workout_id: workoutId,
          workout_day_id: workoutDayId,
          count: dayReplacementCount
        });
        return NextResponse.json({ success: false, error: "replacement_limit_reached", plan: "premium" }, { status: 403 });
      }
    }

    // --- Carregar catálogo de exercícios ---
    const exerciseLibrary = await loadExerciseCatalog(supabase, userId);
    if (!exerciseLibrary.length) {
      logWarn("REPLACE_EXERCISE", "Exercise catalog empty", { user_id: userId });
      return jsonError(REPLACE_ERROR_MESSAGE, 500);
    }

    // --- Buscar respostas do usuário para o filtro ---
    const savedAnswers = await getUserAnswersByUserId(supabase, userId);
    const answers = buildRuntimeQuizAnswers(savedAnswers);

    // --- Encontrar o ExerciseRecord original pelo nome ---
    const originalNameKey = originalExercise.name.trim().toLowerCase();
    const originalRecord = exerciseLibrary.find(
      (exercise) => exercise.name.trim().toLowerCase() === originalNameKey
    );

    if (!originalRecord) {
      logWarn("REPLACE_EXERCISE", "Original exercise not found in catalog", {
        user_id: userId,
        workout_id: workoutId,
        exercise_name: originalExercise.name
      });
      return jsonError(NO_CANDIDATES_MESSAGE, 422);
    }

    // --- Coletar IDs dos exercícios da sessão atual (via catálogo por nome) ---
    const sessionExerciseIds = section.exercises
      .map((exercise) => {
        const nameKey = exercise.name.trim().toLowerCase();
        return exerciseLibrary.find((record) => record.name.trim().toLowerCase() === nameKey)?.id ?? null;
      })
      .filter((id): id is string => id !== null);

    // --- Filtrar candidatos ---
    const candidates = filterReplacementCandidates(originalRecord, sessionExerciseIds, answers, exerciseLibrary);

    if (!candidates.length) {
      logWarn("REPLACE_EXERCISE", "No replacement candidates found", {
        user_id: userId,
        workout_id: workoutId,
        exercise_name: originalExercise.name
      });
      return jsonError(NO_CANDIDATES_MESSAGE, 422);
    }

    const originalForAI = {
      id: originalRecord.id,
      name: originalRecord.name,
      primaryMuscle: getPrimaryExerciseMuscle(originalRecord) ?? "",
      type: originalRecord.type ?? null
    };

    // --- Chamar a IA (validar contra a lista de candidatos, não o catálogo inteiro) ---
    const candidateIdSet = new Set(candidates.map((c) => c.id));

    let aiResult = await callAIForReplacement(originalForAI, reason, candidates, answers);

    if (!candidateIdSet.has(aiResult.replacementExerciseId)) {
      logWarn("REPLACE_EXERCISE", "AI returned exercise outside candidate list, retrying", {
        user_id: userId,
        workout_id: workoutId,
        returned_id: aiResult.replacementExerciseId,
        returned_name: aiResult.replacementExerciseName,
        candidates_count: candidates.length
      });

      aiResult = await callAIForReplacement(originalForAI, reason, candidates, answers);

      if (!candidateIdSet.has(aiResult.replacementExerciseId)) {
        logError("REPLACE_EXERCISE", "AI replacement not in candidate list after retry", {
          user_id: userId,
          workout_id: workoutId,
          returned_id: aiResult.replacementExerciseId,
          candidates_count: candidates.length
        });
        return NextResponse.json({ success: false, error: "replacement_not_found" }, { status: 422 });
      }
    }

    // --- Buscar ExerciseRecord completo do substituto ---
    const replacementRecord = exerciseLibrary.find((exercise) => exercise.id === aiResult.replacementExerciseId);
    if (!replacementRecord) {
      return NextResponse.json({ success: false, error: "replacement_not_found" }, { status: 422 });
    }

    // --- Substituir o exercício preservando estrutura e substituindo apenas identidade ---
    const updatedExercise = {
      ...originalExercise,
      name: replacementRecord.name,
      videoUrl: replacementRecord.video_url ?? null,
      primaryMuscles: replacementRecord.muscle_groups?.length
        ? [replacementRecord.muscle_groups[0]]
        : replacementRecord.muscle
        ? [replacementRecord.muscle]
        : [],
      secondaryMuscles: replacementRecord.muscle_groups?.slice(1) ?? [],
      muscleGroups: replacementRecord.muscle_groups ?? []
    };

    const updatedSections = workout.sections.map((section, index) => {
      if (index !== dayIndex) return section;

      const updatedExercises = section.exercises.map((exercise, exIndex) =>
        exIndex === exerciseIndex ? updatedExercise : exercise
      );

      // Reconstruir items a partir dos exercises atualizados para manter
      // consistência com buildTrainingExerciseRows, que usa items quando presentes.
      const updatedItems = buildWorkoutSectionItems(section.mobility ?? [], updatedExercises);

      return {
        ...section,
        exercises: updatedExercises,
        items: updatedItems
      };
    });

    const updatedWorkout: WorkoutPlan = { ...workout, sections: updatedSections };

    // --- Salvar workout atualizado ---
    const { data: updatedRows, error: updateError } = await supabase
      .from("workouts")
      .update({ exercises: updatedWorkout })
      .eq("id", workoutId)
      .eq("user_id", userId)
      .select("id");

    if (updateError) {
      logError("REPLACE_EXERCISE", "Workout update failed", {
        user_id: userId,
        workout_id: workoutId,
        error_code: getSupabaseErrorCode(updateError)
      });
      return jsonError(REPLACE_ERROR_MESSAGE, 500);
    }

    if (!updatedRows || updatedRows.length === 0) {
      logError("REPLACE_EXERCISE", "Workout update affected 0 rows — possible RLS block", {
        user_id: userId,
        workout_id: workoutId
      });
      return jsonError(REPLACE_ERROR_MESSAGE, 500);
    }

    // --- Registrar histórico de substituição ---
    const { error: historyError } = await supabase.from("workout_exercise_replacements").insert({
      user_id: userId,
      workout_id: workoutId,
      workout_day_id: workoutDayId,
      original_exercise_id: originalRecord.id,
      replacement_exercise_id: replacementRecord.id,
      reason,
      plan_type_at_time: userIsPremium ? "premium" : "free"
    });

    if (historyError) {
      logWarn("REPLACE_EXERCISE", "Replacement history insert failed (non-blocking)", {
        user_id: userId,
        workout_id: workoutId,
        error_code: getSupabaseErrorCode(historyError)
      });
    }

    // --- Adicionar à lista de exercícios excluídos do usuário ---
    const { error: excludeError } = await supabase.from("user_excluded_exercises").upsert(
      {
        user_id: userId,
        exercise_id: originalRecord.id,
        exercise_name: originalRecord.name
      },
      { onConflict: "user_id,exercise_id", ignoreDuplicates: true }
    );

    if (excludeError) {
      logWarn("REPLACE_EXERCISE", "Excluded exercise insert failed (non-blocking)", {
        user_id: userId,
        exercise_id: originalRecord.id,
        error_code: getSupabaseErrorCode(excludeError)
      });
    }

    logInfo("REPLACE_EXERCISE", "Exercise replaced successfully", {
      user_id: userId,
      workout_id: workoutId,
      workout_day_id: workoutDayId,
      original_exercise_id: originalRecord.id,
      replacement_exercise_id: replacementRecord.id,
      reason
    });

    return jsonSuccess({
      replacedExercise: {
        id: replacementRecord.id,
        name: replacementRecord.name
      },
      updatedWorkout
    });
  } catch (error) {
    logError("REPLACE_EXERCISE", "Replace exercise unexpected failure", {
      error_detail: error instanceof Error ? error.message : String(error)
    });
    return jsonError(REPLACE_ERROR_MESSAGE, 500);
  }
}

// --- Helpers locais ---

async function loadExerciseCatalog(
  supabase: NonNullable<ReturnType<typeof createSupabaseUserClient>>,
  userId: string
) {
  const { data, error } = await supabase.from("exercises").select("*");

  if (error) {
    logWarn("REPLACE_EXERCISE", "Exercise catalog load failed", {
      user_id: userId,
      error_code: getSupabaseErrorCode(error)
    });
    return [] as ExerciseRecord[];
  }

  return ((data ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
}

function buildRuntimeQuizAnswers(savedAnswers?: QuizAnswers | null): QuizAnswers {
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

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
