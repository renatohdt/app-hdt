import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CancellationReason } from "@/lib/cancellation-feedback";
import { sendUserEmailOnce } from "@/lib/email";
import {
  milestone10WorkoutsEmail,
  premiumCanceledEmail,
  premiumOfferEmail,
  premiumWelcomeEmail
} from "@/lib/email-templates";
import { logError } from "@/lib/server-logger";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isPremium } from "@/lib/subscription";

// ─────────────────────────────────────────────────────────────────────────────
// Disparo dos e-mails estratégicos. Cada função pode ser chamada sem medo de
// duplicar: a tabela email_log garante no máximo 1 envio por (tipo, chave).
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONE_WORKOUTS = 10;

/**
 * Roda o envio DEPOIS que a resposta já saiu (o usuário/webhook não espera o e-mail).
 * Erros ficam só no log.
 */
function runAfterResponse(label: string, task: (supabase: SupabaseClient) => Promise<unknown>) {
  after(async () => {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    try {
      await task(supabase);
    } catch (error) {
      logError("EMAIL", `Falha ao disparar ${label}`, { error: String(error) });
    }
  });
}

/** Acabou de assinar (Stripe ou lojas). Só 1x na vida. */
export function queuePremiumWelcomeEmail(userId: string) {
  runAfterResponse("premium_welcome", (supabase) =>
    sendUserEmailOnce(supabase, { userId, kind: "premium_welcome", build: premiumWelcomeEmail })
  );
}

/**
 * Cancelou o plano. `cycleKey` identifica a assinatura cancelada (ex.: id no Stripe),
 * para quem assinar de novo e cancelar outra vez receber o e-mail de novo.
 * O texto usa o motivo respondido no questionário de cancelamento, se houver.
 */
export function queuePremiumCanceledEmail(userId: string, cycleKey: string) {
  runAfterResponse("premium_canceled", async (supabase) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: feedback } = await supabase
      .from("cancellation_feedbacks")
      .select("reason")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const reason = (feedback?.reason ?? null) as CancellationReason | null;

    return sendUserEmailOnce(supabase, {
      userId,
      kind: "premium_canceled",
      dedupeKey: cycleKey,
      build: (firstName) => premiumCanceledEmail(firstName, reason)
    });
  });
}

/**
 * Viu o popup Premium 3x (usuário free do app). Envia NA HORA (sem after), porque
 * quem chama precisa saber se deu certo para desfazer a reserva da oferta.
 * `offerKey` diferencia cada oferta (no máximo 1 a cada 30 dias).
 */
export function sendPremiumOfferEmail(supabase: SupabaseClient, userId: string, offerKey: string) {
  return sendUserEmailOnce(supabase, {
    userId,
    kind: "premium_offer",
    dedupeKey: offerKey,
    build: premiumOfferEmail
  });
}

/** Chamado ao concluir um treino: dispara só quando o total cruza 10 treinos. */
export function queueMilestoneEmailIfReached(userId: string, previousTotal: number, newTotal: number) {
  if (!(previousTotal < MILESTONE_WORKOUTS && newTotal >= MILESTONE_WORKOUTS)) return;
  runAfterResponse("milestone_10_workouts", async (supabase) => {
    const premium = await isPremium(userId).catch(() => false);
    return sendUserEmailOnce(supabase, {
      userId,
      kind: "milestone_10_workouts",
      build: (firstName) => milestone10WorkoutsEmail(firstName, premium)
    });
  });
}
