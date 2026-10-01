import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { isPremium } from "@/lib/subscription";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";
import { sanitizeWeekdays } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

// "Minha semana" (Premium): salva os dias da semana em que a pessoa vai treinar.
// Fica em user_answers.weeklyPlanDays (0 = seg … 6 = dom). Sem migração.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }
    const supabase = createSupabaseUserClient(request);
    if (!supabase) return jsonError("Não foi possível salvar seus dias.", 500);
    const userId = auth.user.id;
    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    if (!(await isPremium(userId, token).catch(() => false))) {
      return NextResponse.json({ success: false, code: "premium_required", error: "Recurso exclusivo Premium." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { days?: unknown };
    const days = sanitizeWeekdays(body.days);
    if (!days) return jsonError("Escolha pelo menos um dia de treino.", 400);

    const saved = await getUserAnswersByUserId(supabase, userId);
    if (!saved) return jsonError("Não foi possível salvar seus dias.", 404);

    const result = await saveUserAnswers(supabase, userId, {
      ...saved,
      weeklyPlanDays: days
    } as QuizAnswers & { weeklyPlanDays: number[] });
    if (result.error) return jsonError("Não foi possível salvar seus dias.", 500);

    return NextResponse.json({ success: true, data: { days } });
  } catch (error) {
    logError("WORKOUT", "Weekly plan save failed", { error: error instanceof Error ? error.message : String(error) });
    return jsonError("Não foi possível salvar seus dias.", 500);
  }
}
