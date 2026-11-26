import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { sendPremiumOfferEmail } from "@/lib/strategic-emails";
import { isPremium } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Regras da oferta do preço do site para quem usa o app iOS/Android (nov/2026):
const VIEWS_TO_OFFER = 3; // aberturas do popup Premium para disparar o e-mail
const COOLDOWN_DAYS = 30; // no máximo 1 e-mail de oferta a cada 30 dias

/**
 * Chamado pelo app nativo (iOS/Android) toda vez que o popup de assinatura abre.
 * Conta a abertura e, se o usuário free atingiu a regra, envia o e-mail (Resend)
 * que oferece os planos pelo site (Stripe).
 * A oferta acontece SÓ por e-mail: o app nunca mostra o preço do site (regra das lojas).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }
    const userId = auth.user.id;

    const body = (await request.json().catch(() => null)) as { platform?: string } | null;
    const platform = body?.platform;
    if (platform !== "ios" && platform !== "android") {
      return jsonSuccess({ counted: false });
    }

    // Quem já é Premium não conta nem recebe oferta.
    if (await isPremium(userId)) {
      return jsonSuccess({ counted: false });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Serviço indisponível.", 503);
    }

    // 1) Soma +1 abertura (operação única no banco).
    const { data: row, error: incError } = await supabase.rpc("increment_premium_offer_views", {
      p_user_id: userId
    });
    if (incError || !row) {
      logError("PREMIUM_OFFER", "Falha ao contar abertura", { user_id: userId, error: incError?.message });
      return jsonSuccess({ counted: false });
    }

    const signal = row as { popup_views: number; last_offer_sent_at: string | null; offers_sent: number };
    const cooldownStart = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const lastSent = signal.last_offer_sent_at ? new Date(signal.last_offer_sent_at) : null;
    const eligible = signal.popup_views >= VIEWS_TO_OFFER && (!lastSent || lastSent <= cooldownStart);

    if (!eligible) {
      return jsonSuccess({ counted: true, offerSent: false });
    }

    // 2) "Reserva" o envio de forma atômica: só um pedido consegue marcar a oferta,
    //    mesmo se dois popups abrirem ao mesmo tempo (evita e-mail duplicado).
    let claim = supabase
      .from("premium_offer_signals")
      .update({
        popup_views: 0,
        last_offer_sent_at: new Date().toISOString(),
        offers_sent: signal.offers_sent + 1,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .gte("popup_views", VIEWS_TO_OFFER);
    claim = lastSent ? claim.lte("last_offer_sent_at", cooldownStart.toISOString()) : claim.is("last_offer_sent_at", null);
    const { data: claimed } = await claim.select("user_id");

    if (!claimed || claimed.length === 0) {
      return jsonSuccess({ counted: true, offerSent: false });
    }

    // 3) Envia o e-mail da oferta. A chave é a data da oferta: no máximo 1 a cada 30 dias.
    //    "skipped" = sem consentimento de marketing (LGPD) ou já enviado: mantém a reserva.
    const offerKey = new Date().toISOString().slice(0, 10);
    const outcome = await sendPremiumOfferEmail(supabase, userId, offerKey);
    const result = { ok: outcome === "sent", reason: outcome === "sent" ? null : outcome };

    if (outcome === "failed") {
      // Falhou: desfaz a reserva para tentar de novo na próxima abertura.
      await supabase
        .from("premium_offer_signals")
        .update({
          popup_views: signal.popup_views,
          last_offer_sent_at: signal.last_offer_sent_at,
          offers_sent: signal.offers_sent,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);
    }

    logInfo("PREMIUM_OFFER", "Oferta do site por e-mail", {
      user_id: userId,
      platform,
      ok: result.ok,
      reason: result.reason ?? null,
      offer_number: signal.offers_sent + 1
    });

    return jsonSuccess({ counted: true, offerSent: result.ok });
  } catch (error) {
    logError("PREMIUM_OFFER", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
