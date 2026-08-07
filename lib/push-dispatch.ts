import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToMany, type PushSubscriptionRecord } from "@/lib/push-notifications";
import { sendFcmToTokens } from "@/lib/fcm";
import { logInfo } from "@/lib/server-logger";

// Lógica central de envio de push por audiência, reaproveitada pelo envio
// imediato (/api/admin/push/send) e pelo agendado (/api/cron/send-scheduled).
// Manda para os dois canais: web (VAPID) e nativo (FCM Android/iOS).

export type PushAudience = "all" | "premium" | "inactive";
export type DispatchPayload = { title: string; body: string; url?: string };

function mapSubs(
  rows: { endpoint: string; p256dh: string; auth: string }[]
): PushSubscriptionRecord[] {
  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function dispatchPushToAudience(
  supabase: SupabaseClient,
  payload: DispatchPayload,
  audience: PushAudience
): Promise<{ sent: number; failed: number; total: number }> {
  let subscriptions: PushSubscriptionRecord[] = [];
  let nativeTokens: string[] = [];

  if (audience === "all") {
    const [subsRes, tokensRes] = await Promise.all([
      supabase.from("push_subscriptions").select("endpoint, p256dh, auth"),
      supabase.from("native_push_tokens").select("token"),
    ]);
    if (subsRes.error || tokensRes.error) {
      throw new Error(subsRes.error?.message ?? tokensRes.error?.message);
    }
    subscriptions = mapSubs(subsRes.data ?? []);
    nativeTokens = (tokensRes.data ?? []).map((r) => r.token);

  } else if (audience === "premium") {
    const { data: premiumUsers, error } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const premiumIds = (premiumUsers ?? []).map((r) => r.user_id);
    if (premiumIds.length === 0) return { sent: 0, failed: 0, total: 0 };

    const [subsRes, tokensRes] = await Promise.all([
      supabase.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", premiumIds),
      supabase.from("native_push_tokens").select("token").in("user_id", premiumIds),
    ]);
    if (subsRes.error || tokensRes.error) {
      throw new Error(subsRes.error?.message ?? tokensRes.error?.message);
    }
    subscriptions = mapSubs(subsRes.data ?? []);
    nativeTokens = (tokensRes.data ?? []).map((r) => r.token);

  } else {
    // inactive: quem NÃO treinou nos últimos 2 dias
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsers, error } = await supabase
      .from("workout_session_logs")
      .select("user_id")
      .gte("completed_at", twoDaysAgo);
    if (error) throw new Error(error.message);

    const activeUserIds = [...new Set((activeUsers ?? []).map((r) => r.user_id))];
    const notInClause =
      activeUserIds.length > 0 ? `(${activeUserIds.map((id) => `"${id}"`).join(",")})` : null;

    let subsQuery = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
    let tokensQuery = supabase.from("native_push_tokens").select("token");
    if (notInClause) {
      subsQuery = subsQuery.not("user_id", "in", notInClause);
      tokensQuery = tokensQuery.not("user_id", "in", notInClause);
    }

    const [subsRes, tokensRes] = await Promise.all([subsQuery, tokensQuery]);
    if (subsRes.error || tokensRes.error) {
      throw new Error(subsRes.error?.message ?? tokensRes.error?.message);
    }
    subscriptions = mapSubs(subsRes.data ?? []);
    nativeTokens = (tokensRes.data ?? []).map((r) => r.token);
  }

  const total = subscriptions.length + nativeTokens.length;
  if (total === 0) return { sent: 0, failed: 0, total: 0 };

  const sendPayload = { title: payload.title, body: payload.body, url: payload.url ?? "/dashboard" };

  const [webResult, nativeResult] = await Promise.all([
    subscriptions.length > 0
      ? sendPushToMany(subscriptions, sendPayload)
      : Promise.resolve({ sent: 0, failed: 0 }),
    nativeTokens.length > 0
      ? sendFcmToTokens(nativeTokens, sendPayload)
      : Promise.resolve({ sent: 0, failed: 0, invalidTokens: [] as string[] }),
  ]);

  if (nativeResult.invalidTokens.length > 0) {
    await supabase.from("native_push_tokens").delete().in("token", nativeResult.invalidTokens);
  }

  logInfo("PUSH_DISPATCH", "Push enviado", {
    audience,
    web: subscriptions.length,
    native: nativeTokens.length,
  });

  return {
    sent: webResult.sent + nativeResult.sent,
    failed: webResult.failed + nativeResult.failed,
    total,
  };
}
