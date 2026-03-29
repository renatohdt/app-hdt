import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

type FunnelBody = {
  userId?: string;
  action?: "clicked_cta" | "quiz_started" | "quiz_completed" | "viewed_workout";
};

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível registrar o evento agora.", 500);
    }

    const body = (await request.json()) as FunnelBody;
    if (!body.action) {
      return jsonError("Dados inválidos.", 400);
    }

    if (body.userId && body.userId !== auth.user.id) {
      logWarn("FUNNEL", "Mismatched userId ignored", { user_id: auth.user.id });
    }

    const { data, error } = await supabase
      .from("analytics_events")
      .insert({
        event_name: body.action,
        user_id: auth.user.id,
        metadata: {}
      })
      .select()
      .single();

    if (error) {
      logError("FUNNEL", "Insert failed", { user_id: auth.user.id, event_name: body.action });
      return jsonError("Não foi possível registrar o evento agora.", 500);
    }

    return jsonSuccess(data, 200);
  } catch (error) {
    logError("FUNNEL", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível registrar o evento agora.", 500);
  }
}
