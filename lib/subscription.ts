import "server-only";

import { createClient } from "@supabase/supabase-js";

// Tipos de plano disponíveis no app
export type SubscriptionPlan = "free" | "monthly" | "annual";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete";

export type Subscription = {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: "monthly" | "annual";
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  customer_name: string | null;
  customer_email: string | null;
  payment_method: "card" | "pix" | null;
  created_at: string;
  updated_at: string;
};

// Cria um cliente Supabase com service_role para leitura server-side
// Necessário pois as políticas RLS bloqueiam leitura via anon key fora do contexto do usuário
function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Variáveis de ambiente do Supabase não configuradas.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Busca a assinatura ativa de um usuário no banco.
 * Retorna null se o usuário for free ou não tiver assinatura.
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .or("status.eq.active,status.eq.past_due")
    .maybeSingle();


  if (error) {
    console.error("[subscription] Erro ao buscar assinatura:", error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Verifica se um usuário tem acesso premium.
 * Considera premium: status 'active' ou 'past_due' (ainda dentro do período de graça).
 */
export async function isPremium(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription !== null;
}

/**
 * Retorna o tipo de plano atual do usuário.
 */
export async function getPlanType(userId: string): Promise<SubscriptionPlan> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) return "free";
  return subscription.plan;
}

/**
 * Retorna informações resumidas do plano para exibição na UI.
 * Usado na página de perfil e nos componentes de upsell.
 */
export async function getSubscriptionSummary(userId: string) {
  const subscription = await getUserSubscription(userId);

  if (!subscription) {
    return {
      plan: "free" as SubscriptionPlan,
      isPremium: false,
      renewsAt: null,
      cancelsAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    plan: subscription.plan as SubscriptionPlan,
    isPremium: true,
    renewsAt: subscription.cancel_at_period_end
      ? null
      : subscription.current_period_end,
    cancelsAt: subscription.cancel_at_period_end
      ? subscription.current_period_end
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}
