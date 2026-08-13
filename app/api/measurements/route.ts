import {
  buildMeasurementValues,
  createMeasurement,
  getLatestRecordedWeight,
  listMeasurements
} from "@/lib/measurements-store";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível carregar suas medições.", 500);
    }

    const measurements = await listMeasurements(supabase, auth.user.id);
    return jsonSuccess({ measurements });
  } catch {
    return jsonError("Não foi possível carregar suas medições.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível salvar sua medição.", 500);
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

    const { data, error } = await createMeasurement(supabase, userId, values.data);
    if (error || !data) {
      logError("MEASUREMENTS", "Create failed", { user_id: userId });
      return jsonError("Não foi possível salvar sua medição.", 500);
    }

    await syncCurrentWeight(supabase, userId, answers);

    return jsonSuccess({ measurement: data });
  } catch {
    return jsonError("Não foi possível salvar sua medição.", 500);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mantém answers.weight (usado na geração de treino) igual ao peso da medição
// mais recente que tenha peso. Best-effort: falhas aqui não quebram o salvamento.
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
    // silencioso — sincronização de peso é secundária
  }
}
