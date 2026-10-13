"use client";

// Lembretes que aparecem DENTRO do popup de "Treino Concluído", conforme o total
// de treinos concluídos da pessoa (desde o cadastro):
//
//   6º treino → Indique e Ganhe   (só plano free: Premium não ganha nada indicando)
//   7º treino → Avaliar na loja   (só dentro do app Android / iOS liberado)
//   8º treino → Redes sociais     (todo mundo, inclusive Premium)
//
// Cada lembrete aparece UMA vez por aparelho (fica marcado no localStorage).
// Quem já passou desses números (ex.: 20 treinos) vê os lembretes que ainda não
// viu, um por treino concluído, na ordem acima. Assim os usuários antigos também
// recebem, sem empilhar tudo de uma vez.

import { canAskStoreReview } from "@/lib/app-review";

export type WorkoutMilestone = "referral" | "review" | "social";

type MilestoneRule = {
  id: WorkoutMilestone;
  atWorkout: number;
  freeOnly?: boolean;
  nativeReviewOnly?: boolean;
};

export const WORKOUT_MILESTONES: MilestoneRule[] = [
  { id: "referral", atWorkout: 6, freeOnly: true },
  { id: "review", atWorkout: 7, nativeReviewOnly: true },
  { id: "social", atWorkout: 8 },
];

const SEEN_KEY_PREFIX = "workout_milestone_seen_";

function wasSeen(id: WorkoutMilestone): boolean {
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + id) !== null;
  } catch {
    // sem localStorage não dá pra garantir "uma vez só": melhor não mostrar
    return true;
  }
}

function markSeen(id: WorkoutMilestone) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + id, new Date().toISOString());
  } catch {
    // ignora
  }
}

/**
 * Escolhe (no máximo) um lembrete para o treino que acabou de ser concluído e já
 * o marca como visto. Devolve null quando não há nada a mostrar.
 *
 * `isPremium` = null quando a assinatura ainda está carregando: nesse caso o
 * Indique e Ganhe (só free) fica para o próximo treino.
 */
export function pickWorkoutMilestone({
  totalWorkouts,
  isPremium,
}: {
  totalWorkouts: number;
  isPremium: boolean | null;
}): WorkoutMilestone | null {
  if (typeof window === "undefined") return null;

  for (const rule of WORKOUT_MILESTONES) {
    if (totalWorkouts < rule.atWorkout) continue;
    if (wasSeen(rule.id)) continue;
    if (rule.freeOnly && isPremium !== false) continue;
    if (rule.nativeReviewOnly && !canAskStoreReview()) continue;

    markSeen(rule.id);
    return rule.id;
  }

  return null;
}
