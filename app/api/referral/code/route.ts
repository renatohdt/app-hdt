import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { getOrCreateReferralCode, getReferralCount } from "@/lib/referral";

export const dynamic = "force-dynamic";

const BASE_URL = "https://app.horadotreino.com.br";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const userId = auth.user.id;
    const [code, count] = await Promise.all([
      getOrCreateReferralCode(userId),
      getReferralCount(userId),
    ]);

    return jsonSuccess({ code, link: `${BASE_URL}?ref=${code}`, count });
  } catch {
    return jsonError("Não foi possível carregar seu código de indicação.", 500);
  }
}
