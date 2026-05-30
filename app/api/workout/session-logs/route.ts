import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { listAllUserSessionLogs } from "@/lib/workout-session-store";

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
    const sessionLogsWithFeedback = sessionLogs.map((log) => ({
      ...log,
      liked: fbMap.get(log.id)?.liked ?? null,
      intensityLevel: fbMap.get(log.id)?.intensity_level ?? null,
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
