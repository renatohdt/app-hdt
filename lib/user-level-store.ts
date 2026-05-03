// ─────────────────────────────────────────────────────────────────────────────
// Operações de banco de dados para o sistema de XP e fases.
// Toda a lógica de negócio pura está em lib/user-level.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAdvancePhase,
  checkStreak7Days,
  getDotProgress,
  getISOWeekKey,
  getMonthKey,
  isReadyButWaiting,
  nextPhase,
  experienceToInitialPhase,
  normalizeUserPhase,
  PHASE_UP_ACHIEVEMENTS,
  previousPhase,
  REGRESSION_MESSAGE,
  toDateKey,
  XP_DECAY,
  XP_GAINS,
  XP_THRESHOLD,
  type UserPhase,
  type WorkoutDifficulty,
} from "@/lib/user-level";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type UserLevelRow = {
  xp_points: number;
  current_phase: UserPhase;
  phase_started_at: string;
  last_activity_at: string | null;
  last_perfect_week_at: string | null;
  last_monthly_xp_at: string | null;
  last_streak_xp_at: string | null;
  last_decay_checked_at: string | null;
};

export type XpUpdateResult = {
  prevXp: number;
  newXp: number;
  prevPhase: UserPhase;
  newPhase: UserPhase;
  phasedUp: boolean;
  dotProgress: 0 | 1 | 2 | 3;
  isReadyButWaiting: boolean;
  phaseUpMessage?: { title: string; phrase: string };
};

export type DecayResult = {
  regressed: boolean;
  regressedPhase: boolean;
  regressionMessage: string;
  newXp: number;
  newPhase: UserPhase;
};

// ── Leitura ────────────────────────────────────────────────────────────────

export async function getUserLevelRow(
  supabase: SupabaseClient,
  userId: string
): Promise<UserLevelRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "xp_points, current_phase, phase_started_at, last_activity_at, last_perfect_week_at, last_monthly_xp_at, last_streak_xp_at, last_decay_checked_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    xp_points:            Number(data.xp_points ?? 0),
    current_phase:        normalizeUserPhase(data.current_phase),
    phase_started_at:     data.phase_started_at ?? new Date().toISOString(),
    last_activity_at:     data.last_activity_at ?? null,
    last_perfect_week_at: data.last_perfect_week_at ?? null,
    last_monthly_xp_at:   data.last_monthly_xp_at ?? null,
    last_streak_xp_at:    data.last_streak_xp_at ?? null,
    last_decay_checked_at: data.last_decay_checked_at ?? null,
  };
}

// ── Ganho de XP ao concluir sessão ─────────────────────────────────────────

/**
 * Aplica todos os ganhos de XP ao concluir uma sessão de treino.
 * Verifica bônus de semana perfeita, consistência mensal e streak de 7 dias.
 * Retorna o resultado com nova fase (caso tenha avançado) para o frontend exibir o popup.
 */
export async function applySessionXp(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    completedAt: string;           // ISO string da sessão concluída
    newWeightIncreases: number;    // novos aumentos de carga nesta sessão
    workoutDifficulty?: WorkoutDifficulty | null;
    recentSessionDates: string[];  // datas ISO de sessões anteriores (para streak/semana/mês)
    weeklyTarget: number;          // dias de treino planejados por semana (answers.days)
  }
): Promise<XpUpdateResult | null> {
  const row = await getUserLevelRow(supabase, userId);
  const now = new Date(opts.completedAt);

  const currentXp       = row?.xp_points ?? 0;
  const currentPhase    = row?.current_phase ?? "iniciante";
  const phaseStartedAt  = new Date(row?.phase_started_at ?? now.toISOString());

  let xpGained = XP_GAINS.SESSION;
  const bonusUpdates: Record<string, string> = {};

  // +1 por aumento de carga (máximo 5 por sessão)
  if (opts.newWeightIncreases > 0) {
    xpGained += Math.min(opts.newWeightIncreases, 5) * XP_GAINS.WEIGHT_INCREASE;
  }

  // +2 se o treino foi avaliado como muito fácil
  if (opts.workoutDifficulty === "muito_facil") {
    xpGained += XP_GAINS.EASY_FEEDBACK;
  }

  // Bônus de semana perfeita (+5)
  const currentWeekKey  = getISOWeekKey(now);
  const lastWeekKey     = row?.last_perfect_week_at ? getISOWeekKey(new Date(row.last_perfect_week_at)) : null;
  if (lastWeekKey !== currentWeekKey && opts.weeklyTarget > 0) {
    const sessionsThisWeek =
      opts.recentSessionDates.filter((d) => getISOWeekKey(new Date(d)) === currentWeekKey).length + 1;
    if (sessionsThisWeek >= opts.weeklyTarget) {
      xpGained += XP_GAINS.PERFECT_WEEK;
      bonusUpdates.last_perfect_week_at = now.toISOString();
    }
  }

  // Bônus de consistência mensal (+3, se ≥50% das sessões planejadas)
  const currentMonthKey = getMonthKey(now);
  const lastMonthKey    = row?.last_monthly_xp_at ? getMonthKey(new Date(row.last_monthly_xp_at)) : null;
  if (lastMonthKey !== currentMonthKey) {
    const sessionsThisMonth =
      opts.recentSessionDates.filter((d) => getMonthKey(new Date(d)) === currentMonthKey).length + 1;
    const monthlyTarget = opts.weeklyTarget * 4;
    if (sessionsThisMonth >= Math.ceil(monthlyTarget * 0.5)) {
      xpGained += XP_GAINS.MONTHLY_CONSISTENCY;
      bonusUpdates.last_monthly_xp_at = now.toISOString();
    }
  }

  // Bônus de streak de 7 dias (+5, bloqueado por 7 dias após a última concessão)
  const lastStreakAt = row?.last_streak_xp_at ? new Date(row.last_streak_xp_at) : null;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  if (!lastStreakAt || lastStreakAt < sevenDaysAgo) {
    const allDates = [...opts.recentSessionDates, opts.completedAt];
    if (checkStreak7Days(allDates)) {
      xpGained += XP_GAINS.STREAK_7_DAYS;
      bonusUpdates.last_streak_xp_at = now.toISOString();
    }
  }

  let newXp    = currentXp + xpGained;
  let newPhase = currentPhase;
  let phasedUp = false;

  // Verifica se avança de fase
  if (canAdvancePhase(currentPhase, newXp, phaseStartedAt)) {
    const next = nextPhase(currentPhase);
    if (next) {
      newPhase = next;
      newXp    = 0;
      phasedUp = true;
    }
  }

  const { error } = await supabase
    .from("users")
    .update({
      xp_points:        newXp,
      current_phase:    newPhase,
      last_activity_at: now.toISOString(),
      ...(phasedUp ? { phase_started_at: now.toISOString() } : {}),
      ...bonusUpdates,
    })
    .eq("id", userId);

  if (error) return null;

  const newPhaseStartedAt = phasedUp ? now : phaseStartedAt;

  return {
    prevXp:            currentXp,
    newXp,
    prevPhase:         currentPhase,
    newPhase,
    phasedUp,
    dotProgress:       getDotProgress(newXp),
    isReadyButWaiting: isReadyButWaiting(newPhase, newXp, newPhaseStartedAt),
    phaseUpMessage:    phasedUp ? PHASE_UP_ACHIEVEMENTS[newPhase] : undefined,
  };
}

// ── Decaimento por inatividade ─────────────────────────────────────────────

/**
 * Verifica e aplica decaimento de XP/fase por inatividade.
 * Executado no carregamento do dashboard, no máximo 1× por dia.
 * Retorna null se não houve nenhuma mudança.
 */
export async function applyInactivityDecay(
  supabase: SupabaseClient,
  userId: string
): Promise<DecayResult | null> {
  const row = await getUserLevelRow(supabase, userId);
  if (!row?.last_activity_at) return null;

  const now          = new Date();
  const lastActivity = new Date(row.last_activity_at);

  const daysSinceActivity = Math.floor(
    (now.getTime() - lastActivity.getTime()) / 86_400_000
  );

  // Dentro do período de graça — nenhum decaimento
  if (daysSinceActivity < XP_DECAY.GRACE_PERIOD_DAYS) return null;

  // Verifica se já rodou hoje para não aplicar duas vezes
  if (row.last_decay_checked_at) {
    const lastCheck = new Date(row.last_decay_checked_at);
    if (toDateKey(lastCheck) === toDateKey(now)) return null;
  }

  const currentXp    = row.xp_points;
  const currentPhase = row.current_phase;
  let newXp          = currentXp;
  let newPhase       = currentPhase;
  let regressedPhase = false;

  if (daysSinceActivity >= XP_DECAY.PHASE_DROP_DAYS) {
    // Queda de fase completa
    const prev = previousPhase(currentPhase);
    if (prev) {
      newPhase       = prev;
      newXp          = Math.floor(XP_THRESHOLD * 0.7); // começa na fase anterior com 70% dos pontos
      regressedPhase = true;
    }
  } else {
    // Decaimento semanal após o período de graça
    const decayStartDate  = new Date(lastActivity.getTime() + XP_DECAY.GRACE_PERIOD_DAYS * 86_400_000);
    const lastDecayBase   = row.last_decay_checked_at
      ? new Date(row.last_decay_checked_at)
      : decayStartDate;
    const fromDate        = lastDecayBase > decayStartDate ? lastDecayBase : decayStartDate;
    const daysSinceFrom   = Math.max(0, Math.floor((now.getTime() - fromDate.getTime()) / 86_400_000));
    const weeksToDecay    = Math.floor(daysSinceFrom / 7);

    if (weeksToDecay > 0) {
      newXp = Math.max(0, currentXp - weeksToDecay * XP_DECAY.WEEKLY_LOSS);
    }
  }

  const changed = newXp !== currentXp || newPhase !== currentPhase;

  // Sempre atualiza last_decay_checked_at (evita verificar várias vezes no mesmo dia)
  await supabase
    .from("users")
    .update({
      xp_points:             newXp,
      current_phase:         newPhase,
      last_decay_checked_at: now.toISOString(),
      ...(regressedPhase ? { phase_started_at: now.toISOString() } : {}),
    })
    .eq("id", userId);

  if (!changed) return null;

  return {
    regressed:        true,
    regressedPhase,
    regressionMessage: REGRESSION_MESSAGE,
    newXp,
    newPhase,
  };
}

// ── Leitura pública do nível (para o payload do dashboard) ─────────────────

export type UserLevelSummary = {
  xpPoints: number;
  currentPhase: UserPhase;
  phaseStartedAt: string;
  dotProgress: 0 | 1 | 2 | 3;
  isReadyButWaiting: boolean;
  decayResult: DecayResult | null;
};

/**
 * Lê e retorna o resumo de nível do usuário.
 * Aplica decaimento se necessário e retorna tudo em uma só chamada.
 *
 * @param quizExperience - Valor do campo `experience` do quiz.
 *   Usado APENAS na primeira vez (xp=0, fase=iniciante) para inicializar
 *   a fase corretamente. O quiz continua sendo a fonte para o primeiro treino.
 */
export async function getUserLevelSummary(
  supabase: SupabaseClient,
  userId: string,
  quizExperience?: string | null
): Promise<UserLevelSummary> {
  // Aplica decaimento (no-op se não for necessário)
  const decayResult = await applyInactivityDecay(supabase, userId);

  // Lê estado atual (pós-decay)
  let row = await getUserLevelRow(supabase, userId);

  // ── Inicialização pela experiência do quiz ────────────────────────────────
  // Se o usuário nunca teve XP (novo no sistema) e o quiz indica nível maior
  // que iniciante, corrige a fase inicial sem esperar progressão.
  if (row && row.xp_points === 0 && row.current_phase === "iniciante" && quizExperience) {
    const initialPhase = experienceToInitialPhase(quizExperience);
    if (initialPhase !== "iniciante") {
      await supabase
        .from("users")
        .update({ current_phase: initialPhase, phase_started_at: new Date().toISOString() })
        .eq("id", userId);
      row = { ...row, current_phase: initialPhase };
    }
  }

  const xpPoints       = row?.xp_points ?? 0;
  const currentPhase   = row?.current_phase ?? "iniciante";
  const phaseStartedAt = row?.phase_started_at ?? new Date().toISOString();

  return {
    xpPoints,
    currentPhase,
    phaseStartedAt,
    dotProgress:       getDotProgress(xpPoints),
    isReadyButWaiting: isReadyButWaiting(currentPhase, xpPoints, new Date(phaseStartedAt)),
    decayResult,
  };
}
