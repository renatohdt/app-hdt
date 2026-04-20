import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logError, logWarn } from "@/lib/server-logger";

/**
 * Preços por 1M de tokens (USD) do modelo usado para montar treinos.
 *
 * Fonte: https://openai.com/api/pricing/ (gpt-4o-mini).
 * Se algum dia a Anthropic/OpenAI reajustar, atualize aqui.
 * Se um modelo diferente for configurado via OPENAI_WORKOUT_MODEL,
 * o custo para esse modelo fica null (não registramos).
 */
export const OPENAI_PRICES_USD_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 }
};

/**
 * Calcula o custo em centavos de dólar (cents) a partir dos tokens retornados
 * pelo OpenAI. Retorna null se o modelo não estiver na tabela de preços.
 *
 * Ex.: 2.000 prompt tokens + 1.500 completion tokens no gpt-4o-mini:
 *   input = 2000 * 0.15 / 1_000_000 = 0.0003 USD
 *   output = 1500 * 0.60 / 1_000_000 = 0.0009 USD
 *   total = 0.0012 USD ~= 0.12 cents -> round -> 0
 *
 * Armazenamos em centavos (inteiro) para consulta e somas serem precisas.
 */
export function estimateCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number
): number | null {
  const price = OPENAI_PRICES_USD_PER_MILLION[model];
  if (!price) {
    return null;
  }

  const usd =
    (promptTokens * price.input + completionTokens * price.output) / 1_000_000;

  return Math.round(usd * 100);
}

/**
 * Calcula o custo em USD (float, cheio de casas decimais) a partir dos tokens.
 * Retorna null se o modelo não estiver na tabela de preços.
 *
 * Útil para os dashboards admin que precisam somar custos sem perder precisão
 * (estimateCostCents arredonda para inteiro e some pode virar zero em treinos
 * individuais do gpt-4o-mini que custam ~0,0018 USD cada).
 */
export function estimateCostUsd(
  model: string | null | undefined,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined
): number | null {
  if (!model || promptTokens == null || completionTokens == null) {
    return null;
  }

  const price = OPENAI_PRICES_USD_PER_MILLION[model];
  if (!price) {
    return null;
  }

  return (
    (promptTokens * price.input + completionTokens * price.output) / 1_000_000
  );
}

export type WorkoutGenerationTelemetry = {
  userId: string | null;
  workoutId?: string | null;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptChars: number;
  responseChars: number;
  catalogSizeBeforeFilter: number | null;
  catalogSizeAfterFilter: number | null;
  promptBody: string;
  responseBody: string;
  splitType: string | null;
  dayCount: number | null;
  durationMs: number;
  status: "success" | "error";
  errorMessage?: string | null;
};

/**
 * Grava uma linha de telemetria em public.ai_workout_generations.
 *
 * Fail-soft: se a inserção falhar (ou o admin client não estiver configurado),
 * apenas logamos um warn/error e seguimos — a geração do treino para o usuário
 * NUNCA pode ser interrompida por um erro de observabilidade.
 *
 * Usa o cliente service_role, então bypassa o RLS da tabela.
 */
export async function recordWorkoutGeneration(
  telemetry: WorkoutGenerationTelemetry
): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      logWarn("AI_TELEMETRY", "Admin client não disponível; pulando registro", {
        status: telemetry.status
      });
      return;
    }

    const costCents =
      telemetry.promptTokens != null && telemetry.completionTokens != null
        ? estimateCostCents(
            telemetry.model,
            telemetry.promptTokens,
            telemetry.completionTokens
          )
        : null;

    const { error } = await supabase.from("ai_workout_generations").insert({
      user_id: telemetry.userId,
      workout_id: telemetry.workoutId ?? null,
      model: telemetry.model,
      prompt_tokens: telemetry.promptTokens,
      completion_tokens: telemetry.completionTokens,
      total_tokens: telemetry.totalTokens,
      prompt_chars: telemetry.promptChars,
      response_chars: telemetry.responseChars,
      catalog_size_before_filter: telemetry.catalogSizeBeforeFilter,
      catalog_size_after_filter: telemetry.catalogSizeAfterFilter,
      prompt_body: telemetry.promptBody,
      response_body: telemetry.responseBody,
      split_type: telemetry.splitType,
      day_count: telemetry.dayCount,
      duration_ms: telemetry.durationMs,
      cost_cents: costCents,
      status: telemetry.status,
      error_message: telemetry.errorMessage ?? null
    });

    if (error) {
      logError("AI_TELEMETRY", "Falha ao inserir telemetria de geração", {
        message: error.message,
        status: telemetry.status,
        user_id: telemetry.userId
      });
    }
  } catch (error) {
    logError("AI_TELEMETRY", "Exceção ao registrar telemetria", {
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}
