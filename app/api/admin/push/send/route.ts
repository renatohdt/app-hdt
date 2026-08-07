import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";
import { dispatchPushToAudience, type PushAudience } from "@/lib/push-dispatch";

export const dynamic = "force-dynamic";

type SendBody = {
  title: string;
  body: string;
  url?: string;
  audience: PushAudience;
};

// Envio IMEDIATO (web + nativo) para uma audiência. O agendamento fica em
// /api/admin/push/schedule; ambos usam dispatchPushToAudience.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request, "ADMIN_PUSH");
    if (admin.response) return admin.response;

    const body = (await request.json()) as SendBody;

    if (!body?.title?.trim() || !body?.body?.trim()) {
      return jsonError("Título e mensagem são obrigatórios.", 400);
    }
    if (!["all", "premium", "inactive"].includes(body.audience)) {
      return jsonError("Audiência inválida.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const result = await dispatchPushToAudience(
      supabase,
      { title: body.title, body: body.body, url: body.url },
      body.audience
    );

    return jsonSuccess(result);
  } catch (error) {
    logError("ADMIN_PUSH", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
