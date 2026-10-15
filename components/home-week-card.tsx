"use client";

// Card "Sua semana" da Home: os 7 dias (dom → sáb) com os treinos feitos,
// a meta semanal do plano e a meta pessoal logo abaixo.
// Free: vê os dias treinados + convite para planejar os dias (Premium).
// Premium: vê os dias planejados da "Minha semana" e os day offs.

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronRight, Crown, Plus, Target } from "lucide-react";
import { Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { getGoalProgress, type ActiveGoalShape } from "@/components/goal-card";
import type { AppWorkoutData } from "@/lib/app-workout";
import { buildWeekProgress, toLocalDateKey } from "@/lib/evolution";
import { getDefaultWeekdays } from "@/lib/weekly-plan-app";
import type { WorkoutSessionLogEntry } from "@/lib/workout-sessions";

const DAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"]; // getDay(): 0 = domingo

type CellState = "done" | "today" | "planned" | "off" | "idle";

export function HomeWeekCard({
  data,
  sessionLogs,
  isPremium,
  activeGoal,
  onCreateGoal
}: {
  data: AppWorkoutData;
  sessionLogs: WorkoutSessionLogEntry[];
  isPremium: boolean;
  activeGoal: ActiveGoalShape;
  onCreateGoal: () => void;
}) {
  const [showPlanUpsell, setShowPlanUpsell] = useState(false);

  const { cells, progress } = useMemo(() => {
    const dates = sessionLogs
      .map((log) => new Date(log.completedAt))
      .filter((date) => !Number.isNaN(date.getTime()));
    const doneKeys = new Set(dates.map(toLocalDateKey));

    // Dias planejados (Premium). Formato salvo: 0 = seg … 6 = dom.
    const chosen = new Set(data.weeklyPlanDays ?? getDefaultWeekdays(data));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());

    const weekCells = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + offset);
      const key = toLocalDateKey(date);
      const isToday = date.getTime() === today.getTime();
      const isFuture = date.getTime() > today.getTime();
      const planned = chosen.has((date.getDay() + 6) % 7);
      let state: CellState = "idle";
      if (doneKeys.has(key)) state = "done";
      else if (isToday) state = isPremium && !planned ? "off" : "today";
      else if (isPremium && isFuture) state = planned ? "planned" : "off";
      return { key, initial: DAY_INITIALS[date.getDay()], isToday, state };
    });

    return { cells: weekCells, progress: buildWeekProgress(dates, data.weeklyTarget) };
  }, [sessionLogs, data, isPremium]);

  const isPerfect = progress.done >= progress.target;
  const goal = activeGoal ? getGoalProgress(activeGoal) : null;

  return (
    <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/calendario" className="flex min-h-9 items-center gap-1 text-left">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">
            {isPremium ? "Minha semana" : "Sua semana"}
          </span>
          <span className="text-[12px] font-semibold text-white/55">
            · {isPerfect ? "Semana perfeita 🔥" : `${progress.done} de ${progress.target} treinos`}
          </span>
        </Link>
        {isPremium ? (
          <Link
            href="/calendario"
            className="inline-flex min-h-9 items-center gap-0.5 text-[12px] font-semibold text-white/45 transition hover:text-white/75"
          >
            Editar dias <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setShowPlanUpsell(true)}
            className="inline-flex min-h-9 items-center gap-1 text-[12px] font-semibold text-premium transition hover:brightness-110"
          >
            <Crown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Planejar dias
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <div key={cell.key} className="flex flex-col items-center gap-1">
            <span
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold",
                cell.state === "done" && "bg-primary text-[#062b0c]",
                cell.state === "today" && "border-2 border-primary text-primary",
                cell.state === "planned" && "border border-dashed border-primary/50",
                cell.state === "off" && "text-[10px] text-white/30",
                cell.state === "idle" && "bg-white/[0.06]",
                cell.isToday && cell.state !== "today" && "ring-2 ring-white/25 ring-offset-2 ring-offset-[#101010]"
              )}
              aria-label={labelFor(cell.state)}
            >
              {cell.state === "done" ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
              {cell.state === "off" ? "off" : null}
            </span>
            <span className={clsx("text-[11px]", cell.isToday ? "font-bold text-white" : "text-white/40")}>
              {cell.initial}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-white/[0.06] pt-3">
        {goal ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                <Target className="h-4 w-4 text-primary" aria-hidden />
                {goal.isComplete ? "Meta batida! 🎉" : `Meta: ${goal.done} de ${goal.total} treinos`}
              </p>
              {goal.isComplete ? (
                <button
                  type="button"
                  onClick={onCreateGoal}
                  className="min-h-9 text-[12px] font-semibold text-primary transition hover:brightness-110"
                >
                  Nova meta
                </button>
              ) : (
                <span className="text-[12px] text-white/45">
                  {goal.daysLeft === 0 ? "Último dia" : `${goal.daysLeft} ${goal.daysLeft === 1 ? "dia" : "dias"}`}
                </span>
              )}
            </div>
            {!goal.isComplete ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-primary/80" style={{ width: `${goal.pct}%` }} />
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onCreateGoal}
            className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <Plus className="h-4 w-4" aria-hidden /> Criar meta pessoal
            </span>
            <span className="text-[12px] text-white/40">1 mês, 3 meses ou o ano</span>
          </button>
        )}
      </div>

      {showPlanUpsell ? <UpsellModal reason="weekly_plan" onClose={() => setShowPlanUpsell(false)} /> : null}
    </Card>
  );
}

function labelFor(state: CellState) {
  switch (state) {
    case "done":
      return "Treinou";
    case "today":
      return "Hoje";
    case "planned":
      return "Treino planejado";
    case "off":
      return "Day off";
    default:
      return "Sem treino";
  }
}
