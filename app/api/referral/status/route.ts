import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível verificar seu status de indicação.", 500);
    }

    const { data, error } = await supabase
      .from("users")
      .select("referral_premium_until, referral_achievement_unlocked")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      return jsonError("Não foi possível verificar seu status de indicação.", 500);
    }

    const referralPremiumUntil = data?.referral_premium_until ?? null;
    const isReferralPremiumActive = referralPremiumUntil
      ? new Date(referralPremiumUntil) > new Date()
      : false;
    const referralAchievementUnlocked = data?.referral_achievement_unlocked ?? false;

    return jsonSuccess({ referralPremiumUntil, isReferralPremiumActive, referralAchievementUnlocked });
  } catch {
    return jsonError("Não foi possível verificar seu status de indicação.", 500);
  }
}
