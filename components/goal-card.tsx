"use client";

import { Target } from "lucide-react";
import { Card } from "@/components/ui";

export type ActiveGoalShape = {
  id: string;
  targetCount: number;
  periodDays: number;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  workoutsDone: number;
} | null;

export function getGoalProgress(goal: NonNullable<ActiveGoalShape>) {
  const done = goal.workoutsDone;
  const total = goal.targetCount;
  const pct = total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(goal.endsAt).getTime() - Date.now()) / 86_400_000));
  const isComplete = goal.completedAt !== null || done >= total;
  return { done, total, pct, daysLeft, isComplete };
}

// Card da meta pessoal (Evolução > Progresso). A criação acontece na gaveta
// GoalSheet; sem `onCreate` o card só exibe.
export function GoalCard({ activeGoal, onCreate }: { activeGoal: ActiveGoalShape; onCreate?: () => void }) {
  if (activeGoal) {
    const { done, total, pct, daysLeft, isComplete } = getGoalProgress(activeGoal);

    return (
      <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">Meta pessoal</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[20px] font-bold leading-none text-white">
              {done}
              <span className="text-[14px] font-semibold text-white/50">/{total}</span>
            </p>
            <p className="mt-1 text-[12px] text-white/52">treinos concluídos</p>
          </div>
          {isComplete ? (
            <span className="shrink-0 rounded-full bg-primary/20 px-3 py-1 text-[11px] font-semibold text-primary">
              Concluída!
            </span>
          ) : (
            <span className="shrink-0 text-xs text-white/40">
              {daysLeft === 0 ? "Último dia!" : `${daysLeft} ${daysLeft === 1 ? "dia restante" : "dias restantes"}`}
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primaryStrong transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {isComplete ? (
          onCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex min-h-10 items-center rounded-[16px] border border-primary/18 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/16"
            >
              Criar nova meta
            </button>
          ) : (
            <p className="text-[12px] text-white/40">Meta batida! Crie uma nova meta quando quiser.</p>
          )
        ) : (
          <p className="text-[12px] text-white/40">
            {pct}% concluído. Em {activeGoal.periodDays} dias, {total} treinos.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">Meta pessoal</p>
      </div>
      <p className="text-[14px] leading-[1.45] text-white/58">
        Defina quantos treinos quer fazer e em quanto tempo: um mês, três meses ou o ano inteiro.
      </p>
      {onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[16px] border border-primary/18 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/16"
        >
          Criar minha meta
        </button>
      ) : null}
    </Card>
  );
}
