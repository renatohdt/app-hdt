"use client";

import Link from "next/link";
import { CalendarRange, ChevronRight, Dumbbell, Repeat2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { buildWeeklySchedule, type AppWorkoutData } from "@/lib/app-workout";

export function CalendarScreen({ data }: { data: AppWorkoutData }) {
  const schedule = buildWeeklySchedule(data);

  return (
    <AppShell>
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Calendário</p>
            <h1 className="mt-1 text-[1.9rem] font-semibold leading-tight text-white">Organize sua semana</h1>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Distribuição sugerida para encaixar o plano na rotina com recuperação entre as sessões.
            </p>
          </div>

          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/15 bg-primary/10 text-primary">
            <CalendarRange className="h-5 w-5" />
          </span>
        </div>
      </Card>

      <div className="space-y-3">
        {schedule.map((item) => (
          <Card
            key={item.dayLabel}
            className="flex items-center gap-4 rounded-[26px] p-4 sm:p-5"
          >
            <div className="inline-flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[16px] border border-white/10 bg-black/20">
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-white/38">{item.shortLabel}</span>
              <span className="text-sm font-semibold text-white">{item.index + 1}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{item.dayLabel}</p>
                  <p className="mt-1 text-sm text-white/58">
                    {item.isRest ? "Dia de recuperação" : item.workoutLabel}
                  </p>
                </div>

                <span
                  className={
                    item.isRest
                      ? "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/52"
                      : "rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                  }
                >
                  {item.note}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-primary/15 bg-primary/10 text-primary">
            <Repeat2 className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-white">Como usar essa base</p>
            <p className="text-sm leading-6 text-white/62">
              Esta tela já deixa pronta a estrutura para encaixar check-ins, reagendamento e controle real de execução nas próximas sprints.
            </p>
          </div>
        </div>

        <Link
          href="/treino"
          className="inline-flex min-h-12 items-center gap-2 rounded-[20px] border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-primary/20 hover:text-primary"
        >
          <Dumbbell className="h-4 w-4" />
          Abrir treino da semana
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Card>
    </AppShell>
  );
}
