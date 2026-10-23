// ─────────────────────────────────────────────────────────────────────────────
// Dicas do Renato — o "personal virtual" orientando o aluno (Renato, out/2026)
//
// Onde aparecem (100% grátis):
//  • Ao tocar em "Iniciar treino": UM card com a dica mais importante do momento.
//  • Dentro do exercício, com o treino em andamento: dica de aumentar/diminuir carga.
//
// Prioridade do card (só a primeira válida aparece):
//   1. Volta depois de pausa (segurança)
//   2. Anote a carga · 3. Ajustar a semana · 4. Treino pulado · 5. Treino pela metade (educação)
//   6. Evolução de força · 7. Reta final do programa (motivação)
// Cada dica mostrada fica escondida por 14 dias (controle no aparelho).
//
// Para mudar um texto ou um limite, é só editar aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { getWeekKey } from "@/lib/user-level";

/** Equipamentos em que faz sentido sugerir ajuste de carga. */
export const LOAD_EQUIPMENT = ["machine", "halteres", "kettlebell"];
/** Quantas repetições acima/abaixo do planejado contam como "fora". */
export const REPS_TOLERANCE = 2;
/** Treinos seguidos fora do planejado para sugerir ajuste de carga. */
export const LOAD_SESSIONS_IN_A_ROW = 2;
/** Dias que uma dica fica escondida depois de aparecer. */
export const SNOOZE_DAYS = 14;
const COMEBACK_DAYS = 10;
const WEEKS_MISSING_TARGET = 3;
const SKIPS_TO_WARN = 2;
const HALF_SESSIONS_IN_A_ROW = 3;
const NO_LOAD_SESSIONS_IN_A_ROW = 3;
const STRENGTH_GAIN_PCT = 20;

export type CoachTip = {
  /** Identificador estável (usado para esconder por 14 dias). */
  id: string;
  kind:
    | "comeback"
    | "log_weight"
    | "weekly_target"
    | "skipped_workout"
    | "half_workout"
    | "strength_gain"
    | "final_stretch"
    | "load_increase"
    | "load_decrease";
  title: string;
  text: string;
  action?: { label: string; href: string };
};

export type CoachSessionLog = {
  id: string;
  workoutKey: string | null;
  completedAt: string;
  planCycleId: string | null;
  completionRatio: number | null;
};

export type CoachWeightLog = {
  sessionLogId: string | null;
  exerciseNameNormalized: string;
  completedAt: string;
  maxWeightKg: number;
  sets: { reps: string; completed: boolean }[];
};

export type CoachExercise = {
  name: string;
  nameNormalized: string;
  /** Repetições planejadas, ex.: "12" (vazio/"30s" = sem regra de carga). */
  reps: string;
  /** Equipamentos do catálogo. */
  equipment: string[];
};

export type CoachInput = {
  now: Date;
  firstName: string | null;
  sessions: CoachSessionLog[];
  weightLogs: CoachWeightLog[];
  /** Exercícios do treino que vai começar. */
  exercises: CoachExercise[];
  workoutOrder: string[];
  weeklyTarget: number;
  remainingSessions: number | null;
  /** Premium com "Minha semana": a ordem é do planejador, não vale "treino pulado". */
  followsWeeklyPlan: boolean;
};

const PROFILE_TRAINING_HREF = "/perfil?editar=treino";

// ── Textos ───────────────────────────────────────────────────────────────────

function hello(firstName: string | null) {
  return firstName ? `${firstName}, ` : "";
}

export const COACH_COPY = {
  comeback: (): Omit<CoachTip, "id" | "kind"> => ({
    title: "Que bom te ver de volta!",
    text: "Comece com carga menor ou diminua as séries/repetições. O corpo agradece e você volta ao ritmo rapidinho, sem risco de machucar."
  }),
  logWeight: (): Omit<CoachTip, "id" | "kind"> => ({
    title: "Anote a carga!",
    text: "Eu consigo entender melhor como está a sua força e a sua evolução para os próximos treinos."
  }),
  weeklyTarget: (): Omit<CoachTip, "id" | "kind"> => ({
    title: "Vamos ajustar sua semana?",
    text: "Talvez seja interessante você alterar a quantidade de treinos na semana. Te proponho treinos mais bem equilibrados, e você não fica tanto tempo sem estímulo para um grupo muscular. Um plano que cabe na sua rotina rende mais que um plano perfeito que não acontece.",
    action: { label: "Ajustar dias de treino", href: PROFILE_TRAINING_HREF }
  }),
  skippedWorkout: (): Omit<CoachTip, "id" | "kind"> => ({
    title: "Não deixe nenhum treino para trás",
    text: "É importante treinar todos os grupos musculares. Pular treino pode provocar desequilíbrio muscular. Ajuste seu perfil para dar ênfase no músculo que você quer treinar mais, e eu monto um treino mais focado.",
    action: { label: "Ajustar foco do treino", href: PROFILE_TRAINING_HREF }
  }),
  halfWorkout: (): Omit<CoachTip, "id" | "kind"> => ({
    title: "Seu treino está ficando pela metade",
    text: "Quer ajustar o tempo disponível no perfil? Eu monto um treino que cabe no seu dia.",
    action: { label: "Ajustar tempo de treino", href: PROFILE_TRAINING_HREF }
  }),
  strengthGain: (exercise: string, pct: number): Omit<CoachTip, "id" | "kind"> => ({
    title: "Você está mais forte!",
    text: `Sua carga em ${exercise} subiu ${pct}% desde o começo do programa. Isso é resultado!`
  }),
  finalStretch: (remaining: number): Omit<CoachTip, "id" | "kind"> => ({
    title: "Reta final do programa!",
    text:
      remaining === 1
        ? "Falta 1 sessão para o seu programa novo. Bora fechar com chave de ouro!"
        : `Faltam ${remaining} sessões para o seu programa novo. Bora fechar com chave de ouro!`
  }),
  loadIncrease: (firstName: string | null): Omit<CoachTip, "id" | "kind"> => ({
    title: "Vamos aumentar essa carga?",
    text: `${hello(firstName)}esse peso está fácil para você: nos últimos treinos você passou das repetições planejadas. As últimas repetições precisam ser difíceis, sem perder a postura.`
  }),
  loadDecrease: (firstName: string | null): Omit<CoachTip, "id" | "kind"> => ({
    title: "Que tal baixar um pouco a carga?",
    text: `${hello(firstName)}acho que seria interessante você baixar a carga para manter dentro das repetições propostas. Elas são importantes para a sua evolução.`
  })
};

// ── Regras auxiliares ────────────────────────────────────────────────────────

/** "12" → {min:12,max:12}; "10-12" ou "10 a 12" → {10,12}; tempo ("30s") → null. */
export function parsePlannedReps(reps: string): { min: number; max: number } | null {
  const value = (reps ?? "").trim().toLowerCase();
  const range = value.match(/^(\d{1,3})\s*(?:-|a|–)\s*(\d{1,3})$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min > 0 && max >= min ? { min, max } : null;
  }
  const single = value.match(/^(\d{1,3})$/);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? { min: n, max: n } : null;
  }
  return null;
}

export function usesLoadEquipment(equipment: string[]) {
  return equipment.some((item) => LOAD_EQUIPMENT.includes(item));
}

/** Exercício que exige carga (não tem opção com peso do corpo). */
function requiresLoad(equipment: string[]) {
  return usesLoadEquipment(equipment) && !equipment.includes("bodyweight");
}

function completedReps(log: CoachWeightLog) {
  return log.sets
    .filter((set) => set.completed)
    .map((set) => Number(String(set.reps ?? "").trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Sugestão de carga de UM exercício, a partir dos últimos registros dele. */
export function evaluateLoad(
  exercise: CoachExercise,
  logs: CoachWeightLog[]
): "increase" | "decrease" | null {
  if (!usesLoadEquipment(exercise.equipment)) return null;
  const planned = parsePlannedReps(exercise.reps);
  if (!planned) return null;
  const recent = logs
    .filter((log) => log.exerciseNameNormalized === exercise.nameNormalized && log.maxWeightKg > 0)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, LOAD_SESSIONS_IN_A_ROW);
  if (recent.length < LOAD_SESSIONS_IN_A_ROW) return null;

  const repsPerLog = recent.map(completedReps);
  if (repsPerLog.some((reps) => reps.length === 0)) return null;

  const allAbove = repsPerLog.every((reps) => reps.every((n) => n >= planned.max + REPS_TOLERANCE));
  if (allAbove) return "increase";

  const halfBelow = repsPerLog.every(
    (reps) => reps.filter((n) => n <= planned.min - REPS_TOLERANCE).length >= Math.ceil(reps.length / 2)
  );
  if (halfBelow) return "decrease";
  return null;
}

// ── Card ao iniciar o treino ─────────────────────────────────────────────────

/** Todas as dicas válidas agora, em ordem de prioridade (o app mostra a 1ª não escondida). */
export function evaluateSessionTips(input: CoachInput): CoachTip[] {
  const tips: CoachTip[] = [];
  const sessions = [...input.sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  if (!sessions.length) return tips; // 1º treino: quem orienta são as dicas guiadas
  const now = input.now.getTime();
  const lastSession = sessions[0]!;
  const daysSinceLast = (now - new Date(lastSession.completedAt).getTime()) / 86_400_000;

  // 1. Volta depois de pausa
  if (daysSinceLast >= COMEBACK_DAYS) {
    tips.push({ id: `comeback:${lastSession.id}`, kind: "comeback", ...COACH_COPY.comeback() });
  }

  // 2. Anote a carga: últimos 3 treinos sem nenhuma carga anotada, e hoje tem exercício com carga
  const todayNeedsLoad = input.exercises.some((exercise) => requiresLoad(exercise.equipment));
  if (todayNeedsLoad && sessions.length >= NO_LOAD_SESSIONS_IN_A_ROW) {
    const lastIds = new Set(sessions.slice(0, NO_LOAD_SESSIONS_IN_A_ROW).map((s) => s.id));
    const anyLogged = input.weightLogs.some((log) => log.sessionLogId && lastIds.has(log.sessionLogId));
    if (!anyLogged) tips.push({ id: "log_weight", kind: "log_weight", ...COACH_COPY.logWeight() });
  }

  // 3. Meta semanal: 3 semanas completas seguidas abaixo dos dias planejados
  const firstSession = sessions[sessions.length - 1]!;
  const weeksOfHistory = (now - new Date(firstSession.completedAt).getTime()) / (7 * 86_400_000);
  if (input.weeklyTarget > 0 && weeksOfHistory >= WEEKS_MISSING_TARGET + 1) {
    const sessionsByWeek = new Map<string, number>();
    for (const s of sessions) {
      const key = getWeekKey(new Date(s.completedAt));
      sessionsByWeek.set(key, (sessionsByWeek.get(key) ?? 0) + 1);
    }
    let missed = 0;
    for (let i = 1; i <= WEEKS_MISSING_TARGET; i++) {
      const key = getWeekKey(new Date(now - i * 7 * 86_400_000));
      if ((sessionsByWeek.get(key) ?? 0) < input.weeklyTarget) missed++;
    }
    if (missed === WEEKS_MISSING_TARGET) {
      tips.push({ id: "weekly_target", kind: "weekly_target", ...COACH_COPY.weeklyTarget() });
    }
  }

  // 4. Treino pulado: a mesma letra pulada 2+ vezes no ciclo atual
  const order = input.workoutOrder;
  const cycleId = lastSession.planCycleId;
  if (!input.followsWeeklyPlan && order.length >= 2) {
    const cycle = sessions
      .filter((s) => s.planCycleId === cycleId)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    const skips = new Map<string, number>();
    let expected: number | null = null;
    for (const s of cycle) {
      const idx = s.workoutKey ? order.indexOf(s.workoutKey) : -1;
      if (idx < 0) continue; // Treino Extra e afins
      if (expected !== null && idx !== expected) {
        let cursor: number = expected;
        let guard = 0;
        while (cursor !== idx && guard < order.length) {
          const letter = order[cursor]!;
          skips.set(letter, (skips.get(letter) ?? 0) + 1);
          cursor = (cursor + 1) % order.length;
          guard++;
        }
      }
      expected = (idx + 1) % order.length;
    }
    if (Array.from(skips.values()).some((count) => count >= SKIPS_TO_WARN)) {
      tips.push({ id: `skipped_workout:${cycleId ?? "ciclo"}`, kind: "skipped_workout", ...COACH_COPY.skippedWorkout() });
    }
  }

  // 5. Treino pela metade: últimos 3 com menos de 50% feito
  const withRatio = sessions.filter((s) => typeof s.completionRatio === "number").slice(0, HALF_SESSIONS_IN_A_ROW);
  if (withRatio.length === HALF_SESSIONS_IN_A_ROW && withRatio.every((s) => (s.completionRatio ?? 1) < 0.5)) {
    tips.push({ id: "half_workout", kind: "half_workout", ...COACH_COPY.halfWorkout() });
  }

  // 6. Evolução de força: +20% de carga num exercício de hoje desde o início do ciclo
  const cycleStart = sessions
    .filter((s) => s.planCycleId === cycleId)
    .reduce((min, s) => (s.completedAt < min ? s.completedAt : min), lastSession.completedAt);
  let best: { name: string; pct: number } | null = null;
  for (const exercise of input.exercises) {
    if (!usesLoadEquipment(exercise.equipment)) continue;
    const logs = input.weightLogs
      .filter((log) => log.exerciseNameNormalized === exercise.nameNormalized && log.completedAt >= cycleStart && log.maxWeightKg > 0)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    if (logs.length < 2) continue;
    const pct = Math.round((logs[logs.length - 1]!.maxWeightKg / logs[0]!.maxWeightKg - 1) * 100);
    if (pct >= STRENGTH_GAIN_PCT && (!best || pct > best.pct)) best = { name: exercise.name, pct };
  }
  if (best) {
    tips.push({
      id: `strength_gain:${cycleId ?? "ciclo"}:${best.name}`,
      kind: "strength_gain",
      ...COACH_COPY.strengthGain(best.name, best.pct)
    });
  }

  // 7. Reta final do programa
  if (input.remainingSessions === 1 || input.remainingSessions === 2) {
    tips.push({
      id: `final_stretch:${cycleId ?? "ciclo"}:${input.remainingSessions}`,
      kind: "final_stretch",
      ...COACH_COPY.finalStretch(input.remainingSessions)
    });
  }

  return tips;
}

/** Dicas de carga por exercício (chave = nome normalizado). */
export function evaluateExerciseTips(input: CoachInput): Record<string, CoachTip> {
  const result: Record<string, CoachTip> = {};
  for (const exercise of input.exercises) {
    const verdict = evaluateLoad(exercise, input.weightLogs);
    if (!verdict) continue;
    const copy = verdict === "increase" ? COACH_COPY.loadIncrease(input.firstName) : COACH_COPY.loadDecrease(input.firstName);
    result[exercise.nameNormalized] = {
      id: `load_${verdict}:${exercise.nameNormalized}`,
      kind: verdict === "increase" ? "load_increase" : "load_decrease",
      ...copy
    };
  }
  return result;
}
