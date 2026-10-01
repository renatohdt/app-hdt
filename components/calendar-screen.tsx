"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { TrainingInlineAd } from "@/components/TrainingInlineAd";
import { AppShell } from "@/components/app-shell";
import { BodyMeasurementsPanel } from "@/components/body-measurements-panel";
import { Card } from "@/components/ui";
import { useSubscription } from "@/components/use-subscription";
import { DaySheet, type DaySheetSession } from "@/components/evolution/day-sheet";
import { ProgressTab } from "@/components/evolution/progress-tab";
import { SwipeTabs } from "@/components/evolution/swipe-tabs";
import { WeeklyPlanCard } from "@/components/evolution/weekly-plan-card";
import { calcConsistencyStats } from "@/lib/achievements";
import {
  buildTrainingExerciseRows,
  buildWeeklySchedule,
  formatWorkoutDisplayTitle,
  getFeaturedWorkoutKey,
  type AppWorkoutData
} from "@/lib/app-workout";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { buildSuggestedDays, buildWeekProgress, toLocalDateKey } from "@/lib/evolution";
import { buildWeeklyPlan } from "@/lib/weekly-plan";
import type { WorkoutSessionLogEntry } from "@/lib/workout-sessions";

const AchievementsModal = dynamic(() =>
  import("@/components/achievements-modal").then((m) => ({ default: m.AchievementsModal }))
);

// Página "Evolução" (rota /calendario): Agenda, Progresso e Corpo em abas que
// trocam tocando ou deslizando para o lado.

const TABS = [
  { key: "agenda", label: "Agenda" },
  { key: "progresso", label: "Progresso" },
  { key: "corpo", label: "Corpo" }
];

const CALENDAR_LOCATION_LABELS: Record<string, string> = {
  home: "Casa",
  condo_gym: "Condomínio",
  gym: "Academia"
};

type RecordedSessionItem = {
  id: string;
  workoutId: string;
  date: Date;
  dateKey: string;
  workoutKey: string | null;
  workoutLabel: string;
  isExtra: boolean;
  sessionNumber: number | null;
  liked: boolean | null;
  intensityLevel: number | null;
  location: string | null;
};

type CalendarDayCell = {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  suggestedKey: string | null;
  completedSessions: RecordedSessionItem[];
};

// Semana começa no domingo (padrão brasileiro).
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "long" });

export function CalendarScreen({ data }: { data: AppWorkoutData }) {
  const [activeTab, setActiveTab] = useState(0);
  // Abas já abertas. Progresso/Corpo (medidas e anúncios) só montam depois da
  // 1ª visita — evita buscar dados e exibir anúncio numa aba fora da tela.
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(() => new Set([0]));
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [showAchievements, setShowAchievements] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<WorkoutSessionLogEntry[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  // Só trata como free depois que a assinatura carregou (evita anúncio piscar para premium).
  const isFreePlan = !subscriptionLoading && !subscription?.isPremium;
  const isPremiumPlan = !subscriptionLoading && Boolean(subscription?.isPremium);

  // "Minha semana": dias escolhidos (Premium). Padrão = distribuição pela frequência.
  const defaultWeekdays = useMemo(
    () => buildWeeklySchedule(data).filter((item) => !item.isRest).map((item) => item.index),
    [data]
  );
  const [chosenDays, setChosenDays] = useState<number[]>(() => data.weeklyPlanDays ?? defaultWeekdays);
  const [savingPlan, setSavingPlan] = useState(false);

  async function handleSaveDays(days: number[]) {
    const previous = chosenDays;
    setChosenDays(days);
    setSavingPlan(true);
    try {
      const response = await fetchWithAuth("/api/evolution/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days })
      });
      if (!response.ok) throw new Error("save failed");
    } catch {
      setChosenDays(previous);
    } finally {
      setSavingPlan(false);
    }
  }

  // Deep link: /calendario?tab=progresso | corpo
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const index = TABS.findIndex((t) => t.key === tab);
    if (index > 0) setActiveTab(index);
  }, []);

  useEffect(() => {
    setVisitedTabs((current) => (current.has(activeTab) ? current : new Set(current).add(activeTab)));
  }, [activeTab]);

  const handleTabChange = useCallback((index: number) => setActiveTab(index), []);

  useEffect(() => {
    function fetchSessionLogs() {
      fetchWithAuth("/api/workout/session-logs")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.success && Array.isArray(json.data)) setSessionLogs(json.data);
        })
        .catch(() => {
          /* falha silenciosa */
        });
    }
    fetchSessionLogs();
    function handleVisibilityChange() {
      if (!document.hidden) fetchSessionLogs();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const consistencyStats = useMemo(() => {
    const stats = calcConsistencyStats(sessionLogs, data.weeklyTarget, data.sessionProgress.completedSessions, data.sessionProgress.totalSessions);
    // "Plano Concluído" continua desbloqueado depois que o próximo ciclo começa.
    return { ...stats, planCompleted: stats.planCompleted || data.hasCompletedCycleBefore };
  }, [sessionLogs, data.weeklyTarget, data.sessionProgress.completedSessions, data.sessionProgress.totalSessions, data.hasCompletedCycleBefore]);

  const recordedSessions = useMemo(() => {
    return sessionLogs
      .map((entry) => {
        const completedAt = new Date(entry.completedAt);
        if (Number.isNaN(completedAt.getTime())) return null;
        const isExtra = Boolean(entry.workoutKey?.startsWith("extra_"));
        const workout = entry.workoutKey && !isExtra ? data.workouts[entry.workoutKey] : undefined;
        const workoutLabel = isExtra
          ? "Treino Extra"
          : workout
            ? formatWorkoutDisplayTitle(workout.title, workout.day)
            : entry.workoutKey
              ? `Treino ${entry.workoutKey}`
              : "Treino concluído";
        return {
          id: entry.id,
          workoutId: entry.workoutId,
          date: completedAt,
          dateKey: toLocalDateKey(completedAt),
          workoutKey: entry.workoutKey ?? null,
          workoutLabel,
          isExtra,
          sessionNumber: entry.sessionNumber > 0 ? entry.sessionNumber : null,
          liked: entry.liked ?? null,
          intensityLevel: entry.intensityLevel ?? null,
          location: entry.location ?? null
        } satisfies RecordedSessionItem;
      })
      .filter((entry): entry is RecordedSessionItem => Boolean(entry))
      .sort((left, right) => right.date.getTime() - left.date.getTime());
  }, [sessionLogs, data.workouts]);

  const recordedSessionsByDate = useMemo(() => {
    const grouped = new Map<string, RecordedSessionItem[]>();
    for (const session of recordedSessions) {
      const current = grouped.get(session.dateKey) ?? [];
      current.push(session);
      grouped.set(session.dateKey, current);
    }
    return grouped;
  }, [recordedSessions]);

  const todayKey = toLocalDateKey(new Date());

  const weekProgress = useMemo(
    () => buildWeekProgress(recordedSessions.map((s) => s.date), data.weeklyTarget),
    [recordedSessions, data.weeklyTarget]
  );

  // Treinos do programa já feitos, por dia (para as regras e para a semana).
  const doneByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of [...recordedSessions].reverse()) {
      if (!session.isExtra && session.workoutKey) map.set(session.dateKey, session.workoutKey);
    }
    return map;
  }, [recordedSessions]);

  const trainedToday = doneByDate.has(todayKey);
  const nextWorkoutKey = getFeaturedWorkoutKey(data.workoutOrder, data.sessionProgress.lastCompletedWorkoutKey);

  // Premium: plano da "Minha semana" (dias escolhidos + regras de recuperação).
  const plannedDays = useMemo(() => {
    if (!isPremiumPlan || data.sessionProgress.cycleCompleted) return [];
    return buildWeeklyPlan({
      chosenWeekdays: chosenDays,
      workouts: data.workoutOrder.map((key) => ({
        key,
        focus: data.workouts[key]?.focus ?? null,
        splitType: data.workouts[key]?.splitType ?? null
      })),
      nextWorkoutKey,
      history: doneByDate,
      trainedToday,
      weeklyTarget: data.weeklyTarget,
      doneThisWeek: countDoneThisWeek(doneByDate)
    });
  }, [isPremiumPlan, data, chosenDays, nextWorkoutKey, doneByDate, trainedToday]);

  // Próximos treinos sugeridos no calendário (de hoje em diante).
  // Premium segue a "Minha semana"; Free usa a distribuição padrão na ordem A → B → C.
  const suggestedDays = useMemo(() => {
    if (data.sessionProgress.cycleCompleted) return new Map<string, string>();
    if (isPremiumPlan) {
      return new Map(plannedDays.filter((d) => d.workoutKey).map((d) => [d.dateKey, d.workoutKey!]));
    }
    return buildSuggestedDays({
      activeWeekdays: defaultWeekdays,
      workoutOrder: data.workoutOrder,
      nextWorkoutKey,
      trainedToday
    });
  }, [data.sessionProgress.cycleCompleted, data.workoutOrder, isPremiumPlan, plannedDays, defaultWeekdays, nextWorkoutKey, trainedToday]);

  const monthCells = useMemo(
    () => buildCalendarMonth(visibleMonth, suggestedDays, recordedSessionsByDate),
    [suggestedDays, recordedSessionsByDate, visibleMonth]
  );

  const visibleMonthSessions = useMemo(
    () => recordedSessions.filter((session) => isSameMonth(session.date, visibleMonth)),
    [recordedSessions, visibleMonth]
  );

  const monthTitle = capitalizeLabel(MONTH_FORMATTER.format(visibleMonth));

  // Dados do painel do dia selecionado.
  const sheet = useMemo(() => {
    if (!selectedDateKey) return null;
    const [y, m, d] = selectedDateKey.split("-").map(Number);
    const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
    const sessions: DaySheetSession[] = (recordedSessionsByDate.get(selectedDateKey) ?? []).map((s) => {
      const isCurrentPlan = !s.isExtra && s.workoutId === data.workoutId && s.workoutKey && data.workouts[s.workoutKey];
      return {
        id: s.id,
        workoutLabel: s.workoutLabel,
        isExtra: s.isExtra,
        sessionNumber: s.sessionNumber,
        liked: s.liked,
        intensityLevel: s.intensityLevel,
        location: s.location,
        plannedExerciseNames: isCurrentPlan
          ? buildTrainingExerciseRows(data.workouts[s.workoutKey!]).map((row) => row.name)
          : []
      };
    });
    const suggestedKey = suggestedDays.get(selectedDateKey) ?? null;
    const suggestedWorkout = suggestedKey ? data.workouts[suggestedKey] : undefined;
    return {
      dateLabel: capitalizeLabel(DAY_LABEL_FORMATTER.format(date)),
      sessions,
      suggested:
        !sessions.length && suggestedKey && suggestedWorkout
          ? {
              label: formatWorkoutDisplayTitle(suggestedWorkout.title, suggestedKey),
              exerciseCount: buildTrainingExerciseRows(suggestedWorkout).length
            }
          : null
    };
  }, [selectedDateKey, recordedSessionsByDate, suggestedDays, data.workoutId, data.workouts]);

  const agenda = (
    <>
      <WeekProgressCard progress={weekProgress} />

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-primary/18 hover:text-primary"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="truncate text-sm font-semibold text-white">{monthTitle}</p>
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-primary/18 hover:text-primary"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/34">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {monthCells.map((cell) => {
            const isCompleted = cell.completedSessions.length > 0;
            const isSuggested = Boolean(cell.suggestedKey) && !isCompleted;
            const isClickable = cell.isCurrentMonth && (isCompleted || isSuggested);
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => isClickable && setSelectedDateKey(cell.dateKey)}
                disabled={!isClickable}
                className={clsx(
                  "flex aspect-square min-h-0 items-center justify-center rounded-[16px] text-center transition",
                  !cell.isCurrentMonth && "opacity-45",
                  !isClickable && "cursor-default"
                )}
                aria-label={cell.isCurrentMonth ? `Dia ${cell.dayNumber}` : undefined}
              >
                <span
                  className={clsx(
                    "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold transition sm:h-10 sm:w-10 sm:text-sm",
                    cell.isCurrentMonth ? "text-white" : "text-white/28",
                    isCompleted && cell.isCurrentMonth && "bg-primary text-[#041a0b]",
                    isSuggested && cell.isCurrentMonth && "border border-dashed border-primary/70 text-primary",
                    cell.isToday && !isCompleted && "ring-2 ring-white/70",
                    cell.isToday && !isCompleted && !isSuggested && "bg-white/80 text-[#0b0b0b] ring-0"
                  )}
                >
                  {cell.dayNumber}
                  {isSuggested && cell.isCurrentMonth ? (
                    <span className="absolute -bottom-1.5 rounded-full bg-[#0b0d0b] px-1 text-[8px] font-bold leading-tight text-primary">
                      {cell.suggestedKey}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 pt-4 text-[11px] font-medium text-white/54">
          <LegendItem tone="completed" label="Concluído" />
          <LegendItem tone="planned" label="Sugerido" />
          <LegendItem tone="today" label="Hoje" />
          <span className="ml-auto text-white/35">Toque no dia para ver</span>
        </div>
      </Card>

      {!subscriptionLoading && !data.raw.program ? (
        <WeeklyPlanCard
          locked={!isPremiumPlan}
          chosenDays={chosenDays}
          plannedDays={plannedDays}
          doneByDate={doneByDate}
          weeklyTarget={data.weeklyTarget}
          saving={savingPlan}
          cycleCompleted={data.sessionProgress.cycleCompleted}
          onSaveDays={(days) => void handleSaveDays(days)}
        />
      ) : null}

      {isFreePlan ? <TrainingInlineAd /> : null}

      <Card className="space-y-3 p-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Registro</p>
          <h2 className="mt-0.5 text-[16px] font-semibold leading-6 text-white">{`Treinos realizados em ${monthTitle}`}</h2>
        </div>
        {visibleMonthSessions.length ? (
          <div className="max-h-[15.5rem] space-y-2 overflow-y-auto pr-1">
            {visibleMonthSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedDateKey(session.dateKey)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-[22px] border p-3 text-left transition hover:brightness-110",
                  session.isExtra ? "border-yellow-500/20 bg-yellow-500/[0.07]" : "border-primary/14 bg-primary/[0.08]"
                )}
              >
                <div className="inline-flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#0f2817] px-2">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary/70">
                    {WEEKDAY_LABELS[getWeekdayIndex(session.date)]}
                  </span>
                  <span className="text-[1.05rem] font-semibold text-white">{session.date.getDate()}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    {session.location ? (
                      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-primary/70">
                        {CALENDAR_LOCATION_LABELS[session.location] ?? session.location}
                      </p>
                    ) : null}
                    <div className="flex min-w-0 items-center gap-2">
                      {session.isExtra ? <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-400" /> : null}
                      <p className="truncate text-sm font-semibold text-white">{session.workoutLabel}</p>
                      {!session.isExtra && session.sessionNumber ? (
                        <span className="shrink-0 text-sm font-semibold text-white">Sessão {session.sessionNumber}</span>
                      ) : null}
                      {session.intensityLevel ? (
                        <span className="shrink-0 text-sm leading-none">
                          {(["😴", "😊", "😄", "😤", "😵"] as const)[session.intensityLevel - 1]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <CheckCircle2 className="h-[21px] w-[21px]" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/62">
            Nenhum treino foi registrado neste mês ainda. Assim que você concluir uma sessão em{" "}
            <strong className="text-white">Treino</strong>, o dia ganha destaque no calendário e o registro aparece aqui.
          </div>
        )}
      </Card>
    </>
  );

  const progresso = (
    <>
      <ProgressTab
        data={data}
        consistencyStats={consistencyStats}
        perfectWeeks={weekProgress.perfectWeeks}
        onOpenAchievements={() => setShowAchievements(true)}
      />
      {isFreePlan && visitedTabs.has(1) ? <GoogleAd /> : null}
    </>
  );

  const corpo = visitedTabs.has(2) ? (
    <>
      <BodyMeasurementsPanel age={(data.answers.age as number | undefined) ?? null} />
      {isFreePlan ? <TrainingInlineAd /> : null}
    </>
  ) : (
    <div className="h-64" />
  );

  return (
    <AppShell className="space-y-4">
      <div className="px-1">
        <h1 className="text-[22px] font-extrabold leading-tight text-white">Evolução</h1>
        <p className="text-sm text-white/50">Sua agenda, seus números e seu corpo</p>
      </div>

      <SwipeTabs tabs={TABS} activeIndex={activeTab} onChange={handleTabChange}>
        {[agenda, progresso, corpo]}
      </SwipeTabs>

      {sheet ? (
        <DaySheet
          dateLabel={sheet.dateLabel}
          sessions={sheet.sessions}
          suggested={sheet.suggested}
          onClose={() => setSelectedDateKey(null)}
        />
      ) : null}

      {showAchievements ? (
        <AchievementsModal data={{ ...data, consistencyStats }} onClose={() => setShowAchievements(false)} />
      ) : null}
    </AppShell>
  );
}

function WeekProgressCard({ progress }: { progress: ReturnType<typeof buildWeekProgress> }) {
  const pct = Math.min(100, Math.round((progress.done / progress.target) * 100));
  const complete = progress.remaining === 0;
  const title = complete
    ? "Semana Perfeita! 🔥"
    : progress.done === 0
      ? `Meta da semana: ${progress.target} ${progress.target === 1 ? "treino" : "treinos"}`
      : `Falta${progress.remaining === 1 ? "" : "m"} ${progress.remaining} ${progress.remaining === 1 ? "treino" : "treinos"} para a Semana Perfeita`;
  const subtitle =
    progress.perfectStreak > 1
      ? `Sequência: ${progress.perfectStreak} semanas perfeitas seguidas`
      : complete
        ? "Meta batida. Agora é recuperar bem."
        : "Bata a meta para ganhar pontos extras de nível.";

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-primary/25 bg-primary/10 p-3.5">
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(#22c55e ${pct * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0c140e]">
          <span className="text-xs font-bold text-white">
            {progress.done}/{progress.target}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary">Esta semana</p>
        <p className="text-sm font-bold leading-snug text-white">{title}</p>
        <p className="text-xs text-white/55">{subtitle}</p>
      </div>
    </div>
  );
}

function LegendItem({ label, tone }: { label: string; tone: "completed" | "planned" | "today" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={clsx(
          "inline-flex h-2.5 w-2.5 rounded-full",
          tone === "completed" && "bg-primary",
          tone === "planned" && "border border-dashed border-primary/70 bg-transparent",
          tone === "today" && "bg-white/70"
        )}
      />
      {label}
    </span>
  );
}

function buildCalendarMonth(
  visibleMonth: Date,
  suggestedDays: Map<string, string>,
  recordedSessionsByDate: Map<string, RecordedSessionItem[]>
) {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = addDays(monthStart, -getWeekdayIndex(monthStart));
  const today = new Date();
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toLocalDateKey(date);
    const isCurrentMonth = isSameMonth(date, visibleMonth);
    return {
      date,
      dateKey,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday: isSameDay(date, today),
      suggestedKey: isCurrentMonth ? suggestedDays.get(dateKey) ?? null : null,
      completedSessions: isCurrentMonth ? recordedSessionsByDate.get(dateKey) ?? [] : []
    } satisfies CalendarDayCell;
  });
}

// Treinos do programa feitos na semana atual (domingo → hoje).
function countDoneThisWeek(doneByDate: Map<string, string>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  for (let offset = 0; offset <= today.getDay(); offset++) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    if (doneByDate.has(toLocalDateKey(day))) count++;
  }
  return count;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}
function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}
// Índice da coluna no calendário: 0 = domingo … 6 = sábado.
function getWeekdayIndex(date: Date) {
  return date.getDay();
}
function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}
function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
function capitalizeLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
