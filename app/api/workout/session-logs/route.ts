import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { listAllUserSessionLogs } from "@/lib/workout-session-store";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { fetchUserStandardWorkouts, resolveProgramCycleStart } from "@/lib/workout-record-store";

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const LOAD_ERROR_MESSAGE = "Não foi possível carregar o histórico de sessões.";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(LOAD_ERROR_MESSAGE, 500);
    }

    const userId = auth.user.id;

    // Busca logs dos últimos 180 dias
    const sessionLogs = await listAllUserSessionLogs(supabase, userId, 180);

    // Busca feedbacks vinculados aos logs
    const logIds = sessionLogs.map((l) => l.id);
    const { data: fbRows } = logIds.length
      ? await supabase
          .from("workout_session_feedbacks")
          .select("session_log_id, liked, intensity_level")
          .in("session_log_id", logIds)
      : { data: [] };

    const fbMap = new Map((fbRows ?? []).map((f) => [f.session_log_id, f]));

    // Anexa o local (home/condo_gym/gym) de cada sessão, buscando pelo workout.
    // Tolerante a produção pré-migração (coluna `location` ausente → sem local).
    const workoutIds = Array.from(
      new Set(sessionLogs.map((l) => l.workoutId).filter((id): id is string => Boolean(id)))
    );
    const locationMap = new Map<string, string>();
    if (workoutIds.length) {
      const { data: workoutRows, error: workoutRowsError } = await supabase
        .from("workouts")
        .select("id, location")
        .in("id", workoutIds);
      if (!workoutRowsError && Array.isArray(workoutRows)) {
        for (const row of workoutRows) {
          const loc = (row as { location?: unknown }).location;
          const id = (row as { id?: unknown }).id;
          if (typeof id === "string" && typeof loc === "string" && loc.trim()) {
            locationMap.set(id, loc);
          }
        }
      }
    }

    // Um programa, vários locais: no ciclo atual, o número da sessão é contado
    // em TODOS os locais, em ordem cronológica (o número salvo é por local).
    const [savedAnswers, standardWorkouts] = await Promise.all([
      getUserAnswersByUserId(supabase, userId),
      fetchUserStandardWorkouts(supabase, userId)
    ]);
    const standardIds = new Set(standardWorkouts.map((w) => w.id));
    const cycleStart = new Date(
      resolveProgramCycleStart(
        (savedAnswers as { programCycleStartedAt?: string } | null)?.programCycleStartedAt,
        standardWorkouts
      )
    ).getTime();
    const unifiedNumbers = new Map<string, number>();
    [...sessionLogs]
      .filter((log) => standardIds.has(log.workoutId) && new Date(log.completedAt).getTime() >= cycleStart)
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
      .forEach((log, index) => unifiedNumbers.set(log.id, index + 1));

    const sessionLogsWithFeedback = sessionLogs.map((log) => ({
      ...log,
      sessionNumber: unifiedNumbers.get(log.id) ?? log.sessionNumber,
      liked: fbMap.get(log.id)?.liked ?? null,
      intensityLevel: fbMap.get(log.id)?.intensity_level ?? null,
      location: locationMap.get(log.workoutId) ?? null,
    }));

    return NextResponse.json({
      success: true,
      data: sessionLogsWithFeedback,
    });
  } catch {
    logError("SESSION_LOGS", "GET unexpected failure", {});
    return jsonError(LOAD_ERROR_MESSAGE, 500);
  }
}
