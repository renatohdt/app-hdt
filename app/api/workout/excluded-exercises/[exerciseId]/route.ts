import { type NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    exerciseId: string;
  };
};

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const DELETE_ERROR_MESSAGE = "Não foi possível remover o exercício agora. Tente novamente.";
const NOT_FOUND_MESSAGE = "Exercício não encontrado na sua lista de excluídos.";

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const userId = auth.user.id;
    const { exerciseId } = params;

    if (!exerciseId?.trim()) {
      return jsonError("exerciseId é obrigatório.", 400);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(DELETE_ERROR_MESSAGE, 500);
    }

    const { data, error } = await supabase
      .from("user_excluded_exercises")
      .delete()
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId.trim())
      .select("exercise_id");

    if (error) {
      logError("EXCLUDED_EXERCISES", "Delete excluded exercise failed", {
        user_id: userId,
        exercise_id: exerciseId,
        error_code: getSupabaseErrorCode(error)
      });
      return jsonError(DELETE_ERROR_MESSAGE, 500);
    }

    if (!data || data.length === 0) {
      logWarn("EXCLUDED_EXERCISES", "Excluded exercise not found for deletion", {
        user_id: userId,
        exercise_id: exerciseId
      });
      return jsonError(NOT_FOUND_MESSAGE, 404);
    }

    return jsonSuccess({ removed: true });
  } catch {
    logError("EXCLUDED_EXERCISES", "Delete excluded exercise unexpected failure", {});
    return jsonError(DELETE_ERROR_MESSAGE, 500);
  }
}
