import { estimateCostUsd } from "@/lib/ai-telemetry";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

// Regex simples para validar UUID v4-ish. Evita query desnecessária com
// strings aleatórias vindas da URL.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Params) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const id = params.id?.trim();
    if (!id || !UUID_REGEX.test(id)) {
      return jsonError("Identificador inválido.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Supabase admin não configurado.", 500);
    }

    const result = await supabase
      .from("ai_workout_generations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      logError("ADMIN", "ai-log detail query failed", {
        message: result.error.message,
        id
      });
      return jsonError("Não foi possível carregar o log da IA.", 500);
    }

    if (!result.data) {
      return jsonError("Log não encontrado.", 404);
    }

    const row = result.data as {
      id: string;
      created_at: string;
      expires_at: string | null;
      user_id: string | null;
      workout_id: string | null;
      model: string | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
      prompt_chars: number | null;
      response_chars: number | null;
      catalog_size_before_filter: number | null;
      catalog_size_after_filter: number | null;
      prompt_body: string | null;
      response_body: string | null;
      split_type: string | null;
      day_count: number | null;
      duration_ms: number | null;
      cost_cents: number | null;
      status: string;
      error_message: string | null;
    };

    return jsonSuccess(
      {
        ...row,
        cost_usd: estimateCostUsd(row.model, row.prompt_tokens, row.completion_tokens)
      },
      200
    );
  } catch (error) {
    logError("ADMIN", "ai-log detail route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar o log da IA.", 500);
  }
}
