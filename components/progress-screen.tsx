"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, Gauge, Sparkles, TimerReset } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { getAchievementCopy, getPlanCoverage, type AppWorkoutData } from "@/lib/app-workout";

export function ProgressScreen({ data }: { data: AppWorkoutData }) {
  const coverage = getPlanCoverage(data);
  const achievement = getAchievementCopy(data);

  return (
    <AppShell>
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Progresso</p>
            <h1 className="mt-1 text-[1.9rem] font-semibold leading-tight text-white">Base de acompanhamento</h1>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Resumo do plano atual e da carga semanal estimada para preparar a evolução real nas próximas entregas.
            </p>
          </div>

          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/15 bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Gauge}
          label="Sessões"
          value={`${coverage.coveredSessions}/${coverage.totalSessions}`}
          description="Ciclo atual"
        />
        <MetricCard
          icon={TimerReset}
          label="Atual"
          value={`${data.sessionProgress.currentSessionNumber}`}
          description="Sessão em andamento"
        />
        <MetricCard
          icon={Sparkles}
          label="Duração média"
          value={`${data.averageDurationMinutes} min`}
          description="Por sessão"
        />
        <MetricCard
          icon={BarChart3}
          label="Exercícios"
          value={`${data.totalExercises}`}
          description="Volume do plano"
        />
      </div>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Leitura rápida</p>
          <h2 className="text-xl font-semibold text-white">{achievement.title}</h2>
          <p className="text-sm leading-6 text-white/62">{achievement.description}</p>
          <p className="text-sm leading-6 text-white/48">
            Bloco atual: {data.plan.blockDurationWeeks} semana(s) e {data.plan.totalSessions} sessões planejadas.
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/38">Progressão do plano</p>
          <p className="mt-2 text-sm leading-6 text-white/62">
            {data.sessionProgress.lastCompletedAt
              ? `Último registro em ${new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                }).format(new Date(data.sessionProgress.lastCompletedAt))}.`
              : "Quando os próximos módulos entrarem, esta área pode receber histórico de treinos, comparativos semanais e indicadores reais de consistência."}
          </p>
        </div>

        <Link
          href="/treino"
          className="inline-flex min-h-12 items-center gap-2 rounded-[20px] border border-primary/18 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:text-white"
        >
          Ver treino atual
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Card>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  description
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="rounded-[24px] p-4 sm:p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/48">{description}</p>
    </Card>
  );
}
