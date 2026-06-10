import "server-only";
import { createSupabaseAdminClient } from "./supabase-admin";

const CODE_PREFIX = "HDT-";
// Sem 0/O/1/I para evitar confusão na leitura
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const MAX_RETRIES = 5;
const REFERRALS_NEEDED = 5;
const PREMIUM_DAYS = 30;

// Código de erro do PostgreSQL para violação de constraint UNIQUE
const PG_UNIQUE_VIOLATION = "23505";

function generateRandomCode(): string {
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Retorna o código existente do usuário, ou null se não tiver. */
export async function getReferralCode(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[referral] Erro ao buscar código:", error.message);
    return null;
  }

  return data?.code ?? null;
}

/**
 * Retorna o código existente do usuário.
 * Se ainda não tiver, gera um no formato HDT-XXXX (até 5 tentativas para evitar colisão).
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin não configurado.");

  const existing = await getReferralCode(userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateRandomCode();
    const { error } = await supabase
      .from("referral_codes")
      .insert({ user_id: userId, code });

    if (!error) return code;

    // Colisão de UNIQUE → tenta outro código; qualquer outro erro interrompe
    if (error.code !== PG_UNIQUE_VIOLATION) {
      console.error("[referral] Erro ao inserir código:", error.message);
      throw new Error("Erro ao criar código de indicação.");
    }
  }

  throw new Error("Não foi possível gerar um código único após 5 tentativas.");
}

/**
 * Registra o uso de um código quando um novo usuário se cadastra.
 * Retorna { success, referrerUserId } ou { success: false, error }.
 */
export async function registerReferralUse(
  code: string,
  referredUserId: string
): Promise<{ success: boolean; referrerUserId?: string; error?: string }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { success: false, error: "Supabase admin não configurado." };

  // Busca quem é dono do código
  const { data: codeData, error: codeError } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (codeError) {
    console.error("[referral] Erro ao buscar código:", codeError.message);
    return { success: false, error: "Erro interno ao validar código." };
  }

  if (!codeData) {
    return { success: false, error: "Código inválido." };
  }

  const referrerUserId = codeData.user_id;

  if (referrerUserId === referredUserId) {
    return { success: false, error: "Você não pode usar seu próprio código." };
  }

  const { error: insertError } = await supabase
    .from("referral_uses")
    .insert({ code, referrer_user_id: referrerUserId, referred_user_id: referredUserId });

  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      return { success: false, error: "Você já usou um código de indicação." };
    }
    console.error("[referral] Erro ao registrar uso:", insertError.message);
    return { success: false, error: "Erro interno ao registrar indicação." };
  }

  return { success: true, referrerUserId };
}

/** Conta quantas indicações válidas o usuário tem. */
export async function getReferralCount(userId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("referral_uses")
    .select("*", { count: "exact", head: true })
    .eq("referrer_user_id", userId);

  if (error) {
    console.error("[referral] Erro ao contar indicações:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Concede 30 dias de premium gratuito ao usuário (apenas se for free).
 * Verifica antes se já tem Stripe ativo — se tiver, não faz nada.
 * Retorna true se concedeu, false se não era elegível ou já tinha prêmio ativo.
 */
export async function grantReferralPremium(userId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  // Usuário com assinatura Stripe ativa não recebe o prêmio
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  if (sub) return false;

  // Busca o estado atual do premium por indicação
  const { data: user } = await supabase
    .from("users")
    .select("referral_premium_until, referral_rewarded_count")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return false;

  const now = new Date();

  // Prêmio repetível: soma 30 dias. Se ainda houver premium de indicação ativo,
  // estende a partir do prazo restante (não substitui); caso contrário, conta a
  // partir de agora. A elegibilidade (5 indicações novas) é validada antes, em
  // checkAndGrantReferralReward.
  const currentUntil = user.referral_premium_until ? new Date(user.referral_premium_until) : null;
  const base = currentUntil && currentUntil > now ? currentUntil : now;

  const premiumUntil = new Date(
    base.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from("users")
    .update({
      referral_premium_until: premiumUntil,
      referral_rewarded_count: (user.referral_rewarded_count ?? 0) + 1,
      referral_achievement_unlocked: true,
    })
    .eq("id", userId);

  if (error) {
    console.error("[referral] Erro ao conceder premium:", error.message);
    return false;
  }

  return true;
}

/** Verifica se o usuário tem premium por indicação ainda válido. */
export async function hasActiveReferralPremium(userId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("users")
    .select("referral_premium_until")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.referral_premium_until) return false;

  return new Date(data.referral_premium_until) > new Date();
}

/**
 * Verifica se o usuário atingiu mais um bloco de indicações necessárias (5 NOVAS)
 * e, se sim, tenta conceder o prêmio.
 *
 * O prêmio é repetível: a cada 5 indicações novas, +30 dias de premium.
 * Em vez de zerar/apagar a tabela de indicações, usamos referral_rewarded_count
 * (quantos prêmios já foram dados) como deslocamento. Assim o usuário só ganha de
 * novo ao alcançar o próximo múltiplo de 5:
 *   1º prêmio  → 5 indicações
 *   2º prêmio  → 10 indicações (5 novas)
 *   3º prêmio  → 15 indicações (5 novas)...
 * Isso evita a re-concessão indevida quando o premium expira mas a contagem
 * histórica continua >= 5.
 *
 * Retorna true se o prêmio foi concedido nesta chamada.
 */
export async function checkAndGrantReferralReward(referrerUserId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const count = await getReferralCount(referrerUserId);

  // Quantos prêmios já foram concedidos a este usuário.
  const { data: user } = await supabase
    .from("users")
    .select("referral_rewarded_count")
    .eq("id", referrerUserId)
    .maybeSingle();

  const alreadyRewarded = user?.referral_rewarded_count ?? 0;

  // Precisa de 5 indicações novas além das que já geraram prêmio.
  const needed = (alreadyRewarded + 1) * REFERRALS_NEEDED;
  if (count < needed) return false;

  return grantReferralPremium(referrerUserId);
}
