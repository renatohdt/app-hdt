import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { dispatchPushToAudience, type PushAudience } from "@/lib/push-dispatch";

export const dynamic = "force-dynamic";

// Dispara as notificações agendadas que já venceram.
// Protegido por CRON_SECRET (aceita no header "Authorization: Bearer <segredo>"
// ou no query "?secret=<segredo>"). Deve ser chamado periodicamente por um cron
// (Vercel Cron ou serviço externo).
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError("CRON_SECRET não configurado.", 500);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "") || querySecret;

  if (provided !== secret) {
    return jsonError("Não autorizado.", 401);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return jsonError("Serviço indisponível.", 500);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("scheduled_notifications")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(20);

  if (error) {
    logError("CRON_PUSH", "Erro ao buscar agendamentos", { error: error.message });
    return jsonError("Erro ao buscar agendamentos.", 500);
  }

  let processed = 0;

  for (const item of due ?? []) {
    try {
      const result = await dispatchPushToAudience(
        supabase,
        { title: item.title, body: item.body, url: item.url },
        item.audience as PushAudience
      );

      await supabase
        .from("scheduled_notifications")
        .update({
          status: "sent",
          result_sent: result.sent,
          result_failed: result.failed,
          result_total: result.total,
          sent_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      processed++;
    } catch (err) {
      await supabase
        .from("scheduled_notifications")
        .update({
          status: "error",
          error_message: err instanceof Error ? err.message : String(err),
          sent_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      logError("CRON_PUSH", "Erro ao disparar agendamento", { id: item.id, error: String(err) });
    }
  }

  logInfo("CRON_PUSH", "Cron executado", { due: (due ?? []).length, processed });
  return jsonSuccess({ due: (due ?? []).length, processed });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
