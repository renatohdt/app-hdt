import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { checkAndGrantReferralReward, registerReferralUse } from "@/lib/referral";

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
      await checkAndGrantReferralReward(result.referrerUserId);
    }

    return jsonSuccess(null);
  } catch {
    return jsonError("Não foi possível registrar a indicação.", 500);
  }
}
