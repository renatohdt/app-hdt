import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { isPremium } from "@/lib/subscription";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_LOCATIONS: Location[] = ["home", "condo_gym", "gym"];
const ERROR_MESSAGE = "Não foi possível trocar o local agora. Tente novamente.";

// Troca o LOCAL ATIVO do usuário (casa/condomínio). Ter mais de um local ao mesmo
// tempo é exclusivo Premium — por isso a troca só é permitida para assinantes.
// Só persiste o local; a busca/geração do treino daquele local segue pelo fluxo
// normal de /api/workout (GET busca o programa do local ativo; POST gera se faltar).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const userId = auth.user.id;
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(ERROR_MESSAGE, 500);
    }

    const body = (await request.json().catch(() => ({}))) as { location?: unknown };
    const location = body.location;
    if (typeof location !== "string" || !VALID_LOCATIONS.includes(location as Location)) {
      return jsonError("Local inválido.", 400);
    }

    const premium = await isPremium(userId, userToken);
    if (!premium) {
      return jsonError("Treinar em mais de um local é um recurso Premium.", 403);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, userId);
    if (!savedAnswers) {
      return jsonError("Não encontramos seus dados de treino.", 404);
    }

    const saveResult = await saveUserAnswers(supabase, userId, {
      ...savedAnswers,
      location: location as Location
    });

    if (saveResult.error) {
      logError("WORKOUT_LOCATION", "Falha ao salvar o local ativo", { user_id: userId });
      return jsonError(ERROR_MESSAGE, 500);
    }

    return jsonSuccess({ location });
  } catch (error) {
    logError("WORKOUT_LOCATION", "Erro inesperado ao trocar o local", {
      error_detail: error instanceof Error ? error.message : String(error)
    });
    return jsonError(ERROR_MESSAGE, 500);
  }
}
