import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { sendPushToMany, type PushSubscriptionRecord } from "@/lib/push-notifications";
import { sendFcmToTokens } from "@/lib/fcm";

export const dynamic = "force-dynamic";

type SendBody = {
  title: string;
  body: string;
  url?: string;
  audience: "all" | "premium" | "inactive"; // inactive = não treina há 2+ dias
};

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function mapSubs(rows: { endpoint: string; p256dh: string; auth: string }[]): PushSubscriptionRecord[] {
  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

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

    const supabase = createSupabaseAdminClient() as SupabaseAdmin | null;
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    let subscriptions: PushSubscriptionRecord[] = [];
    let nativeTokens: string[] = [];

    if (body.audience === "all") {
      const [subsRes, tokensRes] = await Promise.all([
        supabase.from("push_subscriptions").select("endpoint, p256dh, auth"),
        supabase.from("native_push_tokens").select("token"),
      ]);
      if (subsRes.error || tokensRes.error) {
        logError("ADMIN_PUSH", "Erro ao buscar destinatários (all)", {
          error: subsRes.error?.message ?? tokensRes.error?.message,
        });
        return jsonError("Erro ao buscar inscrições.", 500);
      }
      subscriptions = mapSubs(subsRes.data ?? []);
      nativeTokens = (tokensRes.data ?? []).map((r) => r.token);

    } else if (body.audience === "premium") {
      const { data: premiumUsers, error: premiumError } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("status", "active");

      if (premiumError) {
        logError("ADMIN_PUSH", "Erro ao buscar premium", { error: premiumError.message });
        return jsonError("Erro ao buscar usuários premium.", 500);
      }

      const premiumIds = (premiumUsers ?? []).map((r) => r.user_id);
      if (premiumIds.length === 0) {
        return jsonSuccess({ sent: 0, failed: 0, total: 0 });
      }

      const [subsRes, tokensRes] = await Promise.all([
        supabase.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", premiumIds),
        supabase.from("native_push_tokens").select("token").in("user_id", premiumIds),
      ]);
      if (subsRes.error || tokensRes.error) {
        logError("ADMIN_PUSH", "Erro ao buscar destinatários (premium)", {
          error: subsRes.error?.message ?? tokensRes.error?.message,
        });
        return jsonError("Erro ao buscar inscrições.", 500);
      }
      subscriptions = mapSubs(subsRes.data ?? []);
      nativeTokens = (tokensRes.data ?? []).map((r) => r.token);

    } else {
      // inactive: quem NÃO treinou nos últimos 2 dias
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const { data: activeUsers, error: activeError } = await supabase
        .from("workout_session_logs")
        .select("user_id")
        .gte("completed_at", twoDaysAgo);

      if (activeError) {
        logError("ADMIN_PUSH", "Erro ao buscar usuários ativos", { error: activeError.message });
        return jsonError("Erro interno.", 500);
      }

      const activeUserIds = [...new Set((activeUsers ?? []).map((r) => r.user_id))];
      const notInClause = activeUserIds.length > 0
        ? `(${activeUserIds.map((id) => `"${id}"`).join(",")})`
        : null;

      let subsQuery = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
      let tokensQuery = supabase.from("native_push_tokens").select("token");
      if (notInClause) {
        subsQuery = subsQuery.not("user_id", "in", notInClause);
        tokensQuery = tokensQuery.not("user_id", "in", notInClause);
      }

      const [subsRes, tokensRes] = await Promise.all([subsQuery, tokensQuery]);
      if (subsRes.error || tokensRes.error) {
        logError("ADMIN_PUSH", "Erro ao buscar destinatários (inactive)", {
          error: subsRes.error?.message ?? tokensRes.error?.message,
        });
        return jsonError("Erro ao buscar inscrições.", 500);
      }
      subscriptions = mapSubs(subsRes.data ?? []);
      nativeTokens = (tokensRes.data ?? []).map((r) => r.token);
    }

    const total = subscriptions.length + nativeTokens.length;
    if (total === 0) {
      return jsonSuccess({ sent: 0, failed: 0, total: 0 });
    }

    logInfo("ADMIN_PUSH", "Enviando push", {
      audience: body.audience,
      web: subscriptions.length,
      native: nativeTokens.length,
      title: body.title,
    });

    const payload = { title: body.title, body: body.body, url: body.url ?? "/dashboard" };

    // Envia web (VAPID) e nativo (FCM) em paralelo
    const [webResult, nativeResult] = await Promise.all([
      subscriptions.length > 0
        ? sendPushToMany(subscriptions, payload)
        : Promise.resolve({ sent: 0, failed: 0 }),
      nativeTokens.length > 0
        ? sendFcmToTokens(nativeTokens, payload)
        : Promise.resolve({ sent: 0, failed: 0, invalidTokens: [] as string[] }),
    ]);

    // Limpa tokens FCM inválidos (aparelhos que desinstalaram, etc.)
    if (nativeResult.invalidTokens.length > 0) {
      await supabase.from("native_push_tokens").delete().in("token", nativeResult.invalidTokens);
    }

    return jsonSuccess({
      sent: webResult.sent + nativeResult.sent,
      failed: webResult.failed + nativeResult.failed,
      total,
    });
  } catch (error) {
    logError("ADMIN_PUSH", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
