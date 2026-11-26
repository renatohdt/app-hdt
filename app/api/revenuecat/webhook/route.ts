import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { notifyAccountEvent } from "@/lib/notify-user";
import { pagamentoLojaFalhouText } from "@/lib/notification-copy";
import { markCancellationConfirmed } from "@/lib/cancellation-feedback";
import { queuePremiumCanceledEmail, queuePremiumWelcomeEmail } from "@/lib/strategic-emails";

export const dynamic = "force-dynamic";

// Webhook do RevenueCat: mantém o premium das lojas (Apple e Google Play) atualizado no Supabase.
// O RevenueCat chama esta rota quando a assinatura é comprada, renovada,
// cancelada, expira ou é reembolsada. Protegido por um segredo configurado
// tanto aqui (env REVENUECAT_WEBHOOK_SECRET) quanto no painel do RevenueCat
// (Authorization header do webhook).
//
// O `app_user_id` do evento é o ID do usuário no Supabase, porque o app chama
// Purchases.logIn(<id do usuário>) antes de comprar.

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  // Loja de origem: "APP_STORE", "PLAY_STORE", etc.
  store?: string | null;
  // "SANDBOX" (compra de teste) ou "PRODUCTION" (venda real).
  environment?: string | null;
  // Em CANCELLATION: "UNSUBSCRIBE" (a pessoa desligou), "BILLING_ERROR", etc.
  cancel_reason?: string | null;
  // Identifica a assinatura na loja (mesma em todas as renovações).
  original_transaction_id?: string | null;
};

// Converte o campo `store` do RevenueCat para o valor salvo no banco.
function mapStore(store?: string | null): string | null {
  if (store === "APP_STORE" || store === "MAC_APP_STORE") return "app_store";
  if (store === "PLAY_STORE") return "play_store";
  return store ? store.toLowerCase() : null;
}

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

    // Problema de cobrança na loja (cartão recusado etc.): avisa a pessoa.
    // O BILLING_ISSUE pode vir com data de expiração (período de carência), então
    // o aviso fica ANTES da decisão abaixo, que continua igual.
    if (type === "BILLING_ISSUE") {
      await notifyAccountEvent({
        userId: appUserId,
        type: "pagamento_loja",
        dedupeKey: `pagamento_loja:${event?.id ?? new Date().toISOString().slice(0, 10)}`,
        text: pagamentoLojaFalhouText(),
      });
    }

    // Decide a nova data de expiração do premium da loja.
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
      .update({
        apple_premium_expires_at: expiresAt,
        // De qual loja veio e se é compra de teste (usado só pelo admin).
        store_premium_source: mapStore(event?.store),
        store_premium_sandbox: event?.environment ? event.environment === "SANDBOX" : null,
      })
      .eq("id", appUserId);

    if (error) {
      logError("REVENUECAT", "Erro ao atualizar premium da loja", { error: error.message, type });
      return jsonError("Erro ao processar.", 500);
    }

    // CANCELLATION = a pessoa desligou a renovação na loja (o acesso continua até
    // expirar, tratado acima). Marca a resposta do questionário de cancelamento
    // como "cancelou de verdade". Se falhar, só registra no log.
    if (type === "CANCELLATION") {
      const result = await markCancellationConfirmed(supabase, appUserId, ["app_store", "play_store"]);
      if (result.error) {
        logWarn("REVENUECAT", "Não marcou o questionário de cancelamento", {
          user_id: appUserId,
          error: result.error,
        });
      }

      // E-mail de cancelamento só quando a pessoa desligou a renovação
      // (não em falha de cobrança, que já tem aviso próprio).
      if (event?.cancel_reason === "UNSUBSCRIBE") {
        const cycleKey = `rc:${event?.original_transaction_id ?? new Date().toISOString().slice(0, 7)}`;
        queuePremiumCanceledEmail(appUserId, cycleKey);
      }
    }

    // Primeira compra na loja: e-mail de boas-vindas ao Premium (só 1x na vida).
    if (type === "INITIAL_PURCHASE") {
      queuePremiumWelcomeEmail(appUserId);
    }

    logInfo("REVENUECAT", "Premium da loja atualizado", {
      type,
      user_id: appUserId,
      expires_at: expiresAt,
      store: event?.store ?? null,
      environment: event?.environment ?? null,
    });
    return jsonSuccess({ ok: true });
  } catch (error) {
    logError("REVENUECAT", "Erro inesperado no webhook", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
