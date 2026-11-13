"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { AdminDashboardData, DistributionDatum, formatDate } from "@/lib/admin-shared";
import { formatBRL } from "@/lib/premium-pricing";

// Painel do PostHog (funil, retenção e atividade saíram do admin em out/2026).
const POSTHOG_DASHBOARDS_URL = "https://us.posthog.com/project/620910/dashboard";

type ProfileTab = "demografia" | "treino" | "local" | "enfase";

const PROFILE_TABS: Array<{ key: ProfileTab; label: string }> = [
  { key: "demografia", label: "Demografia" },
  { key: "treino", label: "Treino" },
  { key: "local", label: "Local e material" },
  { key: "enfase", label: "Ênfase muscular" }
];

function formatPercent(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function AdminDashboardOverview({ data }: { data: AdminDashboardData }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>("demografia");
  const totalUsers = data.totalUsers;

  // Horário calculado no navegador (evita diferença de fuso entre servidor e cliente).
  useEffect(() => {
    setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }, [data]);

  const conversion = totalUsers ? (data.premiumUsers / totalUsers) * 100 : null;

  const totalForPie = useMemo(
    () => ({
      gender: data.genderDistribution.reduce((sum, item) => sum + item.value, 0),
      goal: data.goalDistribution.reduce((sum, item) => sum + item.value, 0)
    }),
    [data.genderDistribution, data.goalDistribution]
  );

  const engagement = useMemo(() => {
    const usage = data.featureUsage;
    return [
      {
        label: "Concluíram sessão",
        value: usage.usersWithCompletedSession,
        help: "Usuários únicos que marcaram ao menos uma sessão de treino como concluída."
      },
      {
        label: "Substituíram exercício",
        value: usage.usersWithReplacement,
        help: "Usuários únicos que usaram substituição de exercício pelo menos 1 vez."
      },
      {
        label: "Geraram novo treino",
        value: usage.usersWithNewWorkout,
        help: "Usuários únicos com 2 ou mais programas de treino gerados."
      },
      {
        label: "Treino Extra",
        value: usage.usersWithExtraWorkout,
        help: "Usuários únicos que geraram pelo menos 1 treino extra."
      },
      {
        label: "Criaram meta",
        value: usage.usersWithGoals,
        help: "Usuários únicos que criaram ao menos uma meta de treino."
      }
    ]
      .map((item) => ({ ...item, percentage: totalUsers ? (item.value / totalUsers) * 100 : 0 }))
      .sort((left, right) => right.value - left.value);
  }, [data.featureUsage, totalUsers]);

  const store = data.premiumByStore ?? { stripe: 0, apple: 0, google: 0, test: 0 };
  const courtesy = data.courtesyPremium;

  // Novos 7 dias vs 7 dias anteriores
  const newUsersTrend = useMemo(() => {
    const previous = data.newUsersPrev7Days;
    const current = data.newUsersLast7Days;
    if (!previous) return { text: `vs 0 nos 7 dias anteriores`, tone: "flat" as const };
    const change = ((current - previous) / previous) * 100;
    const sign = change > 0 ? "+" : "";
    return {
      text: `${sign}${formatPercent(change)}% vs 7 dias anteriores (${previous})`,
      tone: change > 0 ? ("up" as const) : change < 0 ? ("down" as const) : ("flat" as const)
    };
  }, [data.newUsersLast7Days, data.newUsersPrev7Days]);

  return (
    <div className="space-y-5">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[11px] text-white/45">
          {isRefreshing ? "Atualizando..." : updatedAt ? `Atualizado às ${updatedAt}` : ""}
        </span>
        <button
          type="button"
          disabled={isRefreshing}
          onClick={() => startRefresh(() => router.refresh())}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          <svg className={isRefreshing ? "animate-spin" : ""} xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          Atualizar
        </button>
        <a
          href={POSTHOG_DASHBOARDS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/10"
        >
          Ver funil no PostHog ↗
        </a>
      </div>

      {/* Negócio — o que olhar primeiro */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroMetricCard
          highlight
          label="MRR estimado"
          value={formatBRL(data.mrrEstimate.total)}
          detail={`Stripe ${formatBRL(data.mrrEstimate.stripe)} · lojas ~${formatBRL(data.mrrEstimate.stores)}`}
          help="Receita mensal recorrente estimada, bruta (antes de taxas do Stripe e das lojas). Usa o preço de tabela da web: mensal R$ 14,90 e anual R$ 118,80 ÷ 12. As lojas não gravam o plano, então são estimadas na mesma proporção mensal/anual do Stripe."
        />
        <HeroMetricCard
          label="Premium pagantes"
          value={String(data.premiumUsers)}
          detail={`Stripe ${store.stripe} · Apple ${store.apple} · Google ${store.google}`}
          help="Assinaturas ativas (Stripe ativa ou em período de graça + lojas com expiração no futuro). Cortesias e compras de teste não entram."
        />
        <HeroMetricCard
          label="Conversão"
          value={conversion === null ? "—" : `${formatPercent(conversion)}%`}
          detail="premium pagantes ÷ usuários"
          help="Percentual da base de usuários ativos que paga o Premium hoje."
        />
        <HeroMetricCard
          label="Novos (7 dias)"
          value={String(data.newUsersLast7Days)}
          detail={newUsersTrend.text}
          detailTone={newUsersTrend.tone}
          help="Contas criadas nos últimos 7 dias (hoje incluso, fuso de Brasília), sem contar as excluídas, comparadas com os 7 dias anteriores."
        />
      </section>

      {/* Resumo secundário em uma linha */}
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-white/50">
        <span>
          <span className="font-semibold text-white/80">{totalUsers}</span> usuários
        </span>
        <span>
          <span className="font-semibold text-white/80">{data.deletedUsers}</span> contas excluídas
        </span>
        <span>
          Stripe: <span className="font-semibold text-white/80">{data.stripePlans.monthly}</span> mensal ·{" "}
          <span className="font-semibold text-white/80">{data.stripePlans.annual}</span> anual
        </span>
        <span title="Premium sem pagar. Embaixadores = cortesia com mais de 1 ano pela frente (inclui contas internas).">
          <span className="font-semibold text-white/80">{courtesy.total}</span> com Premium cortesia (indicação{" "}
          {courtesy.referral} · embaixadores {courtesy.ambassadors} · programa {courtesy.program})
        </span>
        <span>
          <span className="font-semibold text-white/80">{data.workoutsGenerated}</span> treinos gerados
        </span>
        <span>
          <span className="font-semibold text-white/80">{data.featureUsage.usersRegisteredViaReferral}</span> vieram por
          indicação
        </span>
        {store.test ? (
          <span>
            <span className="font-semibold text-white/80">{store.test}</span> compras de teste (fora do total)
          </span>
        ) : null}
      </p>

      <SignupsChart days={data.signupsLast30Days} />

      {/* Engajamento — lista única com % da base */}
      <Card className="min-w-0 space-y-4 overflow-hidden p-4 sm:p-[1.15rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[1rem] font-semibold text-white">Engajamento com as ferramentas</h2>
          <span className="text-[10px] text-white/40">% da base de {totalUsers} usuários</span>
        </div>
        <div className="space-y-3">
          {engagement.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-[12px] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
              <span className="flex min-w-0 items-center gap-1.5 text-white/72">
                <span className="truncate">{item.label}</span>
                <InfoHint text={item.help} />
              </span>
              <div className="h-2 rounded-full bg-white/8">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-primary to-primaryStrong"
                  style={{ width: `${Math.min(100, Math.max(item.percentage, 2))}%` }}
                />
              </div>
              <span className="w-[5.5rem] text-right text-white">
                {formatPercent(item.percentage)}% <span className="text-white/45">({item.value})</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

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
                  Usuários sem Premium (Stripe, lojas ou Indique e Ganhe) que concluíram 5 ou mais treinos nos últimos 30 dias — quem está treinando agora é quem tem mais chance de assinar.
                </p>
              </div>
              <div className="shrink-0 rounded-[18px] border border-primary/30 bg-primary/10 px-5 py-3 text-center">
                <p className="text-[2rem] font-bold leading-none text-primary">{data.premiumPotentialCount}</p>
                <p className="mt-1 text-[10px] text-white/50">usuários</p>
              </div>
            </div>
          </Card>
          <PremiumPotentialTable />
        </section>
      )}

      {/* Perfil do quiz — recolhido, com abas */}
      <details className="group rounded-[28px] border border-white/10 bg-black/20">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-white">Perfil dos usuários (respostas do quiz)</span>
          <span className="flex items-center gap-2 text-xs text-white/50">
            idade, gênero, objetivo, nível, local e mais
            <span className="inline-block transition group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {PROFILE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={profileTab === tab.key}
                onClick={() => setProfileTab(tab.key)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  profileTab === tab.key
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/10 text-white/55 hover:text-white/85"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {profileTab === "demografia" ? (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <DistributionBarCard title="Idade" data={data.ageDistribution} baseCount={totalUsers} emptyLabel="Sem faixa etária registrada." />
              <DistributionPieCard title="Gênero" data={data.genderDistribution} total={totalForPie.gender} baseCount={totalUsers} emptyLabel="Sem gênero registrado." />
              <DistributionPieCard title="Objetivo" data={data.goalDistribution} total={totalForPie.goal} baseCount={totalUsers} emptyLabel="Sem objetivo registrado." />
            </div>
          ) : null}

          {profileTab === "treino" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DistributionBarCard title="Dias por semana" data={data.daysDistribution} baseCount={totalUsers} emptyLabel="Sem dados de dias registrados." />
              <DistributionBarCard title="Nível" data={data.levelDistribution} baseCount={totalUsers} emptyLabel="Sem dados de nível registrados." />
              <DistributionBarCard title="Tempo de treino" data={data.durationDistribution} baseCount={totalUsers} emptyLabel="Sem dados de duração registrados." />
              <DistributionBarCard title="Método de treino" data={data.trainingStyleDistribution} baseCount={totalUsers} emptyLabel="Sem dados de método de treino registrados." />
            </div>
          ) : null}

          {profileTab === "local" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DistributionBarCard title="Local de treino" data={data.locationDistribution} baseCount={totalUsers} emptyLabel="Sem dados de local de treino registrados." />
              <DistributionBarCard title="Materiais" data={data.equipmentDistribution} baseCount={totalUsers} emptyLabel="Sem dados de materiais registrados." />
            </div>
          ) : null}

          {profileTab === "enfase" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <DistributionBarCard title="Ênfase muscular" data={data.focusRegionDistribution} baseCount={totalUsers} emptyLabel="Sem dados de ênfase muscular registrados." />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function HeroMetricCard({
  label,
  value,
  detail,
  help,
  highlight = false,
  detailTone = "flat"
}: {
  label: string;
  value: string;
  detail: string;
  help: string;
  highlight?: boolean;
  detailTone?: "up" | "down" | "flat";
}) {
  const detailColor = detailTone === "up" ? "text-primary" : detailTone === "down" ? "text-red-300" : "text-white/55";
  return (
    <Card
      className={`min-w-0 space-y-3 overflow-hidden p-4 sm:p-5 ${
        highlight ? "!border-primary/35 !bg-primary/[0.06]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
        <InfoHint text={help} />
      </div>
      <p className={`text-[2.3rem] font-semibold leading-none ${highlight ? "text-primary" : "text-white"}`}>{value}</p>
      <p className={`text-[12px] ${detailColor}`}>{detail}</p>
    </Card>
  );
}

// Cadastros por dia (30 dias) — barras simples; passe o mouse para ver o dia.
function SignupsChart({ days }: { days: Array<{ date: string; label: string; value: number }> }) {
  const total = days.reduce((sum, day) => sum + day.value, 0);
  const max = Math.max(1, ...days.map((day) => day.value));
  const average = days.length ? total / days.length : 0;

  return (
    <Card className="min-w-0 space-y-4 overflow-hidden p-4 sm:p-[1.15rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[1rem] font-semibold text-white">Cadastros por dia</h2>
        <span className="text-[11px] text-white/45">
          últimos 30 dias · <span className="font-semibold text-white/80">{total}</span> no total · média{" "}
          <span className="font-semibold text-white/80">{formatPercent(average)}</span>/dia
        </span>
      </div>
      {days.length ? (
        <div>
          <div className="flex h-36 items-end gap-[3px]">
            {days.map((day) => (
              <div
                key={day.date}
                title={`${day.label}: ${day.value} cadastro(s)`}
                className="group relative flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  className="w-full rounded-t-[3px] bg-primary/70 transition group-hover:bg-primary"
                  style={{ height: day.value ? `${Math.max((day.value / max) * 100, 4)}%` : "2px", opacity: day.value ? 1 : 0.25 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-white/40">
            <span>{days[0]?.label}</span>
            <span>{days[Math.floor(days.length / 2)]?.label}</span>
            <span>{days[days.length - 1]?.label}</span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-white/52">Sem cadastros no período.</p>
      )}
    </Card>
  );
}

// Ícone "i": mostra a explicação da métrica ao passar o mouse.
function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-white/20 text-[9px] font-semibold text-white/45"
    >
      i
    </span>
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

type PremiumPotentialUser = {
  id: string;
  name: string;
  email: string;
  /** Treinos concluídos no período escolhido (30 dias ou histórico todo). */
  session_count: number;
  /** Treinos concluídos desde o cadastro. */
  total_sessions: number;
  created_at: string;
  last_workout_at: string | null;
};

type PotentialPeriod = "30" | "all";

function PremiumPotentialTable() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [users, setUsers] = useState<PremiumPotentialUser[]>([]);
  const [period, setPeriod] = useState<PotentialPeriod>("30");
  const [copied, setCopied] = useState(false);

  async function load(nextPeriod: PotentialPeriod = period) {
    setPeriod(nextPeriod);
    setStatus("loading");
    try {
      const res = await fetchWithAuth(`/api/admin/premium-potential?days=${nextPeriod}`);
      if (!res.ok) throw new Error("Falha ao carregar");
      const json = await res.json();
      setUsers(json.data ?? []);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  // Copia os e-mails separados por vírgula (cola direto no Gmail ou no Leadlovers).
  async function copyEmails() {
    const emails = users.map((u) => u.email).filter((e) => e && e !== "—");
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem acesso à área de transferência: ignora
    }
  }

  const periodLabel = period === "30" ? "Treinos (30 dias)" : "Treinos";

  const toolbar = (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {(["30", "all"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => void load(option)}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
            period === option
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-white/10 text-white/50 hover:text-white/80"
          }`}
        >
          {option === "30" ? "Últimos 30 dias" : "Todo o período"}
        </button>
      ))}
      {status === "done" && users.length ? (
        <button
          type="button"
          onClick={() => void copyEmails()}
          className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/60 transition hover:text-white"
        >
          {copied ? "E-mails copiados ✓" : `Copiar ${users.length} e-mails`}
        </button>
      ) : null}
    </div>
  );

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => void load("30")}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/14 py-3 text-[12px] font-semibold text-white/52 transition hover:border-primary/40 hover:text-primary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Ver lista de usuários
      </button>
    );
  }

  if (status === "loading") {
    return (
      <div>
      {toolbar}
      <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-white/45">
        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Carregando lista...
      </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        {toolbar}
        <p className="py-4 text-center text-[12px] text-red-400/80">
          Não foi possível carregar a lista. Tente novamente.
        </p>
      </div>
    );
  }

  if (!users.length) {
    return (
      <div>
        {toolbar}
        <p className="py-4 text-center text-[12px] text-white/45">Nenhum usuário encontrado.</p>
      </div>
    );
  }

  return (
    <div>
    {toolbar}
    <div className="mt-1 overflow-x-auto rounded-[18px] border border-white/8">
      <table className="w-full min-w-[680px] text-[12px]">
        <thead>
          <tr className="border-b border-white/8 text-left text-[10px] uppercase tracking-[0.14em] text-white/40">
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium text-right">{periodLabel}</th>
            {period === "30" ? <th className="px-4 py-3 font-medium text-right">Total</th> : null}
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
              {period === "30" ? <td className="px-4 py-3 text-right text-white/52">{u.total_sessions}</td> : null}
              <td className="px-4 py-3 text-white/52">{formatDate(u.created_at)}</td>
              <td className="px-4 py-3 text-white/52">{u.last_workout_at ? formatDate(u.last_workout_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
