import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserConsentMap } from "@/lib/consents";
import { logError, logInfo, logWarn } from "@/lib/server-logger";

// ─────────────────────────────────────────────────────────────────────────────
// E-mails estratégicos do Hora do Treino, enviados direto pelo app via Resend.
// Usa a API HTTP do Resend com fetch (sem pacote novo no projeto).
//
// Variáveis de ambiente:
//   RESEND_API_KEY  — chave da API (começa com "re_")
//   EMAIL_FROM      — remetente, ex.: "Renato Santiago <renato@horadotreino.com.br>"
//                     (o domínio precisa estar verificado no Resend)
//   EMAIL_REPLY_TO  — opcional: para onde vão as respostas dos alunos
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Renato Santiago <renato@horadotreino.com.br>";

// Tipos de e-mail. Cada um é enviado no máximo 1x por usuário para a mesma
// "chave" (dedupeKey) — a tabela email_log garante isso no banco.
export type EmailKind =
  | "premium_offer" // viu o popup Premium 3x (oferta do preço do site)
  | "premium_welcome" // acabou de assinar
  | "premium_canceled" // cancelou o plano
  | "milestone_10_workouts" // concluiu 10 treinos
  | "premium_interest" // tocou em "Tenho interesse" no Premium (app)
  | "program_interest"; // tocou em "Tenho interesse" em um Programa (app)

// E-mails de marketing só vão para quem aceitou receber (consentimento
// "marketing", LGPD). Os demais são avisos sobre a conta/assinatura.
const MARKETING_KINDS: ReadonlySet<EmailKind> = new Set<EmailKind>([
  "premium_offer",
  "milestone_10_workouts"
]);

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

type SendResult = { ok: true; id: string | null } | { ok: false; reason: string };

/** Envia um e-mail pelo Resend. Nunca lança erro: devolve { ok:false } se falhar. */
export async function sendEmail(to: string, content: EmailContent, tag?: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logWarn("EMAIL", "RESEND_API_KEY não configurada — e-mail não enviado", { tag });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
        to: [to],
        reply_to: process.env.EMAIL_REPLY_TO?.trim() || undefined,
        subject: content.subject,
        html: content.html,
        text: content.text,
        tags: tag ? [{ name: "kind", value: tag }] : undefined
      })
    });

    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      logError("EMAIL", "Resend recusou o envio", { tag, status: response.status, message: body?.message });
      return { ok: false, reason: `http_${response.status}` };
    }
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    logError("EMAIL", "Falha de rede ao chamar o Resend", { tag, error: String(error) });
    return { ok: false, reason: "network" };
  }
}

type SendUserEmailOnceInput = {
  userId: string;
  kind: EmailKind;
  /** Diferencia repetições permitidas, ex.: a data da oferta. Padrão: "once" (só 1x na vida). */
  dedupeKey?: string;
  /** Monta o conteúdo com o primeiro nome do aluno. */
  build: (firstName: string | null) => EmailContent;
};

/**
 * Envia um e-mail estratégico para um usuário no máximo uma vez por (kind, dedupeKey).
 * Precisa do cliente ADMIN do Supabase (service role), porque lê o e-mail em auth.users
 * e grava em email_log. Nunca lança erro.
 */
export async function sendUserEmailOnce(
  supabase: SupabaseClient,
  input: SendUserEmailOnceInput
): Promise<"sent" | "skipped" | "failed"> {
  const { userId, kind } = input;
  const dedupeKey = input.dedupeKey ?? "once";

  try {
    if (MARKETING_KINDS.has(kind)) {
      const consents = await getUserConsentMap(supabase, userId);
      if (!consents.marketing) return "skipped";
    }

    // Reserva o envio ANTES de mandar: o índice único (user_id, kind, dedupe_key)
    // impede que duas requisições ao mesmo tempo enviem em dobro.
    let { data: reserved, error: reserveError } = await supabase
      .from("email_log")
      .insert({ user_id: userId, kind, dedupe_key: dedupeKey, status: "sending" })
      .select("id")
      .maybeSingle();

    // 23505 = já existe registro. Se a tentativa anterior FALHOU, pega de volta
    // (só um pedido consegue, por causa do filtro status = failed) e tenta de novo.
    if (reserveError?.code === "23505") {
      const retry = await supabase
        .from("email_log")
        .update({ status: "sending", error: null })
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("dedupe_key", dedupeKey)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      reserved = retry.data;
      reserveError = retry.error;
    }

    if (reserveError || !reserved) {
      if (reserveError) {
        logError("EMAIL", "Falha ao reservar envio", { user_id: userId, kind, code: reserveError.code });
      }
      return "skipped"; // já enviado (ou em envio) antes
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) {
      await supabase.from("email_log").update({ status: "failed", error: "no_email" }).eq("id", reserved.id);
      return "failed";
    }

    const { data: profile } = await supabase.from("users").select("name").eq("id", userId).maybeSingle();
    const firstName = typeof profile?.name === "string" ? profile.name.trim().split(/\s+/)[0] || null : null;

    const result = await sendEmail(email, input.build(firstName), kind);
    await supabase
      .from("email_log")
      .update(
        result.ok
          ? { status: "sent", provider_id: result.id, sent_at: new Date().toISOString() }
          : { status: "failed", error: result.reason }
      )
      .eq("id", reserved.id);

    if (result.ok) logInfo("EMAIL", "E-mail enviado", { user_id: userId, kind });
    return result.ok ? "sent" : "failed";
  } catch (error) {
    logError("EMAIL", "Erro inesperado no envio", { user_id: userId, kind, error: String(error) });
    return "failed";
  }
}
