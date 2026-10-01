import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export type SessionDetailExercise = {
  name: string;
  maxWeightKg: number;
  setsDone: number;
  reps: string | null;
  // Bateu a maior carga já registrada neste exercício até então.
  increased: boolean;
  previousMaxKg: number | null;
};

type WeightLogRow = {
  exercise_name: string;
  exercise_name_normalized: string;
  max_weight_kg: number;
  sets_data: unknown;
  completed_at: string;
};

// Detalhe de uma sessão concluída (calendário → toque no dia):
// cargas registradas por exercício e se houve aumento em relação ao histórico.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }
    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Não foi possível carregar o treino.", 500);

    const sessionLogId = new URL(request.url).searchParams.get("id");
    if (!sessionLogId) return jsonError("Parâmetro 'id' é obrigatório.", 400);
    const userId = auth.user.id;

    const { data: rows, error } = await supabase
      .from("exercise_weight_logs")
      .select("exercise_name, exercise_name_normalized, max_weight_kg, sets_data, completed_at")
      .eq("user_id", userId)
      .eq("workout_session_log_id", sessionLogId);

    if (error) return jsonError("Não foi possível carregar o treino.", 500);
    const sessionRows = (rows ?? []) as WeightLogRow[];
    if (!sessionRows.length) {
      return NextResponse.json({ success: true, data: { exercises: [] as SessionDetailExercise[] } });
    }

    // Maior carga de cada exercício ANTES desta sessão (para marcar os aumentos).
    const names = Array.from(new Set(sessionRows.map((r) => r.exercise_name_normalized)));
    const sessionAt = sessionRows[0]!.completed_at;
    const { data: previousRows } = await supabase
      .from("exercise_weight_logs")
      .select("exercise_name_normalized, max_weight_kg")
      .eq("user_id", userId)
      .in("exercise_name_normalized", names)
      .lt("completed_at", sessionAt);

    const previousMax: Record<string, number> = {};
    for (const row of (previousRows ?? []) as Array<{ exercise_name_normalized: string; max_weight_kg: number }>) {
      const value = Number(row.max_weight_kg) || 0;
      previousMax[row.exercise_name_normalized] = Math.max(previousMax[row.exercise_name_normalized] ?? 0, value);
    }

    const exercises: SessionDetailExercise[] = sessionRows.map((row) => {
      const sets = Array.isArray(row.sets_data)
        ? (row.sets_data as Array<{ reps?: string; completed?: boolean }>)
        : [];
      const doneSets = sets.filter((s) => s.completed !== false);
      const prev = previousMax[row.exercise_name_normalized];
      const weight = Number(row.max_weight_kg) || 0;
      return {
        name: row.exercise_name,
        maxWeightKg: weight,
        setsDone: doneSets.length,
        reps: doneSets.find((s) => s.reps)?.reps ?? null,
        increased: typeof prev === "number" && weight > prev,
        previousMaxKg: typeof prev === "number" ? prev : null
      };
    });

    return NextResponse.json({ success: true, data: { exercises } });
  } catch (error) {
    logError("WORKOUT", "Session detail failed", { error: error instanceof Error ? error.message : String(error) });
    return jsonError("Não foi possível carregar o treino.", 500);
  }
}
