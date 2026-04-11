"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import {
  AdminDashboardData,
  DashboardPeriod,
  DashboardWindowKey,
  DistributionDatum,
  RetentionMetric,
  formatDate
} from "@/lib/admin-shared";
import { clientLogError } from "@/lib/client-logger";

export function AdminDashboardOverview({ data }: { data: AdminDashboardData }) {
  const [period, setPeriod] = useState<DashboardWindowKey>("weekly");
  const [exporting, setExporting] = useState(false);
  const activeUsers = data.activeUsers[period];
  const totalUsers = data.totalUsers;
  const deletedUsers = data.deletedUsers;
  const funnel = data.funnel[period];
  const totalForPie = useMemo(
    () => ({
      gender: data.genderDistribution.reduce((sum, item) => sum + item.value, 0),
      goal: data.goalDistribution.reduce((sum, item) => sum + item.value, 0)
    }),
    [data.genderDistribution, data.goalDistribution]
  );

  async function handleExportMonthly() {
    try {
      setExporting(true);
      const response = await fetchWithAuth("/api/admin/dashboard/export-monthly");

      if (!response.ok) {
        throw new Error("Não foi possível exportar o CSV mensal.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = "dashboard-mensal.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      clientLogError("ADMIN CSV EXPORT ERROR", error);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <SummaryMetricCard
          label="Usuários totais"
          value={String(totalUsers)}
          description={getTotalUsersDescription(period, activeUsers)}
        />
        <SummaryMetricCard
          label="Contas excluídas"
          value={String(deletedUsers)}
          description="Usuários que deletaram a conta."
        />

        {data.retention.map((metric) => (
          <RetentionMetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.95fr)]">
        <Card className="min-w-0 space-y-4 overflow-hidden p-4 sm:p-[1.15rem]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-2">
              <h2 className="text-[1.2rem] font-semibold text-white">Funil</h2>
              <p className="text-[12px] leading-5 text-white/56">
                Eventos do produto com fallback persistido de onboarding quando o topo do funil não foi trackeado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <PeriodButton active={period === "daily"} onClick={() => setPeriod("daily")}>
                Visão diária
              </PeriodButton>
              <PeriodButton active={period === "weekly"} onClick={() => setPeriod("weekly")}>
                Visão semanal
              </PeriodButton>
              <button
                type="button"
                onClick={handleExportMonthly}
                disabled={exporting}
                className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-60 sm:w-auto"
              >
                {exporting ? "Exportando..." : "Exportar CSV mensal"}
              </button>
            </div>
          </div>

          <FunnelView funnel={funnel} />
        </Card>

        <div className="grid min-w-0 gap-4">
          <DistributionBarCard
            title="Distribuição por idade"
            data={data.ageDistribution}
            emptyLabel="Sem faixa etaria registrada."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <DistributionPieCard
              title="Distribuição por gênero"
              data={data.genderDistribution}
              total={totalForPie.gender}
              emptyLabel="Sem gênero registrado."
            />
            <DistributionPieCard
              title="Distribuição por objetivo"
              data={data.goalDistribution}
              total={totalForPie.goal}
              emptyLabel="Sem objetivo registrado."
            />
          </div>
        </div>
      </section>

      <Card className="min-w-0 space-y-4 overflow-hidden p-4 sm:p-[1.15rem]">
        <div className="space-y-2">
          <h2 className="text-[1.2rem] font-semibold text-white">Log de erros</h2>
          <p className="text-[12px] leading-5 text-white/56">
            Últimos erros capturados pelo sistema para apoio operacional do admin.
          </p>
        </div>

        {data.errors.length ? (
          <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
            {data.errors.map((error) => (
              <div key={error.id} className="rounded-[18px] border border-white/8 bg-black/20 px-3.5 py-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[12px] font-medium leading-5 text-white">{error.message}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">{error.origin}</p>
                  </div>
                  <p className="shrink-0 text-[10px] text-white/52">{formatDate(error.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-5 text-[12px] text-white/60">
            Sem erros recentes
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryMetricCard({
  label,
  value,
  description
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="min-w-0 space-y-2.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="text-[1.85rem] font-semibold leading-none text-white">{value}</p>
      <p className="text-[12px] leading-5 text-white/58">{description}</p>
    </Card>
  );
}

function RetentionMetricCard({ metric }: { metric: RetentionMetric }) {
  const valueLabel = metric.percentage === null ? "Sem base" : `${metric.percentage}%`;
  const detailLabel =
    metric.eligibleUsers === 0
      ? "Ainda não há usuários suficientes para fechar essa janela."
      : `${metric.returnedUsers} de ${metric.eligibleUsers} usuários elegíveis retornaram.`;

  return (
    <Card className="min-w-0 space-y-2.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{metric.label}</p>
        <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/58">
          {metric.windowLabel}
        </span>
      </div>

      <p className="text-[1.85rem] font-semibold leading-none text-white">{valueLabel}</p>
      <p className="text-[12px] leading-5 text-white/58">{detailLabel}</p>
    </Card>
  );
}

function PeriodButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
        active ? "bg-primary text-white" : "bg-white/5 text-white/62 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function DistributionBarCard({
  title,
  data,
  emptyLabel
}: {
  title: string;
  data: DistributionDatum[];
  emptyLabel: string;
}) {
  return (
    <Card className="min-w-0 space-y-3.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <h2 className="text-[1rem] font-semibold text-white">{title}</h2>
      {data.length ? (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]">
                <span className="break-words leading-5 text-white/70">{item.label}</span>
                <span className="text-[11px] text-white">{item.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/8">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-primary to-primaryStrong"
                  style={{ width: `${Math.max(item.percentage, 6)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-white/52">{emptyLabel}</p>
      )}
    </Card>
  );
}

function DistributionPieCard({
  title,
  data,
  total,
  emptyLabel
}: {
  title: string;
  data: DistributionDatum[];
  total: number;
  emptyLabel: string;
}) {
  const gradient = useMemo(() => buildPieGradient(data), [data]);

  return (
    <Card className="min-w-0 space-y-3.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <h2 className="text-[1rem] font-semibold text-white">{title}</h2>
      {data.length ? (
        <div className="grid gap-3 min-[440px]:grid-cols-[76px_minmax(0,1fr)] min-[440px]:items-center">
          <div
            className="mx-auto h-[72px] w-[72px] rounded-full border border-white/8 sm:h-[84px] sm:w-[84px]"
            style={{ backgroundImage: gradient }}
          />
          <div className="space-y-2.5">
            {data.map((item, index) => (
              <div key={item.label} className="min-w-0 space-y-0.5">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="break-words text-[11px] leading-4 text-white/70">{item.label}</span>
                </div>
                <p className="pl-4 text-[10px] leading-4 text-white/56">
                  {item.value} {total ? `(${item.percentage}%)` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-white/52">{emptyLabel}</p>
      )}
    </Card>
  );
}

function FunnelView({ funnel }: { funnel: DashboardPeriod }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {funnel.steps.map((step) => (
        <div key={step.key} className="min-w-0 rounded-[18px] border border-white/8 bg-black/20 p-3.5 sm:p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{step.label}</p>
          <p className="mt-2.5 text-[1.85rem] font-semibold leading-none text-white">{step.value}</p>
          <p className="mt-2 text-[12px] leading-5 text-white/56">
            {step.conversion === null ? "Base inicial" : `${step.conversion}% de conversão`}
          </p>
        </div>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#22c55e", "#84cc16", "#facc15", "#38bdf8", "#f97316"];

function buildPieGradient(data: DistributionDatum[]) {
  let current = 0;
  const segments = data.map((item, index) => {
    const start = current;
    const end = current + item.percentage;
    current = end;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function getTotalUsersDescription(period: DashboardWindowKey, activeUsers: number) {
  if (period === "daily") {
    return `${activeUsers} com atividade ou onboarding salvo hoje.`;
  }

  return `${activeUsers} com atividade ou onboarding salvo nos últimos 7 dias.`;
}
