import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { runNotificationEngine } from "@/lib/notification-engine";
import { flushPendingNotifications } from "@/lib/notify-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Notificações AUTOMÁTICAS — chamar 1x por hora (ex.: no minuto 5 de cada hora).
// Protegido por CRON_SECRET, igual ao /api/cron/send-scheduled:
//   Authorization: Bearer <segredo>   ou   ?secret=<segredo>
//
// Teste sem enviar nada:  ?dry=1  → devolve a lista de quem receberia o quê.
// Simular outro horário:  ?dry=1&now=2026-10-20T20:05:00Z
// Limitar a uma pessoa:   ?user=<uuid>
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError("CRON_SECRET não configurado.", 500);

  const params = request.nextUrl.searchParams;
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || params.get("secret") || "";
  if (provided !== secret) return jsonError("Não autorizado.", 401);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return jsonError("Serviço indisponível.", 500);

  const dryRun = params.get("dry") === "1";
  const nowParam = params.get("now");
  const now = nowParam ? new Date(nowParam) : undefined;
  if (now && Number.isNaN(now.getTime())) return jsonError("Parâmetro now inválido.", 400);
  // Simular horário só faz sentido sem enviar de verdade.
  if (now && !dryRun) return jsonError("Use now apenas junto com dry=1.", 400);

  try {
    const engine = await runNotificationEngine(supabase, {
      dryRun,
      now,
      onlyUserId: params.get("user") ?? undefined
    });
    const pending = dryRun ? null : await flushPendingNotifications(supabase);
    logInfo("CRON_AUTO_PUSH", "Execução concluída", {
      dryRun,
      candidates: engine.candidates,
      sent: engine.sent,
      pendingSent: pending?.sent ?? 0
    });
    return jsonSuccess({ engine, pending });
  } catch (err) {
    logError("CRON_AUTO_PUSH", "Erro na execução", { error: String(err) });
    return jsonError("Erro ao processar notificações automáticas.", 500);
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
