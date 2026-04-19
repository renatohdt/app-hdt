import { NextRequest } from "next/server";
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getSiteUrl } from "@/lib/site-url";
import { logError, logInfo } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type CheckoutBody = {
  plan?: unknown;
  customerName?: unknown;
  customerCpf?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    // 2. Validação do body
    const body: CheckoutBody = await request.json().catch(() => ({}));
    const plan = body.plan;
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerCpf = typeof body.customerCpf === "string" ? body.customerCpf.trim() : "";

    if (plan !== "monthly" && plan !== "annual") {
      return jsonError("Plano inválido. Use 'monthly' ou 'annual'.", 400);
    }

    if (!customerName) {
      return jsonError("Nome completo é obrigatório.", 400);
    }

    if (!customerCpf) {
      return jsonError("CPF é obrigatório.", 400);
    }

    const priceId = STRIPE_PRICE_IDS[plan];
    if (!priceId) {
      logError("STRIPE_CHECKOUT", "Price ID não configurado para o plano", { plan });
      return jsonError("Configuração de preço indisponível. Tente novamente.", 500);
    }

    // 3. Verifica se o usuário já tem assinatura ativa (evita checkout duplo)
    const supabase = createSupabaseUserClient(request);
    if (supabase) {
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id, status")
        .eq("user_id", auth.user.id)
        .or("status.eq.active,status.eq.past_due")
        .maybeSingle();

      if (existingSub) {
        logInfo("STRIPE_CHECKOUT", "Usuário já possui assinatura ativa", {
          user_id: auth.user.id,
          status: existingSub.status,
        });
        return jsonError("Você já possui uma assinatura ativa.", 409);
      }

      // Salva nome e CPF no banco ANTES de redirecionar ao Stripe
      // Esses dados nunca trafegam pelo Stripe — ficam apenas no Supabase
      // O webhook os recupera daqui pelo user_id quando o pagamento é confirmado
      await supabase
        .from("users")
        .update({ billing_name: customerName, billing_cpf: customerCpf })
        .eq("id", auth.user.id);
    }

    const siteUrl = getSiteUrl();

    // 4. Cria a sessão de checkout no Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: plan === "annual" ? ["card", "boleto"] : ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // Dados do cliente para rastreamento
      // CPF e nome nao sao enviados ao Stripe - ficam apenas no banco (Supabase)
      // para evitar exposicao de dados sensiveis no painel e nos logs do Stripe
      customer_email: auth.user.email ?? undefined,
      metadata: {
        user_id: auth.user.id,
        plan,
        // customer_name e customer_cpf são guardados no banco via webhook,
        // usando os valores coletados localmente antes do redirect
      },
      subscription_data: {
        metadata: {
          user_id: auth.user.id,
          plan,
        },
      },

      // URLs de retorno
      success_url: `${siteUrl}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${siteUrl}/premium?canceled=true`,

      // Idioma e moeda
      locale: "pt-BR",

      // Permite o usuário ajustar a quantidade? Não.
      allow_promotion_codes: false,
    });

    logInfo("STRIPE_CHECKOUT", "Sessão de checkout criada", {
      user_id: auth.user.id,
      plan,
      session_id: session.id,
    });

    return jsonSuccess({ url: session.url });
  } catch (error) {
    logError("STRIPE_CHECKOUT", "Erro ao criar sessão de checkout", { error });
    return jsonError("Não foi possível iniciar o checkout. Tente novamente.", 500);
  }
}
