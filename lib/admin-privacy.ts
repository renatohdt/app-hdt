import "server-only";

import { formatBodyTypeLabel } from "@/lib/body-type";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId } from "@/lib/user-answers";

type WorkoutRow = {
  id: string;
  created_at: string;
  exercises: {
    focus?: string[];
    sections?: Array<{ title?: string }>;
  } | null;
};

export type AdminAnswerSummary = {
  goal: string;
  gender: string;
  bodyType: string;
  level: string;
  ageLabel: string;
  days: string;
  time: string;
};

export type AdminUserDetailPayload = {
  user: {
    id: string;
    name: string;
    emailMasked: string;
    emailRaw?: string | null;
    createdAt: string;
    summary: AdminAnswerSummary;
  };
  workout: {
    id: string | null;
    createdAt: string | null;
    focus: string[];
    sections: string[];
    sectionCount: number;
  };
  extendedData: {
    quizAnswers: QuizAnswers | null;
    workoutRaw: unknown;
  } | null;
};

export function maskEmail(email?: string | null) {
  if (!email) {
    return "Nao informado";
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "Nao informado";
  }

  const visibleStart = localPart.slice(0, 2);
  return `${visibleStart}${"*".repeat(Math.max(2, localPart.length - 2))}@${domain}`;
}

export function buildAdminAnswerSummary(answers?: QuizAnswers | null): AdminAnswerSummary {
  return {
    goal: getGoalLabel(answers?.goal),
    gender: getGenderLabel(answers?.gender),
    bodyType: getBodyTypeLabel(answers?.body_type ?? answers?.body_type_raw ?? answers?.wrist),
    level: getLevelLabel(answers?.experience),
    ageLabel: getAgeLabel(answers?.age),
    days: getDaysLabel(answers?.days),
    time: getTimeLabel(answers?.time)
  };
}

export async function getAdminUserDetail(userId: string, includeExtended: boolean) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const [{ data: userRow, error: userError }, { data: workoutRow, error: workoutError }] = await Promise.all([
    supabase.from("users").select("id, name, created_at").eq("id", userId).maybeSingle(),
    supabase
      .from("workouts")
      .select("id, created_at, exercises")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (userError || !userRow || workoutError) {
    return null;
  }

  const answers = await getUserAnswersByUserId(supabase, userId);
  const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(userId);
  const email = authUserError ? null : authUserData.user?.email ?? null;
  const workout = (workoutRow ?? null) as WorkoutRow | null;

  return {
    user: {
      id: userRow.id,
      name: userRow.name,
      emailMasked: maskEmail(email),
      emailRaw: includeExtended ? email : undefined,
      createdAt: userRow.created_at,
      summary: buildAdminAnswerSummary(answers)
    },
    workout: {
      id: workout?.id ?? null,
      createdAt: workout?.created_at ?? null,
      focus: Array.isArray(workout?.exercises?.focus) ? workout?.exercises?.focus ?? [] : [],
      sections: Array.isArray(workout?.exercises?.sections)
        ? workout?.exercises?.sections
            ?.map((section) => section?.title?.trim())
            .filter((title): title is string => Boolean(title))
        : [],
      sectionCount: Array.isArray(workout?.exercises?.sections) ? workout?.exercises?.sections?.length ?? 0 : 0
    },
    extendedData: includeExtended
      ? {
          quizAnswers: answers,
          workoutRaw: workout?.exercises ?? null
        }
      : null
  } satisfies AdminUserDetailPayload;
}

function getGoalLabel(goal?: QuizAnswers["goal"]) {
  const labels = {
    lose_weight: "Emagrecimento",
    gain_muscle: "Hipertrofia",
    body_recomposition: "Definicao",
    improve_conditioning: "Condicionamento"
  };

  return goal ? labels[goal] : "Nao informado";
}

function getGenderLabel(gender?: QuizAnswers["gender"]) {
  const labels = {
    male: "Masculino",
    female: "Feminino"
  };

  return gender ? labels[gender] : "Nao informado";
}

function getBodyTypeLabel(value?: QuizAnswers["wrist"] | QuizAnswers["body_type"] | string) {
  return value ? formatBodyTypeLabel(value) : "Nao informado";
}

function getLevelLabel(experience?: QuizAnswers["experience"]) {
  const labels = {
    no_training: "Iniciante",
    lt_6_months: "Iniciante",
    "6_to_12_months": "Intermediario",
    gt_1_year: "Avancado"
  };

  return experience ? labels[experience] : "Nao informado";
}

function getAgeLabel(age?: number) {
  const numericAge = Number(age);

  if (!Number.isFinite(numericAge) || numericAge <= 0) {
    return "Nao informado";
  }

  if (numericAge < 18) return "Menos de 18";
  if (numericAge <= 24) return "18-24";
  if (numericAge <= 34) return "25-34";
  if (numericAge <= 44) return "35-44";
  if (numericAge <= 54) return "45-54";
  return "55+";
}

function getDaysLabel(days?: QuizAnswers["days"]) {
  const numericDays = Number(days);
  return Number.isFinite(numericDays) ? `${numericDays} ${numericDays === 1 ? "dia" : "dias"} por semana` : "Nao informado";
}

function getTimeLabel(time?: QuizAnswers["time"]) {
  const minutes = Number(time);
  return Number.isFinite(minutes) ? `${minutes} min` : "Nao informado";
}
