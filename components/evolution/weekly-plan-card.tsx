"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, Lock, Pencil } from "lucide-react";
import { Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { toLocalDateKey } from "@/lib/evolution";
import type { PlannedDay } from "@/lib/weekly-plan";

// Índices internos: 0 = seg … 6 = dom (formato salvo). Exibição começa no domingo.
const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

type DayCell = {
  label: string;
  dateKey: string;
  state: "done" | "missed" | "planned" | "rest" | "rest_recovery";
  workoutKey: string | null;
  isToday: boolean;
};

// "Minha semana" — Premium escolhe os dias e vê a distribuição dos treinos.
// Free vê uma prévia borrada com convite ao Premium.
export function WeeklyPlanCard({
  locked,
  chosenDays,
  plannedDays,
  doneByDate,
  weeklyTarget,
  saving,
  cycleCompleted = false,
  onSaveDays
}: {
  locked: boolean;
  chosenDays: number[];
  plannedDays: PlannedDay[];
  doneByDate: Map<string, string>;
  weeklyTarget: number;
  saving: boolean;
  // Ciclo concluído: não há próximos treinos até montar o novo programa.
  cycleCompleted?: boolean;
  onSaveDays: (days: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>(chosenDays);
  const [showUpsell, setShowUpsell] = useState(false);

  const cells = buildWeekCells(plannedDays, doneByDate);
  const hasRecoveryRest = cells.some((c) => c.state === "rest_recovery");
  const chosenLabel = DISPLAY_ORDER.filter((d) => chosenDays.includes(d)).map((d) => DAY_LABELS[d]).join(" · ");

  if (locked) {
    return (
      <Card className="relative min-h-[200px] overflow-hidden p-5">
        <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary">Minha semana</p>
          <p className="mt-1 text-sm font-bold text-white">Seus dias: Seg · Qua · Sex</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {["off", "A", "off", "B", "off", "C", "off"].map((v, i) => (
              <div key={i} className="rounded-xl bg-white/[0.06] py-3 text-center text-[10px] text-white/60">
                {DAY_LABELS[DISPLAY_ORDER[i]!]}
                <br />
                {v}
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowUpsell(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-6 text-center"
        >
          <Lock className="h-4 w-4 text-white/80" />
          <span className="mt-1.5 text-sm font-bold text-white">Monte sua semana como um personal</span>
          <span className="mt-1 text-xs leading-relaxed text-white/60">
            Escolha seus dias e o app organiza a ordem ideal dos treinos, com day off na hora certa e reorganização automática.
          </span>
          <span className="mt-3 rounded-xl bg-gradient-to-r from-primary to-primaryStrong px-4 py-2 text-xs font-bold text-black">
            Desbloquear no Premium
          </span>
        </button>
        {showUpsell ? <UpsellModal reason="weekly_plan" onClose={() => setShowUpsell(false)} /> : null}
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary">Minha semana</p>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(chosenDays);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70 hover:text-white"
          >
            <Pencil className="h-3 w-3" />
            Escolher dias
          </button>
        ) : null}
      </div>

      {editing ? (
        <>
          <p className="text-sm font-semibold text-white">Em quais dias você vai treinar?</p>
          <div className="grid grid-cols-7 gap-1">
            {DISPLAY_ORDER.map((index) => {
              const label = DAY_LABELS[index];
              const on = draft.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDraft((current) =>
                      on ? current.filter((d) => d !== index) : [...current, index].sort((a, b) => a - b)
                    )
                  }
                  className={clsx(
                    "rounded-xl border py-2.5 text-center text-[11px] font-semibold transition",
                    on ? "border-primary bg-primary/20 text-white" : "border-white/10 bg-white/[0.03] text-white/45"
                  )}
                >
                  {label}
                  <span className="mt-0.5 block text-[10px] font-bold">{on ? "treino" : "off"}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-white/50">
            {draft.length === 0
              ? "Escolha pelo menos 1 dia."
              : draft.length < weeklyTarget
                ? `Você escolheu ${draft.length} ${draft.length === 1 ? "dia" : "dias"}; seu programa prevê ${weeklyTarget} treinos por semana. Tudo bem: o programa só vai levar um pouco mais de tempo.`
                : "Os dias não escolhidos viram day off. O app distribui os treinos respeitando o descanso."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-2xl border border-white/10 py-2.5 text-sm font-semibold text-white/60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!draft.length || saving}
              onClick={() => {
                onSaveDays(draft);
                setEditing(false);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong py-2.5 text-sm font-bold text-black disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Salvar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-white">Seus dias: {chosenLabel || "—"}</p>
          {cycleCompleted ? (
            <p className="rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs leading-relaxed text-white/75">
              🏁 Programa concluído! Monte o próximo programa na tela inicial e sua semana volta a ser organizada aqui.
            </p>
          ) : null}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => (
              <div
                key={cell.dateKey}
                className={clsx(
                  "rounded-xl py-2 text-center text-[10px]",
                  cell.state === "done" && "bg-primary text-[#041a0b]",
                  cell.state === "planned" && "border border-primary/40 bg-primary/15 text-white",
                  (cell.state === "rest" || cell.state === "rest_recovery" || cell.state === "missed") && "bg-white/[0.04] text-white/40",
                  cell.isToday && cell.state !== "done" && "ring-1 ring-white/60"
                )}
              >
                <p className="font-semibold">{cell.label}</p>
                <p className={clsx("mt-0.5 font-bold", cell.state === "planned" && "text-primary")}>
                  {cell.state === "done"
                    ? `✓ ${cell.workoutKey ?? ""}`
                    : cell.state === "planned"
                      ? cell.workoutKey
                      : cell.state === "rest_recovery"
                        ? "💤"
                        : cell.state === "missed"
                          ? "—"
                          : "off"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-white/50">
            {hasRecoveryRest
              ? "💤 Recuperação: depois de um treino de corpo inteiro, ou para não repetir o mesmo grupo muscular, o dia vira descanso. "
              : ""}
            Perdeu um dia? A semana se reorganiza sozinha a partir de hoje.
          </p>
        </>
      )}
    </Card>
  );
}

// Semana atual (dom → sáb): passado mostra o que foi feito; de hoje em diante, o plano.
function buildWeekCells(plannedDays: PlannedDay[], doneByDate: Map<string, string>): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const plannedByKey = new Map(plannedDays.map((d) => [d.dateKey, d]));

  return DISPLAY_ORDER.map((weekdayIndex, offset) => {
    const label = DAY_LABELS[weekdayIndex];
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + offset);
    const dateKey = toLocalDateKey(date);
    const done = doneByDate.get(dateKey);
    const isToday = date.getTime() === today.getTime();
    const planned = plannedByKey.get(dateKey);
    let state: DayCell["state"];
    if (done) state = "done";
    else if (date < today) state = "missed";
    else if (planned?.workoutKey) state = "planned";
    else if (planned?.restReason === "after_full_body" || planned?.restReason === "same_group") state = "rest_recovery";
    else state = "rest";
    return { label, dateKey, state: state === "missed" && !done ? "missed" : state, workoutKey: done ?? planned?.workoutKey ?? null, isToday };
  });
}
