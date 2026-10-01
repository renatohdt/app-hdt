import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkoutAge } from "@/lib/age";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { diagnoseUser } from "@/lib/diagnosis";
import { normalizeExerciseRecord } from "@/lib/exercise-library";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode } from "@/lib/supabase-errors";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { Experience, ExerciseRecord, Location, QuizAnswers, WorkoutPlan } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";
import { isPremium } from "@/lib/subscription";
import { sanitizeWeekdays } from "@/lib/weekly-plan";
import { FREE_CYCLE_LIMIT_ERROR_CODE, getCycleRenewalsUsed, hasCompletedCycleBefore, hasFreeCycleRenewalAvailable } from "@/lib/cycle-renewal";
import { getActiveProgramEntitlement, getProgramById } from "@/lib/program-store";
import { clampProgramWeek, getProgramTotalWeeks, getProgramWeeks, mapProgramWeekToWorkoutPlan } from "@/lib/program-workout-mapper";
// lib/workout-ai (OpenAI, ~4 mil linhas) é carregado só dentro do POST
// (geração de treino), para o GET — chamado em toda abertura de tela — iniciar
// mais rápido quando a função "acorda" (cold start).
type WorkoutAiModule = typeof import("@/lib/workout-ai");
import { normalizeWorkoutPayload, syncWorkoutWithExerciseLibrary } from "@/lib/workout-payload";
import { fetchLatestWorkoutRecord, fetchAvailableWorkoutLocations, fetchUserStandardWorkouts, resolveProgramCycleStart, getUnifiedProgramCompletedCount, getUnifiedLastProgramSession, type WorkoutRecordRow, saveWorkoutRecord } from "@/lib/workout-record-store";
import { getAllTimeWorkoutCount, getWorkoutSessionStats, listWorkoutSessionLogs } from "@/lib/workout-session-store";
import { countWeightIncreases } from "@/lib/exercise-weight-store";
import { getUserLevelSummary } from "@/lib/user-level-store";
import { experienceToInitialPhase, phaseToExperience, type UserPhase } from "@/lib/user-level";
import {
  applyWorkoutPlanSessionConfig,
  buildWorkoutSessionProgress,
  hasWorkoutPlanSessionConfig,
  resolveWorkoutPlanSessionConfig
} from "@/lib/workout-sessions";

export const dynamic = "force-dynamic";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const LOAD_WORKOUT_ERROR_MESSAGE = "Não foi possível carregar seu treino agora.";
const LOAD_ANSWERS_ERROR_MESSAGE = "Não foi possível carregar seus dados agora.";
const GENERATE_WORKOUT_ERROR_MESSAGE = "Não foi possível gerar seu treino agora. Tente novamente.";
const SAVE_WORKOUT_ERROR_MESSAGE = "Não foi possível salvar seu treino no momento.";
const RATE_LIMIT_ERROR_MESSAGE = "Você atingiu o limite de tentativas. Tente novamente em alguns minutos.";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId");
    const userId = auth.user.id;

    if (requestedUserId && requestedUserId !== userId) {
      logWarn("AUTH", "Workout access denied", { user_id: userId });
      return jsonError("Acesso negado.", 403);
    }

    // ETAPA 1 — tudo que depende só do userId roda junto (uma única "ida"
    // ao banco em vez de várias em fila).
    const workoutUserToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const now = new Date().toISOString();
    const [
      programEntitlement,
      { data: user, error: userError },
      { data: workoutRecordInitial, error: workoutError },
      savedAnswers,
      exerciseLibrary,
      isPremiumUser,
      standardWorkoutsGet,
      rawAvailableLocations,
      totalWorkoutsAllTime,
      totalWeightIncreasesAllTime,
      activeGoalResult,
      completedGoalsResult,
      referralAchievementResult
    ] = await Promise.all([
      getActiveProgramEntitlement(supabase, userId),
      supabase.from("users").select("id, name, created_at").eq("id", userId).maybeSingle(),
      fetchLatestWorkoutRecord(supabase, { userId, includeCreatedAt: true, scope: "WORKOUT" }),
      getUserAnswersByUserId(supabase, userId),
      getCachedExerciseCatalog(),
      isPremium(userId, workoutUserToken),
      fetchUserStandardWorkouts(supabase, userId),
      // Locais que já têm treino (abas de local na tela de treino).
      fetchAvailableWorkoutLocations(supabase, userId),
      getAllTimeWorkoutCount(supabase, userId),
      countWeightIncreases(supabase, userId),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .is("completed_at", null)
        .gte("ends_at", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("completed_at", "is", null),
      // Flag de desbloqueio da conquista de indicação ("Fofoqueiro(a)").
      supabase
        .from("users")
        .select("referral_achievement_unlocked")
        .eq("id", userId)
        .maybeSingle()
    ]);

    // Modo programa: se o usuário tem um programa comprado ativo, ele tem
    // prioridade sobre o fluxo de treino por IA (que segue abaixo).
    if (programEntitlement) {
      return await buildProgramWorkoutResponse(request, userId, programEntitlement);
    }

    if (userError || !user) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 404);
    }

    if (workoutError) {
      logError("WORKOUT", "Workout query failed", {
        user_id: userId,
        error_code: getSupabaseErrorCode(workoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    if (!savedAnswers) {
      logWarn("WORKOUT", "Workout runtime answers fallback", {
        user_id: userId,
        reason: "user_answers_missing"
      });
    }

    const answers = buildRuntimeQuizAnswers(savedAnswers, (user as { created_at?: string | null }).created_at ?? null);
    const diagnosis = diagnoseUser(answers);

    // Contagem UNIFICADA do programa: soma as sessões de todos os locais desde o
    // início do ciclo. Total continua o do local ativo. Local único = igual a antes.
    const cycleStartGet = resolveProgramCycleStart(
      (savedAnswers as { programCycleStartedAt?: string } | null)?.programCycleStartedAt,
      standardWorkoutsGet
    );
    const standardIdsGet = standardWorkoutsGet.map((w) => w.id);
    const activeGoalRow = activeGoalResult.data;

    // ETAPA 2 — o que depende das respostas do quiz / premium / meta.
    const [scopedWorkout, unifiedCompletedGet, unifiedLastGet, activeGoalCountResult] = await Promise.all([
      // Premium tem um programa por local (casa/condomínio): busca o treino do
      // local ATIVO. Free continua com um único programa (o mais recente).
      isPremiumUser
        ? fetchLatestWorkoutRecord(supabase, {
            userId: user.id,
            includeCreatedAt: true,
            scope: "WORKOUT",
            location: answers.location
          })
        : Promise.resolve(null),
      getUnifiedProgramCompletedCount(supabase, user.id, cycleStartGet, standardIdsGet),
      getUnifiedLastProgramSession(supabase, user.id, cycleStartGet, standardIdsGet),
      activeGoalRow
        ? supabase
            .from("workout_session_logs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("completed_at", activeGoalRow.starts_at)
            .lte("completed_at", activeGoalRow.ends_at)
        : Promise.resolve(null)
    ]);

    // Só adota o treino do local ativo quando ele EXISTE. Se o premium ainda
    // não tem programa para esse local, mantém o treino mais recente.
    let workoutRecord = workoutRecordInitial;
    if (scopedWorkout && !scopedWorkout.error && scopedWorkout.data) {
      workoutRecord = scopedWorkout.data;
    }

    if (!workoutRecord) {
      logInfo("WORKOUT", "Workout not found", { user_id: user.id });
      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: false,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: null,
          sessionProgress: null,
          sessionLogs: []
        }
      });
    }

    const normalizedWorkout = normalizeWorkoutSafely(workoutRecord.exercises, {
      diagnosis,
      answers,
      exerciseLibrary,
      userId: user.id,
      workoutId: workoutRecord.id
    });

    if (!normalizedWorkout) {
      logWarn("WORKOUT", "Workout payload unavailable after parsing", {
        user_id: user.id,
        workout_id: workoutRecord.id
      });

      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: false,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: null,
          sessionProgress: null,
          sessionLogs: []
        }
      });
    }

    const workoutState = resolveWorkoutPlanState({
      workoutRecord,
      workout: normalizedWorkout,
      answers
    });

    // ETAPA 3 — o que depende do treino escolhido (e o nível/XP, que pode
    // gravar decaimento por inatividade — só roda para quem tem treino, como antes).
    const [sessionStats, replacementCountResult, userLevelSummary] = await Promise.all([
      getWorkoutSessionStats(supabase, workoutState.sessionFilter),
      supabase
        .from("workout_exercise_replacements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("workout_id", workoutRecord.id),
      // Aplica decaimento por inatividade e retorna resumo do nível.
      // Passa a experiência do quiz para inicializar a fase corretamente na 1ª vez.
      getUserLevelSummary(supabase, user.id, savedAnswers?.experience ?? null).catch(() => null)
    ]);

    // Um programa, vários locais: contagem, último treino e próxima letra valem
    // para TODOS os locais (fez A no condomínio → o próximo é B em qualquer local).
    const hasUnified = standardIdsGet.length > 0;
    const sessionProgress = buildWorkoutSessionProgress({
      totalSessions: workoutState.sessionConfig.totalSessions,
      completedSessions: hasUnified ? unifiedCompletedGet : sessionStats.completedSessions,
      lastCompletedAt: hasUnified ? unifiedLastGet?.completedAt ?? null : sessionStats.lastLog?.completedAt ?? null,
      lastCompletedWorkoutKey: hasUnified ? unifiedLastGet?.workoutKey ?? null : sessionStats.lastLog?.workoutKey ?? null,
      lastCompletedSessionNumber: hasUnified ? (unifiedLastGet ? unifiedCompletedGet : null) : sessionStats.lastLog?.sessionNumber ?? null
    });

    // Processar meta ativa
    let activeGoalData = null;
    if (activeGoalRow) {
      const g = activeGoalRow;
      activeGoalData = {
        id: g.id,
        targetCount: g.target_count,
        periodDays: g.period_days,
        startsAt: g.starts_at,
        endsAt: g.ends_at,
        completedAt: g.completed_at,
        workoutsDone: activeGoalCountResult?.count ?? 0
      };
    }

    // Só premium pode ter mais de um local; garante que o local ativo apareça sempre.
    const availableLocationsSet = new Set<string>(rawAvailableLocations);
    availableLocationsSet.add(answers.location ?? "home");
    const availableLocations = Array.from(availableLocationsSet);

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: true,
        workoutId: workoutRecord.id,
        availableLocations,
        replacementCount: replacementCountResult.count ?? 0,
        totalWorkoutsAllTime,
        totalWeightIncreasesAllTime,
        totalGoalsCompleted: completedGoalsResult.count ?? 0,
        referralAchievementUnlocked: referralAchievementResult.data?.referral_achievement_unlocked === true,
        activeGoal: activeGoalData,
        user: {
          id: user.id,
          name: user.name
        },
        answers: serializeAnswersForResponse(answers),
        diagnosis,
        workout: workoutState.workout,
        sessionProgress,
        // Free: ainda pode montar o 2º programa ao concluir o ciclo? (premium ignora)
        freeCycleRenewalAvailable: hasFreeCycleRenewalAvailable(savedAnswers),
        // Última regeneração pelo perfil (cooldown do plano free na dashboard).
        // Vem junto aqui para a dashboard não precisar chamar /api/profile.
        lastWorkoutGeneratedAt: (() => {
          const value = (savedAnswers as Record<string, unknown> | null)?.lastRegeneratedAt;
          return typeof value === "string" ? value : null;
        })(),
        // Já fechou algum ciclo antes (mantém a conquista "Plano Concluído" após renovar)
        hasCompletedCycleBefore: hasCompletedCycleBefore(savedAnswers),
        // "Minha semana" (Premium): dias escolhidos para treinar (0 = seg … 6 = dom)
        weeklyPlanDays: sanitizeWeekdays((savedAnswers as { weeklyPlanDays?: unknown } | null)?.weeklyPlanDays),
        // Dados de nível/XP — inclui decay aplicado se havia inatividade
        levelData: userLevelSummary
          ? {
              xpPoints:            userLevelSummary.xpPoints,
              currentPhase:        userLevelSummary.currentPhase,
              phaseStartedAt:      userLevelSummary.phaseStartedAt,
              dotProgress:         userLevelSummary.dotProgress,
              isReadyButWaiting:   userLevelSummary.isReadyButWaiting,
              decayRegressed:      userLevelSummary.decayResult?.regressed ?? false,
              decayRegressedPhase: userLevelSummary.decayResult?.regressedPhase ?? false,
              regressionMessage:   userLevelSummary.decayResult?.regressionMessage ?? null,
            }
          : null,
      }
    });
  } catch {
    logError("WORKOUT", "Workout GET unexpected failure", {});
    return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
  }
}

// Converte o nível do programa para o formato de "experiência" do app.
function programLevelToExperience(level: string): Experience {
  if (level === "advanced") return "gt_1_year";
  if (level === "intermediate") return "6_to_12_months";
  return "lt_6_months";
}

// Monta a resposta do GET no "modo programa": entrega a semana do programa no
// formato AppWorkoutPayload que a tela de treino/dashboard já consome.
async function buildProgramWorkoutResponse(
  request: NextRequest,
  userId: string,
  entitlement: { id: string; program_id: string; current_week: number; expires_at: string }
) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
  }

  const [userResult, program] = await Promise.all([
    admin.from("users").select("id, name").eq("id", userId).maybeSingle(),
    getProgramById(admin, entitlement.program_id),
  ]);

  if (!program) {
    logError("WORKOUT", "Programa do entitlement não encontrado", {
      program_id: entitlement.program_id,
    });
    return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
  }

  const requestedWeekParam = request.nextUrl.searchParams.get("week");
  const requestedWeek = requestedWeekParam ? Number(requestedWeekParam) : entitlement.current_week;
  const week = clampProgramWeek(program, requestedWeek);
  const totalWeeks = getProgramTotalWeeks(program);

  // Mapa exercise_id -> video_url a partir do catálogo (cacheado).
  const catalog = await getCachedExerciseCatalog();
  const videoByExerciseId = new Map<string, string | null>();
  for (const exercise of catalog) {
    videoByExerciseId.set(exercise.id, exercise.video_url ?? null);
  }

  const workout = mapProgramWeekToWorkoutPlan(program, week, videoByExerciseId);

  const sessionProgress = buildWorkoutSessionProgress({
    totalSessions: workout.sections.length,
    completedSessions: 0,
    lastCompletedAt: null,
    lastCompletedWorkoutKey: null,
    lastCompletedSessionNumber: null,
  });

  // Mantém a gamificação visível (XP/fase); não altera o conteúdo do programa.
  const userLevelSummary = await getUserLevelSummary(admin, userId, null).catch(() => null);

  const pf = (program.fixed_profile ?? {}) as Record<string, unknown>;
  const answers = {
    goal: pf["goal"],
    days: Number(pf["days"]) || program.sessions_per_week,
    time: Number(pf["time"]) || undefined,
    equipment: Array.isArray(pf["equipment"]) ? (pf["equipment"] as string[]) : [],
    location: pf["location"],
    experience: programLevelToExperience(program.level),
  };

  const weeks = getProgramWeeks(program).map((w, index) => ({
    week: Number(w.week) || index + 1,
    label: w.label ?? `Semana ${index + 1}`,
  }));

  return NextResponse.json({
    success: true,
    data: {
      hasWorkout: true,
      workoutId: entitlement.id,
      replacementCount: 0,
      totalWorkoutsAllTime: 0,
      totalWeightIncreasesAllTime: 0,
      totalGoalsCompleted: 0,
      referralAchievementUnlocked: false,
      activeGoal: null,
      user: {
        id: userId,
        name: userResult.data?.name ?? "Aluno",
      },
      answers,
      workout,
      sessionProgress,
      levelData: userLevelSummary
        ? {
            xpPoints: userLevelSummary.xpPoints,
            currentPhase: userLevelSummary.currentPhase,
            phaseStartedAt: userLevelSummary.phaseStartedAt,
            dotProgress: userLevelSummary.dotProgress,
            isReadyButWaiting: userLevelSummary.isReadyButWaiting,
            decayRegressed: userLevelSummary.decayResult?.regressed ?? false,
            decayRegressedPhase: userLevelSummary.decayResult?.regressedPhase ?? false,
            regressionMessage: userLevelSummary.decayResult?.regressionMessage ?? null,
          }
        : null,
      program: {
        id: program.id,
        slug: program.slug,
        title: program.title,
        currentWeek: week,
        totalWeeks,
        weekLabel: workout.subtitle,
        weeks,
      },
    },
  });
}

export async function POST(request: Request) {
  const { buildWorkoutHash, generateWorkoutWithAI, isOpenAIQuotaError }: WorkoutAiModule = await import("@/lib/workout-ai");
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const body = (await request.json().catch(() => ({}))) as { userId?: string; force?: boolean; location?: unknown };
    const userId = auth.user.id;
    let forceRegenerate = body.force === true;

    if (body.userId && body.userId !== userId) {
      logWarn("AUTH", "Workout generation denied", { user_id: userId });
      return jsonError("Acesso negado.", 403);
    }

    const rateKey = `workout:${userId}:${getRequestFingerprint(request, userId)}`;
    const rateLimit = enforceRateLimit(rateKey, 3, 10 * 60 * 1000);

    if (!rateLimit.allowed) {
      logWarn("AI", "Workout generation rate limited", { user_id: userId });
      return jsonError(RATE_LIMIT_ERROR_MESSAGE, 429);
    }

    const { data: user, error: userError } = await supabase.from("users").select("id, name, created_at").eq("id", userId).maybeSingle();

    if (userError || !user) {
      return jsonError(SESSION_EXPIRED_MESSAGE, 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, user.id);
    if (!savedAnswers) {
      return jsonError(LOAD_ANSWERS_ERROR_MESSAGE, 404);
    }

    const answers = buildRuntimeQuizAnswers(savedAnswers, (user as { created_at?: string | null }).created_at ?? null);

    const workoutUserToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const isPremiumUser = await isPremium(userId, workoutUserToken);

    // "+ Local": geração para um local específico (casa/condomínio). Exclusivo
    // premium. Ajusta o local ATIVO em memória para que catálogo, hash e busca do
    // treino usem esse local, e força a geração (o local novo não tem programa).
    const VALID_GENERATE_LOCATIONS: Location[] = ["home", "condo_gym", "gym"];
    const requestedLocation =
      typeof body.location === "string" && VALID_GENERATE_LOCATIONS.includes(body.location as Location)
        ? (body.location as Location)
        : null;
    if (requestedLocation && isPremiumUser && requestedLocation !== answers.location) {
      answers.location = requestedLocation;
      forceRegenerate = true;
    }

    // ── Trava premium do multi-estilo ───────────────────────────────────────
    // Plano com 2+ estilos distintos é exclusivo Premium. Não-premium é
    // rebaixado para 1 estilo (o primeiro). A trava real fica aqui no backend.
    const requestedStyles = Array.from(
      new Set((answers.trainingStyles ?? []).filter((style) => style && style !== "personal"))
    );
    if (requestedStyles.length >= 2) {
      if (!isPremiumUser) {
        answers.trainingStyles = [requestedStyles[0]];
        logWarn("AI", "Multi-estilo negado (não premium); rebaixado para 1 estilo", {
          user_id: userId,
          requested: requestedStyles
        });
      }
    }

    // ── Nível para geração do treino ────────────────────────────────────────
    // O quiz é a fonte primária. O XP só sobrescreve se a fase evoluiu além
    // do que o quiz indicaria — preservando o filtro de exercícios por nível.
    const levelRow = await getUserLevelSummary(supabase, user.id, savedAnswers.experience ?? null).catch(() => null);
    const effectiveAnswers = levelRow
      ? overrideExperienceFromPhase(answers, levelRow.currentPhase)
      : answers;
    const diagnosis = diagnoseUser(effectiveAnswers);
    const workoutHash = buildWorkoutHash(effectiveAnswers);
    const { data: exercises, error: exercisesError } = await supabase.from("exercises").select("*");

    if (exercisesError) {
      logError("AI", "Exercise catalog load failed", { user_id: userId });
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    const normalizedExercises = ((exercises ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));

    const { data: excludedRows } = await supabase
      .from("user_excluded_exercises")
      .select("exercise_id")
      .eq("user_id", userId);

    const excludedExerciseIds = (excludedRows ?? []).map((row) => row.exercise_id);

    const { data: existingWorkout, error: existingWorkoutError } = await fetchLatestWorkoutRecord(supabase, {
      userId: user.id,
      includeCreatedAt: true,
      scope: "AI",
      // Premium tem um programa por local: busca o existente DO LOCAL ATIVO, para
      // não sobrescrever o programa de outro local ao gerar/regenerar.
      location: isPremiumUser ? effectiveAnswers.location : undefined
    });

    if (existingWorkoutError) {
      logError("AI", "Workout lookup query failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(existingWorkoutError)
      });
      return jsonError(LOAD_WORKOUT_ERROR_MESSAGE, 500);
    }

    const existingWorkoutState = buildExistingWorkoutState({
      workoutRecord: existingWorkout,
      answers,
      diagnosis,
      exerciseLibrary: normalizedExercises,
      userId
    });
    const existingSessionStats = existingWorkoutState
      ? await getWorkoutSessionStats(supabase, existingWorkoutState.sessionFilter)
      : null;
    // Contagem UNIFICADA (soma de todos os locais desde o início do ciclo) para
    // decidir se o ciclo terminou (dispara a regeneração automática abaixo).
    const standardWorkoutsPost = await fetchUserStandardWorkouts(supabase, user.id);
    const cycleStartPost = resolveProgramCycleStart(
      (savedAnswers as { programCycleStartedAt?: string })?.programCycleStartedAt,
      standardWorkoutsPost
    );
    const unifiedCompletedPost = await getUnifiedProgramCompletedCount(
      supabase,
      user.id,
      cycleStartPost,
      standardWorkoutsPost.map((w) => w.id)
    );
    const existingSessionProgress = existingWorkoutState
      ? buildWorkoutSessionProgress({
          totalSessions: existingWorkoutState.sessionConfig.totalSessions,
          // Contagem unificada (todos os locais desde o início do ciclo).
          completedSessions: standardWorkoutsPost.length ? unifiedCompletedPost : existingSessionStats?.completedSessions ?? 0,
          lastCompletedAt: existingSessionStats?.lastLog?.completedAt ?? null,
          lastCompletedWorkoutKey: existingSessionStats?.lastLog?.workoutKey ?? null,
          lastCompletedSessionNumber: existingSessionStats?.lastLog?.sessionNumber ?? null
        })
      : null;

    // ── Renovação de ciclo no Free (até 2 programas) ─────────────────────────
    // Ciclo concluído + free sem renovação disponível → não gera; o app mostra
    // o upsell. Vale também para `force`, senão o limite seria contornável.
    const isRenewingCompletedCycle = Boolean(existingWorkout && existingSessionProgress?.cycleCompleted);
    if (isRenewingCompletedCycle && !isPremiumUser && !hasFreeCycleRenewalAvailable(savedAnswers)) {
      logInfo("AI", "Free cycle renewal limit reached", { user_id: userId });
      return NextResponse.json(
        {
          success: false,
          code: FREE_CYCLE_LIMIT_ERROR_CODE,
          error: "Você já concluiu seus 2 programas gratuitos. Assine o Premium para montar o próximo."
        },
        { status: 403 }
      );
    }

    if (
      !forceRegenerate &&
      existingWorkout &&
      existingWorkoutState &&
      existingWorkout.hash === workoutHash &&
      !existingSessionProgress?.cycleCompleted
    ) {
      logInfo("AI", "Workout cached", { user_id: userId });

      const shouldPersistCurrentPlan =
        existingWorkout.total_sessions !== existingWorkoutState.sessionConfig.totalSessions ||
        !hasWorkoutPlanSessionConfig(existingWorkoutState.normalizedWorkout, existingWorkoutState.sessionConfig);

      if (shouldPersistCurrentPlan) {
        const workoutSaveResult = await saveWorkoutRecord(supabase, {
          userId: user.id,
          existingWorkoutId: existingWorkout.id,
          hash: workoutHash,
          exercises: existingWorkoutState.workout,
          totalSessions: existingWorkoutState.sessionConfig.totalSessions,
          location: effectiveAnswers.location,
          scope: "AI"
        });

        if (workoutSaveResult.error) {
          logError("AI", "Workout save failed", {
            user_id: user.id,
            error_code: getSupabaseErrorCode(workoutSaveResult.error)
          });
          return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
        }
      }

      const sessionLogs = await listWorkoutSessionLogs(supabase, {
        workoutId: existingWorkout.id,
        limit: 180,
        allCycles: true
      });

      return NextResponse.json({
        success: true,
        data: {
          hasWorkout: true,
          user: {
            id: user.id,
            name: user.name
          },
          answers: serializeAnswersForResponse(answers),
          diagnosis,
          workout: existingWorkoutState.workout,
          sessionProgress: existingSessionProgress,
          sessionLogs
        }
      });
    }

    let workout = null as WorkoutPlan | null;

    try {
      logInfo("AI", "Workout generation started", { user_id: userId });

      const { data: feedbackRows } = await supabase
        .from("workout_session_feedbacks")
        .select("liked, intensity_level")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      const _fbRows = feedbackRows ?? [];
      const fbCount = _fbRows.length;
      const avgLiked = fbCount > 0 ? _fbRows.filter((r) => r.liked).length / fbCount : null;
      const avgIntensity = fbCount > 0 ? _fbRows.reduce((s, r) => s + r.intensity_level, 0) / fbCount : null;
      const previousWorkoutSummary = existingWorkoutState?.workout
        ? existingWorkoutState.workout.sections
            .map((s) => `${s.title}:\n${s.exercises.slice(0, 3).map((e) => `  - ${e.name}`).join("\n")}`)
            .join("\n")
        : null;
      const feedbackContext = { avgLiked, avgIntensity, sessionCount: fbCount, previousWorkoutSummary };

      workout = normalizeWorkoutPayload(
        await generateWorkoutWithAI(effectiveAnswers, diagnosis, normalizedExercises, {
          previousWorkout: existingWorkoutState?.workout ?? null,
          lastCompletedWorkoutKey: existingSessionStats?.lastLog?.workoutKey ?? null,
          excludedExerciseIds,
          userId
        }, feedbackContext),
        {
          diagnosis,
          answers: effectiveAnswers
        }
      );
      if (workout) {
        workout = syncWorkoutWithExerciseLibrary(workout, normalizedExercises);
      }
      logInfo("AI", "Workout generation completed", { user_id: userId });
    } catch (error) {
      if (isOpenAIQuotaError(error)) {
        return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 503);
      }

      logError("AI", "Workout generation failed", { user_id: userId });
      return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
    }

    if (!workout) {
      return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
    }

    logInfo("AI", "Workout normalized", {
      user_id: userId,
      section_count: workout.sections.length,
      split_type: workout.splitType ?? null
    });

    const nextWorkoutConfig = {
      ...resolveWorkoutPlanSessionConfig({
        answers,
        workout,
        storedTotalSessions: null,
        fallbackWeeklyFrequency: workout.sessionCount ?? workout.sections.length
      }),
      planCycleId: randomUUID()
    };
    const persistedWorkout = applyWorkoutPlanSessionConfig(workout, nextWorkoutConfig);
    const workoutSaveResult = await saveWorkoutRecord(supabase, {
      userId: user.id,
      existingWorkoutId: existingWorkout?.id ?? null,
      hash: workoutHash,
      exercises: persistedWorkout,
      totalSessions: nextWorkoutConfig.totalSessions,
      location: effectiveAnswers.location,
      createdAt: new Date().toISOString(),
      scope: "AI"
    });

    if (workoutSaveResult.error) {
      logError("AI", "Workout save failed", {
        user_id: user.id,
        error_code: getSupabaseErrorCode(workoutSaveResult.error)
      });
      return jsonError(SAVE_WORKOUT_ERROR_MESSAGE, 500);
    }

    // Persistência pós-geração. Reúne num único save:
    //  - local ativo + marca no conjunto `locations` (importante para "+ Local");
    //  - lastRegeneratedAt (limite de 1x/30 dias no free) quando foi regeneração manual;
    //  - programCycleStartedAt = agora QUANDO regenerou um programa EXISTENTE (força,
    //    mudança de perfil ou ciclo concluído) — reinicia a contagem unificada. Ao
    //    gerar o 1º treino de um NOVO local (+ Local), NÃO reseta (preserva o progresso).
    const regeneratedExisting = Boolean(existingWorkout);
    if (forceRegenerate || regeneratedExisting) {
      const savedLocations = Array.isArray((savedAnswers as { locations?: unknown }).locations)
        ? ((savedAnswers as { locations?: Location[] }).locations as Location[])
        : [];
      const nextLocations = Array.from(new Set<Location>([...savedLocations, effectiveAnswers.location]));
      await saveUserAnswers(supabase, user.id, {
        ...savedAnswers,
        location: effectiveAnswers.location,
        locations: nextLocations,
        ...(forceRegenerate ? { lastRegeneratedAt: new Date().toISOString() } : {}),
        ...(regeneratedExisting ? { programCycleStartedAt: new Date().toISOString() } : {}),
        // Fase no início do ciclo → a celebração sabe se a pessoa subiu de fase no ciclo
        ...(regeneratedExisting && levelRow ? { cycleStartPhase: levelRow.currentPhase } : {}),
        // Conta renovações de ciclo concluído (limite do free: FREE_MAX_CYCLE_RENEWALS)
        ...(isRenewingCompletedCycle
          ? { cycleRenewalsCount: getCycleRenewalsUsed(savedAnswers) + 1, lastCycleCompletedAt: new Date().toISOString() }
          : {})
      } as QuizAnswers & {
        lastRegeneratedAt?: string;
        programCycleStartedAt?: string;
        cycleRenewalsCount?: number;
        lastCycleCompletedAt?: string;
        cycleStartPhase?: string;
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasWorkout: true,
        user: {
          id: user.id,
          name: user.name
        },
        answers: serializeAnswersForResponse(answers),
        diagnosis,
        workout: persistedWorkout,
        sessionProgress: buildWorkoutSessionProgress({
          totalSessions: nextWorkoutConfig.totalSessions,
          completedSessions: 0
        }),
        sessionLogs: []
      }
    });
  } catch {
    logError("AI", "Workout POST unexpected failure", {});
    return jsonError(GENERATE_WORKOUT_ERROR_MESSAGE, 500);
  }
}

function buildExistingWorkoutState(input: {
  workoutRecord: WorkoutRecordRow | null;
  answers: QuizAnswers;
  diagnosis: ReturnType<typeof diagnoseUser>;
  exerciseLibrary: ExerciseRecord[];
  userId: string;
}) {
  if (!input.workoutRecord) {
    return null;
  }

  const normalizedWorkout = normalizeWorkoutSafely(input.workoutRecord.exercises, {
    diagnosis: input.diagnosis,
    answers: input.answers,
    exerciseLibrary: input.exerciseLibrary,
    userId: input.userId,
    workoutId: input.workoutRecord.id
  });

  if (!normalizedWorkout) {
    return null;
  }

  return {
    normalizedWorkout,
    ...resolveWorkoutPlanState({
      workoutRecord: input.workoutRecord,
      workout: normalizedWorkout,
      answers: input.answers
    })
  };
}

function resolveWorkoutPlanState(input: {
  workoutRecord: WorkoutRecordRow;
  workout: WorkoutPlan;
  answers: QuizAnswers;
}) {
  const sessionConfig = resolveWorkoutPlanSessionConfig({
    answers: input.answers,
    workout: input.workout,
    storedTotalSessions: input.workoutRecord.total_sessions,
    fallbackWeeklyFrequency: input.workout.sessionCount ?? input.workout.sections.length
  });

  return {
    workout: applyWorkoutPlanSessionConfig(input.workout, sessionConfig),
    sessionConfig,
    sessionFilter: {
      workoutId: input.workoutRecord.id,
      workoutHash: input.workoutRecord.hash ?? null,
      planCycleId: sessionConfig.planCycleId,
      cycleStartedAt: input.workoutRecord.created_at ?? null
    }
  };
}

/**
 * Sobrescreve o campo `experience` dos answers com o nível derivado da fase XP,
 * MAS SOMENTE se a fase XP for maior que o que o quiz indicaria.
 * Isso preserva o filtro de exercícios por nível do quiz para novos usuários.
 */
function overrideExperienceFromPhase(
  answers: QuizAnswers,
  currentPhase: UserPhase
): QuizAnswers {
  const quizPhase = experienceToInitialPhase(answers.experience);
  const phaseOrder = ["iniciante", "pre_intermediario", "intermediario", "pre_avancado", "avancado"];
  const quizIdx   = phaseOrder.indexOf(quizPhase);
  const xpIdx     = phaseOrder.indexOf(currentPhase);

  // Só sobrescreve se XP evoluiu ALÉM do quiz
  if (xpIdx <= quizIdx) return answers;

  return {
    ...answers,
    experience: phaseToExperience(currentPhase) as Experience,
  };
}

function buildRuntimeQuizAnswers(savedAnswers?: QuizAnswers | null, createdAt?: string | null) {
  return normalizeBodyTypeFields({
    goal: savedAnswers?.goal ?? "lose_weight",
    experience: savedAnswers?.experience ?? "no_training",
    gender: savedAnswers?.gender ?? "male",
    // Idade calculada: data de nascimento primeiro; sem ela, idade base
    // "envelhecida" pela data de cadastro do usuário.
    age: resolveWorkoutAge(savedAnswers, createdAt),
    weight: toNumber(savedAnswers?.weight),
    height: toNumber(savedAnswers?.height),
    profession: typeof savedAnswers?.profession === "string" ? savedAnswers.profession : "",
    situation: savedAnswers?.situation ?? "cant_stay_consistent",
    mindMuscle: savedAnswers?.mindMuscle ?? "sometimes",
    days: toNumber(savedAnswers?.days) || 3,
    time: toNumber(savedAnswers?.time) || 45,
    equipment: Array.isArray(savedAnswers?.equipment) ? savedAnswers.equipment : [],
    structuredPlan: savedAnswers?.structuredPlan ?? "no",
    wrist: savedAnswers?.wrist,
    body_type_raw: savedAnswers?.body_type_raw,
    body_type: savedAnswers?.body_type,
    location: savedAnswers?.location ?? "home",
    locations: Array.isArray(savedAnswers?.locations) ? savedAnswers.locations : undefined,
    focusRegion: savedAnswers?.focusRegion ?? "balanced",
    trainingStyle: savedAnswers?.trainingStyle ?? "personal",
    trainingStyles: Array.isArray(savedAnswers?.trainingStyles) ? savedAnswers.trainingStyles : undefined
  }) as QuizAnswers;
}

function serializeAnswersForResponse(answers: QuizAnswers) {
  return {
    goal: answers.goal,
    gender: answers.gender,
    wrist: answers.wrist,
    body_type_raw: answers.body_type_raw,
    body_type: answers.body_type,
    age: answers.age,
    weight: answers.weight,
    height: answers.height,
    profession: answers.profession,
    location: answers.location,
    locations: answers.locations,
    equipment: answers.equipment,
    time: answers.time,
    days: answers.days,
    experience: answers.experience
  };
}

function normalizeWorkoutSafely(
  rawWorkout: unknown,
  input: {
    diagnosis: ReturnType<typeof diagnoseUser>;
    answers: QuizAnswers;
    exerciseLibrary?: ExerciseRecord[];
    userId: string;
    workoutId?: string | null;
  }
) {
  try {
    const normalizedWorkout = normalizeWorkoutPayload(rawWorkout, {
      diagnosis: input.diagnosis,
      answers: input.answers
    });

    return normalizedWorkout && input.exerciseLibrary?.length
      ? syncWorkoutWithExerciseLibrary(normalizedWorkout, input.exerciseLibrary)
      : normalizedWorkout;
  } catch {
    logWarn("WORKOUT", "Workout payload parsing failed", {
      user_id: input.userId,
      workout_id: input.workoutId ?? null
    });
    return null;
  }
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

async function loadExerciseCatalog(
  supabase: NonNullable<ReturnType<typeof createSupabaseUserClient>>,
  userId: string
) {
  const { data, error } = await supabase.from("exercises").select("*");

  if (error) {
    logWarn("WORKOUT", "Exercise catalog enrichment skipped", {
      user_id: userId,
      error_code: getSupabaseErrorCode(error)
    });
    return [] as ExerciseRecord[];
  }

  return ((data ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
}

// Catálogo de exercícios cacheado por 10 minutos no servidor.
// A tabela "exercises" é gerenciada por admins e raramente muda,
// portanto não faz sentido buscá-la do banco a cada request de usuário.
// Apenas o GET usa este cache — o POST (geração de treino) busca direto do banco.
const getCachedExerciseCatalog = unstable_cache(
  async (): Promise<ExerciseRecord[]> => {
    const adminClient = createSupabaseAdminClient();

    if (!adminClient) {
      return [];
    }

    const { data, error } = await adminClient.from("exercises").select("*");

    if (error) {
      return [];
    }

    return ((data ?? []) as ExerciseRecord[]).map((exercise) => normalizeExerciseRecord(exercise));
  },
  ["exercises-catalog"],
  { revalidate: 600 } // 10 minutos
);
