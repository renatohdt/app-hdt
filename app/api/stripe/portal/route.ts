import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getSiteUrl } from "@/lib/site-url";
import { logError, logInfo } from "@/lib/server-logger";
import { getUserSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Redireciona o usuário para o portal de gerenciamento do Stripe
// onde ele pode cancelar a assinatura ou trocar o cartão
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const subscription = await getUserSubscription(auth.user.id, token);

    if (!subscription) {
      return jsonError("Nenhuma assinatura ativa encontrada.", 404);
    }

    const siteUrl = getSiteUrl();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${siteUrl}/perfil`,
    });

    logInfo("STRIPE_PORTAL", "Portal de cobrança acessado", { user_id: auth.user.id });

    return jsonSuccess({ url: portalSession.url });
  } catch (error) {
    const isCustomerMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "resource_missing";

    if (isCustomerMissing) {
      logError("STRIPE_PORTAL", "Cliente Stripe não encontrado", { error });
      return jsonError("Seu perfil de cobrança ainda não está configurado. Isso acontece quando o plano foi ativado manualmente para testes.", 400);
    }

    logError("STRIPE_PORTAL", "Erro ao criar sessão do portal", { error });
    return jsonError("Não foi possível acessar o gerenciamento da assinatura.", 500);
  }
}
