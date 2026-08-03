import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getUserSubscription } from "@/lib/subscription";
import { logError, logInfo } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

// Cancela ou reativa a assinatura do usuário logado SEM abrir o portal do Stripe.
// Usado pela gestão in-app (dentro do app das lojas). São ações que não envolvem
// pagamento, portanto permitidas dentro do app.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    const action = body?.action;

    if (action !== "cancel" && action !== "reactivate") {
      return jsonError("Ação inválida.", 400);
    }

    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const subscription = await getUserSubscription(auth.user.id, token);

    if (!subscription || !subscription.stripe_subscription_id) {
      return jsonError("Nenhuma assinatura gerenciável encontrada.", 404);
    }

    const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: action === "cancel",
    });

    logInfo("STRIPE_MANAGE", `Assinatura ${action}`, { user_id: auth.user.id });

    const cancelAtPeriodEnd = updated.cancel_at_period_end;
    // Na versão atual da API do Stripe, o período fica no ITEM da assinatura
    // (mesmo padrão usado no webhook), não no objeto de assinatura.
    const periodEndUnix = updated.items.data[0]?.current_period_end ?? null;
    const periodEndIso = periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : subscription.current_period_end;

    return jsonSuccess({
      cancelAtPeriodEnd,
      cancelsAt: cancelAtPeriodEnd ? periodEndIso : null,
      renewsAt: cancelAtPeriodEnd ? null : periodEndIso,
    });
  } catch (error) {
    logError("STRIPE_MANAGE", "Erro ao gerenciar assinatura", { error });
    return jsonError("Não foi possível atualizar sua assinatura.", 500);
  }
}
