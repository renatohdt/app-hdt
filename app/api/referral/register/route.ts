import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { checkAndGrantReferralReward, getReferralCount, registerReferralUse, REFERRALS_NEEDED } from "@/lib/referral";
import { notifyAccountEvent } from "@/lib/notify-user";
import { indicacaoPremioText, indicacaoText } from "@/lib/notification-copy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isPremium } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!code) {
      return jsonError("Código de indicação inválido.", 400);
    }

    const result = await registerReferralUse(code, auth.user.id);
    if (!result.success) {
      return jsonError(result.error ?? "Não foi possível registrar a indicação.", 400);
    }

    // Verifica se o dono do código atingiu 5 indicações e concede o prêmio
    if (result.referrerUserId) {
      const granted = await checkAndGrantReferralReward(result.referrerUserId);
      await notifyReferrer(result.referrerUserId, auth.user.id, granted);
    }

    return jsonSuccess(null);
  } catch {
    return jsonError("Não foi possível registrar a indicação.", 500);
  }
}

// Avisa o dono do convite (notificação de conta: chega mesmo se já treinou hoje
// e não conta no limite diário). Nunca atrapalha o cadastro do indicado.
async function notifyReferrer(referrerUserId: string, referredUserId: string, granted: boolean) {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("users")
      .select("referral_rewarded_count")
      .eq("id", referrerUserId)
      .maybeSingle();
    const rewarded = data?.referral_rewarded_count ?? 0;

    if (granted) {
      await notifyAccountEvent({
        userId: referrerUserId,
        type: "indicacao_premio",
        dedupeKey: `indicacao_premio:${rewarded}`,
        text: indicacaoPremioText()
      });
      return;
    }

    // Premium não ganha nada indicando: não faz sentido falar em "faltam X".
    if (await isPremium(referrerUserId)) return;
    const count = await getReferralCount(referrerUserId);
    const remaining = Math.max((rewarded + 1) * REFERRALS_NEEDED - count, 1);
    await notifyAccountEvent({
      userId: referrerUserId,
      type: "indicacao",
      dedupeKey: `indicacao:${referredUserId}`,
      text: indicacaoText(remaining)
    });
  } catch {
    // notificação é um extra
  }
}
