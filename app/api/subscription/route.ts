import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getSubscriptionSummary } from "@/lib/subscription";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

// Retorna o resumo da assinatura do usuário logado
// Usado pelo perfil, pelos componentes de upsell e pelo middleware de acesso
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    // Extrai o token do header para usar o JWT do próprio usuário na query.
    // Isso usa a política RLS "Users can read own subscription" (auth.uid() = user_id),
    // sem depender da SUPABASE_SERVICE_ROLE_KEY para leitura.
    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const summary = await getSubscriptionSummary(auth.user.id, token);

    return jsonSuccess(summary);
  } catch (error) {
    logError("SUBSCRIPTION", "Erro ao buscar assinatura", { error });
    return jsonError("Não foi possível verificar sua assinatura.", 500);
  }
}
