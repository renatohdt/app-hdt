"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import {
  buildWeeklySchedule,
  formatWorkoutDisplayTitle,
  type AppWorkoutData
} from "@/lib/app-workout";

type PlannedWorkoutDay = {
  workoutKey: string | null;
  workoutLabel: string;
};

type RecordedSessionItem = {
  id: string;
  date: Date;
  dateKey: string;
  workoutKey: string | null;
  workoutLabel: string;
  sessionNumber: number | null;
};

type CalendarDayCell = {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  plannedWorkout: PlannedWorkoutDay | null;
  completedSessions: RecordedSessionItem[];
};

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"] as const;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric"
});
export function CalendarScreen({ data }: { data: AppWorkoutData }) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

  const plannedWorkoutsByWeekday = useMemo(() => {
    const schedule = buildWeeklySchedule(data);

    return new Map<number, PlannedWorkoutDay>(
      schedule
        .filter((item) => !item.isRest && item.workoutLabel)
        .map((item) => [
          item.index,
          {
            workoutKey: item.workoutKey,
            workoutLabel: item.workoutLabel ?? "Treino planejado"
          }
        ])
    );
  }, [data]);

  const recordedSessions = useMemo(() => {
    return data.sessionLogs
      .map((entry) => {
        const completedAt = new Date(entry.completedAt);
        if (Number.isNaN(completedAt.getTime())) {
          return null;
        }

        const workout = entry.workoutKey ? data.workouts[entry.workoutKey] : undefined;
        const workoutLabel = workout
          ? formatWorkoutDisplayTitle(workout.title, workout.day)
          : entry.workoutKey
            ? `Treino ${entry.workoutKey}`
            : "Treino concluido";

        return {
          id: entry.id,
          date: completedAt,
          dateKey: toDateKey(completedAt),
          workoutKey: entry.workoutKey ?? null,
          workoutLabel,
          sessionNumber: entry.sessionNumber > 0 ? entry.sessionNumber : null
        } satisfies RecordedSessionItem;
      })
      .filter((entry): entry is RecordedSessionItem => Boolean(entry))
      .sort((left, right) => right.date.getTime() - left.date.getTime());
  }, [data]);

  const recordedSessionsByDate = useMemo(() => {
    const grouped = new Map<string, RecordedSessionItem[]>();

    for (const session of recordedSessions) {
      const current = grouped.get(session.dateKey) ?? [];
      current.push(session);
      grouped.set(session.dateKey, current);
    }

    return grouped;
  }, [recordedSessions]);

  const monthCells = useMemo(() => {
    return buildCalendarMonth(visibleMonth, plannedWorkoutsByWeekday, recordedSessionsByDate);
  }, [plannedWorkoutsByWeekday, recordedSessionsByDate, visibleMonth]);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const visibleMonthSessions = useMemo(() => {
    return recordedSessions.filter((session) => isSameMonth(session.date, visibleMonth));
  }, [recordedSessions, visibleMonth]);

  const registerSessions = useMemo(() => {
    if (!selectedDateKey) {
      return visibleMonthSessions;
    }

    const selectedSessions = visibleMonthSessions.filter((session) => session.dateKey === selectedDateKey);
    const remainingSessions = visibleMonthSessions.filter((session) => session.dateKey !== selectedDateKey);

    return [...selectedSessions, ...remainingSessions];
  }, [selectedDateKey, visibleMonthSessions]);

  const plannedSessionsInMonth = useMemo(() => {
    return monthCells.filter((cell) => cell.isCurrentMonth && cell.plannedWorkout).length;
  }, [monthCells]);

  const completedSessionsInMonth = visibleMonthSessions.length;
  const monthTitle = capitalizeLabel(MONTH_FORMATTER.format(visibleMonth));

  return (
    <AppShell className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedDateKey(null);
              setVisibleMonth((current) => addMonths(current, -1));
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-primary/18 hover:text-primary sm:h-11 sm:w-11 sm:rounded-[16px]"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <div className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-center sm:flex-none sm:px-4">
            <p className="truncate text-[13px] font-semibold text-white sm:text-sm">{monthTitle}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedDateKey(null);
              setVisibleMonth((current) => addMonths(current, 1));
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-primary/18 hover:text-primary sm:h-11 sm:w-11 sm:rounded-[16px]"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 px-0.5 sm:gap-2 sm:px-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/34 sm:text-[11px] sm:tracking-[0.12em]">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {monthCells.map((cell) => {
            const isCompleted = cell.completedSessions.length > 0;
            const isPlanned = Boolean(cell.plannedWorkout);

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => {
                  if (cell.completedSessions.length > 0) {
                    setSelectedDateKey((current) => (current === cell.dateKey ? null : cell.dateKey));
                    return;
                  }

                  if (selectedDateKey === cell.dateKey) {
                    setSelectedDateKey(null);
                  }
                }}
                disabled={!cell.isCurrentMonth}
                className={clsx(
                  "flex aspect-square min-h-0 items-center justify-center rounded-[16px] text-center transition sm:rounded-[18px]",
                  !cell.isCurrentMonth && "cursor-default opacity-45",
                  cell.dateKey === selectedDateKey && "ring-2 ring-inset ring-primary/65"
                )}
                aria-label={cell.isCurrentMonth ? `Dia ${cell.dayNumber}` : undefined}
              >
                <span
                  className={clsx(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold transition sm:h-10 sm:w-10 sm:text-sm",
                    cell.isCurrentMonth ? "text-white" : "text-white/28",
                    isCompleted && cell.isCurrentMonth && "bg-primary text-[#041a0b]",
                    !isCompleted && isPlanned && cell.isCurrentMonth && "border border-primary/70 text-primary",
                    cell.isToday && cell.isCurrentMonth && !isCompleted && !isPlanned && "bg-white/70 text-[#0b0b0b]",
                    cell.isCurrentMonth && !isCompleted && !isPlanned && !cell.isToday && "bg-transparent"
                  )}
                >
                  {cell.dayNumber}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/8 pt-4 text-[10px] font-medium text-white/54 sm:gap-x-4 sm:text-[11px]">
          <LegendItem tone="completed" label="Treino concluído" />
          <LegendItem tone="planned" label="Treino planejado" />
          <LegendItem tone="today" label="Hoje" />
        </div>
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Registro</p>
            <h2 className="mt-0.5 text-[16px] font-semibold leading-6 text-white">
              {`Treinos realizados em ${monthTitle}`}
            </h2>
          </div>
        </div>

        {registerSessions.length ? (
          <div className="max-h-[15.5rem] space-y-2 overflow-y-auto pr-1">
            {registerSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2.5 rounded-[22px] border border-primary/14 bg-primary/[0.08] p-3"
              >
                <div className="inline-flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#0f2817] px-2">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary/70">
                    {WEEKDAY_LABELS[getWeekdayIndex(session.date)]}
                  </span>
                  <span className="text-[1.05rem] font-semibold text-white">{session.date.getDate()}</span>
                </div>

                <div className="min-w-0 flex flex-1 items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{session.workoutLabel}</p>
                    {session.sessionNumber ? (
                      <span className="shrink-0 text-sm font-semibold text-white">Sessão {session.sessionNumber}</span>
                    ) : null}
                  </div>

                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <CheckCircle2 className="h-[21px] w-[21px]" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/62">
            Nenhum treino foi registrado neste mês ainda. Assim que você concluir uma sessão em{" "}
            <strong className="text-white">Treino</strong>, o dia vai ganhar destaque no calendário e o registro aparece aqui embaixo.
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Progresso</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatPill label="Planejadas" value={`${plannedSessionsInMonth}`} tone="planned" />
          <StatPill label="Concluídas" value={`${completedSessionsInMonth}`} tone="completed" />
          <StatPill label="Ciclo atual" value={`${data.sessionProgress.currentSessionNumber}/${data.sessionProgress.totalSessions}`} />
        </div>
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Conquistas</p>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/62">
          Você não tem nenhuma conquista.
        </div>
      </Card>
    </AppShell>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "planned" | "completed";
}) {
  return (
    <div
      className={clsx(
        "flex min-h-[5.4rem] flex-col items-center justify-center rounded-[18px] border px-2 py-3 text-center",
        tone === "completed"
          ? "border-primary/16 bg-primary/[0.08]"
          : tone === "planned"
            ? "border-primary/10 bg-primary/[0.05]"
            : "border-white/10 bg-white/[0.03]"
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/38 sm:text-[10px]">
        {label}
      </p>
      <p
        className={clsx(
          "mt-1.5 text-base font-semibold sm:text-lg",
          tone === "completed" || tone === "planned" ? "text-white" : "text-white/88"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LegendItem({
  label,
  tone
}: {
  label: string;
  tone: "completed" | "planned" | "today";
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={clsx(
          "inline-flex h-2.5 w-2.5 rounded-full",
          tone === "completed" && "bg-primary",
          tone === "planned" && "border border-primary/70 bg-transparent",
          tone === "today" && "bg-white/70"
        )}
      />
      {label}
    </span>
  );
}

function buildCalendarMonth(
  visibleMonth: Date,
  plannedWorkoutsByWeekday: Map<number, PlannedWorkoutDay>,
  recordedSessionsByDate: Map<string, RecordedSessionItem[]>
) {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = addDays(monthStart, -getWeekdayIndex(monthStart));

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);
    const isCurrentMonth = isSameMonth(date, visibleMonth);

    return {
      date,
      dateKey,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday: isSameDay(date, new Date()),
      plannedWorkout: isCurrentMonth ? plannedWorkoutsByWeekday.get(getWeekdayIndex(date)) ?? null : null,
      completedSessions: isCurrentMonth ? recordedSessionsByDate.get(dateKey) ?? [] : []
    } satisfies CalendarDayCell;
  });
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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function capitalizeLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
