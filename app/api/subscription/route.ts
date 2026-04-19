import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getSubscriptionSummary } from "@/lib/subscription";
import { logError, logInfo } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

// Retorna o resumo da assinatura do usuário logado
// Usado pelo perfil, pelos componentes de upsell e pelo middleware de acesso
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const summary = await getSubscriptionSummary(auth.user.id);

    logInfo("SUBSCRIPTION", "Resumo retornado", {
      user_id: auth.user.id,
      is_premium: summary.isPremium,
      plan: summary.plan,
    });

    return jsonSuccess(summary);
  } catch (error) {
    logError("SUBSCRIPTION", "Erro ao buscar assinatura", { error });
    return jsonError("Não foi possível verificar sua assinatura.", 500);
  }
}
