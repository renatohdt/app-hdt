"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BicepsFlexed,
  CalendarRange,
  Dumbbell,
  Target,
  Trophy
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import {
  ARTICLE_PLACEHOLDER_IMAGE,
  getEvergreenFallbackArticles,
  sanitizeArticleRecommendations,
  type ArticleRecommendation
} from "@/lib/articles";
import {
  formatSessionCounter,
  getAchievementCopy,
  getMotivationLine,
  getPlanCoverage,
  type AppWorkoutData
} from "@/lib/app-workout";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

const BLOG_URL = "https://horadotreino.com.br/";
const CONSULTORIA_URL =
  "https://horadotreino.com.br/consultoria-de-treino-personalizado/?utm_source=hora-do-treino-app&utm_medium=cta-home&utm_campaign=consultoria";
const HOME_LOGO_URL = "https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png";

export function DashboardHomeScreen({ data }: { data: AppWorkoutData }) {
  const [articles, setArticles] = useState<ArticleRecommendation[]>([]);
  const metrics = useMemo(() => buildHomeMetrics(data), [data]);
  const coverage = useMemo(() => getPlanCoverage(data), [data]);
  const achievement = useMemo(() => getAchievementCopy(data), [data]);
  const fallbackArticles = useMemo(() => sanitizeArticleRecommendations(getEvergreenFallbackArticles()), []);
  const firstName = normalizeDisplayName(data.user.firstName, data.user.name);

  useEffect(() => {
    const controller = new AbortController();

    async function loadArticles() {
      try {
        const response = await fetchWithAuth("/api/articles", {
          signal: controller.signal
        });
        const payload = (await response.json()) as { success: boolean; data?: ArticleRecommendation[] };

        if (!response.ok || !payload.success) {
          throw new Error("articles-load-failed");
        }

        setArticles(sanitizeArticleRecommendations(payload.data));
      } catch {
        if (!controller.signal.aborted) {
          setArticles([]);
        }
      }
    }

    void loadArticles();

    return () => controller.abort();
  }, []);

  const articleItems = (articles.length ? articles : fallbackArticles).slice(0, 2);
  const remainingSessions = Math.max(coverage.totalSessions - coverage.coveredSessions, 0);
  const progressBarWidth = Math.max(Math.min(coverage.percentage, 100), 0);

  return (
    <AppShell className="space-y-4 sm:space-y-4">
      <Card className="overflow-hidden rounded-[24px] border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.13),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.016))] px-5 pb-[22px] pt-[22px] shadow-[0_12px_28px_rgba(0,0,0,0.2)] sm:px-5 sm:pb-[22px] sm:pt-[22px]">
        <div className="flex flex-col items-center text-center">
          <img
            src={HOME_LOGO_URL}
            alt="Hora do Treino"
            className="mt-1 mb-4 h-auto w-full max-w-[140px]"
          />
        </div>

        <div className="text-center">
          <h1 className="mb-[10px] text-[20px] font-bold leading-[1.15] tracking-tight text-white">
            Olá, {firstName}
          </h1>
          <p className="mx-auto mb-[22px] max-w-[24rem] text-[13px] font-normal leading-[1.45] text-white/56">
            {getMotivationLine(data.user.goal)}
          </p>
        </div>

        <Link
          href="/treino"
          onClick={() =>
            trackEvent("cta_click", data.user.id, {
              source: "home_primary_cta",
              goal: data.user.goal ?? null
            })
          }
          className="block"
        >
          <div className="flex h-12 w-full items-center justify-center gap-[7px] rounded-[16px] border border-primary/12 bg-[linear-gradient(90deg,rgba(34,197,94,0.94),rgba(20,128,61,0.94))] px-4 text-center text-white shadow-[0_12px_24px_rgba(34,197,94,0.16)] transition duration-200 hover:-translate-y-0.5">
            <Dumbbell className="h-4 w-4 shrink-0" />
            <span className="text-[15px] font-bold leading-none">Iniciar treino</span>
          </div>
        </Link>
      </Card>

      <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <SectionHeader title="Sua evolução" />

        <div className="grid grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} />
          ))}
        </div>
      </Card>

      <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <p className="mb-[10px] text-xs font-bold uppercase tracking-[0.12em] text-primary/88">Meta da semana</p>
        <h2 className="mb-3 text-[20px] font-bold leading-[1.15] text-white">
          {coverage.coveredSessions}/{coverage.totalSessions} treinos
        </h2>
        <p className="mb-4 text-[14px] leading-[1.45] text-white/58">
          {remainingSessions === 0
            ? "Meta concluída neste ciclo. Siga mantendo a consistência nas próximas sessões."
            : `Faltam ${remainingSessions} ${remainingSessions === 1 ? "treino" : "treinos"} para concluir esta etapa do plano.`}
        </p>

        <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primaryStrong"
            style={{ width: `${progressBarWidth}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-white/52">
          <span>{formatSessionCounter(data.sessionProgress)}</span>
          <span>{coverage.percentage}% da meta</span>
        </div>
      </Card>

      <div>
        <Card className="mb-[18px] rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-primary/88">Conquista recente</p>
              <h2 className="mb-2 text-[16px] font-bold leading-[1.2] text-white">{achievement.title}</h2>
              <p className="text-[14px] leading-[1.5] text-white/58">{achievement.description}</p>
            </div>
          </div>
        </Card>

        <a
          href={CONSULTORIA_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            trackEvent("cta_click", data.user.id, {
              source: "home_consultoria",
              goal: data.user.goal ?? null
            })
          }
        >
          <Card className="overflow-hidden rounded-[24px] border-0 bg-transparent p-0 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
            <div
              className="min-h-[12.75rem] bg-cover bg-center"
              style={{
                backgroundImage:
                  'linear-gradient(180deg,rgba(3,8,5,0.12),rgba(3,8,5,0.88)), url("https://horadotreino.com.br/wp-content/uploads/2026/03/cta-consultoria.png")'
              }}
            >
              <div className="flex h-full min-h-[12.75rem] flex-col justify-end p-[18px]">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary/90">
                  Consultoria de treino
                </p>
                <h2
                  className="mt-2 max-w-[15.5rem] text-[16px] font-bold leading-[1.2] text-white"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 3,
                    overflow: "hidden"
                  }}
                >
                  Plano premium com acompanhamento real para evoluir com mais consistência.
                </h2>
                <div className="mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-primary">
                  Saiba mais
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </Card>
        </a>
      </div>

      <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-white">Artigos Hora do Treino</h2>

          <a
            href={BLOG_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-semibold text-primary transition hover:text-white"
          >
            Ver todos
          </a>
        </div>

        <div className="grid grid-cols-2 gap-[14px]">
          {articleItems.map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackEvent("article_click", data.user.id, {
                  source: "home_articles",
                  goal: data.user.goal ?? null,
                  article: article.title,
                  url: article.url
                })
              }
              className="group rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-[10px] transition duration-200 hover:-translate-y-0.5 hover:border-primary/12 hover:bg-white/[0.045]"
            >
              <div className="mb-[10px] aspect-[4/3] overflow-hidden rounded-[12px] bg-white/[0.04]">
                <img
                  src={article.image || ARTICLE_PLACEHOLDER_IMAGE}
                  alt={article.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </div>

              <div className="space-y-1.5 px-1 pb-1">
                <p className="min-h-[4rem] text-[15px] font-semibold leading-[1.35] text-white">{article.title}</p>
                <p className="text-[13px] leading-[1.4] text-white/46">{formatArticleMeta(article)}</p>
              </div>
            </a>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

function buildHomeMetrics(data: AppWorkoutData) {
  return [
    {
      label: "Treinos concluídos",
      value: `${data.sessionProgress.completedSessions}`,
      icon: BicepsFlexed
    },
    {
      label: "Sessão",
      value: `${data.sessionProgress.currentSessionNumber}/${data.sessionProgress.totalSessions}`,
      icon: CalendarRange
    },
    {
      label: "Meta",
      value: `${data.sessionProgress.progressPercentage}%`,
      icon: Target
    }
  ];
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div>
      <h2 className="mb-3 text-[16px] font-bold text-white">{title}</h2>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Dumbbell;
  label: string;
  value: string;
}) {
  const compactLabel = label === "Treinos concluídos" ? "Treinos" : label;

  return (
    <div className="flex min-h-[88px] items-center gap-[10px] rounded-[15px] border border-white/[0.05] bg-black/18 p-[14px] text-left">
      <Icon className="h-[18px] w-[18px] shrink-0 text-primary" />

      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold leading-[1.05] text-white">{value}</p>
        <p className="mt-[5px] text-[11px] font-medium leading-[1.15] text-white/54">{compactLabel}</p>
      </div>
    </div>
  );
}

function formatArticleMeta(article: ArticleRecommendation) {
  const readingTime = Math.max(Number(article.readingTime) || 1, 1);
  return `${readingTime} min de leitura`;
}

function normalizeDisplayName(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "Aluno";
}
