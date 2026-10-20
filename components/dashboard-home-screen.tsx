"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, Dumbbell, Play } from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { getPlannedNext } from "@/lib/weekly-plan-app";
import { CycleCompleteCard, CycleCompleteCelebration, resolveCycleCompleteMode } from "@/components/cycle-complete";
import { ReferralRewardPopup } from "@/components/referral-reward-popup";
import { ReferralExpiryPopup } from "@/components/referral-expiry-popup";
import { useSubscription } from "@/components/use-subscription";
import { LevelBadge, LevelPopup } from "@/components/level-badge";
import { REGRESSION_MESSAGE } from "@/lib/user-level";
import {
  buildTrainingExerciseRows,
  formatSessionCounter,
  formatWorkoutDisplayTitle,
  getPlanCoverage,
  type AppWorkoutData
} from "@/lib/app-workout";
import { REFERRAL_REWARD_ACHIEVEMENT } from "@/lib/achievements";
import { MedalBoard } from "@/components/medal-board";
import { HomeLoadCard } from "@/components/home-load-card";
import { AchievementPopup } from "@/components/achievement-popup";
import { trackEvent } from "@/lib/analytics-client";
import { SHOW_PROGRAMS_HOME_ENTRY } from "@/lib/feature-flags";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";
import { type ActiveGoalShape } from "@/components/goal-card";
import { GoalSheet } from "@/components/goal-sheet";
import { HomeWeekCard } from "@/components/home-week-card";
import { useAllSessionLogs } from "@/lib/session-logs-cache";
import { RecommendationsCard } from "@/components/recommendations-card";
import { ReferralCard } from "@/components/referral-card";
import { useIsNativeApp } from "@/lib/is-native-app";
import { PremiumHomeBanner } from "@/components/premium-home-banner";
import { MissingOutPopup } from "@/components/missing-out-popup";
import { BeginnerTourOverlay, useBeginnerTour } from "@/components/beginner-tour";
import { getDaysUsing, getFirstSeenAt, markMissingOutShown, shouldShowMissingOut } from "@/lib/missing-out-schedule";

const HOME_LOGO_URL = "https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png";

export function DashboardHomeScreen({
  data,
  onChangeProgramWeek,
  changingWeek = false,
  onReloadWorkout
}: {
  data: AppWorkoutData;
  onChangeProgramWeek?: (week: number) => void;
  changingWeek?: boolean;
  // Recarrega o treino (usado após montar o próximo programa no fim do ciclo).
  onReloadWorkout?: () => Promise<void>;
}) {
  // Modo programa: presente apenas quando o usuário tem um programa comprado ativo.
  const program = data.raw.program ?? null;
  const [showGoalSheet, setShowGoalSheet] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActiveGoalShape>(data.activeGoal ?? null);
  // Histórico completo (todos os locais + extras) para a semana da Home.
  const allSessionLogs = useAllSessionLogs(data.user.id, data.sessionLogs);
  const [showCycleCelebration, setShowCycleCelebration] = useState(false);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const isNative = useIsNativeApp();
  const router = useRouter();
  const coverage = useMemo(() => getPlanCoverage(data), [data]);

  // ── Sistema de nível/XP ──────────────────────────────────────────────────
  const [phasePopupDismissed, setPhasePopupDismissed] = useState(false);
  const [showReferralRewardPopup, setShowReferralRewardPopup] = useState(false);
  const [showReferralExpiryPopup, setShowReferralExpiryPopup] = useState(false);
  const [showReferralAchievementPopup, setShowReferralAchievementPopup] = useState(false);
  // Guarda o status da API para usar quando o popup de conquista fechar
  const referralStatusRef = useRef<{
    referralPremiumUntil: string | null;
    isReferralPremiumActive: boolean;
  } | null>(null);
  const levelData = data.levelData ?? null;
  // Mostra popup se houve regressão de nível ao carregar o dashboard
  const showRegressionPopup = !phasePopupDismissed && (levelData?.decayRegressed ?? false);
  const firstName = normalizeDisplayName(data.user.firstName, data.user.name);
  // Só trata como free depois que a assinatura terminou de carregar.
  // Evita mostrar anúncio/banner premium para quem é premium durante o carregamento.
  const isFreePlan = !subscriptionLoading && !subscription?.isPremium;

  // Pop-up "o que você está perdendo" (free): dias 3 e 7 de uso, depois a cada
  // 14 dias. Nunca por cima de outro pop-up; espera a home aparecer primeiro.
  const [showMissingOut, setShowMissingOut] = useState(false);
  const [missingOutDaysUsing, setMissingOutDaysUsing] = useState(1);
  const missingOutCheckedRef = useRef(false);
  const anotherPopupOpen =
    showRegressionPopup ||
    showReferralRewardPopup ||
    showReferralExpiryPopup ||
    showReferralAchievementPopup ||
    showCycleCelebration ||
    showGoalSheet;

  // ── Dicas da Home (qualquer nível, logo após o cadastro) ─────────────────
  // Textos: lib/beginner-tour.ts (grupo "home"). Nunca por cima de outro pop-up.
  const homeTour = useBeginnerTour(data.user.id, (data.totalWorkoutsAllTime ?? 0) === 0);
  const requestHomeTour = homeTour.request;
  useEffect(() => {
    if (anotherPopupOpen || showMissingOut) return;
    const timer = window.setTimeout(() => requestHomeTour("home"), 700);
    return () => window.clearTimeout(timer);
  }, [anotherPopupOpen, showMissingOut, requestHomeTour]);

  useEffect(() => {
    if (!isFreePlan || anotherPopupOpen || missingOutCheckedRef.current) return;
    if (typeof window === "undefined") return;
    missingOutCheckedRef.current = true;

    const earliestSession = data.sessionLogs.reduce<string | null>((earliest, log) => {
      const at = log.createdAt ?? log.completedAt;
      return at && (!earliest || at < earliest) ? at : earliest;
    }, null);
    const firstSeenAt = getFirstSeenAt(data.user.id, earliestSession);
    if (!shouldShowMissingOut(data.user.id, firstSeenAt)) return;

    const timer = window.setTimeout(() => {
      markMissingOutShown(data.user.id);
      setMissingOutDaysUsing(getDaysUsing(firstSeenAt));
      setShowMissingOut(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [isFreePlan, anotherPopupOpen, data.sessionLogs, data.user.id]);
  // Premium segue a "Minha semana" (dias escolhidos + regras de descanso).
  const plannedNext = useMemo(
    () => (!subscriptionLoading && subscription?.isPremium && !program ? getPlannedNext({ data }) : null),
    [data, program, subscription?.isPremium, subscriptionLoading]
  );
  const featuredWorkoutText = plannedNext
    ? formatWorkoutDisplayTitle(data.workouts[plannedNext.workoutKey]?.title, plannedNext.workoutKey)
    : data.featuredWorkoutLabel || "Treino";
  const plannedNextDayLabel =
    plannedNext && !plannedNext.isToday ? formatPlannedDay(plannedNext.dateKey) : null;

  // Verifica popups de indicação: conquista, recompensa ou expiração
  useEffect(() => {
    if (typeof window === "undefined") return;

    const achievementSeen = localStorage.getItem("referral_achievement_seen_v1") === "true";
    const rewardSeen = localStorage.getItem("referral_reward_seen_v1") === "true";
    const expirySeen = localStorage.getItem("referral_expiry_seen_v1") === "true";

    // Todos já foram vistos — evita chamada desnecessária à API
    if (achievementSeen && rewardSeen && expirySeen) return;

    fetchWithAuth("/api/referral/status")
      .then((res) =>
        parseJsonResponse<{
          success: boolean;
          data?: {
            referralPremiumUntil: string | null;
            isReferralPremiumActive: boolean;
            referralAchievementUnlocked: boolean;
          };
        }>(res)
      )
      .then((result) => {
        if (!result.success || !result.data) return;
        const { referralPremiumUntil, isReferralPremiumActive, referralAchievementUnlocked } = result.data;

        // Salva o status para uso no onClose do popup de conquista
        referralStatusRef.current = { referralPremiumUntil, isReferralPremiumActive };

        if (!achievementSeen && referralAchievementUnlocked) {
          // Conquista aparece primeiro; recompensa e expiração aparecem após ela fechar
          setShowReferralAchievementPopup(true);
        } else if (!rewardSeen && isReferralPremiumActive) {
          setShowReferralRewardPopup(true);
        } else if (!expirySeen && referralPremiumUntil && !isReferralPremiumActive) {
          setShowReferralExpiryPopup(true);
        }
      })
      .catch(() => {});
  }, []);

  // Ciclo concluído no fluxo de IA (programa comprado tem navegação própria de semanas).
  const isCycleCompleteAi = !program && Boolean(data.sessionProgress?.cycleCompleted);
  const progressBarWidth = Math.max(Math.min(coverage.percentage, 100), 0);

  // ── Card "Treino de hoje" ────────────────────────────────────────────────
  const featuredKey = plannedNext?.workoutKey ?? data.featuredWorkoutKey ?? data.workoutOrder[0] ?? null;
  const featuredWorkout = featuredKey ? data.workouts[featuredKey] : undefined;
  const featuredMinutes = featuredWorkout?.estimatedDurationMinutes || data.averageDurationMinutes || 0;
  const featuredExerciseCount = useMemo(
    () => (featuredWorkout ? buildTrainingExerciseRows(featuredWorkout).length : 0),
    [featuredWorkout]
  );
  const locationLabel = program ? null : LOCATION_LABELS[(data.answers.location as string | undefined) ?? "home"] ?? null;
  const trainedToday = useMemo(() => hasTrainedToday(data, allSessionLogs), [data, allSessionLogs]);
  const isRestDay = Boolean(plannedNext?.todayIsRest);
  const isNextLater = Boolean(plannedNext && !plannedNext.isToday);
  const todayLabel = useMemo(() => formatTodayLabel(), []);
  // Dia de treino normal: só a data (o card abaixo já diz "Treino de hoje").
  const dayTitle = trainedToday
    ? "Treino de hoje concluído"
    : isRestDay
      ? "Hoje é day off"
      : isNextLater
        ? "Dia de recuperação"
        : null;
  const heroEyebrow = trainedToday || isRestDay || isNextLater ? "Próximo treino" : "Treino de hoje";
  // Já treinou ou é descanso: o botão só mostra o treino (não chama para começar).
  const ctaIsStart = !trainedToday && !isRestDay && !isNextLater;

  return (
    <AppShell className="space-y-4 sm:space-y-4">
      {/* Topo limpo: marca + nível. Sem frases aleatórias — data e status do dia. */}
      <header className="pt-1">
        <img src={HOME_LOGO_URL} alt="Hora do Treino" className="h-auto max-w-[118px]" />
      </header>

      <div className="px-0.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-white/50">{todayLabel}</p>
          {levelData ? (
            <div data-tour="home-level" className="shrink-0 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1">
              <LevelBadge data={levelData} />
            </div>
          ) : null}
        </div>
        {dayTitle ? (
          <h1 className="mt-0.5 flex items-center gap-2 text-[22px] font-bold leading-tight tracking-tight text-white">
            {dayTitle}
            {trainedToday ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : null}
          </h1>
        ) : null}
        {isRestDay ? (
          <p className="mt-1 text-[13px] text-white/55">A recuperação também faz parte do treino.</p>
        ) : null}
      </div>

      {/* Treino de hoje: o que é, quanto tempo, onde, e em que ponto do ciclo. */}
      <div data-tour="home-workout">
      <Card className="rounded-[24px] border-primary/20 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-5 shadow-none sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">
          {heroEyebrow}
          {locationLabel ? <span className="text-white/45"> · {locationLabel}</span> : null}
        </p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-tight text-white">{featuredWorkoutText}</h2>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {plannedNextDayLabel ? <HeroChip>{capitalize(plannedNextDayLabel)}</HeroChip> : null}
          {featuredMinutes > 0 ? (
            <HeroChip>
              <Clock className="h-3.5 w-3.5" aria-hidden /> {featuredMinutes} min
            </HeroChip>
          ) : null}
          {featuredExerciseCount > 0 ? (
            <HeroChip>
              {featuredExerciseCount} {featuredExerciseCount === 1 ? "exercício" : "exercícios"}
            </HeroChip>
          ) : null}
        </div>

        {program ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <button
              type="button"
              onClick={() => onChangeProgramWeek?.(program.currentWeek - 1)}
              disabled={changingWeek || program.currentWeek <= 1}
              className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Semana anterior"
            >
              ‹
            </button>
            <span className="text-center text-[13px] font-semibold text-white/80">
              {program.weekLabel} · {program.currentWeek}/{program.totalWeeks}
            </span>
            <button
              type="button"
              onClick={() => onChangeProgramWeek?.(program.currentWeek + 1)}
              disabled={changingWeek || program.currentWeek >= program.totalWeeks}
              className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Próxima semana"
            >
              ›
            </button>
          </div>
        ) : !isCycleCompleteAi ? (
          <div className="mt-4">
            <p className="text-[12px] font-semibold text-white/55">{formatSessionCounter(data.sessionProgress)}</p>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
              role="progressbar"
              aria-valuenow={progressBarWidth}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do ciclo"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primaryStrong"
                style={{ width: `${progressBarWidth}%` }}
              />
            </div>
          </div>
        ) : null}

        <Link
          href="/treino"
          onClick={() =>
            trackEvent("cta_click", data.user.id, {
              source: "home_primary_cta",
              goal: data.user.goal ?? null
            })
          }
          className="mt-4 block"
        >
          {ctaIsStart ? (
            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(90deg,rgba(34,197,94,0.96),rgba(20,128,61,0.96))] px-4 text-white shadow-[0_12px_24px_rgba(34,197,94,0.16)] transition duration-200 active:scale-[0.99]">
              <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden />
              <span className="text-[15px] font-bold leading-none">Iniciar treino</span>
            </div>
          ) : (
            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-white/12 bg-white/[0.04] px-4 text-white/85 transition duration-200 active:scale-[0.99]">
              <Dumbbell className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-[15px] font-semibold leading-none">Ver treino</span>
            </div>
          )}
        </Link>
      </Card>

      </div>

      {/* Sua semana + meta pessoal. Espera a assinatura para não mostrar o convite
          "Planejar dias" (Premium) piscando para quem já é Premium. */}
      {!program && !subscriptionLoading ? (
        <HomeWeekCard
          data={data}
          sessionLogs={allSessionLogs}
          isPremium={Boolean(subscription?.isPremium)}
          activeGoal={activeGoal}
          onCreateGoal={() => setShowGoalSheet(true)}
        />
      ) : null}

      {showGoalSheet ? (
        <GoalSheet
          weeklyTarget={data.weeklyTarget}
          onClose={() => setShowGoalSheet(false)}
          onCreated={(goal) => {
            setActiveGoal(goal);
            setShowGoalSheet(false);
          }}
        />
      ) : null}

      {/* Banner Premium (só plano free) logo abaixo do cartão principal: visível
          sem rolar, mas sem tirar o "Iniciar treino" do topo. */}
      {isFreePlan ? (
        <PremiumHomeBanner
          isNative={isNative}
          onOpen={() => {
            // O banner já mostra benefícios e preço: vai direto para a página
            // Premium (plano anual pré-selecionado), sem pop-up no meio.
            trackEvent("cta_click", data.user.id, { source: "upsell_modal_cta_home_banner" });
            router.push("/premium");
          }}
        />
      ) : null}

      {/* Anúncio responsivo entre os cards — somente plano free com anúncios liberados */}
      {isFreePlan ? <GoogleAd placement="home_meio" /> : null}

      {/* Entrada para os programas de treino (só para quem não está em um programa) */}
      {/* Escondido temporariamente via SHOW_PROGRAMS_HOME_ENTRY até haver programas cadastrados. */}
      {SHOW_PROGRAMS_HOME_ENTRY && !program && (
        <Link href="/programas" className="block">
          <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-primary/30">
            <div>
              <p className="text-sm font-semibold text-white">Programas de treino do Renato</p>
              <p className="text-xs text-white/55">Programa completo de 3 meses, com o app liberado no período.</p>
            </div>
            <span className="text-lg text-primary">›</span>
          </Card>
        </Link>
      )}


      {/* Fim de ciclo (fluxo de IA): destaque para montar o próximo programa. */}
      {isCycleCompleteAi && !subscriptionLoading ? (
        <CycleCompleteCard
          mode={resolveCycleCompleteMode(Boolean(subscription?.isPremium), data.freeCycleRenewalAvailable)}
          completedSessions={coverage.coveredSessions}
          onOpen={() => setShowCycleCelebration(true)}
        />
      ) : null}

      {showCycleCelebration ? (
        <CycleCompleteCelebration
          userId={data.user.id}
          locations={data.availableLocations}
          activeLocation={(data.answers.location as string | undefined) ?? null}
          isPremium={Boolean(subscription?.isPremium)}
          freeRenewalAvailable={data.freeCycleRenewalAvailable}
          completedSessions={coverage.coveredSessions}
          weeks={data.plan.blockDurationWeeks}
          source="dashboard_card"
          onClose={() => setShowCycleCelebration(false)}
          onRenewed={async () => {
            if (onReloadWorkout) {
              await onReloadWorkout();
            } else {
              router.refresh();
            }
          }}
        />
      ) : null}

      {/* Premium: resumo da evolução de carga (o valor do plano, todo dia). */}
      {!subscriptionLoading && subscription?.isPremium ? <HomeLoadCard /> : null}

      {/* Quadro de medalhas (substitui o antigo "Conquista recente"). */}
      <MedalBoard data={data} sessionLogs={allSessionLogs} />

      {/* Indique e Ganhe — só plano free (Premium não ganha nada indicando) */}
      {isFreePlan ? <ReferralCard /> : null}

      <RecommendationsCard
        goal={data.user.goal}
        level={data.user.level}
        equipment={data.answers.equipment}
        location={data.answers.location}
        locations={Array.isArray(data.answers.locations) ? (data.answers.locations as string[]) : []}
        totalWorkouts={data.totalWorkoutsAllTime}
      />

      {isFreePlan ? <GoogleAd placement="home_fim" /> : null}


      {/* ── Pop-up "o que você está perdendo" (free) ─────────────────── */}
      <BeginnerTourOverlay tour={homeTour} context={{ firstName }} />

      {showMissingOut && !anotherPopupOpen && !homeTour.isActive ? (
        <MissingOutPopup
          firstName={firstName}
          totalWorkouts={data.totalWorkoutsAllTime}
          weightIncreases={data.totalWeightIncreasesAllTime}
          daysUsing={missingOutDaysUsing}
          isNative={isNative}
          onClose={() => setShowMissingOut(false)}
        />
      ) : null}

      {/* ── Popup de regressão de nível (inatividade) ────────────────── */}
      {showRegressionPopup && (
        <LevelPopup
          emoji="😤"
          title="Nível caiu!"
          message={REGRESSION_MESSAGE}
          onClose={() => setPhasePopupDismissed(true)}
        />
      )}

      {/* ── Popup de recompensa por indicação ────────────────────────── */}
      {showReferralRewardPopup && (
        <ReferralRewardPopup onClose={() => setShowReferralRewardPopup(false)} />
      )}

      {/* ── Popup de expiração do premium por indicação ───────────────── */}
      {showReferralExpiryPopup && (
        <ReferralExpiryPopup onClose={() => setShowReferralExpiryPopup(false)} />
      )}

      {/* ── Conquista "Fofoqueiro(a)" — desbloqueada ao atingir 5 referrals ── */}
      {showReferralAchievementPopup && (
        <AchievementPopup
          achievement={REFERRAL_REWARD_ACHIEVEMENT}
          onClose={() => {
            localStorage.setItem("referral_achievement_seen_v1", "true");
            setShowReferralAchievementPopup(false);
            // Após fechar a conquista, mostra o popup de recompensa (se aplicável)
            const status = referralStatusRef.current;
            const rewardSeen = localStorage.getItem("referral_reward_seen_v1") === "true";
            if (status && !rewardSeen && status.isReferralPremiumActive) {
              setShowReferralRewardPopup(true);
            }
          }}
        />
      )}
    </AppShell>
  );
}


function normalizeDisplayName(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "Aluno";
}

const LOCATION_LABELS: Record<string, string> = {
  home: "Casa",
  condo_gym: "Condomínio",
  gym: "Academia"
};

function HeroChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[12px] font-medium text-white/70">
      {children}
    </span>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// "Quarta, 14 de outubro"
function formatTodayLabel() {
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return capitalize(label.replace("-feira", ""));
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Já concluiu algum treino hoje (do programa ou extra)?
function hasTrainedToday(data: AppWorkoutData, logs: AppWorkoutData["sessionLogs"]) {
  const todayKey = toLocalDateKey(new Date());
  const isToday = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && toLocalDateKey(date) === todayKey;
  };
  return isToday(data.sessionProgress?.lastCompletedAt) || logs.some((log) => isToday(log.completedAt));
}

// "qua, 08/10" para o próximo treino planejado (quando não é hoje).
function formatPlannedDay(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === tomorrow.getTime()) return "amanhã";
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
