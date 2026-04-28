import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Não autenticado.", 401);
    }

    const body = (await request.json()) as SubscribeBody;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return jsonError("Subscription inválida.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    // Upsert: se o endpoint já existe, atualiza as chaves
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: auth.user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      logError("PUSH", "Erro ao salvar subscription", { error: error.message });
      return jsonError("Não foi possível salvar sua inscrição.", 500);
    }

    return jsonSuccess({ subscribed: true });
  } catch (error) {
    logError("PUSH", "Erro inesperado em subscribe", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
