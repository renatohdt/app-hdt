import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { logError, logInfo } from "@/lib/server-logger";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const IMPROVEMENT_REASONS = [
  "treinos_nao_sao_para_mim",
  "dificil_de_usar",
  "falta_algo_que_preciso",
  "outro",
] as const;

type ImprovementReason = (typeof IMPROVEMENT_REASONS)[number];

type FeedbackBody = {
  rating?: unknown;
  improvement_reason?: unknown;
  comment?: unknown;
  page_count_at_trigger?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as FeedbackBody | null;

    // Valida rating (obrigatório, 1-5)
    const rating = typeof body?.rating === "number" ? body.rating : null;
    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonError("Avaliação inválida. Escolha entre 1 e 5 estrelas.", 400);
    }

    // Valida improvement_reason (opcional, só aceita valores conhecidos)
    const improvementReason = body?.improvement_reason ?? null;
    if (
      improvementReason !== null &&
      !IMPROVEMENT_REASONS.includes(improvementReason as ImprovementReason)
    ) {
      return jsonError("Motivo de melhoria inválido.", 400);
    }

    // Valida comment (opcional, máximo 1000 caracteres)
    const comment =
      typeof body?.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim().slice(0, 1000)
        : null;

    // page_count é informativo, não crítico
    const pageCountAtTrigger =
      typeof body?.page_count_at_trigger === "number" &&
      Number.isInteger(body.page_count_at_trigger) &&
      body.page_count_at_trigger >= 0
        ? body.page_count_at_trigger
        : null;

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível salvar seu feedback agora.", 500);
    }

    const { data, error } = await supabase
      .from("user_feedbacks")
      .insert({
        user_id: auth.user.id,
        rating,
        improvement_reason: improvementReason as ImprovementReason | null,
        comment,
        page_count_at_trigger: pageCountAtTrigger,
      })
      .select("id")
      .single();

    if (error || !data) {
      logError("FEEDBACK", "Insert failed", {
        user_id: auth.user.id,
        error_message: error?.message ?? "no data returned",
      });
      return jsonError("Não foi possível salvar seu feedback agora.", 500);
    }

    logInfo("FEEDBACK", "Feedback saved", {
      user_id: auth.user.id,
      feedback_id: data.id,
      rating,
    });

    return jsonSuccess({ id: data.id }, 201);
  } catch (error) {
    logError("FEEDBACK", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível salvar seu feedback agora.", 500);
  }
}
