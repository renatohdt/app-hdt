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
  const [period, setPeriod] = useState<DashboardWindowKey>("daily");
  const [exporting, setExporting] = useState(false);
  const activeUsers = data.activeUsers[period];
  const totalUsers = data.totalUsers;
  const deletedUsers = data.deletedUsers;
  const premiumUsers = data.premiumUsers;
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
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          Atualizar dados
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryMetricCard
          label="Usuários totais"
          value={String(totalUsers)}
          description="Total de cadastros realizados no app."
        />
        <SummaryMetricCard
          label="Contas excluídas"
          value={String(deletedUsers)}
          description="Usuários que deletaram a conta."
        />
        <SummaryMetricCard
          label="Usuários premium"
          value={String(premiumUsers)}
          description="Assinaturas ativas."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {data.retention.map((metric) => {
          // Sobrescreve active_7d e active_30d com os valores precisos do RPC de banco
          if (metric.key === "active_7d") {
            const count = data.activeUsersLast7d;
            const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : null;
            return (
              <RetentionMetricCard
                key={metric.key}
                metric={{
                  ...metric,
                  returnedUsers: count,
                  percentage: pct,
                  detail: `${count} de ${totalUsers} usuários acessaram o app nos últimos 7 dias.`
                }}
              />
            );
          }
          if (metric.key === "active_30d") {
            const count = data.activeUsersLast30d;
            const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : null;
            return (
              <RetentionMetricCard
                key={metric.key}
                metric={{
                  ...metric,
                  returnedUsers: count,
                  percentage: pct,
                  detail: `${count} de ${totalUsers} usuários acessaram o app nos últimos 30 dias.`
                }}
              />
            );
          }
          return <RetentionMetricCard key={metric.key} metric={metric} />;
        })}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          label="Novos (7 dias)"
          value={String(data.newUsersLast7Days)}
          description="Cadastros nos últimos 7 dias."
        />
      </section>

      <section className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
          Engajamento com as ferramentas
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryMetricCard
            label="Substituíram exercício"
            value={String(data.featureUsage.usersWithReplacement)}
            description="Usuários únicos que usaram substituição de exercício pelo menos 1 vez."
          />
          <SummaryMetricCard
            label="Geraram novo treino"
            value={String(data.featureUsage.usersWithNewWorkout)}
            description="Usuários únicos com 2 ou mais programas de treino gerados."
          />
          <SummaryMetricCard
            label="Concluíram sessão"
            value={String(data.featureUsage.usersWithCompletedSession)}
            description="Usuários únicos que marcaram ao menos uma sessão de treino como concluída."
          />
          <SummaryMetricCard
            label="Treino Extra"
            value={String(data.featureUsage.usersWithExtraWorkout)}
            description="Usuários únicos que geraram pelo menos 1 treino extra."
          />
          <SummaryMetricCard
            label="Criaram meta"
            value={String(data.featureUsage.usersWithGoals)}
            description="Usuários únicos que criaram ao menos uma meta de treino."
          />
          <SummaryMetricCard
            label="Vieram por indicação"
            value={String(data.featureUsage.usersRegisteredViaReferral)}
            description="Usuários que se cadastraram usando o cupom de outro usuário."
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
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

        <DistributionBarCard
          title="Distribuição por idade"
          data={data.ageDistribution}
          baseCount={totalUsers}
          emptyLabel="Sem faixa etaria registrada."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <DistributionPieCard
          title="Distribuição por gênero"
          data={data.genderDistribution}
          total={totalForPie.gender}
          baseCount={totalUsers}
          emptyLabel="Sem gênero registrado."
        />
        <DistributionPieCard
          title="Distribuição por objetivo"
          data={data.goalDistribution}
          total={totalForPie.goal}
          baseCount={totalUsers}
          emptyLabel="Sem objetivo registrado."
        />
      </section>

      <section className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
          Perfil dos usuários
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DistributionBarCard
            title="Dias por semana"
            data={data.daysDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de dias registrados."
          />
          <DistributionBarCard
            title="Nível"
            data={data.levelDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de nível registrados."
          />
          <DistributionBarCard
            title="Materiais"
            data={data.equipmentDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de materiais registrados."
          />
          <DistributionBarCard
            title="Tempo de treino"
            data={data.durationDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de duração registrados."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DistributionBarCard
            title="Método de treino"
            data={data.trainingStyleDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de método de treino registrados."
          />
          <DistributionBarCard
            title="Ênfase muscular"
            data={data.focusRegionDistribution}
            baseCount={totalUsers}
            emptyLabel="Sem dados de ênfase muscular registrados."
          />
        </div>
      </section>

      {data.premiumPotentialCount > 0 && (
        <section className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Oportunidade de conversão
          </p>
          <Card className="min-w-0 space-y-3 overflow-hidden p-4 sm:p-[1.15rem]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-white">Usuários free com potencial premium</h2>
                <p className="text-[12px] leading-5 text-white/56">
                  Usuários sem assinatura que finalizaram 5 ou mais treinos — comportamento recorrente é o principal sinal de potencial de conversão.
                </p>
              </div>
              <div className="shrink-0 rounded-[18px] border border-primary/30 bg-primary/10 px-5 py-3 text-center">
                <p className="text-[2rem] font-bold leading-none text-primary">{data.premiumPotentialCount}</p>
                <p className="mt-1 text-[10px] text-white/50">usuários</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-[12px]">
              <div className="rounded-[14px] border border-white/8 bg-black/20 px-3.5 py-3">
                <p className="text-white/45 text-[10px] uppercase tracking-[0.14em]">Critério</p>
                <p className="mt-1.5 text-white/80">2+ treinos gerados</p>
              </div>
              <div className="rounded-[14px] border border-white/8 bg-black/20 px-3.5 py-3">
                <p className="text-white/45 text-[10px] uppercase tracking-[0.14em]">Status</p>
                <p className="mt-1.5 text-white/80">Sem assinatura ativa</p>
              </div>
              <div className="rounded-[14px] border border-white/8 bg-black/20 px-3.5 py-3">
                <p className="text-white/45 text-[10px] uppercase tracking-[0.14em]">% do total</p>
                <p className="mt-1.5 text-white/80">
                  {totalUsers > 0 ? Math.round((data.premiumPotentialCount / totalUsers) * 100) : 0}% da base
                </p>
              </div>
            </div>
          </Card>
          <PremiumPotentialTable />
        </section>
      )}

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

  return (
    <Card className="min-w-0 space-y-2.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{metric.label}</p>
        <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/58">
          {metric.windowLabel}
        </span>
      </div>

      <p className="text-[1.85rem] font-semibold leading-none text-white">{valueLabel}</p>
      <p className="text-[12px] leading-5 text-white/58">{metric.detail}</p>
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
  baseCount,
  emptyLabel
}: {
  title: string;
  data: DistributionDatum[];
  baseCount?: number;
  emptyLabel: string;
}) {
  return (
    <Card className="min-w-0 space-y-3.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-semibold text-white">{title}</h2>
        {baseCount !== undefined && (
          <span className="shrink-0 text-[10px] text-white/40">base: {baseCount} usuários</span>
        )}
      </div>
      {data.length ? (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]">
                <span className="break-words leading-5 text-white/70">{item.label}</span>
                <span className="text-[11px] text-white">
                  {item.value} <span className="text-white/56">({item.percentage}%)</span>
                </span>
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
  baseCount,
  emptyLabel
}: {
  title: string;
  data: DistributionDatum[];
  total: number;
  baseCount?: number;
  emptyLabel: string;
}) {
  const gradient = useMemo(() => buildPieGradient(data), [data]);

  return (
    <Card className="min-w-0 space-y-3.5 overflow-hidden p-4 sm:p-[1.15rem]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-semibold text-white">{title}</h2>
        {baseCount !== undefined && (
          <span className="shrink-0 text-[10px] text-white/40">base: {baseCount} usuários</span>
        )}
      </div>
      {data.length ? (
        <div className="grid gap-5 min-[440px]:grid-cols-[auto_minmax(0,1fr)] min-[440px]:items-center">
          <div
            className="mx-auto h-[96px] w-[96px] rounded-full border border-white/8 sm:h-[120px] sm:w-[120px] lg:h-[144px] lg:w-[144px]"
            style={{ backgroundImage: gradient }}
          />
          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={item.label} className="min-w-0 space-y-0.5">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="break-words text-[12px] leading-5 text-white/72">{item.label}</span>
                </div>
                <p className="pl-[18px] text-[11px] leading-4 text-white/58">
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

type PremiumPotentialUser = {
  id: string;
  name: string;
  email: string;
  session_count: number;
  created_at: string;
  last_workout_at: string | null;
};

function PremiumPotentialTable() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [users, setUsers] = useState<PremiumPotentialUser[]>([]);

  async function load() {
    setStatus("loading");
    try {
      const res = await fetchWithAuth("/api/admin/premium-potential");
      if (!res.ok) throw new Error("Falha ao carregar");
      const json = await res.json();
      setUsers(json.data ?? []);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={load}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/14 py-3 text-[12px] font-semibold text-white/52 transition hover:border-primary/40 hover:text-primary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Ver lista de usuários
      </button>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-white/45">
        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Carregando lista...
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="py-4 text-center text-[12px] text-red-400/80">
        Não foi possível carregar a lista. Tente novamente.
      </p>
    );
  }

  if (!users.length) {
    return (
      <p className="py-4 text-center text-[12px] text-white/45">Nenhum usuário encontrado.</p>
    );
  }

  return (
    <div className="mt-1 overflow-x-auto rounded-[18px] border border-white/8">
      <table className="w-full min-w-[600px] text-[12px]">
        <thead>
          <tr className="border-b border-white/8 text-left text-[10px] uppercase tracking-[0.14em] text-white/40">
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium text-right">Sessões</th>
            <th className="px-4 py-3 font-medium">Cadastro</th>
            <th className="px-4 py-3 font-medium">Último treino</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((u) => (
            <tr key={u.id} className="transition hover:bg-white/[0.03]">
              <td className="px-4 py-3 text-white/85">{u.name}</td>
              <td className="px-4 py-3 text-white/65">{u.email}</td>
              <td className="px-4 py-3 text-right font-semibold text-primary">{u.session_count}</td>
              <td className="px-4 py-3 text-white/52">{formatDate(u.created_at)}</td>
              <td className="px-4 py-3 text-white/52">{u.last_workout_at ? formatDate(u.last_workout_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
