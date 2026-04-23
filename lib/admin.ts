import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  AdminDashboardData,
  AdminErrorLog,
  DashboardPeriod,
  RetentionMetric
} from "@/lib/admin-shared";
import {
  ACTIVE_USER_EVENT_NAMES,
  CTA_EVENTS,
  DASHBOARD_EVENT_NAMES,
  HOME_VIEW_EVENTS,
  PREMIUM_INTENT_EVENTS,
  QUIZ_START_EVENTS,
  RETURN_ACTIVITY_EVENTS,
  SIGNUP_EVENTS
} from "@/lib/analytics-events";
import { formatExerciseMuscleGroups, formatExerciseTypeLabel } from "@/lib/exercise-library";
import { formatBodyTypeLabel } from "@/lib/body-type";
import { QuizAnswers } from "@/lib/types";
import { getUserAnswersMap } from "@/lib/user-answers";

type AdminUser = {
  id: string;
  name: string;
  email?: string | null;
  answers: QuizAnswers | null;
  created_at: string;
};

type AdminWorkout = {
  id: string;
  user_id: string;
  exercises: {
    sections?: Array<{ title: string; exercises?: Array<{ name?: string }> }>;
    focus?: string[];
  };
  created_at: string;
};

export type AdminExercise = {
  id: string;
  name: string;
  tags?: string[];
  muscle?: string;
  muscle_groups?: string[];
  type?: string;
  location?: string[];
  level?: string | string[];
  equipment?: string[];
  metadata?: {
    muscle?: string;
    muscle_groups?: string[];
    muscles?: string[];
    type?: string;
    level?: string | string[];
    location?: string[];
    equipment?: string[];
  };
  video_url: string | null;
};

type AdminEvent = {
  id: string;
  event_name: string;
  user_id: string | null;
  visitor_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DashboardUserRow = {
  id: string;
  created_at: string;
  role?: string | null;
  deleted_at?: string | null;
};

type UserAnswerRow = {
  user_id: string;
  answers: QuizAnswers | Record<string, unknown>;
  created_at?: string;
};
type IdentityResolver = (value: { user_id?: string | null; visitor_id?: string | null }) => string | null;

type TimeWindow = {
  from: Date;
  to?: Date;
  label: string;
};
const RETENTION_WINDOWS = [
  {
    key: "d1",
    label: "Retorno D1",
    windowLabel: "24h a 48h",
    startHours: 24,
    endDays: 2,
    eligibleAfterDays: 2
  },
  {
    key: "d7",
    label: "Retorno D7",
    windowLabel: "24h a 7 dias",
    startHours: 24,
    endDays: 7,
    eligibleAfterDays: 7
  },
  {
    key: "d30",
    label: "Retorno D30",
    windowLabel: "24h a 30 dias",
    startHours: 24,
    endDays: 30,
    eligibleAfterDays: 30
  }
] as const satisfies ReadonlyArray<{
  key: RetentionMetric["key"];
  label: string;
  windowLabel: string;
  startHours: number;
  endDays: number;
  eligibleAfterDays: number;
}>;

export async function getAdminData() {
  noStore();
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      users: [] as AdminUser[],
      workouts: [] as AdminWorkout[],
      exercises: [] as AdminExercise[],
      events: [] as AdminEvent[],
      errors: [
        {
          id: "config-error",
          message: "Supabase não configurado.",
          origin: "config",
          created_at: new Date().toISOString()
        }
      ] as AdminErrorLog[]
    };
  }

  const [usersResult, workoutsResult, exercisesResult, eventsResult] = await Promise.all([
    supabase.from("users").select("id, name, created_at").order("created_at", { ascending: false }),
    supabase.from("workouts").select("*").order("created_at", { ascending: false }),
    supabase.from("exercises").select("*").order("name"),
    supabase.from("analytics_events").select("*").order("created_at", { ascending: false })
  ]);

  const baseErrors = [
    buildQueryError("users-error", usersResult.error?.message, "users"),
    buildQueryError("workouts-error", workoutsResult.error?.message, "workouts"),
    buildQueryError("exercises-error", exercisesResult.error?.message, "exercises"),
    buildQueryError("events-error", eventsResult.error?.message, "analytics_events")
  ].filter(Boolean) as AdminErrorLog[];

  const users = await attachUserData((usersResult.data ?? []) as AdminUser[], supabase);
  const events = (eventsResult.data ?? []) as AdminEvent[];

  return {
    users,
    workouts: (workoutsResult.data ?? []) as AdminWorkout[],
    exercises: (exercisesResult.data ?? []) as AdminExercise[],
    events,
    errors: [...baseErrors, ...getRecentSystemErrors(events)]
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  noStore();
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      totalUsers: 0,
      deletedUsers: 0,
      activeUsers: {
        daily: 0,
        weekly: 0
      },
      ageDistribution: [],
      genderDistribution: [],
      goalDistribution: [],
      retention: buildRetentionMetrics([], []),
      funnel: {
        daily: buildFunnelPeriod([], startOfToday(), "Diário"),
        weekly: buildFunnelPeriod([], startOfLastDays(7), "Semanal")
      },
      errors: [
        {
          id: "config-error",
          message: "Supabase não configurado.",
          origin: "config",
          created_at: new Date().toISOString()
        }
      ],
      newUsersLast7Days: 0,
      newUsersLast30Days: 0,
      workoutsGenerated: 0,
      workoutsLast7Days: 0,
      completionRate: null,
      featureUsage: { usersWithReplacement: 0, usersWithNewWorkout: 0, usersWithCompletedSession: 0 }
    };
  }

  // Use the new windowed metric path first so the admin dashboard stays coherent
  // across event-based funnel data and persisted onboarding rows.
  {
    const [dashboardUsersQuery, dashboardAnswersQuery, dashboardEventsQuery, dashboardErrorEventsQuery, dashboardWorkoutsQuery] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, name, role, created_at, deleted_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("user_answers")
          .select("user_id, answers, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("analytics_events")
          .select("id, event_name, user_id, visitor_id, metadata, created_at")
          .is("deleted_at", null)
          .in("event_name", DASHBOARD_EVENT_NAMES)
          // Bug 2: limita a janela de 30 dias para evitar full-table scan.
          // 30 dias é suficiente para funil semanal e retenção D30.
          .gte("created_at", startOfLastDays(30).toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("analytics_events")
          .select("id, event_name, user_id, visitor_id, metadata, created_at")
          .is("deleted_at", null)
          .ilike("event_name", "%error%")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("workouts")
          .select("id, user_id, created_at")
          .order("created_at", { ascending: false })
      ]);

    const dashboardQueryErrors = [
      buildQueryError("users-error", dashboardUsersQuery.error?.message, "users"),
      buildQueryError("answers-error", dashboardAnswersQuery.error?.message, "user_answers"),
      buildQueryError("events-error", dashboardEventsQuery.error?.message, "analytics_events"),
      buildQueryError("error-events-error", dashboardErrorEventsQuery.error?.message, "analytics_events"),
      buildQueryError("workouts-error", dashboardWorkoutsQuery.error?.message, "workouts")
    ].filter(Boolean) as AdminErrorLog[];

    if (dashboardQueryErrors.length) {
      return {
        totalUsers: 0,
        deletedUsers: 0,
        activeUsers: {
          daily: 0,
          weekly: 0
        },
        ageDistribution: [],
        genderDistribution: [],
        goalDistribution: [],
        retention: buildRetentionMetrics([], []),
        funnel: {
          daily: buildLegacyFunnelPeriod([], startOfToday(), "Diario"),
          weekly: buildLegacyFunnelPeriod([], startOfLastDays(7), "Semanal")
        },
        errors: dashboardQueryErrors,
        newUsersLast7Days: 0,
        newUsersLast30Days: 0,
        workoutsGenerated: 0,
        workoutsLast7Days: 0,
        completionRate: null,
        featureUsage: { usersWithReplacement: 0, usersWithNewWorkout: 0, usersWithCompletedSession: 0 }
      };
    }

    const dashboardAllUsers = ((dashboardUsersQuery.data ?? []) as DashboardUserRow[]).filter(isRegisteredDashboardUser);
    const dashboardUsers = dashboardAllUsers.filter((user) => !user.deleted_at);
    const deletedUsers = dashboardAllUsers.filter((user) => Boolean(user.deleted_at)).length;
    const dashboardAnswers = (dashboardAnswersQuery.data ?? []) as UserAnswerRow[];
    const dashboardEvents = (dashboardEventsQuery.data ?? []) as AdminEvent[];
    const dashboardErrorEvents = (dashboardErrorEventsQuery.data ?? []) as AdminEvent[];
    const dashboardIdentityResolver = getEventIdentityResolver(dashboardEvents);
    const dashboardAnswerList = dashboardAnswers
      .map((row) => normalizeAnswers(row.answers))
      .filter(Boolean) as Array<Partial<QuizAnswers> & Record<string, unknown>>;
    const dashboardAllEvents = [...dashboardEvents, ...dashboardErrorEvents];

    // Novas métricas de crescimento
    const dashboardWorkouts = (dashboardWorkoutsQuery.data ?? []) as Array<{ id: string; user_id: string; created_at: string }>;
    const sevenDaysAgo = startOfLastDays(7);
    const thirtyDaysAgo = startOfLastDays(30);
    const newUsersLast7Days = dashboardUsers.filter((u) => new Date(u.created_at) >= sevenDaysAgo).length;
    const newUsersLast30Days = dashboardUsers.filter((u) => new Date(u.created_at) >= thirtyDaysAgo).length;
    const workoutsGenerated = dashboardWorkouts.length;
    const workoutsLast7Days = dashboardWorkouts.filter((w) => new Date(w.created_at) >= sevenDaysAgo).length;
    const completionRate = dashboardUsers.length > 0
      ? Math.round((workoutsGenerated / dashboardUsers.length) * 100)
      : null;

    // Métricas de engajamento com as ferramentas do app
    // Buscamos separadamente para não atrasar o dashboard caso as tabelas cresçam.
    const [featureReplacementsQuery, featureSessionsQuery] = await Promise.all([
      supabase.from("workout_exercise_replacements").select("user_id"),
      supabase.from("workout_session_logs").select("user_id").eq("status", "completed")
    ]);

    const usersWithReplacement = new Set(
      ((featureReplacementsQuery.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
    ).size;
    const usersWithCompletedSession = new Set(
      ((featureSessionsQuery.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
    ).size;
    // Usuários com mais de 1 programa de treino = usaram "gerar novo treino" (free auto ou premium)
    const workoutCountPerUser = new Map<string, number>();
    for (const row of dashboardWorkouts) {
      workoutCountPerUser.set(row.user_id, (workoutCountPerUser.get(row.user_id) ?? 0) + 1);
    }
    const usersWithNewWorkout = [...workoutCountPerUser.values()].filter((count) => count > 1).length;

    // Total = usuários que completaram o cadastro (quiz finalizado, perfil salvo)
    const totalUsers = dashboardUsers.length;

    return {
      totalUsers,
      deletedUsers,
      activeUsers: {
        daily: buildActiveUsersForWindow(dashboardUsers, dashboardAnswers, dashboardEvents, {
          from: startOfToday(),
          label: "Diario"
        }),
        weekly: buildActiveUsersForWindow(dashboardUsers, dashboardAnswers, dashboardEvents, {
          from: startOfLastDays(7),
          label: "Semanal"
        })
      },
      ageDistribution: toDistribution(dashboardAnswerList.map(getAgeBucket)),
      genderDistribution: toDistribution(dashboardAnswerList.map((answers) => getGenderLabel(answers.gender))),
      goalDistribution: toDistribution(dashboardAnswerList.map((answers) => getGoalLabel(answers.goal))),
      retention: buildRetentionMetrics(dashboardUsers, dashboardEvents),
      funnel: {
        daily: buildWindowedFunnelPeriod(dashboardUsers, dashboardAnswers, dashboardEvents, dashboardIdentityResolver, {
          from: startOfToday(),
          label: "Diario"
        }),
        weekly: buildWindowedFunnelPeriod(dashboardUsers, dashboardAnswers, dashboardEvents, dashboardIdentityResolver, {
          from: startOfLastDays(7),
          label: "Semanal"
        })
      },
      errors: [...dashboardQueryErrors, ...getRecentSystemErrors(dashboardAllEvents)].slice(0, 10),
      newUsersLast7Days,
      newUsersLast30Days,
      workoutsGenerated,
      workoutsLast7Days,
      completionRate,
      featureUsage: {
        usersWithReplacement,
        usersWithNewWorkout,
        usersWithCompletedSession
      }
    };
  }

  const [usersResult, userAnswersResult, dashboardEventsResult, errorEventsResult] = await Promise.all([
    supabase!.from("users").select("id, name, role, created_at, deleted_at").order("created_at", { ascending: false }),
    supabase!.from("user_answers").select("user_id, answers, created_at").order("created_at", { ascending: false }),
    supabase!
      .from("analytics_events")
      .select("id, event_name, user_id, metadata, created_at")
      .in("event_name", DASHBOARD_EVENT_NAMES)
      .order("created_at", { ascending: false }),
    supabase!
      .from("analytics_events")
      .select("id, event_name, user_id, metadata, created_at")
      .ilike("event_name", "%error%")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const queryErrors = [
    buildQueryError("users-error", usersResult.error?.message, "users"),
    buildQueryError("answers-error", userAnswersResult.error?.message, "user_answers"),
    buildQueryError("events-error", dashboardEventsResult.error?.message, "analytics_events"),
    buildQueryError("error-events-error", errorEventsResult.error?.message, "analytics_events")
  ].filter(Boolean) as AdminErrorLog[];

  if (queryErrors.length) {
    return {
      totalUsers: 0,
      deletedUsers: 0,
      activeUsers: {
        daily: 0,
        weekly: 0
      },
      ageDistribution: [],
      genderDistribution: [],
      goalDistribution: [],
      retention: buildRetentionMetrics([], []),
      funnel: {
        daily: buildFunnelPeriod([], startOfToday(), "Diário"),
        weekly: buildFunnelPeriod([], startOfLastDays(7), "Semanal")
      },
      errors: queryErrors,
      newUsersLast7Days: 0,
      newUsersLast30Days: 0,
      workoutsGenerated: 0,
      workoutsLast7Days: 0,
      completionRate: null,
      featureUsage: { usersWithReplacement: 0, usersWithNewWorkout: 0, usersWithCompletedSession: 0 }
    };
  }

  const allUsers = ((usersResult.data ?? []) as DashboardUserRow[]).filter(isRegisteredDashboardUser);
  const users = allUsers.filter((user) => !user.deleted_at);
  const deletedUsers = allUsers.filter((user) => Boolean(user.deleted_at)).length;
  const userAnswers = (userAnswersResult.data ?? []) as UserAnswerRow[];
  const dashboardEvents = (dashboardEventsResult.data ?? []) as AdminEvent[];
  const errorEvents = (errorEventsResult.data ?? []) as AdminEvent[];
  const events = [...dashboardEvents, ...errorEvents];
  const answersList = userAnswers.map((row) => normalizeAnswers(row.answers)).filter(Boolean) as Array<Partial<QuizAnswers> & Record<string, unknown>>;
  const activeUsers = new Set([
    ...users.map((user) => user.id),
    ...userAnswers.map((answer) => answer.user_id)
  ]).size;

  return {
    totalUsers: users.length,
    deletedUsers,
    activeUsers: {
      daily: activeUsers,
      weekly: activeUsers
    },
    ageDistribution: toDistribution(answersList.map(getAgeBucket)),
    genderDistribution: toDistribution(answersList.map((answers) => getGenderLabel(answers.gender))),
    goalDistribution: toDistribution(answersList.map((answers) => getGoalLabel(answers.goal))),
    retention: buildRetentionMetrics(users, dashboardEvents),
    funnel: {
      daily: buildFunnelPeriod(events, startOfToday(), "Diário"),
      weekly: buildFunnelPeriod(events, startOfLastDays(7), "Semanal")
    },
    errors: [...queryErrors, ...getRecentSystemErrors(events)].slice(0, 10),
    newUsersLast7Days: 0,
    newUsersLast30Days: 0,
    workoutsGenerated: 0,
    workoutsLast7Days: 0,
    completionRate: null,
    featureUsage: { usersWithReplacement: 0, usersWithNewWorkout: 0, usersWithCompletedSession: 0 }
  };
}

export async function getMonthlyDashboardCsv() {
  const supabase = createSupabaseAdminClient();

  const EMPTY_CSV = "data,dia_semana,pagina_inicial,quiz_iniciado,conta_criada,visitou_premium,conv_home_quiz,conv_quiz_conta,conv_conta_premium\n";

  if (!supabase) {
    return EMPTY_CSV;
  }

  {
    // Início do mês corrente em horário de Brasília (UTC-3)
    const nowInBrasilia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const [brtYear, brtMonth] = nowInBrasilia.split("-");
    // Meia-noite do dia 1 do mês em BRT = 03:00 UTC
    const monthStart = new Date(`${brtYear}-${brtMonth}-01T03:00:00.000Z`);

    const [csvUsersQuery, csvAnswersQuery, csvEventsQuery] = await Promise.all([
      supabase
        .from("users")
        .select("id, role, created_at")
        .is("deleted_at", null)
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("user_answers")
        .select("user_id, created_at")
        .is("deleted_at", null)
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("analytics_events")
        .select("event_name, user_id, visitor_id, created_at")
        .is("deleted_at", null)
        .gte("created_at", monthStart.toISOString())
        .in("event_name", DASHBOARD_EVENT_NAMES)
        .order("created_at", { ascending: true })
    ]);

    if (csvUsersQuery.error || csvAnswersQuery.error || csvEventsQuery.error) {
      console.error("MONTHLY CSV ERROR:", csvUsersQuery.error ?? csvAnswersQuery.error ?? csvEventsQuery.error);
      return EMPTY_CSV;
    }

    const csvUsers = ((csvUsersQuery.data ?? []) as DashboardUserRow[]).filter(isRegisteredDashboardUser);
    const csvAnswers = (csvAnswersQuery.data ?? []) as UserAnswerRow[];
    const csvEvents = (csvEventsQuery.data ?? []) as AdminEvent[];
    const csvIdentityResolver = getEventIdentityResolver(csvEvents);

    // Usa datas em BRT para agrupar por dia — evita contar eventos de 21h-00h
    // no dia errado (problema do fuso UTC x BRT)
    const dayKeys = new Set<string>();
    const toBrtDate = (iso: string) =>
      new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

    csvUsers.forEach((u) => { if (u.created_at) dayKeys.add(toBrtDate(u.created_at)); });
    csvAnswers.forEach((a) => { if (a.created_at) dayKeys.add(toBrtDate(a.created_at)); });
    csvEvents.forEach((e) => { if (e.created_at) dayKeys.add(toBrtDate(e.created_at)); });

    // Mês formatado para o cabeçalho, ex: "Abril/2026"
    const monthLabel = new Date(monthStart).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo"
    });
    const exportedAt = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    });

    // Bloco de legenda — aparece como texto nas primeiras linhas do arquivo.
    // Linhas com # são convenção de comentário em CSV; Excel mostra na coluna A.
    const legend = [
      `# Hora do Treino — Relatorio de Metricas`,
      `# Exportado em: ${exportedAt} (horario de Brasilia)`,
      `# Periodo: ${monthLabel}`,
      `#`,
      `# LEGENDA DAS COLUNAS:`,
      `# data             — Dia no formato DD/MM/AAAA (horario de Brasilia)`,
      `# dia_semana       — Dia da semana`,
      `# pagina_inicial   — Visitantes unicos que acessaram a landing page`,
      `# quiz_iniciado    — Usuarios unicos que iniciaram o questionario`,
      `# conta_criada     — Usuarios unicos que criaram conta no app`,
      `# visitou_premium  — Usuarios unicos que visitaram a pagina de planos ou iniciaram o checkout`,
      `# conv_home_quiz   — Conversao de pagina inicial para quiz (%)`,
      `# conv_quiz_conta  — Conversao de quiz para criacao de conta (%)`,
      `# conv_conta_prem  — Conversao de conta criada para visita ao premium (%)`,
      `# -----`
    ].join("\n");

    const dataHeader = "data,dia_semana,pagina_inicial,quiz_iniciado,conta_criada,visitou_premium,conv_home_quiz,conv_quiz_conta,conv_conta_prem";

    // Acumuladores para a linha TOTAL
    let totalHome = 0, totalQuiz = 0, totalSignup = 0, totalPremium = 0;

    const DAYS_PT = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

    const lines = [...dayKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        // Janela do dia em BRT: meia-noite BRT = 03:00 UTC, fim = 03:00 UTC do dia seguinte
        const from = new Date(`${date}T03:00:00.000Z`);
        const to = new Date(from);
        to.setUTCDate(to.getUTCDate() + 1);

        const counts = buildFunnelCountsForWindow(csvUsers, csvAnswers, csvEvents, csvIdentityResolver, { from, to, label: date });

        totalHome    += counts.home;
        totalQuiz    += counts.quiz;
        totalSignup  += counts.signup;
        totalPremium += counts.premiumIntent;

        // Taxas de conversao de cada etapa
        const convHomeQuiz  = counts.home    > 0 ? `${Math.round((counts.quiz    / counts.home)    * 100)}%` : "—";
        const convQuizConta = counts.quiz    > 0 ? `${Math.round((counts.signup  / counts.quiz)    * 100)}%` : "—";
        const convContaPrem = counts.signup  > 0 ? `${Math.round((counts.premiumIntent / counts.signup) * 100)}%` : "—";

        // Data formatada em DD/MM/AAAA e dia da semana
        const [year, month, day] = date.split("-");
        const formattedDate = `${day}/${month}/${year}`;
        const dayOfWeek = DAYS_PT[new Date(`${date}T12:00:00.000Z`).getUTCDay()];

        return `${formattedDate},${dayOfWeek},${counts.home},${counts.quiz},${counts.signup},${counts.premiumIntent},${convHomeQuiz},${convQuizConta},${convContaPrem}`;
      });

    // Conversoes acumuladas do mes
    const totalConvHomeQuiz  = totalHome    > 0 ? `${Math.round((totalQuiz    / totalHome)    * 100)}%` : "—";
    const totalConvQuizConta = totalQuiz    > 0 ? `${Math.round((totalSignup  / totalQuiz)    * 100)}%` : "—";
    const totalConvContaPrem = totalSignup  > 0 ? `${Math.round((totalPremium / totalSignup)  * 100)}%` : "—";
    const totalRow = `TOTAL,,${totalHome},${totalQuiz},${totalSignup},${totalPremium},${totalConvHomeQuiz},${totalConvQuizConta},${totalConvContaPrem}`;

    return [legend, dataHeader, ...lines, totalRow].join("\n");
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase!
    .from("analytics_events")
    .select("event_name, user_id, created_at")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("MONTHLY CSV ERROR:", error);
    return "data,pagina_inicial,iniciaram_questionario,criaram_conta,clicaram_cta\n";
  }

  const rowsByDay = new Map<string, { home: Set<string>; quiz: Set<string>; signup: Set<string>; cta: Set<string> }>();

  for (const event of (data ?? []) as Array<{ event_name: string; user_id: string; created_at: string }>) {
    const dayKey = new Date(event.created_at).toISOString().slice(0, 10);
    if (!rowsByDay.has(dayKey)) {
      rowsByDay.set(dayKey, {
        home: new Set<string>(),
        quiz: new Set<string>(),
        signup: new Set<string>(),
        cta: new Set<string>()
      });
    }

    const row = rowsByDay.get(dayKey);
    if (!row) continue;

    if (hasEventName(HOME_VIEW_EVENTS, event.event_name)) row!.home.add(event.user_id);
    if (hasEventName(QUIZ_START_EVENTS, event.event_name)) row!.quiz.add(event.user_id);
    if (hasEventName(SIGNUP_EVENTS, event.event_name)) row!.signup.add(event.user_id);
    if (hasEventName(CTA_EVENTS, event.event_name)) row!.cta.add(event.user_id);
  }

  const header = "data,pagina_inicial,iniciaram_questionario,criaram_conta,clicaram_cta";
  const lines = [...rowsByDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([date, row]) =>
        `${date},${row.home.size},${row.quiz.size},${row.signup.size},${row.cta.size}`
    );

  return [header, ...lines].join("\n");
}

async function attachUserData(users: AdminUser[], supabase: ReturnType<typeof createSupabaseAdminClient>) {
  if (!supabase) return users;
  const answersMap = await getUserAnswersMap(supabase, users.map((user) => user.id));
  const emailMap = await getUserEmailMap(supabase, users.map((user) => user.id));
  return users.map((user) => ({
    ...user,
    email: emailMap.get(user.id) ?? null,
    answers: answersMap.get(user.id) ?? null
  }));
}

async function getUserEmailMap(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userIds: string[]
) {
  const map = new Map<string, string>();

  if (!supabase || !userIds.length || !("auth" in supabase) || !supabase.auth?.admin?.listUsers) {
    return map;
  }

  try {
    const targetIds = new Set(userIds);
    let page = 1;
    let keepLoading = true;

    while (keepLoading) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 100
      });

      if (error) {
        console.error("ADMIN EMAIL FETCH ERROR:", error);
        return map;
      }

      const users = data?.users ?? [];

      for (const user of users) {
        if (user.id && targetIds.has(user.id)) {
          map.set(user.id, user.email ?? "");
        }
      }

      keepLoading = users.length === 100 && map.size < targetIds.size;
      page += 1;

      if (map.size >= targetIds.size) {
        keepLoading = false;
      }
    }
  } catch (error) {
    console.error("ADMIN EMAIL MAP ERROR:", error);
  }

  return map;
}

function buildLegacyFunnelPeriod(events: AdminEvent[], from: Date, label: string) {
  return buildFunnelPeriod(events, from, label);
}

function buildWindowedFunnelPeriod(
  users: DashboardUserRow[],
  userAnswers: UserAnswerRow[],
  events: AdminEvent[],
  resolveIdentity: IdentityResolver,
  window: TimeWindow
): DashboardPeriod {
  const counts = buildFunnelCountsForWindow(users, userAnswers, events, resolveIdentity, window);
  const values = [
    {
      key: "home_view",
      label: "Página inicial",
      value: counts.home
    },
    {
      key: "quiz_started",
      label: "Iniciaram questionário",
      value: counts.quiz
    },
    {
      key: "signup",
      label: "Criaram conta",
      value: counts.signup
    },
    {
      key: "premium_intent",
      label: "Visitaram o premium",
      value: counts.premiumIntent
    }
  ];

  return {
    label: window.label,
    steps: values.map((step, index) => ({
      ...step,
      conversion: index === 0 ? null : calculateConversion(values[index - 1].value, step.value)
    }))
  };
}

function buildFunnelCountsForWindow(
  users: DashboardUserRow[],
  userAnswers: UserAnswerRow[],
  events: AdminEvent[],
  resolveIdentity: IdentityResolver,
  window: TimeWindow
) {
  const filteredEvents = events.filter((event) => isWithinWindow(event.created_at, window));
  const homeEventIdentities = collectEventIdentities(filteredEvents, HOME_VIEW_EVENTS, resolveIdentity);
  const quizEventIdentities = collectEventIdentities(filteredEvents, QUIZ_START_EVENTS, resolveIdentity);
  // Bug 1 fix: usa o mesmo resolvedor de identidade no passo de signup para que
  // visitantes anônimos (visitor:V) e usuários cadastrados (user:U) sejam
  // unificados na mesma identidade em todas as etapas. Sem isso, a etapa de
  // signup (que usava a tabela users diretamente) podia ter count > quiz/home,
  // gerando conversão > 100%.
  const signupEventIdentities = collectEventIdentities(filteredEvents, SIGNUP_EVENTS, resolveIdentity);
  const createdUserIdentities = collectCreatedUserIdentities(users, window);
  const signupIdentities = signupEventIdentities.size ? signupEventIdentities : createdUserIdentities;
  const onboardingFallbackIdentities = collectOnboardingFallbackIdentities(users, userAnswers, window);
  // Intenção de compra premium: visitou a página de planos ou iniciou o checkout.
  // Esses eventos substituem o antigo "cta_click" que misturava ações de engajamento
  // (abrir exercício, marcar série) com intenção real de conversão.
  const premiumIntentIdentities = collectEventIdentities(filteredEvents, PREMIUM_INTENT_EVENTS, resolveIdentity);

  // Older production data can have missing top-of-funnel events because the original
  // tracker required authentication. Only fall back when the event source is empty.
  const homeIdentities = homeEventIdentities.size
    ? homeEventIdentities
    : quizEventIdentities.size
      ? quizEventIdentities
      : onboardingFallbackIdentities;
  const quizIdentities = quizEventIdentities.size ? quizEventIdentities : onboardingFallbackIdentities;

  return {
    home: homeIdentities.size,
    quiz: quizIdentities.size,
    signup: signupIdentities.size,
    premiumIntent: premiumIntentIdentities.size
  };
}

function buildActiveUsersForWindow(
  users: DashboardUserRow[],
  userAnswers: UserAnswerRow[],
  events: AdminEvent[],
  window: TimeWindow
) {
  const activeUsers = new Set<string>();

  collectCreatedUserIds(users, window).forEach((userId) => activeUsers.add(userId));
  collectUserAnswerIds(userAnswers, window).forEach((userId) => activeUsers.add(userId));

  for (const event of events) {
    if (!event.user_id || !isWithinWindow(event.created_at, window)) {
      continue;
    }

    if (hasEventName(ACTIVE_USER_EVENT_NAMES, event.event_name)) {
      activeUsers.add(event.user_id);
    }
  }

  return activeUsers.size;
}

function collectOnboardingFallbackIdentities(
  users: DashboardUserRow[],
  userAnswers: UserAnswerRow[],
  window: TimeWindow
) {
  const identities = new Set<string>();

  collectCreatedUserIdentities(users, window).forEach((identity) => identities.add(identity));
  collectUserAnswerIdentities(userAnswers, window).forEach((identity) => identities.add(identity));

  return identities;
}

function collectCreatedUserIdentities(users: DashboardUserRow[], window: TimeWindow) {
  return new Set([...collectCreatedUserIds(users, window)].map((userId) => `user:${userId}`));
}

function collectCreatedUserIds(users: DashboardUserRow[], window: TimeWindow) {
  const userIds = new Set<string>();

  for (const user of users) {
    if (isWithinWindow(user.created_at, window)) {
      userIds.add(user.id);
    }
  }

  return userIds;
}

function collectUserAnswerIdentities(userAnswers: UserAnswerRow[], window: TimeWindow) {
  return new Set([...collectUserAnswerIds(userAnswers, window)].map((userId) => `user:${userId}`));
}

function collectUserAnswerIds(userAnswers: UserAnswerRow[], window: TimeWindow) {
  const userIds = new Set<string>();

  for (const answer of userAnswers) {
    if (!answer.user_id || !isWithinWindow(answer.created_at, window)) {
      continue;
    }

    userIds.add(answer.user_id);
  }

  return userIds;
}

function collectEventIdentities(
  events: AdminEvent[],
  names: readonly string[],
  resolveIdentity: IdentityResolver
) {
  const allowedNames = new Set<string>(names);
  const identities = new Set<string>();

  for (const event of events) {
    if (!allowedNames.has(event.event_name)) {
      continue;
    }

    const identity = resolveIdentity(event);
    if (identity) {
      identities.add(identity);
    }
  }

  return identities;
}

function getEventIdentityResolver(events: AdminEvent[]): IdentityResolver {
  const visitorToUser = new Map<string, string>();

  for (const event of events) {
    const userId = normalizeIdentityToken(event.user_id);
    const visitorId = normalizeIdentityToken(event.visitor_id);

    if (userId && visitorId) {
      visitorToUser.set(visitorId, userId);
    }
  }

  return ({ user_id, visitor_id }) => {
    const userId = normalizeIdentityToken(user_id);
    if (userId) {
      return `user:${userId}`;
    }

    const visitorId = normalizeIdentityToken(visitor_id);
    if (!visitorId) {
      return null;
    }

    const mappedUserId = visitorToUser.get(visitorId);
    return mappedUserId ? `user:${mappedUserId}` : `visitor:${visitorId}`;
  };
}

function buildFunnelPeriod(events: AdminEvent[], from: Date, label: string): DashboardPeriod {
  const filtered = events.filter((event) => new Date(event.created_at) >= from);
  const values = [
    {
      key: "home_view",
      label: "Página inicial",
      value: countUniqueUsers(filtered, HOME_VIEW_EVENTS)
    },
    {
      key: "quiz_started",
      label: "Iniciaram questionário",
      value: countUniqueUsers(filtered, QUIZ_START_EVENTS)
    },
    {
      key: "signup",
      label: "Criaram conta",
      value: countUniqueUsers(filtered, SIGNUP_EVENTS)
    },
    {
      key: "cta_click",
      label: "Clicaram na CTA",
      value: countUniqueUsers(filtered, CTA_EVENTS)
    }
  ];

  return {
    label,
    steps: values.map((step, index) => ({
      ...step,
      conversion: index === 0 ? null : calculateConversion(values[index - 1].value, step.value)
    }))
  };
}

function buildRetentionMetrics(
  users: Array<{ id: string; created_at: string }>,
  events: AdminEvent[]
): RetentionMetric[] {
  const now = Date.now();
  const activityByUser = new Map<string, number[]>();

  for (const event of events) {
    if (!hasEventName(RETURN_ACTIVITY_EVENTS, event.event_name) || !event.user_id || !event.created_at) {
      continue;
    }

    const timestamp = new Date(event.created_at).getTime();
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const current = activityByUser.get(event.user_id) ?? [];
    current.push(timestamp);
    activityByUser.set(event.user_id, current);
  }

  for (const timestamps of activityByUser.values()) {
    timestamps.sort((left, right) => left - right);
  }

  return RETENTION_WINDOWS.map((windowConfig) => {
    let eligibleUsers = 0;
    let returnedUsers = 0;

    for (const user of users) {
      const baseline = new Date(user.created_at).getTime();

      if (!Number.isFinite(baseline)) {
        continue;
      }

      const eligibilityCutoff = baseline + daysToMs(windowConfig.eligibleAfterDays);
      if (eligibilityCutoff > now) {
        continue;
      }

      eligibleUsers += 1;

      const returnStart = baseline + hoursToMs(windowConfig.startHours);
      const returnEnd = baseline + daysToMs(windowConfig.endDays);
      const timestamps = activityByUser.get(user.id) ?? [];
      const hasReturnInWindow = timestamps.some((timestamp) => timestamp >= returnStart && timestamp <= returnEnd);

      if (hasReturnInWindow) {
        returnedUsers += 1;
      }
    }

    return {
      key: windowConfig.key,
      label: windowConfig.label,
      windowLabel: windowConfig.windowLabel,
      returnedUsers,
      eligibleUsers,
      percentage: eligibleUsers ? Math.round((returnedUsers / eligibleUsers) * 100) : null
    };
  });
}

function countUniqueUsers(events: AdminEvent[], names: string[]) {
  return new Set(
    events
      .filter((event) => hasEventName(names, event.event_name))
      .map((event) => event.user_id)
      .filter(Boolean)
  ).size;
}

function hasEventName(names: readonly string[], eventName: string) {
  return (names as readonly string[]).includes(eventName);
}

function isWithinWindow(value: string | undefined, window: TimeWindow) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const fromTime = window.from.getTime();
  const toTime = window.to?.getTime();
  return timestamp >= fromTime && (toTime === undefined || timestamp < toTime);
}

function normalizeIdentityToken(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function isRegisteredDashboardUser(user: DashboardUserRow) {
  return normalizeDashboardUserRole(user.role) !== "admin";
}

function normalizeDashboardUserRole(role: string | null | undefined) {
  return typeof role === "string" ? role.trim().toLowerCase() : "user";
}

function toDistribution(values: string[], overrideTotal?: number) {
  const validValues = values.filter(Boolean);
  const countBase = validValues.length;

  if (!countBase) {
    return [];
  }

  // Se um total externo for fornecido (ex: total de cadastros), as porcentagens
  // ficam relativas a ele — permitindo ver "% do total de usuários" em vez de
  // "% de quem respondeu". Usa countBase como fallback.
  const percentBase = overrideTotal && overrideTotal > 0 ? overrideTotal : countBase;

  const counts = new Map<string, number>();
  for (const value of validValues) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / percentBase) * 100)
    }));
}

function getRecentSystemErrors(events: AdminEvent[]) {
  return events
    .filter((event) => event.event_name.toLowerCase().includes("error"))
    .slice(0, 10)
    .map((event) => ({
      id: event.id,
      message:
        getMetadataString(event.metadata, "message") ??
        getMetadataString(event.metadata, "error") ??
        "Erro sem mensagem detalhada.",
      origin:
        getMetadataString(event.metadata, "origin") ??
        getMetadataString(event.metadata, "source") ??
        event.event_name,
      created_at: event.created_at
    }));
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildQueryError(id: string, message: string | undefined, origin: string) {
  if (!message) return null;
  return {
    id,
    message,
    origin,
    created_at: new Date().toISOString()
  };
}

function normalizeAnswers(value: Partial<QuizAnswers> | Record<string, unknown>) {
  if (!value || typeof value !== "object") return null;
  return value as Partial<QuizAnswers> & Record<string, unknown>;
}

function getAgeBucket(answers: Partial<QuizAnswers> & Record<string, unknown>) {
  const rawAge = answers.age ?? answers["idade"] ?? answers["age_range"] ?? answers["faixa_etaria"];

  if (typeof rawAge === "number") {
    return ageToBucket(rawAge);
  }

  if (typeof rawAge === "string") {
    const parsed = Number.parseInt(rawAge, 10);
    if (!Number.isNaN(parsed)) {
      return ageToBucket(parsed);
    }

    const normalized = rawAge.trim().toLowerCase();
    if (normalized) {
      return rawAge;
    }
  }

  return "Não informado";
}

function ageToBucket(age: number) {
  if (age < 18) return "Menos de 18";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

function calculateConversion(previous: number, current: number) {
  if (!previous) return 0;
  return Math.round((current / previous) * 100);
}

function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000;
}

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

function startOfToday() {
  const now = new Date();
  // Usa o fuso horário de Brasília (America/Sao_Paulo = UTC-3, sem horário de verão desde 2019).
  // O servidor roda em UTC, então sem essa correção a "virada do dia" acontece às 21h no Brasil.
  // sv-SE locale retorna YYYY-MM-DD — meia-noite em Brasília equivale a 03:00 UTC.
  const dateInBrasilia = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dateInBrasilia}T03:00:00.000Z`);
}

function startOfLastDays(days: number) {
  const now = new Date();
  const dateInBrasilia = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const todayMidnightBrasilia = new Date(`${dateInBrasilia}T03:00:00.000Z`);
  todayMidnightBrasilia.setUTCDate(todayMidnightBrasilia.getUTCDate() - (days - 1));
  return todayMidnightBrasilia;
}

export function getExerciseMetaSummary(exercise: AdminExercise) {
  const level = Array.isArray(exercise.level)
    ? exercise.level
    : exercise.level
      ? [exercise.level]
      : Array.isArray(exercise.metadata?.level)
        ? exercise.metadata.level
        : exercise.metadata?.level
          ? [exercise.metadata.level]
          : [];

  return [
    formatExerciseMuscleGroups(exercise),
    formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null),
    ...level,
    ...(exercise.location ?? exercise.metadata?.location ?? []),
    ...(exercise.equipment ?? exercise.metadata?.equipment ?? [])
  ]
    .filter(Boolean)
    .join(", ") || (exercise.tags ?? []).join(", ");
}

export function getTodayCount(values: Array<{ created_at?: string }>) {
  const today = new Date();
  return values.filter((value) => {
    if (!value.created_at) return false;
    return new Date(value.created_at).toDateString() === today.toDateString();
  }).length;
}

export function getEventCount(events: AdminEvent[], eventName: string) {
  return events.filter((event) => event.event_name === eventName).length;
}

export function getTodayEventCount(events: AdminEvent[], eventName: string) {
  return getTodayCount(events.filter((event) => event.event_name === eventName));
}

export function getMostCommonValue(values: string[]) {
  if (!values.length) return "-";

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
}

export function getWorkoutTypeLabel(workout: AdminWorkout) {
  return workout.exercises.sections?.map((section) => section.title).join(", ") || "Treino";
}

export function getMostUsedExercises(workouts: AdminWorkout[]) {
  const counts = new Map<string, number>();

  for (const workout of workouts) {
    const sections = workout.exercises.sections ?? [];
    for (const section of sections) {
      for (const exercise of section.exercises ?? []) {
        if (!exercise.name) continue;
        counts.set(exercise.name, (counts.get(exercise.name) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function getAlerts(users: AdminUser[], events: AdminEvent[]) {
  const alerts: string[] = [];
  const usersToday = getTodayCount(users);
  const quizCompletedToday = getTodayEventCount(events, "quiz_completed");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const quizCompletedYesterday = events.filter((event) => {
    return event.event_name === "quiz_completed" && new Date(event.created_at).toDateString() === yesterday.toDateString();
  }).length;

  if (usersToday === 0) {
    alerts.push("Nenhum novo usuário entrou hoje.");
  }

  if (quizCompletedYesterday > 0 && quizCompletedToday < quizCompletedYesterday) {
    alerts.push("Queda na conclusão do quiz em relação a ontem.");
  }

  return alerts;
}

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


