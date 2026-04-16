export type AchievementCategory = "workout" | "weight";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  milestone: number;
  category: AchievementCategory;
};

export const WORKOUT_MILESTONES: Achievement[] = [
  {
    id: "workout_1",
    milestone: 1,
    title: "Primeiro Treino!",
    description: "Parabéns! Treinou pela primeira vez… ou será que apertou o botão de curioso?",
    category: "workout"
  },
  {
    id: "workout_10",
    milestone: 10,
    title: "10 Treinos Realizados",
    description: "Como dizia o Arnold: \"A dor que você sente hoje é a força que você vai ter amanhã.\" Mas no fundo você sabe que tá aqui pelo shape.",
    category: "workout"
  },
  {
    id: "workout_30",
    milestone: 30,
    title: "30 Treinos Realizados",
    description: "Manda para quem duvidou de você! Eu nunca!",
    category: "workout"
  },
  {
    id: "workout_50",
    milestone: 50,
    title: "50 Treinos Realizados",
    description: "Você é um(a) monstro(a). Birlll 💪",
    category: "workout"
  },
  {
    id: "workout_100",
    milestone: 100,
    title: "100 Treinos Realizados",
    description: "Personal está orgulhoso de você 🥹",
    category: "workout"
  }
];

export const WEIGHT_MILESTONES: Achievement[] = [
  {
    id: "weight_increase_1",
    milestone: 1,
    title: "Aumentou a Carga!",
    description: "Pega esse pump! Ninguém segura a gente agora!",
    category: "weight"
  },
  {
    id: "weight_increase_5",
    milestone: 5,
    title: "Quero Peso!",
    description: "Hulk Esmaga!",
    category: "weight"
  },
  {
    id: "weight_increase_10",
    milestone: 10,
    title: "A Musculatura Agradece",
    description: "Dez vezes que você escolheu sofrer mais. Orgulho.",
    category: "weight"
  },
  {
    id: "weight_increase_15",
    milestone: 15,
    title: "Esse Peso Não É Pra Você",
    description: "Mas você pegou assim mesmo.",
    category: "weight"
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

/**
 * Retorna a conquista de carga desbloqueada ao cruzar de `prevCount` para `newCount`.
 */
export function getNewlyUnlockedWeightAchievement(
  prevCount: number,
  newCount: number
): Achievement | null {
  for (const achievement of WEIGHT_MILESTONES) {
    if (prevCount < achievement.milestone && newCount >= achievement.milestone) {
      return achievement;
    }
  }
  return null;
}

/**
 * Retorna todas as conquistas de carga com status de desbloqueio.
 */
export function getAllWeightAchievementsWithStatus(totalIncreases: number): AchievementWithStatus[] {
  return WEIGHT_MILESTONES.map((achievement) => ({
    ...achievement,
    unlocked: totalIncreases >= achievement.milestone
  }));
}
