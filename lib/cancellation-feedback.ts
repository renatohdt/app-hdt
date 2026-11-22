import type { SupabaseClient } from "@supabase/supabase-js";

// Questionário de cancelamento do Premium.
// Os valores (value) precisam bater com o CHECK da tabela cancellation_feedbacks
// (migration 20261121_cancellation_feedbacks.sql). Os textos (label) são os que
// aparecem para o usuário na tela do questionário.
export const CANCELLATION_REASONS = [
  { value: "sem_tempo", label: "Estou sem tempo / parei de treinar" },
  { value: "caro", label: "Está caro / preciso cortar gastos" },
  { value: "treinos_nao_combinam", label: "Os treinos não combinam comigo" },
  { value: "sem_resultado", label: "Não estou vendo resultado" },
  { value: "personal_ou_outro_app", label: "Vou treinar com personal, professor ou outro app" },
  { value: "problemas_no_app", label: "O app tem problemas (erros, lentidão, difícil de usar)" },
  { value: "so_testando", label: "Assinei só para testar / era temporário" },
  { value: "outro", label: "Outro motivo" },
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"];

export type CancellationSource = "stripe_web" | "stripe_app" | "app_store" | "play_store";

export function isCancellationReason(value: unknown): value is CancellationReason {
  return CANCELLATION_REASONS.some((reason) => reason.value === value);
}

// Janela para ligar a resposta do questionário ao cancelamento confirmado.
// Ex.: a pessoa responde, vai para a loja e só cancela dias depois.
const CONFIRMATION_WINDOW_DAYS = 30;

/**
 * Marca como "cancelou de verdade" a resposta mais recente do usuário que ainda
 * não foi confirmada. Precisa do client com service role (a tabela não deixa o
 * usuário atualizar linhas).
 *
 * Nunca lança erro: se falhar, só devolve o motivo, para não atrapalhar o
 * cancelamento em si (que é o que importa para o usuário).
 */
export async function markCancellationConfirmed(
  admin: SupabaseClient,
  userId: string,
  sources: CancellationSource[]
): Promise<{ marked: boolean; error?: string }> {
  try {
    const since = new Date(Date.now() - CONFIRMATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: pending, error: findError } = await admin
      .from("cancellation_feedbacks")
      .select("id")
      .eq("user_id", userId)
      .is("cancelled_at", null)
      .in("source", sources)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    if (findError) return { marked: false, error: findError.message };
    if (!pending || pending.length === 0) return { marked: false };

    const { error: updateError } = await admin
      .from("cancellation_feedbacks")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", pending[0].id);

    if (updateError) return { marked: false, error: updateError.message };
    return { marked: true };
  } catch (error) {
    return { marked: false, error: String(error) };
  }
}
