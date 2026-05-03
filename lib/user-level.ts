// ─────────────────────────────────────────────────────────────────────────────
// Sistema de XP e fases de evolução do usuário
//
// Fases visuais (5):  iniciante → pre_intermediario → intermediario → pre_avancado → avancado
// Níveis de treino (3): beginner | intermediate | advanced
//
// Regra de avanço: XP >= 250 E tempo na fase >= 6 meses → avança, XP zera
// Regra de recuo:  >= 2 sem sem treinar → −2 XP/semana | >= 60 dias → −1 fase
// ─────────────────────────────────────────────────────────────────────────────

import type { TrainingLevel } from "@/lib/workout-strategy";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type UserPhase =
  | "iniciante"
  | "pre_intermediario"
  | "intermediario"
  | "pre_avancado"
  | "avancado";

export type WorkoutDifficulty = "muito_facil" | "adequado" | "muito_dificil";

// ── Constantes ─────────────────────────────────────────────────────────────

/** XP necessário para poder avançar de fase (após o portão de 6 meses). */
export const XP_THRESHOLD = 250;

/** Tempo mínimo em meses que o usuário deve ficar em cada fase. */
export const MIN_PHASE_MONTHS = 6;

/** Ordem das fases — do menor para o maior nível. */
export const PHASE_ORDER: UserPhase[] = [
  "iniciante",
  "pre_intermediario",
  "intermediario",
  "pre_avancado",
  "avancado",
];

/** Rótulos exibidos ao usuário. */
export const PHASE_LABELS: Record<UserPhase, string> = {
  iniciante:         "Iniciante",
  pre_intermediario: "Pré-Intermediário",
  intermediario:     "Intermediário",
  pre_avancado:      "Pré-Avançado",
  avancado:          "Avançado",
};

/** Ganhos de XP por ação. */
export const XP_GAINS = {
  SESSION:             2,  // sessão concluída
  PERFECT_WEEK:        5,  // bateu todas as sessões planejadas na semana
  MONTHLY_CONSISTENCY: 3,  // ≥50% das sessões planejadas no mês
  WEIGHT_INCREASE:     1,  // aumento de carga em um exercício (por exercício, máx. 5)
  EASY_FEEDBACK:       2,  // avaliação "muito fácil" no treino
  STREAK_7_DAYS:       5,  // 7 dias consecutivos (por ocorrência, bloqueado por 7 dias)
} as const;

/** Parâmetros de decaimento por inatividade. */
export const XP_DECAY = {
  GRACE_PERIOD_DAYS:  14,  // dias sem treinar antes de começar a perder XP
  WEEKLY_LOSS:         2,  // XP perdido por semana de inatividade (após grace period)
  PHASE_DROP_DAYS:    60,  // dias de inatividade para cair uma fase completa
} as const;

/** Thresholds internos dos 3 pontinhos de progresso. */
const DOT_THRESHOLDS = [1, 84, 167] as const; // 0-83 = 0, 1-83 = 1, 84-166 = 2, 167+ = 3

// ── Mensagens ──────────────────────────────────────────────────────────────

export const PHASE_UP_ACHIEVEMENTS: Partial<Record<UserPhase, { title: string; phrase: string }>> = {
  pre_intermediario: {
    title:  "Pré-Intermediário Desbloqueado!",
    phrase: "Pra cima! De suor e lágrima se faz um campeão!",
  },
  intermediario: {
    title:  "Intermediário Desbloqueado!",
    phrase: "Agora o jogo ficou sério! Você está preparado? Eu também não.",
  },
  pre_avancado: {
    title:  "Pré-Avançado Desbloqueado!",
    phrase: "Estou tão feliz por você!",
  },
  avancado: {
    title:  "Avançado Desbloqueado!",
    phrase: "Haaaaa agora você é faixa preta! Parabéns!",
  },
};

export const REGRESSION_MESSAGE =
  "Você sumiu, seu nível caiu! Espero que você não esteja treinando com outro app... hunf";

export const ALMOST_THERE_MESSAGE =
  "Falta pouco para evoluir! Continue o bom trabalho!";

// ── Funções puras ──────────────────────────────────────────────────────────

/**
 * Converte o campo `experience` do quiz para a fase XP inicial do usuário.
 * Usado apenas na PRIMEIRA vez que o sistema de XP é ativado para o usuário.
 * O quiz continua sendo a fonte de verdade para a GERAÇÃO do primeiro treino.
 */
export function experienceToInitialPhase(experience?: string | null): UserPhase {
  if (!experience || experience === "no_training" || experience === "lt_6_months") {
    return "iniciante";
  }
  if (experience === "6_to_12_months") {
    return "pre_intermediario";
  }
  // gt_1_year → começa no intermediário
  return "intermediario";
}

/**
 * Mapeia a fase XP para a string de experience que a IA entende.
 * Só sobrescreve o quiz quando o XP é MAIS ALTO que o quiz indicaria.
 */
export function phaseToExperience(phase: UserPhase): string {
  if (phase === "iniciante" || phase === "pre_intermediario") return "6_to_12_months"; // beginner/false_intermediate
  if (phase === "intermediario") return "gt_1_year";                                  // stagnated
  return "gt_1_year";                                                                  // pre_avancado/avancado
}

/**
 * Mapeia a fase visual para o nível que a IA usa na geração do treino.
 * Pré-fases recebem o mesmo nível da fase base — sem diferença para a IA.
 */
export function phaseToTrainingLevel(phase: UserPhase): TrainingLevel {
  if (phase === "iniciante" || phase === "pre_intermediario") return "beginner";
  if (phase === "intermediario") return "intermediate";
  return "advanced"; // pre_avancado | avancado
}

/** Próxima fase na ordem, ou null se já estiver na última. */
export function nextPhase(phase: UserPhase): UserPhase | null {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 && idx < PHASE_ORDER.length - 1
    ? (PHASE_ORDER[idx + 1] ?? null)
    : null;
}

/** Fase anterior na ordem, ou null se já estiver na primeira. */
export function previousPhase(phase: UserPhase): UserPhase | null {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx > 0 ? (PHASE_ORDER[idx - 1] ?? null) : null;
}

/**
 * Quantos dots (0–3) devem estar acesos dado o XP atual.
 * Os três pontos acendem em ~33%, ~66% e 100% do threshold.
 */
export function getDotProgress(xpPoints: number): 0 | 1 | 2 | 3 {
  if (xpPoints >= DOT_THRESHOLDS[2]) return 3;
  if (xpPoints >= DOT_THRESHOLDS[1]) return 2;
  if (xpPoints >= DOT_THRESHOLDS[0]) return 1;
  return 0;
}

/**
 * Retorna true se o usuário pode avançar de fase agora:
 * XP >= threshold E tempo na fase >= 6 meses.
 */
export function canAdvancePhase(
  phase: UserPhase,
  xpPoints: number,
  phaseStartedAt: Date
): boolean {
  if (phase === "avancado") return false;
  return xpPoints >= XP_THRESHOLD && monthsDiff(phaseStartedAt, new Date()) >= MIN_PHASE_MONTHS;
}

/**
 * Retorna true se o usuário já tem XP suficiente mas ainda não completou
 * os 6 meses obrigatórios na fase. Usado para exibir o balãozinho motivacional.
 */
export function isReadyButWaiting(
  phase: UserPhase,
  xpPoints: number,
  phaseStartedAt: Date
): boolean {
  if (phase === "avancado") return false;
  return (
    xpPoints >= XP_THRESHOLD &&
    monthsDiff(phaseStartedAt, new Date()) < MIN_PHASE_MONTHS
  );
}

/** Normaliza uma string para UserPhase, com fallback para "iniciante". */
export function normalizeUserPhase(value?: string | null): UserPhase {
  if (value && (PHASE_ORDER as string[]).includes(value)) {
    return value as UserPhase;
  }
  return "iniciante";
}

// ── Helpers de data ────────────────────────────────────────────────────────

/** Diferença em meses completos entre duas datas. */
function monthsDiff(start: Date, end: Date): number {
  const y = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  const d = end.getDate() - start.getDate();
  return Math.max(0, y * 12 + m + (d < 0 ? -1 : 0));
}

/** Chave ISO da semana: "2026-W18" */
export function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - day + 3);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round((d.getTime() - jan4.getTime()) / 604_800_000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Chave do mês: "2026-05" */
export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Data no formato "YYYY-MM-DD" */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Verifica se há pelo menos 7 dias DISTINTOS consecutivos no array de datas.
 * Recebe strings ISO (pode conter horário — usa apenas a parte da data).
 */
export function checkStreak7Days(isoDates: string[]): boolean {
  if (isoDates.length < 7) return false;
  const daySet = new Set(isoDates.map((d) => toDateKey(new Date(d))));
  const sorted = Array.from(daySet).sort();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] as string);
    const curr = new Date(sorted[i] as string);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      streak++;
      if (streak >= 7) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}
