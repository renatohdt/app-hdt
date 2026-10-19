import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushNotification } from "@/lib/push-notifications";
import { sendFcmToTokens } from "@/lib/fcm";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logError, logInfo } from "@/lib/server-logger";
import { QUIET_END_HOUR, QUIET_START_HOUR, spClock } from "@/lib/notification-rules";
import type { NotificationText } from "@/lib/notification-copy";

// Envio de notificação para UMA pessoa (todos os aparelhos dela: web + app).
// Também registra no histórico (notification_log), o que evita duplicadas.

export type NotificationCategory = "engagement" | "account";

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: NotificationText
): Promise<{ sent: number; failed: number; devices: number }> {
  const [subsRes, tokensRes] = await Promise.all([
    supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId),
    supabase.from("native_push_tokens").select("token").eq("user_id", userId)
  ]);
  if (subsRes.error || tokensRes.error) throw new Error(subsRes.error?.message ?? tokensRes.error?.message);

  const subs = subsRes.data ?? [];
  const tokens = (tokensRes.data ?? []).map((r) => r.token as string);
  const devices = subs.length + tokens.length;
  if (devices === 0) return { sent: 0, failed: 0, devices: 0 };

  const [webResults, native] = await Promise.all([
    Promise.all(
      subs.map((s) =>
        sendPushNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).then(
          (r) => ({ ...r, endpoint: s.endpoint as string })
        )
      )
    ),
    tokens.length > 0
      ? sendFcmToTokens(tokens, payload)
      : Promise.resolve({ sent: 0, failed: 0, invalidTokens: [] as string[] })
  ]);

  // Limpeza: aparelhos que não existem mais (web 404/410, token FCM inválido).
  const deadEndpoints = webResults.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint);
  if (deadEndpoints.length > 0) await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  if (native.invalidTokens.length > 0) await supabase.from("native_push_tokens").delete().in("token", native.invalidTokens);

  const webSent = webResults.filter((r) => r.ok).length;
  return { sent: webSent + native.sent, failed: webResults.length - webSent + native.failed, devices };
}

/**
 * Registra no histórico e envia. Se a mesma dedupe_key já existe para a pessoa,
 * não envia de novo (retorna "duplicate"). Com `sendAfter` no futuro, só registra
 * como pendente — o cron envia depois.
 */
export async function logAndSend(
  supabase: SupabaseClient,
  input: {
    userId: string;
    type: string;
    category: NotificationCategory;
    dedupeKey: string;
    text: NotificationText;
    sendAfter?: Date;
  }
): Promise<"sent" | "failed" | "no_device" | "duplicate" | "pending"> {
  const pending = Boolean(input.sendAfter && input.sendAfter.getTime() > Date.now());
  const { data, error } = await supabase
    .from("notification_log")
    .upsert(
      {
        user_id: input.userId,
        type: input.type,
        category: input.category,
        dedupe_key: input.dedupeKey,
        title: input.text.title,
        body: input.text.body,
        url: input.text.url,
        status: pending ? "pending" : "sending",
        send_after: (input.sendAfter ?? new Date()).toISOString()
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  if (error) throw new Error(error.message);
  const id = data?.[0]?.id as string | undefined;
  if (!id) return "duplicate";
  if (pending) return "pending";
  return deliverLogged(supabase, id, input.userId, input.text);
}

async function deliverLogged(supabase: SupabaseClient, id: string, userId: string, text: NotificationText) {
  try {
    const result = await sendPushToUser(supabase, userId, text);
    const status = result.devices === 0 ? "no_device" : result.sent > 0 ? "sent" : "failed";
    await supabase
      .from("notification_log")
      .update({ status, sent_count: result.sent, failed_count: result.failed, sent_at: new Date().toISOString() })
      .eq("id", id);
    return status as "sent" | "failed" | "no_device";
  } catch (err) {
    await supabase.from("notification_log").update({ status: "failed", sent_at: new Date().toISOString() }).eq("id", id);
    logError("NOTIFY_USER", "Falha ao enviar", { id, error: String(err) });
    return "failed" as const;
  }
}

/** Próximo horário permitido (agora, ou 8h se estiver no silêncio das 21h às 8h). */
export function nextAllowedTime(now = new Date()): Date {
  const { hour, minutes } = spClock(now);
  if (hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR) return now;
  const minutesUntil8 =
    hour >= QUIET_START_HOUR ? 24 * 60 - minutes + QUIET_END_HOUR * 60 : QUIET_END_HOUR * 60 - minutes;
  return new Date(now.getTime() + minutesUntil8 * 60_000);
}

/**
 * Aviso de CONTA (pagamento, Indique e Ganhe). Não segue as regras de
 * engajamento (limite diário/semanal, "já treinou hoje"), só respeita o horário
 * de silêncio. Nunca derruba quem chamou (webhook, rota): erros só vão para o log.
 */
export async function notifyAccountEvent(input: {
  userId: string;
  type: string;
  dedupeKey: string;
  text: NotificationText;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const result = await logAndSend(supabase, {
      ...input,
      category: "account",
      sendAfter: nextAllowedTime()
    });
    logInfo("NOTIFY_USER", "Aviso de conta", { type: input.type, result });
  } catch (err) {
    logError("NOTIFY_USER", "Erro no aviso de conta", { type: input.type, error: String(err) });
  }
}

/** Envia os avisos pendentes cujo horário já chegou (chamado pelo cron). */
export async function flushPendingNotifications(supabase: SupabaseClient, limit = 100) {
  const { data, error } = await supabase
    .from("notification_log")
    .select("id, user_id, title, body, url")
    .eq("status", "pending")
    .lte("send_after", new Date().toISOString())
    .order("send_after", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const row of data ?? []) {
    // Marca "sending" antes, para duas execuções simultâneas não mandarem em dobro.
    const { data: claimed } = await supabase
      .from("notification_log")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;
    const status = await deliverLogged(supabase, row.id, row.user_id, { title: row.title, body: row.body, url: row.url });
    if (status === "sent") sent++;
  }
  return { pending: (data ?? []).length, sent };
}
