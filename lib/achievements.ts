export type Achievement = {
  id: string;
  title: string;
  description: string;
  milestone: number;
};

export const WORKOUT_MILESTONES: Achievement[] = [
  {
    id: "workout_1",
    milestone: 1,
    title: "Primeiro Treino!",
    description: "Parabéns! Treinou pela primeira vez… ou será que apertou o botão de curioso?"
  },
  {
    id: "workout_10",
    milestone: 10,
    title: "10 Treinos Realizados",
    description: "Como dizia o Arnold: \"A dor que você sente hoje é a força que você vai ter amanhã.\" Mas no fundo você sabe que tá aqui pelo shape."
  },
  {
    id: "workout_30",
    milestone: 30,
    title: "30 Treinos Realizados",
    description: "Manda para quem duvidou de você! Eu nunca!"
  },
  {
    id: "workout_50",
    milestone: 50,
    title: "50 Treinos Realizados",
    description: "Você é um(a) monstro(a). Birlll 💪"
  },
  {
    id: "workout_100",
    milestone: 100,
    title: "100 Treinos Realizados",
    description: "Personal está orgulhoso de você 🥹"
  }
];

/**
 * Retorna a conquista desbloqueada ao cruzar de `prevCount` para `newCount`.
 * Retorna null se nenhum marco foi atingido.
 */
export function getNewlyUnlockedAchievement(
  prevCount: number,
  newCount: number
): Achievement | null {
  for (const achievement of WORKOUT_MILESTONES) {
    if (prevCount < achievement.milestone && newCount >= achievement.milestone) {
      return achievement;
    }
  }
  return null;
}

/**
 * Retorna a conquista mais recente já desbloqueada (maior marco atingido).
 * Retorna null se o usuário ainda não tem nenhum treino.
 */
export function getLastUnlockedAchievement(totalWorkouts: number): Achievement | null {
  let last: Achievement | null = null;
  for (const achievement of WORKOUT_MILESTONES) {
    if (totalWorkouts >= achievement.milestone) {
      last = achievement;
    }
  }
  return last;
}

export type AchievementWithStatus = Achievement & { unlocked: boolean };

/**
 * Retorna todas as conquistas com status de desbloqueio.
 */
export function getAllAchievementsWithStatus(totalWorkouts: number): AchievementWithStatus[] {
  return WORKOUT_MILESTONES.map((achievement) => ({
    ...achievement,
    unlocked: totalWorkouts >= achievement.milestone
  }));
}
