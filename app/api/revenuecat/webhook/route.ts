import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo, logWarn } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

// Webhook do RevenueCat: mantém o premium da Apple (IAP) atualizado no Supabase.
// O RevenueCat chama esta rota quando a assinatura é comprada, renovada,
// cancelada, expira ou é reembolsada. Protegido por um segredo configurado
// tanto aqui (env REVENUECAT_WEBHOOK_SECRET) quanto no painel do RevenueCat
// (Authorization header do webhook).
//
// O `app_user_id` do evento é o ID do usuário no Supabase, porque o app chama
// Purchases.logIn(<id do usuário>) antes de comprar.

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
};

// Eventos que REVOGAM o acesso imediatamente.
const REVOKE_TYPES = new Set(["EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED"]);

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      logError("REVENUECAT", "Webhook sem segredo configurado", {});
      return jsonError("Webhook não configurado.", 500);
    }

    // O RevenueCat envia o segredo no header Authorization exatamente como você
    // o cadastra no painel (aceitamos com ou sem o prefixo "Bearer ").
    const authHeader = request.headers.get("authorization") ?? "";
    const provided = authHeader.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      logWarn("REVENUECAT", "Webhook não autorizado", {});
      return jsonError("Não autorizado.", 401);
    }

    const body = (await request.json().catch(() => null)) as { event?: RevenueCatEvent } | null;
    const event = body?.event;
    const type = event?.type ?? "";

    // Evento de teste do painel do RevenueCat: só confirma que está funcionando.
    if (type === "TEST") {
      logInfo("REVENUECAT", "Webhook de teste recebido", {});
      return jsonSuccess({ ok: true, test: true });
    }

    const appUserId = event?.app_user_id ?? "";
    // IDs anônimos do RevenueCat (ex.: "$RCAnonymousID:...") não são usuários
    // nossos — ignoramos com segurança.
    if (!appUserId || appUserId.startsWith("$RCAnonymousID")) {
      logWarn("REVENUECAT", "Evento sem usuário identificável", { type, app_user_id: appUserId });
      return jsonSuccess({ ok: true, skipped: "no_user" });
    }

    // Decide a nova data de expiração do premium da Apple.
    let expiresAt: string | null;
    if (REVOKE_TYPES.has(type)) {
      expiresAt = null; // revoga agora
    } else if (typeof event?.expiration_at_ms === "number") {
      expiresAt = new Date(event.expiration_at_ms).toISOString();
    } else {
      // Evento sem expiração e que não revoga (ex.: BILLING_ISSUE): não mexe.
      logInfo("REVENUECAT", "Evento sem expiração, ignorado", { type });
      return jsonSuccess({ ok: true, skipped: "no_expiration" });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { error } = await supabase
      .from("users")
      .update({ apple_premium_expires_at: expiresAt })
      .eq("id", appUserId);

    if (error) {
      logError("REVENUECAT", "Erro ao atualizar premium Apple", { error: error.message, type });
      return jsonError("Erro ao processar.", 500);
    }

    logInfo("REVENUECAT", "Premium Apple atualizado", { type, user_id: appUserId, expires_at: expiresAt });
    return jsonSuccess({ ok: true });
  } catch (error) {
    logError("REVENUECAT", "Erro inesperado no webhook", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
