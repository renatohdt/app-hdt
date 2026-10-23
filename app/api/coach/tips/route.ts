import {
  evaluateExerciseTips,
  evaluateSessionTips,
  type CoachExercise,
  type CoachSessionLog,
  type CoachWeightLog
} from "@/lib/coach-tips";
import { normalizeExerciseName } from "@/lib/exercise-weight-store";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 180;

type Body = {
  exercises?: { name?: unknown; reps?: unknown }[];
  workoutOrder?: unknown;
  weeklyTarget?: unknown;
  remainingSessions?: unknown;
  followsWeeklyPlan?: unknown;
};

/**
 * Dicas do Renato para o treino que vai começar (lib/coach-tips.ts).
 * O app manda os exercícios do treino; aqui lemos o histórico do usuário
 * (sessões e cargas) e o catálogo (equipamentos) e devolvemos:
 *  - sessionTips: dicas do card "Iniciar treino", em ordem de prioridade
 *  - exerciseTips: dica de carga por exercício (chave = nome normalizado)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }
    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Não foi possível carregar as dicas.", 500);

    const body = ((await request.json().catch(() => null)) ?? {}) as Body;
    const rawExercises = Array.isArray(body.exercises) ? body.exercises.slice(0, 40) : [];
    const exerciseInputs = rawExercises
      .filter((item) => typeof item?.name === "string" && item.name.trim())
      .map((item) => ({
        name: String(item.name).trim(),
        nameNormalized: normalizeExerciseName(String(item.name)),
        reps: typeof item.reps === "string" ? item.reps : ""
      }));
    const workoutOrder = Array.isArray(body.workoutOrder)
      ? body.workoutOrder.filter((key): key is string => typeof key === "string").slice(0, 10)
      : [];
    const weeklyTarget = Math.min(7, Math.max(0, Number(body.weeklyTarget) || 0));
    const remainingRaw = Number(body.remainingSessions);
    const remainingSessions = Number.isFinite(remainingRaw) ? remainingRaw : null;

    const userId = auth.user.id;
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const names = Array.from(new Set(exerciseInputs.map((item) => item.nameNormalized)));

    const [userResult, sessionsResult, weightsResult, catalogResult] = await Promise.all([
      supabase.from("users").select("name").eq("id", userId).maybeSingle(),
      supabase
        .from("workout_session_logs")
        .select("id, workout_key, completed_at, plan_cycle_id, completion_ratio")
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(150),
      supabase
        .from("exercise_weight_logs")
        .select("workout_session_log_id, exercise_name_normalized, completed_at, max_weight_kg, sets_data")
        .eq("user_id", userId)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(600),
      names.length
        ? supabase.from("exercises").select("name_normalized, equipment").in("name_normalized", names)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (sessionsResult.error || weightsResult.error) {
      logError("WORKOUT", "Coach tips load failed", { user_id: userId });
      return jsonError("Não foi possível carregar as dicas.", 500);
    }

    const equipmentByName = new Map<string, string[]>();
    for (const row of (catalogResult.data ?? []) as { name_normalized: string | null; equipment: string[] | null }[]) {
      if (row.name_normalized && !equipmentByName.has(row.name_normalized)) {
        equipmentByName.set(row.name_normalized, Array.isArray(row.equipment) ? row.equipment : []);
      }
    }

    const exercises: CoachExercise[] = exerciseInputs.map((item) => ({
      ...item,
      equipment: equipmentByName.get(item.nameNormalized) ?? []
    }));

    const sessions: CoachSessionLog[] = (sessionsResult.data ?? []).map((row) => ({
      id: String(row.id),
      workoutKey: (row.workout_key as string | null) ?? null,
      completedAt: String(row.completed_at),
      planCycleId: (row.plan_cycle_id as string | null) ?? null,
      completionRatio:
        row.completion_ratio === null || row.completion_ratio === undefined || !Number.isFinite(Number(row.completion_ratio))
          ? null
          : Number(row.completion_ratio)
    }));

    const weightLogs: CoachWeightLog[] = (weightsResult.data ?? []).map((row) => ({
      sessionLogId: (row.workout_session_log_id as string | null) ?? null,
      exerciseNameNormalized: String(row.exercise_name_normalized ?? ""),
      completedAt: String(row.completed_at),
      maxWeightKg: Number(row.max_weight_kg) || 0,
      sets: Array.isArray(row.sets_data)
        ? (row.sets_data as { reps?: unknown; completed?: unknown }[]).map((set) => ({
            reps: String(set?.reps ?? ""),
            completed: set?.completed === true
          }))
        : []
    }));

    const fullName = (userResult.data as { name?: string | null } | null)?.name ?? "";
    const firstName = fullName.trim().split(/\s+/)[0] || null;

    const input = {
      now: new Date(),
      firstName,
      sessions,
      weightLogs,
      exercises,
      workoutOrder,
      weeklyTarget,
      remainingSessions,
      followsWeeklyPlan: body.followsWeeklyPlan === true
    };

    return jsonSuccess({
      sessionTips: evaluateSessionTips(input),
      exerciseTips: evaluateExerciseTips(input)
    });
  } catch {
    return jsonError("Não foi possível carregar as dicas.", 500);
  }
}
