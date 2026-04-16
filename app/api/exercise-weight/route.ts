import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import {
  getLastWeightForExercise,
  getWeightHistoryForExercise,
  normalizeExerciseName
} from "@/lib/exercise-weight-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sessão expirada.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Erro interno.", 500);
    }

    const { searchParams } = new URL(request.url);
    const exerciseName = searchParams.get("exercise");
    const mode = searchParams.get("mode") ?? "history";

    if (!exerciseName) {
      return jsonError("Parâmetro 'exercise' é obrigatório.", 400);
    }

    const normalized = normalizeExerciseName(exerciseName);

    if (mode === "last") {
      const lastWeight = await getLastWeightForExercise(supabase, auth.user.id, normalized);
      return NextResponse.json({ success: true, data: { lastWeightKg: lastWeight } });
    }

    const history = await getWeightHistoryForExercise(supabase, auth.user.id, normalized);
    return NextResponse.json({ success: true, data: { history } });
  } catch {
    return jsonError("Erro ao buscar histórico de carga.", 500);
  }
}
