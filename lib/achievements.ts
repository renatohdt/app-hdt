export type AchievementCategory = "workout" | "weight" | "consistency" | "goal";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  phrase?: string;
  milestone: number;
  category: AchievementCategory;
};

export const WORKOUT_MILESTONES: Achievement[] = [
  {
    id: "workout_1",
    milestone: 1,
    title: "Primeiro Treino!",
    description: "Parabéns! Treinou pela primeira vez… ou será que apertou o botão de curioso?",
    phrase: "Parabéns! Treinou pela primeira vez… ou será que apertou o botão de curioso?",
    category: "workout"
  },
  {
    id: "workout_10",
    milestone: 10,
    title: "10 Treinos Realizados",
    description: "Como dizia o Arnold: \"A dor que você sente hoje é a força que você vai ter amanhã.\" Mas no fundo você sabe que tá aqui pelo shape.",
    phrase: "Como dizia o Arnold: \"A dor que você sente hoje é a força que você vai ter amanhã.\" Mas no fundo você sabe que tá aqui pelo shape.",
    category: "workout"
  },
  {
    id: "workout_30",
    milestone: 30,
    title: "30 Treinos Realizados",
    description: "Manda para quem duvidou de você! Eu nunca!",
    phrase: "Manda para quem duvidou de você! Eu nunca!",
    category: "workout"
  },
  {
    id: "workout_50",
    milestone: 50,
    title: "50 Treinos Realizados",
    description: "Você é um(a) monstro(a). Birlll 💪",
    phrase: "Você é um(a) monstro(a). Birlll 💪",
    category: "workout"
  },
  {
    id: "workout_100",
    milestone: 100,
    title: "100 Treinos Realizados",
    description: "Personal está orgulhoso de você 🥹",
    phrase: "Personal está orgulhoso de você 🥹",
    category: "workout"
  }
];

export const WEIGHT_MILESTONES: Achievement[] = [
  {
    id: "weight_increase_1",
    milestone: 1,
    title: "Aumentou a Carga!",
    description: "Pega esse pump! Ninguém segura a gente agora!",
    phrase: "Pega esse pump! Ninguém segura a gente agora!",
    category: "weight"
  },
  {
    id: "weight_increase_5",
    milestone: 5,
    title: "Quero Peso!",
    description: "Hulk Esmaga!",
    phrase: "Hulk Esmaga!",
    category: "weight"
  },
  {
    id: "weight_increase_10",
    milestone: 10,
    title: "A Musculatura Agradece",
    description: "Dez vezes que você escolheu sofrer mais. Orgulho.",
    phrase: "Dez vezes que você escolheu sofrer mais. Orgulho.",
    category: "weight"
  },
  {
    id: "weight_increase_15",
    milestone: 15,
    title: "Esse Peso Não É Pra Você",
    description: "Mas você pegou assim mesmo.",
    phrase: "Mas você pegou assim mesmo.",
    category: "weight"
  }
];

export const CONSISTENCY_MILESTONES: Achievement[] = [
  {
    id: "perfect_week",
    milestone: 1,
    title: "Semana Perfeita",
    description: "Treinou todos os dias planejados em uma semana.",
    phrase: "Se todos os alunos fossem como você… 😍",
    category: "consistency"
  },
  {
    id: "streak_7",
    milestone: 7,
    title: "Sequência de 7 Dias",
    description: "Treinou 7 dias consecutivos.",
    phrase: "Parabéns… mas você já ouviu falar em day-off?",
    category: "consistency"
  },
  {
    id: "monthly_20",
    milestone: 20,
    title: "20 Treinos no Mês",
    description: "Realizou 20 treinos em um único mês.",
    phrase: "20 treinos? Nem sabia que isso era possível, você é incrível!",
    category: "consistency"
  },
  {
    id: "plan_completed",
    milestone: 1,
    title: "Plano Concluído",
    description: "Finalizou todas as sessões do programa.",
    phrase: "Ihá! Começa assim, em breve será um influencer fitness.",
    category: "consistency"
  }
];

export const GOAL_MILESTONES: Achievement[] = [
  {
    id: "goal_1",
    milestone: 1,
    title: "Primeira Meta",
    description: "Completou sua primeira meta de treinos.",
    phrase: "Aeeeee! Voce se desafiou e provou que consegue!",
    category: "goal"
  },
  {
    id: "goal_2",
    milestone: 2,
    title: "Segunda Meta",
    description: "Completou sua segunda meta de treinos.",
    phrase: "Mostra para quem falou que voce nao era capaz! Vozes da sua cabeca!",
    category: "goal"
  },
  {
    id: "goal_3",
    milestone: 3,
    title: "Terceira Meta",
    description: "Completou sua terceira meta de treinos.",
    phrase: "Uma maquina de bater metas!",
    category: "goal"
  },
  {
    id: "goal_4",
    milestone: 4,
    title: "Quarta Meta",
    description: "Completou sua quarta meta de treinos.",
    phrase: "Espero que voce bata as metas do trabalho igual bate as de treino",
    category: "goal"
  },
  {
    id: "goal_5",
    milestone: 5,
    title: "Quinta Meta",
    description: "Completou sua quinta meta de treinos.",
    phrase: "Bora! Foguete nao tem re! Espera... acho que agora tem...",
    category: "goal"
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
 * Retorna a conquista mais recente ja desbloqueada (maior marco atingido).
 * Retorna null se o usuario ainda nao tem nenhum treino.
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

export type ConsistencyStats = {
  hasPerfectWeek: boolean;
  hasStreak7Days: boolean;
  maxWorkoutsInMonth: number;
  planCompleted: boolean;
};

/**
 * Calcula as metricas de consistencia a partir dos logs de sessao.
 */
export function calcConsistencyStats(
  sessionLogs: Array<{ completedAt: string }>,
  weeklyTarget: number,
  completedSessions: number,
  totalSessions: number
): ConsistencyStats {
  const dates = sessionLogs
    .map((log) => {
      const d = new Date(log.completedAt);
      return Number.isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null);

  return {
    hasPerfectWeek: checkHasPerfectWeek(dates, weeklyTarget),
    hasStreak7Days: checkStreak7Days(dates),
    maxWorkoutsInMonth: calcMaxWorkoutsInMonth(dates),
    planCompleted: totalSessions > 0 && completedSessions >= totalSessions
  };
}

function checkHasPerfectWeek(dates: Date[], weeklyTarget: number): boolean {
  if (weeklyTarget <= 0 || dates.length === 0) return false;
  const weekMap = new Map<string, number>();
  for (const d of dates) {
    const key = getISOWeekKey(d);
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
  }
  for (const count of weekMap.values()) {
    if (count >= weeklyTarget) return true;
  }
  return false;
}

function checkStreak7Days(dates: Date[]): boolean {
  if (dates.length < 7) return false;
  const daySet = new Set(dates.map(toDateKey));
  const sorted = Array.from(daySet).sort();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] as string);
    const curr = new Date(sorted[i] as string);
    const diff = (curr.getTime() - prev.getTime()) / 86_400_000;
    if (diff === 1) {
      streak++;
      if (streak >= 7) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}

function calcMaxWorkoutsInMonth(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const monthMap = new Map<string, number>();
  for (const d of dates) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  return Math.max(...monthMap.values());
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
}

function getWeekNumber(d: Date): number {
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - startOfYear.getTime();
  return Math.ceil((diff / 86_400_000 + startOfYear.getDay() + 1) / 7);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Retorna todas as conquistas de consistencia com status de desbloqueio.
 */
export function getAllConsistencyAchievementsWithStatus(stats: ConsistencyStats): AchievementWithStatus[] {
  return CONSISTENCY_MILESTONES.map((achievement) => {
    let unlocked = false;
    if (achievement.id === "perfect_week") unlocked = stats.hasPerfectWeek;
    else if (achievement.id === "streak_7") unlocked = stats.hasStreak7Days;
    else if (achievement.id === "monthly_20") unlocked = stats.maxWorkoutsInMonth >= 20;
    else if (achievement.id === "plan_completed") unlocked = stats.planCompleted;
    return { ...achievement, unlocked };
  });
}

/**
 * Retorna todas as conquistas de meta com status de desbloqueio.
 */
export function getAllGoalAchievementsWithStatus(totalGoalsCompleted: number): AchievementWithStatus[] {
  return GOAL_MILESTONES.map((achievement) => ({
    ...achievement,
    unlocked: totalGoalsCompleted >= achievement.milestone
  }));
}

/**
 * Retorna TODAS as conquistas agrupadas com status de desbloqueio.
 * Usado no modal de conquistas.
 */
export function getAllAchievementsUnified(
  totalWorkouts: number,
  totalWeightIncreases: number,
  consistencyStats: ConsistencyStats,
  totalGoalsCompleted: number
): { label: string; achievements: AchievementWithStatus[] }[] {
  return [
    {
      label: "Volume de treinos",
      achievements: getAllAchievementsWithStatus(totalWorkouts)
    },
    {
      label: "Consistencia",
      achievements: getAllConsistencyAchievementsWithStatus(consistencyStats)
    },
    {
      label: "Aumento de carga",
      achievements: getAllWeightAchievementsWithStatus(totalWeightIncreases)
    },
    {
      label: "Metas pessoais",
      achievements: getAllGoalAchievementsWithStatus(totalGoalsCompleted)
    }
  ];
}
