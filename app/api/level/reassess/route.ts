import { evaluateLevelAnswers } from "@/lib/level-assessment";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";
import { PHASE_LABELS, phaseToTrainingLevel } from "@/lib/user-level";
import { getUserLevelRow } from "@/lib/user-level-store";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Não foi possível reavaliar seu nível agora. Tente de novo em instantes.";

/**
 * Reavaliação de nível (Perfil > Dados de Treino > Rever nível).
 *
 * Body: { answers: { [perguntaId]: valor }, apply?: boolean }
 *  - apply ausente/false → só calcula e devolve o nível indicado (prévia).
 *  - apply = true        → calcula de novo e GRAVA a fase indicada.
 *
 * O cálculo é sempre aqui no servidor: o app nunca manda a pontuação nem a fase.
 * Ao gravar uma fase diferente: XP zera e a contagem de tempo na fase recomeça
 * (mesma regra de quando o usuário sobe de fase pelo XP).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(GENERIC_ERROR, 500);
    }

    const body = (await request.json().catch(() => null)) as { answers?: unknown; apply?: unknown } | null;
    const result = evaluateLevelAnswers(body?.answers);
    if (!result) {
      return jsonError("Responda todas as perguntas para ver seu nível.", 400);
    }

    const userId = auth.user.id;
    const levelRow = await getUserLevelRow(supabase, userId).catch(() => null);
    const previousPhase = levelRow?.current_phase ?? "iniciante";
    const changed = result.phase !== previousPhase;

    const responsePayload = {
      score: result.score,
      phase: result.phase,
      phaseLabel: result.phaseLabel,
      trainingLevel: phaseToTrainingLevel(result.phase),
      previousPhase,
      previousPhaseLabel: PHASE_LABELS[previousPhase],
      capped: result.capped,
      changed,
      applied: false
    };

    if (body?.apply !== true) {
      return jsonSuccess(responsePayload);
    }

    const now = new Date().toISOString();

    if (changed) {
      const { error } = await supabase
        .from("users")
        .update({ current_phase: result.phase, phase_started_at: now, xp_points: 0 })
        .eq("id", userId);
      if (error) {
        logError("PROFILE", "Level reassessment save failed", { user_id: userId });
        return jsonError(GENERIC_ERROR, 500);
      }
    }

    // Histórico da última reavaliação junto com as respostas do questionário
    // (campo livre em JSON — sem mudar a estrutura do banco). Falha aqui não
    // desfaz a mudança de nível.
    const currentAnswers = await getUserAnswersByUserId(supabase, userId);
    if (currentAnswers) {
      await saveUserAnswers(supabase, userId, {
        ...currentAnswers,
        levelAssessment: {
          answers: result.answers,
          score: result.score,
          phase: result.phase,
          previousPhase,
          capped: result.capped,
          at: now
        }
      } as QuizAnswers).catch(() => null);
    }

    logInfo("PROFILE", "Level reassessed", {
      user_id: userId,
      score: result.score,
      from: previousPhase,
      to: result.phase
    });

    return jsonSuccess({ ...responsePayload, applied: true });
  } catch {
    return jsonError(GENERIC_ERROR, 500);
  }
}
