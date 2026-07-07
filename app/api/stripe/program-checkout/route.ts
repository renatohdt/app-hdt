import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { getSiteUrl } from "@/lib/site-url";
import { logError, logInfo } from "@/lib/server-logger";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getActiveProgramEntitlement, getProgramById, getPublishedProgramBySlug } from "@/lib/program-store";

export const dynamic = "force-dynamic";

type CheckoutBody = {
  slug?: unknown;
  programId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    // 2. Body: aceita slug OU programId
    const body: CheckoutBody = await request.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const programId = typeof body.programId === "string" ? body.programId.trim() : "";

    if (!slug && !programId) {
      return jsonError("Informe o programa a ser comprado.", 400);
    }

    // 3. Busca o programa (usa service role para ler o catálogo)
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível iniciar o checkout.", 500);
    }

    const program = slug
      ? await getPublishedProgramBySlug(supabase, slug)
      : await getProgramById(supabase, programId);

    if (!program) {
      return jsonError("Programa não encontrado.", 404);
    }

    if (program.status !== "published") {
      return jsonError("Este programa não está disponível para compra.", 400);
    }

    // 4. Evita compra duplicada: já tem acesso ativo a este programa?
    const activeEntitlement = await getActiveProgramEntitlement(supabase, auth.user.id);
    if (activeEntitlement && activeEntitlement.program_id === program.id) {
      return jsonError("Você já tem acesso a este programa.", 409);
    }

    // 5. Define o item da compra: preço pré-cadastrado no Stripe (se houver) ou
    //    preço direto a partir do price_cents do programa.
    const lineItem = program.stripe_price_id
      ? { price: program.stripe_price_id, quantity: 1 }
      : {
          price_data: {
            currency: "brl",
            product_data: { name: program.title },
            unit_amount: program.price_cents,
          },
          quantity: 1,
        };

    if (!program.stripe_price_id && (!program.price_cents || program.price_cents <= 0)) {
      return jsonError("Preço do programa não configurado.", 500);
    }

    const siteUrl = getSiteUrl();

    // 6. Cria a sessão de checkout (compra única)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [lineItem],

      // Campos coletados na página do Stripe (para Nota Fiscal futura)
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
        program_id: program.id,
        type: "program",
      },
      payment_intent_data: {
        metadata: {
          user_id: auth.user.id,
          program_id: program.id,
          type: "program",
        },
      },

      success_url: `${siteUrl}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}&program=${program.slug}`,
      cancel_url: `${siteUrl}/programas?canceled=true`,

      locale: "pt-BR",
      allow_promotion_codes: false,
    });

    logInfo("STRIPE_PROGRAM_CHECKOUT", "Sessão de checkout criada", {
      user_id: auth.user.id,
      program_id: program.id,
      session_id: session.id,
    });

    return jsonSuccess({ url: session.url });
  } catch (error) {
    logError("STRIPE_PROGRAM_CHECKOUT", "Erro ao criar checkout do programa", { error });
    return jsonError("Não foi possível iniciar o checkout. Tente novamente.", 500);
  }
}
