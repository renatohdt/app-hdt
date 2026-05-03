import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/goals
 * Retorna a meta ativa do usuario (nao expirada e nao completa, mais recente)
 * e o total de metas completadas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sessao expirada.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Erro interno.", 500);

    const userId = auth.user.id;
    const now = new Date().toISOString();

    const [activeResult, completedResult] = await Promise.all([
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .is("completed_at", null)
        .gte("ends_at", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("completed_at", "is", null)
    ]);

    if (activeResult.error) {
      logError("GOALS", "Failed to fetch active goal", { user_id: userId });
      return jsonError("Erro ao buscar meta.", 500);
    }

    const goal = activeResult.data;
    let workoutsDone = 0;

    if (goal) {
      const { count } = await supabase
        .from("workout_session_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("completed_at", goal.starts_at)
        .lte("completed_at", goal.ends_at);
      workoutsDone = count ?? 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        activeGoal: goal
          ? {
              id: goal.id,
              targetCount: goal.target_count,
              periodDays: goal.period_days,
              startsAt: goal.starts_at,
              endsAt: goal.ends_at,
              completedAt: goal.completed_at,
              workoutsDone
            }
          : null,
        totalGoalsCompleted: completedResult.count ?? 0
      }
    });
  } catch {
    logError("GOALS", "GET goals unexpected error", {});
    return jsonError("Erro interno.", 500);
  }
}

/**
 * POST /api/goals
 * Cria uma nova meta para o usuario.
 * Body: { targetCount: number, periodDays: number }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sessao expirada.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Erro interno.", 500);

    const userId = auth.user.id;
    const body = await request.json();
    const targetCount = Number(body?.targetCount);
    const periodDays = Number(body?.periodDays);

    if (!targetCount || targetCount < 1 || targetCount > 365) {
      return jsonError("Numero de treinos invalido.", 400);
    }
    if (!periodDays || periodDays < 1 || periodDays > 365) {
      return jsonError("Periodo invalido.", 400);
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + periodDays);

    const { data, error } = await supabase
      .from("user_goals")
      .insert({
        user_id: userId,
        target_count: targetCount,
        period_days: periodDays,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      logError("GOALS", "Failed to create goal", { user_id: userId });
      return jsonError("Erro ao criar meta.", 500);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        targetCount: data.target_count,
        periodDays: data.period_days,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        completedAt: null,
        workoutsDone: 0
      }
    });
  } catch {
    logError("GOALS", "POST goals unexpected error", {});
    return jsonError("Erro interno.", 500);
  }
}

/**
 * PATCH /api/goals
 * Marca a meta ativa como completa.
 * Body: { goalId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sessao expirada.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Erro interno.", 500);

    const userId = auth.user.id;
    const body = await request.json();
    const goalId = body?.goalId as string | undefined;

    if (!goalId) return jsonError("goalId obrigatorio.", 400);

    const { error } = await supabase
      .from("user_goals")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", goalId)
      .eq("user_id", userId)
      .is("completed_at", null);

    if (error) {
      logError("GOALS", "Failed to complete goal", { user_id: userId, goal_id: goalId });
      return jsonError("Erro ao completar meta.", 500);
    }

    return NextResponse.json({ success: true });
  } catch {
    logError("GOALS", "PATCH goals unexpected error", {});
    return jsonError("Erro interno.", 500);
  }
}
