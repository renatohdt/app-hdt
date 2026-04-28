import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

type UnsubscribeBody = {
  endpoint: string;
};

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Não autenticado.", 401);
    }

    const body = (await request.json()) as UnsubscribeBody;

    if (!body?.endpoint) {
      return jsonError("Endpoint obrigatório.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("endpoint", body.endpoint);

    if (error) {
      logError("PUSH", "Erro ao remover subscription", { error: error.message });
      return jsonError("Não foi possível remover sua inscrição.", 500);
    }

    return jsonSuccess({ unsubscribed: true });
  } catch (error) {
    logError("PUSH", "Erro inesperado em unsubscribe", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
