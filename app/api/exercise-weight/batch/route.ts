import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { getLastWeightBatch, normalizeExerciseName } from "@/lib/exercise-weight-store";

export const dynamic = "force-dynamic";

// Recebe uma lista de nomes de exercícios e retorna o último peso registrado para cada um.
// Substitui N chamadas individuais a /api/exercise-weight por uma única chamada.
// Query param: exercises = nomes separados por vírgula
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
    const rawExercises = searchParams.get("exercises");

    if (!rawExercises) {
      return jsonError("Parâmetro 'exercises' é obrigatório.", 400);
    }

    const exerciseNames = rawExercises
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 50); // limite de segurança

    if (!exerciseNames.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    const normalizedNames = exerciseNames.map(normalizeExerciseName);
    const weights = await getLastWeightBatch(supabase, auth.user.id, normalizedNames);

    // Devolve o mapa usando o nome normalizado como chave
    return NextResponse.json({ success: true, data: weights });
  } catch {
    return jsonError("Erro ao buscar histórico de cargas.", 500);
  }
}
