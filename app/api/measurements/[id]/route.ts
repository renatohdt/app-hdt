import {
  buildMeasurementValues,
  deleteMeasurement,
  getLatestRecordedWeight,
  updateMeasurement
} from "@/lib/measurements-store";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível atualizar sua medição.", 500);
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return jsonError("Dados inválidos.", 400);
    }

    const userId = auth.user.id;
    const answers = await getUserAnswersByUserId(supabase, userId);

    const values = buildMeasurementValues(body, answers);
    if (!values.ok) {
      return jsonError(values.error, 400);
    }

    const { data, error } = await updateMeasurement(supabase, userId, params.id, values.data);
    if (error) {
      logError("MEASUREMENTS", "Update failed", { user_id: userId });
      return jsonError("Não foi possível atualizar sua medição.", 500);
    }
    if (!data) {
      return jsonError("Medição não encontrada.", 404);
    }

    await syncCurrentWeight(supabase, userId, answers);

    return jsonSuccess({ measurement: data });
  } catch {
    return jsonError("Não foi possível atualizar sua medição.", 500);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível excluir sua medição.", 500);
    }

    const userId = auth.user.id;
    const { error } = await deleteMeasurement(supabase, userId, params.id);
    if (error) {
      logError("MEASUREMENTS", "Delete failed", { user_id: userId });
      return jsonError("Não foi possível excluir sua medição.", 500);
    }

    const answers = await getUserAnswersByUserId(supabase, userId);
    await syncCurrentWeight(supabase, userId, answers);

    return jsonSuccess({ ok: true });
  } catch {
    return jsonError("Não foi possível excluir sua medição.", 500);
  }
}

// Mantém answers.weight igual ao peso da medição mais recente com peso.
async function syncCurrentWeight(
  supabase: ReturnType<typeof createSupabaseUserClient>,
  userId: string,
  answers: Partial<QuizAnswers> | null
) {
  if (!supabase || !answers) return;
  try {
    const latestWeight = await getLatestRecordedWeight(supabase, userId);
    if (latestWeight == null) return;
    const current = typeof answers.weight === "number" ? answers.weight : Number(answers.weight);
    if (current === latestWeight) return;
    await saveUserAnswers(supabase, userId, { ...answers, weight: latestWeight } as QuizAnswers);
  } catch {
    // silencioso
  }
}
