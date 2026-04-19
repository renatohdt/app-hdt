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

// Cria um cliente Supabase autenticado com o JWT do próprio usuário.
// Usa a política RLS existente "Users can read own subscription" (auth.uid() = user_id).
// Essa abordagem não depende da SUPABASE_SERVICE_ROLE_KEY para leitura.
function getUserAuthClient(userToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Variáveis de ambiente do Supabase não configuradas.");
  }

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Cria um cliente Supabase com service_role (bypass de RLS).
// Usado para operações que não têm o token do usuário disponível.
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
 *
 * Quando userToken é fornecido, usa o JWT do próprio usuário (mais seguro e
 * independente da SUPABASE_SERVICE_ROLE_KEY). Caso contrário, usa service_role.
 */
export async function getUserSubscription(
  userId: string,
  userToken?: string | null
): Promise<Subscription | null> {
  const supabase = userToken
    ? getUserAuthClient(userToken)
    : getServiceRoleClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
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
export async function isPremium(userId: string, userToken?: string | null): Promise<boolean> {
  const subscription = await getUserSubscription(userId, userToken);
  return subscription !== null;
}

/**
 * Retorna o tipo de plano atual do usuário.
 */
export async function getPlanType(userId: string, userToken?: string | null): Promise<SubscriptionPlan> {
  const subscription = await getUserSubscription(userId, userToken);

  if (!subscription) return "free";
  return subscription.plan;
}

/**
 * Retorna informações resumidas do plano para exibição na UI.
 * Usado na página de perfil e nos componentes de upsell.
 */
export async function getSubscriptionSummary(userId: string, userToken?: string | null) {
  const subscription = await getUserSubscription(userId, userToken);

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
