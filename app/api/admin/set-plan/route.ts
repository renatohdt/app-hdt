// ⚠️  ROTA DE USO EXCLUSIVO EM DESENVOLVIMENTO/TESTES
// Permite forçar o plano de um usuário sem passar pelo Stripe.
// Protegida por autenticação de admin — nunca exposta a usuários comuns.

import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SetPlanBody = {
  email?: unknown;
  plan?: unknown; // "free" | "monthly" | "annual"
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação admin
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    // 2. Validar body
    const body = (await request.json().catch(() => ({}))) as SetPlanBody;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const plan = body.plan;

    if (!email) {
      return jsonError("email é obrigatório.", 400);
    }
    if (plan !== "free" && plan !== "monthly" && plan !== "annual") {
      return jsonError("plan inválido. Use: free, monthly ou annual.", 400);
    }

    const supabase = createServiceClient();
    if (!supabase) {
      return jsonError("Configuração do Supabase indisponível.", 500);
    }

    // 3. Buscar usuário pelo e-mail
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
      logError("ADMIN_SET_PLAN", "Erro ao listar usuários", { error: userError.message });
      return jsonError("Não foi possível buscar o usuário.", 500);
    }

    const user = users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      return jsonError(`Usuário com e-mail "${email}" não encontrado.`, 404);
    }

    const userId = user.id;

    // 4. Remover assinatura existente (se houver) — garante estado limpo
    const { error: deleteError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      logError("ADMIN_SET_PLAN", "Erro ao remover assinatura existente", { user_id: userId, error: deleteError.message });
      return jsonError("Não foi possível redefinir o plano.", 500);
    }

    // Plano free: só precisava deletar
    if (plan === "free") {
      logInfo("ADMIN_SET_PLAN", "Plano definido para free", { user_id: userId, email });
      return jsonSuccess({ userId, email, plan: "free", message: "Assinatura removida. Usuário está no plano free." });
    }

    // Premium: criar cliente real no Stripe (necessário para o portal de cobrança funcionar)
    let stripeCustomerId: string;
    try {
      // Verifica se já existe um cliente com esse e-mail no Stripe
      const existing = await stripe.customers.list({ email: user.email ?? "", limit: 1 });
      if (existing.data.length > 0 && existing.data[0]) {
        stripeCustomerId = existing.data[0].id;
        logInfo("ADMIN_SET_PLAN", "Cliente Stripe já existente reutilizado", { customer_id: stripeCustomerId });
      } else {
        const newCustomer = await stripe.customers.create({
          email: user.email ?? undefined,
          name: user.email ?? "Teste Admin",
          metadata: { user_id: userId, source: "admin_set_plan" },
        });
        stripeCustomerId = newCustomer.id;
        logInfo("ADMIN_SET_PLAN", "Cliente Stripe criado", { customer_id: stripeCustomerId });
      }
    } catch (stripeError) {
      logError("ADMIN_SET_PLAN", "Erro ao criar cliente no Stripe", { error: stripeError });
      return jsonError("Não foi possível criar o cliente no Stripe.", 500);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const { error: insertError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        stripe_subscription_id: `sub_test_admin_${Date.now()}`,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: plan === "annual" ? "price_test_annual" : "price_test_monthly",
        plan,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        customer_name: user.email ?? "Teste Admin",
        customer_cpf: "00000000000",
        customer_email: user.email ?? null,
        payment_method: "card",
      });

    if (insertError) {
      logError("ADMIN_SET_PLAN", "Erro ao inserir assinatura de teste", { user_id: userId, error: insertError.message });
      return jsonError("Não foi possível definir o plano premium.", 500);
    }

    logInfo("ADMIN_SET_PLAN", "Plano definido via admin", { user_id: userId, email, plan });
    return jsonSuccess({
      userId,
      email,
      plan,
      message: `Plano ${plan} ativado com sucesso para ${email}.`
    });
  } catch (error) {
    logError("ADMIN_SET_PLAN", "Erro inesperado", {
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonError("Erro inesperado ao definir o plano.", 500);
  }
}
