import { NextRequest, NextResponse } from "next/server";
import { hasCompletedCycleBefore } from "@/lib/cycle-renewal";
import {
  buildCycleLevel,
  findAchievementsUnlockedInCycle,
  summarizeWeightIncreases,
  type CycleSummary
} from "@/lib/cycle-summary";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { getUserAnswersByUserId } from "@/lib/user-answers";
import { getUserLevelSummary } from "@/lib/user-level-store";
import { fetchUserStandardWorkouts, resolveProgramCycleStart } from "@/lib/workout-record-store";

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const LOAD_ERROR_MESSAGE = "Não foi possível carregar o resumo do ciclo.";

// Resumo do ciclo atual para a celebração de "Programa concluído":
// cargas aumentadas, situação de nível e conquistas desbloqueadas no ciclo.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(LOAD_ERROR_MESSAGE, 500);
    }

    const userId = auth.user.id;
    const savedAnswers = await getUserAnswersByUserId(supabase, userId);
    const answersRecord = (savedAnswers ?? {}) as {
      programCycleStartedAt?: string;
      cycleStartPhase?: string;
      days?: number;
      experience?: string | null;
    };

    const standardWorkouts = await fetchUserStandardWorkouts(supabase, userId);
    const cycleStartIso = resolveProgramCycleStart(answersRecord.programCycleStartedAt, standardWorkouts);

    const [weightLogsResult, sessionLogsResult, goalsResult, level] = await Promise.all([
      supabase
        .from("exercise_weight_logs")
        .select("exercise_name_normalized, max_weight_kg, completed_at")
        .eq("user_id", userId),
      supabase.from("workout_session_logs").select("completed_at").eq("user_id", userId),
      supabase.from("user_goals").select("completed_at").eq("user_id", userId).not("completed_at", "is", null),
      getUserLevelSummary(supabase, userId, answersRecord.experience ?? null).catch(() => null)
    ]);

    const weight = summarizeWeightIncreases(
      (weightLogsResult.data ?? []) as Array<{ exercise_name_normalized: string; max_weight_kg: number; completed_at: string }>,
      cycleStartIso
    );

    const sessionDates = ((sessionLogsResult.data ?? []) as Array<{ completed_at: string | null }>)
      .map((row) => row.completed_at)
      .filter((value): value is string => Boolean(value));

    const cycleStart = new Date(cycleStartIso).getTime();
    const goalDates = ((goalsResult.data ?? []) as Array<{ completed_at: string | null }>)
      .map((row) => row.completed_at)
      .filter((value): value is string => Boolean(value));
    const goalsCompletedBefore = goalDates.filter((d) => new Date(d).getTime() < cycleStart).length;

    const summary: CycleSummary = {
      exercisesWithLoadIncrease: weight.exercisesIncreasedInCycle,
      level: buildCycleLevel({
        currentPhase: level?.currentPhase ?? "iniciante",
        dotProgress: level?.dotProgress ?? 0,
        isReadyButWaiting: level?.isReadyButWaiting ?? false,
        cycleStartPhase: answersRecord.cycleStartPhase ?? null
      }),
      achievements: findAchievementsUnlockedInCycle({
        cycleStartIso,
        sessionDates,
        weeklyTarget: typeof answersRecord.days === "number" ? answersRecord.days : 3,
        weightIncreasesBefore: weight.before,
        weightIncreasesTotal: weight.total,
        goalsCompletedBefore,
        goalsCompletedTotal: goalDates.length,
        isFirstCompletedCycle: !hasCompletedCycleBefore(savedAnswers)
      })
    };

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logError("WORKOUT", "Cycle summary failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonError(LOAD_ERROR_MESSAGE, 500);
  }
}
