import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { isPremium } from "@/lib/subscription";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

export type LoadEvolutionItem = {
  name: string;
  firstKg: number;
  lastKg: number;
  maxKg: number;
  sessions: number;
  // Histórico (data + maior carga do dia). Vazio para o free (gráfico é Premium).
  points: Array<{ date: string; kg: number }>;
};

export type LoadEvolutionResponse = {
  locked: boolean;
  exercisesTracked: number;
  exercisesImproved: number;
  items: LoadEvolutionItem[];
};

// Premium recebe todos os exercícios (com teto de segurança) para a busca no app.
const MAX_ITEMS = 200;

// Visão geral da evolução de cargas (página Evolução → aba Progresso).
// Premium: todos os exercícios com histórico. Free: só o destaque (sem gráfico).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }
    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Não foi possível carregar a evolução.", 500);
    const userId = auth.user.id;
    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    const [{ data, error }, premium] = await Promise.all([
      supabase
        .from("exercise_weight_logs")
        .select("exercise_name, exercise_name_normalized, max_weight_kg, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: true }),
      isPremium(userId, token).catch(() => false)
    ]);
    if (error) return jsonError("Não foi possível carregar a evolução.", 500);

    const groups = new Map<string, { name: string; points: Array<{ date: string; kg: number }> }>();
    for (const row of (data ?? []) as Array<{
      exercise_name: string;
      exercise_name_normalized: string;
      max_weight_kg: number;
      completed_at: string;
    }>) {
      const kg = Number(row.max_weight_kg) || 0;
      if (kg <= 0) continue;
      const group = groups.get(row.exercise_name_normalized) ?? { name: row.exercise_name, points: [] };
      group.name = row.exercise_name; // nome mais recente
      group.points.push({ date: row.completed_at, kg });
      groups.set(row.exercise_name_normalized, group);
    }

    const all: LoadEvolutionItem[] = Array.from(groups.values()).map((g) => ({
      name: g.name,
      firstKg: g.points[0]!.kg,
      lastKg: g.points[g.points.length - 1]!.kg,
      maxKg: Math.max(...g.points.map((p) => p.kg)),
      sessions: g.points.length,
      points: g.points
    }));

    // Ordena pelo ganho percentual (maior → menor); empate pelo nº de registros.
    const gain = (i: LoadEvolutionItem) => (i.firstKg > 0 ? (i.maxKg - i.firstKg) / i.firstKg : 0);
    all.sort((a, b) => gain(b) - gain(a) || b.sessions - a.sessions);

    const improved = all.filter((i) => i.maxKg > i.firstKg);
    const items = premium
      ? all.slice(0, MAX_ITEMS)
      : all.slice(0, 1).map((i) => ({ ...i, points: [] }));

    const body: LoadEvolutionResponse = {
      locked: !premium,
      exercisesTracked: all.length,
      exercisesImproved: improved.length,
      items
    };
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    logError("WORKOUT", "Load evolution failed", { error: error instanceof Error ? error.message : String(error) });
    return jsonError("Não foi possível carregar a evolução.", 500);
  }
}
