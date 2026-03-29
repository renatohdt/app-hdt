import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json()) as {
      event_name?: string;
      user_id?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.event_name) {
      return jsonError("Evento inválido.", 400);
    }

    if (body.user_id && body.user_id !== auth.user.id) {
      logWarn("TRACK", "Mismatched user_id ignored", { user_id: auth.user.id });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonSuccess(null, 200);
    }

    const { data, error } = await supabase
      .from("analytics_events")
      .insert({
        event_name: body.event_name,
        user_id: auth.user.id,
        metadata: body.metadata ?? {}
      })
      .select()
      .single();

    if (error) {
      logError("TRACK", "Insert failed", { user_id: auth.user.id, event_name: body.event_name });
      return jsonError("Não foi possível registrar o evento agora.", 500);
    }

    return jsonSuccess(data, 200);
  } catch (error) {
    logError("TRACK", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível registrar o evento agora.", 500);
  }
}
