"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { AdminDashboardData, DashboardPeriod, DistributionDatum, formatDate } from "@/lib/admin-shared";
import { clientLogError } from "@/lib/client-logger";

export function AdminDashboardOverview({ data }: { data: AdminDashboardData }) {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [exporting, setExporting] = useState(false);
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
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr_1fr_1fr]">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Usuários ativos</p>
          <p className="text-4xl font-semibold text-white">{data.activeUsers}</p>
        </Card>

        <DistributionBarCard title="Distribuição por idade" data={data.ageDistribution} emptyLabel="Sem faixa etária registrada." />
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

      <Card className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Funil</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriod("daily")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                period === "daily" ? "bg-primary text-white" : "bg-white/5 text-white/62"
              }`}
            >
              Visão diária
            </button>
            <button
              type="button"
              onClick={() => setPeriod("weekly")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                period === "weekly" ? "bg-primary text-white" : "bg-white/5 text-white/62"
              }`}
            >
              Visão semanal
            </button>
            <button
              type="button"
              onClick={handleExportMonthly}
              disabled={exporting}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {exporting ? "Exportando..." : "Exportar CSV mensal"}
            </button>
          </div>
        </div>

        <FunnelView funnel={funnel} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Log de erros</h2>
        {data.errors.length ? (
          <div className="space-y-3">
            {data.errors.map((error) => (
              <div key={error.id} className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">{error.message}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/45">{error.origin}</p>
                  </div>
                  <p className="text-xs text-white/52">{formatDate(error.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
            Sem erros recentes
          </div>
        )}
      </Card>
    </div>
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
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {data.length ? (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/72">{item.label}</span>
                <span className="text-white">{item.value}</span>
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
        <p className="text-sm text-white/52">{emptyLabel}</p>
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
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {data.length ? (
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
          <div
            className="mx-auto h-28 w-28 rounded-full border border-white/10"
            style={{ backgroundImage: gradient }}
          />
          <div className="space-y-2">
            {data.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="text-white/72">{item.label}</span>
                </div>
                <span className="text-white">
                  {item.value} {total ? `(${item.percentage}%)` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/52">{emptyLabel}</p>
      )}
    </Card>
  );
}

function FunnelView({ funnel }: { funnel: DashboardPeriod }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {funnel.steps.map((step) => (
        <div key={step.key} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">{step.label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{step.value}</p>
          <p className="mt-2 text-sm text-white/56">
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
