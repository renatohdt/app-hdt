import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Mapeia o status do Stripe para o status interno do app
function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    unpaid: "unpaid",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    trialing: "active",
  };
  return map[stripeStatus] ?? "incomplete";
}

// Identifica o plano pelo price ID
function mapPlanFromPriceId(priceId: string): "monthly" | "annual" | null {
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return "annual";
  return null;
}

// ─── Handlers de cada evento ────────────────────────────────────────────────

// Checkout concluído → cria ou atualiza a assinatura no banco
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const plan = session.metadata?.plan as "monthly" | "annual" | undefined;

  if (!userId || !plan) {
    logWarn("STRIPE_WEBHOOK", "checkout.session.completed sem metadata obrigatório", {
      session_id: session.id,
    });
    return;
  }

  // Busca nome e CPF do banco — nunca trafegam pelo Stripe
  const supabaseForBilling = getServiceRoleClient();
  const { data: userData } = await supabaseForBilling
    .from("users")
    .select("billing_name, billing_cpf")
    .eq("id", userId)
    .maybeSingle();

  const customerName = userData?.billing_name ?? null;
  const customerCpf = userData?.billing_cpf ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  if (!subscriptionId || !customerId) {
    logWarn("STRIPE_WEBHOOK", "checkout.session.completed sem subscription/customer", {
      session_id: session.id,
    });
    return;
  }

  // Busca detalhes da assinatura para pegar o período e price_id
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id ?? null;
  const periodStart = firstItem?.current_period_start ?? null;
  const periodEnd = firstItem?.current_period_end ?? null;

  const supabase = getServiceRoleClient();

  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    plan,
    status: mapStripeStatus(subscription.status),
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    customer_name: customerName,
    customer_cpf: customerCpf,
    customer_email: session.customer_email ?? null,
    payment_method: session.payment_method_types?.includes("boleto") ? "pix" : "card",
  };

  // Verifica se já existe registro para este stripe_subscription_id (idempotência)
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("subscriptions").update(subscriptionData).eq("stripe_subscription_id", subscriptionId)
    : await supabase.from("subscriptions").insert(subscriptionData);

  if (error) {
    logError("STRIPE_WEBHOOK", "Erro ao salvar assinatura após checkout", {
      user_id: userId,
      error: error.message,
    });
    return;
  }

  logInfo("STRIPE_WEBHOOK", "Assinatura ativada com sucesso", { user_id: userId, plan });
}

// Extrai o subscription ID da fatura (API 2026-03-25.dahlia — subscription ficou em parent)
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && "id" in sub) return (sub as Stripe.Subscription).id;
  return null;
}

// Pagamento de fatura bem-sucedido → renova o período ou cria a assinatura se ainda não existir
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    logWarn("STRIPE_WEBHOOK", "invoice.payment_succeeded sem user_id no metadata", {
      subscription_id: subscriptionId,
    });
    return;
  }

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id ?? null;
  const plan = priceId ? mapPlanFromPriceId(priceId) : null;
  const periodStart = firstItem?.current_period_start ?? null;
  const periodEnd = firstItem?.current_period_end ?? null;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const supabase = getServiceRoleClient();

  // Verifica se já existe assinatura para este subscription_id
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (existing) {
    // Já existe — apenas renova o período
    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        stripe_price_id: priceId,
        plan: plan ?? undefined,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) {
      logError("STRIPE_WEBHOOK", "Erro ao renovar assinatura", {
        subscription_id: subscriptionId,
        error: error.message,
      });
      return;
    }

    logInfo("STRIPE_WEBHOOK", "Assinatura renovada", { user_id: userId });
  } else {
    // Não existe ainda — cria (safety net caso checkout.session.completed falhe)
    if (!plan || !customerId) {
      logWarn("STRIPE_WEBHOOK", "invoice.payment_succeeded sem plan ou customer para criar assinatura", {
        subscription_id: subscriptionId,
      });
      return;
    }

    // Busca dados de cobrança do usuário
    const { data: userData } = await supabase
      .from("users")
      .select("billing_name, billing_cpf")
      .eq("id", userId)
      .maybeSingle();

    const { error } = await supabase.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      plan,
      status: "active",
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      customer_name: userData?.billing_name ?? null,
      customer_cpf: userData?.billing_cpf ?? null,
      customer_email: typeof invoice.customer_email === "string" ? invoice.customer_email : null,
      payment_method: "card",
    });

    if (error) {
      logError("STRIPE_WEBHOOK", "Erro ao criar assinatura via invoice", {
        subscription_id: subscriptionId,
        error: error.message,
      });
      return;
    }

    logInfo("STRIPE_WEBHOOK", "Assinatura criada via invoice.payment_succeeded (safety net)", { user_id: userId, plan });
  }
}

// Falha no pagamento → marca como past_due
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) return;

  const supabase = getServiceRoleClient();

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    logError("STRIPE_WEBHOOK", "Erro ao marcar past_due", {
      subscription_id: subscriptionId,
      error: error.message,
    });
    return;
  }

  logInfo("STRIPE_WEBHOOK", "Assinatura marcada como past_due após falha de pagamento", {
    subscription_id: subscriptionId,
  });
}

// Assinatura cancelada ou expirada → downgrade para free
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = getServiceRoleClient();

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    logError("STRIPE_WEBHOOK", "Erro ao cancelar assinatura", {
      subscription_id: subscription.id,
      error: error.message,
    });
    return;
  }

  logInfo("STRIPE_WEBHOOK", "Assinatura cancelada — usuário retorna ao plano free", {
    subscription_id: subscription.id,
  });
}

// Assinatura atualizada (mudança de plano, cancelamento agendado, etc.)
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? mapPlanFromPriceId(priceId) : null;

  const supabase = getServiceRoleClient();

  const updatedItem = subscription.items.data[0];
  const updatedPeriodStart = updatedItem?.current_period_start ?? null;
  const updatedPeriodEnd = updatedItem?.current_period_end ?? null;

  const updateData: Record<string, unknown> = {
    status: mapStripeStatus(subscription.status),
    current_period_start: updatedPeriodStart ? new Date(updatedPeriodStart * 1000).toISOString() : null,
    current_period_end: updatedPeriodEnd ? new Date(updatedPeriodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };

  if (plan) updateData.plan = plan;
  if (priceId) updateData.stripe_price_id = priceId;
  if (subscription.canceled_at) {
    updateData.canceled_at = new Date(subscription.canceled_at * 1000).toISOString();
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    logError("STRIPE_WEBHOOK", "Erro ao atualizar assinatura", {
      subscription_id: subscription.id,
      error: error.message,
    });
    return;
  }

  logInfo("STRIPE_WEBHOOK", "Assinatura atualizada", {
    subscription_id: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
  });
}

// ─── Handler principal do webhook ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    logWarn("STRIPE_WEBHOOK", "Requisição sem assinatura ou secret não configurado");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: Stripe.Event;

  try {
    // Valida a assinatura — garante que o evento veio realmente do Stripe
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logWarn("STRIPE_WEBHOOK", "Assinatura do webhook inválida", { error: err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  logInfo("STRIPE_WEBHOOK", `Evento recebido: ${event.type}`, { event_id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      default:
        logInfo("STRIPE_WEBHOOK", `Evento ignorado: ${event.type}`);
    }
  } catch (error) {
    logError("STRIPE_WEBHOOK", "Erro ao processar evento", {
      event_type: event.type,
      event_id: event.id,
      error,
    });
    // Retorna 200 mesmo com erro interno para o Stripe não reenviar indefinidamente
    return NextResponse.json({ received: true, error: "Internal processing error" }, { status: 200 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
