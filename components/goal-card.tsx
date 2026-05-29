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

export function GoalCard({
  activeGoal,
  showForm,
  goalTarget,
  goalDays,
  saving,
  onShowForm,
  onCancelForm,
  onChangeTarget,
  onChangeDays,
  onSubmit
}: {
  activeGoal: ActiveGoalShape;
  showForm: boolean;
  goalTarget: string;
  goalDays: string;
  saving: boolean;
  onShowForm: () => void;
  onCancelForm: () => void;
  onChangeTarget: (v: string) => void;
  onChangeDays: (v: string) => void;
  onSubmit: () => void;
}) {
  if (activeGoal) {
    const done = activeGoal.workoutsDone;
    const total = activeGoal.targetCount;
    const pct = total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0;
    const endsAt = new Date(activeGoal.endsAt);
    const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
    const isComplete = activeGoal.completedAt !== null || done >= total;

    return (
      <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/88">Meta pessoal</p>
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
              {daysLeft === 0 ? "Último dia!" : `${daysLeft} dias restantes`}
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primaryStrong transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[12px] text-white/40">
          {isComplete
            ? "Meta batida! Crie uma nova meta quando quiser."
            : `${pct}% concluído. Em ${activeGoal.periodDays} dias, ${total} treinos.`}
        </p>
      </Card>
    );
  }

  if (showForm) {
    return (
      <Card className="space-y-4 rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/88">Nova meta</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
              Treinos
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={goalTarget}
              onChange={(e) => onChangeTarget(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-primary/40"
              placeholder="Ex: 12"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
              Dias
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={goalDays}
              onChange={(e) => onChangeDays(e.target.value)}
              className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-primary/40"
              placeholder="Ex: 30"
            />
          </div>
        </div>
        <p className="text-xs text-white/40">
          {goalTarget && goalDays
            ? `Objetivo: ${goalTarget} treinos em ${goalDays} dias.`
            : "Preencha os campos acima."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !goalTarget || !goalDays}
            className="flex-1 rounded-[16px] bg-primary px-4 py-2.5 text-sm font-semibold text-[#041a0b] transition disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Criar meta"}
          </button>
          <button
            type="button"
            onClick={onCancelForm}
            className="rounded-[16px] border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </Card>
    );
  }

  // Estado: sem meta ativa — card convidativo para criar
  return (
    <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/88">Meta pessoal</p>
      </div>
      <p className="mb-4 text-[14px] leading-[1.45] text-white/58">
        Defina quantos treinos quer fazer e em quanto tempo. Acompanhe seu progresso direto aqui.
      </p>
      <button
        type="button"
        onClick={onShowForm}
        className="inline-flex min-h-10 items-center gap-2 rounded-[16px] border border-primary/18 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/16 hover:text-white"
      >
        Criar minha meta
      </button>
    </Card>
  );
}
