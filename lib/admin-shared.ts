import { formatBodyTypeLabel } from "@/lib/body-type";
import { QuizAnswers } from "@/lib/types";

export type DistributionDatum = {
  label: string;
  value: number;
  percentage: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  value: number;
  conversion: number | null;
};

export type DashboardPeriod = {
  label: string;
  steps: FunnelStep[];
};

export type DashboardWindowKey = "daily" | "weekly";

export type RetentionMetric = {
  key: "d1" | "d7" | "d30";
  label: string;
  windowLabel: string;
  returnedUsers: number;
  eligibleUsers: number;
  percentage: number | null;
};

export type AdminErrorLog = {
  id: string;
  message: string;
  origin: string;
  created_at: string;
};

export type AdminDashboardData = {
  activeUsers: Record<DashboardWindowKey, number>;
  ageDistribution: DistributionDatum[];
  genderDistribution: DistributionDatum[];
  goalDistribution: DistributionDatum[];
  retention: RetentionMetric[];
  funnel: {
    daily: DashboardPeriod;
    weekly: DashboardPeriod;
  };
  errors: AdminErrorLog[];
};

export function getGoalLabel(goal?: QuizAnswers["goal"]) {
  const labels = {
    lose_weight: "Emagrecimento",
    gain_muscle: "Hipertrofia",
    body_recomposition: "Definição",
    improve_conditioning: "Condicionamento"
  };

  return goal ? labels[goal] : "-";
}

export function getGenderLabel(gender?: QuizAnswers["gender"]) {
  const labels = {
    male: "Masculino",
    female: "Feminino"
  };

  return gender ? labels[gender] : "Não informado";
}

export function getBodyTypeLabel(value?: QuizAnswers["wrist"] | QuizAnswers["body_type"] | string) {
  return value ? formatBodyTypeLabel(value) : "-";
}

export function getLevelLabel(experience?: QuizAnswers["experience"]) {
  const labels = {
    no_training: "Iniciante",
    lt_6_months: "Iniciante",
    "6_to_12_months": "Intermediário",
    gt_1_year: "Avançado"
  };

  return experience ? labels[experience] : "-";
}

export function formatDate(value?: string) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}
