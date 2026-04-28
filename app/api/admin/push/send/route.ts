import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { sendPushToMany, type PushSubscriptionRecord } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

type SendBody = {
  title: string;
  body: string;
  url?: string;
  audience: "all" | "premium" | "inactive"; // inactive = não treina há 2+ dias
};

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

    // Busca subscriptions conforme a audiência
    let subscriptions: PushSubscriptionRecord[] = [];

    if (body.audience === "all") {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth");

      if (error) {
        logError("ADMIN_PUSH", "Erro ao buscar subscriptions", { error: error.message });
        return jsonError("Erro ao buscar inscrições.", 500);
      }

      subscriptions = (data ?? []).map((row) => ({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }));

    } else if (body.audience === "premium") {
      // Busca usuários premium pelo campo subscriptions
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

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .in("user_id", premiumIds);

      if (error) {
        logError("ADMIN_PUSH", "Erro ao buscar subscriptions premium", { error: error.message });
        return jsonError("Erro ao buscar inscrições.", 500);
      }

      subscriptions = (data ?? []).map((row) => ({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }));

    } else if (body.audience === "inactive") {
      // Usuários que têm subscription mas não treinaram nos últimos 2 dias
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

      let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");

      if (activeUserIds.length > 0) {
        query = query.not("user_id", "in", `(${activeUserIds.map((id) => `"${id}"`).join(",")})`);
      }

      const { data, error } = await query;

      if (error) {
        logError("ADMIN_PUSH", "Erro ao buscar inativos", { error: error.message });
        return jsonError("Erro ao buscar inscrições.", 500);
      }

      subscriptions = (data ?? []).map((row) => ({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }));
    }

    if (subscriptions.length === 0) {
      return jsonSuccess({ sent: 0, failed: 0, total: 0 });
    }

    logInfo("ADMIN_PUSH", "Enviando push", {
      audience: body.audience,
      total: subscriptions.length,
      title: body.title
    });

    const result = await sendPushToMany(subscriptions, {
      title: body.title,
      body: body.body,
      url: body.url ?? "/dashboard"
    });

    return jsonSuccess({ ...result, total: subscriptions.length });
  } catch (error) {
    logError("ADMIN_PUSH", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
