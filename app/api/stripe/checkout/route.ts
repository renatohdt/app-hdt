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

    if (plan !== "monthly" && plan !== "annual") {
      return jsonError("Plano inválido. Use 'monthly' ou 'annual'.", 400);
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
    }

    const siteUrl = getSiteUrl();

    // 4. Cria a sessão de checkout no Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // Campos personalizados coletados diretamente na página do Stripe
      custom_fields: [
        {
          key: "full_name",
          label: { type: "custom", custom: "Nome completo" },
          type: "text",
          text: { minimum_length: 3 },
        },
        {
          key: "cpf",
          label: { type: "custom", custom: "CPF" },
          type: "text",
          text: { minimum_length: 11, maximum_length: 14 },
        },
      ],

      customer_email: auth.user.email ?? undefined,
      metadata: {
        user_id: auth.user.id,
        plan,
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
