"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dumbbell,
  Loader2,
  PlayCircle,
  RefreshCw,
  Settings,
  Target,
  Trophy
} from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { RewardedAdButton, useAdMobAvailable } from "@/components/RewardedAdButton";
import { useConsentPreferences } from "@/components/consent-provider";
import { preloadRewardedAd, showRewardedAd } from "@/lib/admob";
import { getPlannedNext } from "@/lib/weekly-plan-app";
import { CycleCompleteCard, CycleCompleteCelebration, resolveCycleCompleteMode } from "@/components/cycle-complete";
import { ReferralRewardPopup } from "@/components/referral-reward-popup";
import { ReferralExpiryPopup } from "@/components/referral-expiry-popup";
import { useSubscription } from "@/components/use-subscription";
import { LevelBadge, LevelPopup } from "@/components/level-badge";
import { REGRESSION_MESSAGE } from "@/lib/user-level";
import {
  formatSessionCounter,
  formatWorkoutDisplayTitle,
  getPlanCoverage,
  type AppWorkoutData
} from "@/lib/app-workout";
import { getLastUnlockedAchievement, REFERRAL_REWARD_ACHIEVEMENT } from "@/lib/achievements";
import { AchievementPopup } from "@/components/achievement-popup";
import { trackEvent } from "@/lib/analytics-client";
import { SHOW_PROGRAMS_HOME_ENTRY } from "@/lib/feature-flags";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { GoalCard, type ActiveGoalShape } from "@/components/goal-card";
import { RecommendationsCard } from "@/components/recommendations-card";
import { ReferralCard } from "@/components/referral-card";
import { useIsNativeApp } from "@/lib/is-native-app";
import { PremiumHomeBanner } from "@/components/premium-home-banner";
import { MissingOutPopup } from "@/components/missing-out-popup";
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
  const [showWorkoutUpsell, setShowWorkoutUpsell] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTarget, setGoalTarget] = useState("12");
  const [goalDays, setGoalDays] = useState("30");
  const [savingGoal, setSavingGoal] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActiveGoalShape>(data.activeGoal ?? null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showCycleCelebration, setShowCycleCelebration] = useState(false);
  const [showFreeLimitPopup, setShowFreeLimitPopup] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [lastWorkoutGeneratedAt, setLastWorkoutGeneratedAt] = useState<string | null | undefined>(undefined);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generatingAnimFrameRef = useRef(0);
  const generatingCardRef = useRef<HTMLDivElement | null>(null);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  // Plano free no app (AdMob): gerar novo programa passa por um vídeo com recompensa.
  const adMobAvailable = useAdMobAvailable();
  const { preferences: consentPreferences } = useConsentPreferences();
  const generateRequiresVideo = !subscription?.isPremium && adMobAvailable;
  const [loadingGenerateVideo, setLoadingGenerateVideo] = useState(false);
  const isNative = useIsNativeApp();
  const router = useRouter();
  const coverage = useMemo(() => getPlanCoverage(data), [data]);
  const achievement = useMemo(() => getLastUnlockedAchievement(data.totalWorkoutsAllTime), [data.totalWorkoutsAllTime]);

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
    showFreeLimitPopup ||
    showRegressionPopup ||
    showReferralRewardPopup ||
    showReferralExpiryPopup ||
    showReferralAchievementPopup ||
    showCycleCelebration ||
    showGenerateConfirm ||
    showGoalForm ||
    showWorkoutUpsell ||
    isGenerating;

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

  // Animação da barra de progresso durante geração do treino
  useEffect(() => {
    if (!isGenerating) {
      setLoadingProgress(0);
      window.cancelAnimationFrame(generatingAnimFrameRef.current);
      return;
    }

    window.requestAnimationFrame(() => {
      generatingCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const startTime = window.performance.now();
    setLoadingProgress(WORKOUT_LOADING_INITIAL);

    const animate = () => {
      const elapsed = window.performance.now() - startTime;
      const next = getWorkoutLoadingProgress(elapsed);
      setLoadingProgress((current) => (next > current ? next : current));
      generatingAnimFrameRef.current = window.requestAnimationFrame(animate);
    };

    generatingAnimFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(generatingAnimFrameRef.current);
    };
  }, [isGenerating]);

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

  // lastWorkoutGeneratedAt (cooldown do plano free) agora vem no próprio
  // payload do treino. Só busca em /api/profile se o dado veio de uma versão
  // antiga salva no aparelho (sem o campo).
  useEffect(() => {
    if (data.lastWorkoutGeneratedAt !== undefined) {
      setLastWorkoutGeneratedAt(data.lastWorkoutGeneratedAt);
      return;
    }
    fetchWithAuth("/api/profile")
      .then((res) => res.json())
      .then((payload: { success?: boolean; data?: { lastWorkoutGeneratedAt?: string | null } }) => {
        if (payload?.data?.lastWorkoutGeneratedAt !== undefined) {
          setLastWorkoutGeneratedAt(payload.data.lastWorkoutGeneratedAt);
        } else {
          setLastWorkoutGeneratedAt(null);
        }
      })
      .catch(() => setLastWorkoutGeneratedAt(null));
  }, [data.lastWorkoutGeneratedAt]);

  const remainingSessions = Math.max(coverage.totalSessions - coverage.coveredSessions, 0);
  // Ciclo concluído no fluxo de IA (programa comprado tem navegação própria de semanas).
  const isCycleCompleteAi = !program && Boolean(data.sessionProgress?.cycleCompleted);
  const progressBarWidth = Math.max(Math.min(coverage.percentage, 100), 0);

  // Começa a baixar o vídeo assim que o modal de confirmação abre.
  useEffect(() => {
    if (showGenerateConfirm && generateRequiresVideo) void preloadRewardedAd(consentPreferences.ads);
  }, [showGenerateConfirm, generateRequiresVideo, consentPreferences.ads]);

  async function handleGenerateWithVideo() {
    if (isGenerating || loadingGenerateVideo) return;
    setLoadingGenerateVideo(true);
    // O programa começa a ser gerado JUNTO com o vídeo: quando o vídeo termina,
    // o treino novo já está pronto (ou quase). Sem vídeo disponível, gera normalmente.
    const generation = handleGenerateWorkout();
    await showRewardedAd("generate_program", consentPreferences.ads);
    setLoadingGenerateVideo(false);
    await generation;
  }

  function handleGenerateWorkoutClick() {
    if (isGenerating) return;
    const daysLeft = daysUntilNextFreeGeneration(lastWorkoutGeneratedAt);
    if (!subscription?.isPremium && daysLeft > 0) {
      setShowFreeLimitPopup(true);
      return;
    }
    setShowGenerateConfirm(true);
  }

  async function handleGenerateWorkout() {
    setShowGenerateConfirm(false);
    setIsGenerating(true);
    setGenerateError(null);

    try {
      // Premium com mais de um local marcado gera um treino para CADA local.
      // O local ativo é gerado por último, para permanecer como local ativo ao fim.
      const activeLocation = (data.answers.location as string | undefined) ?? "home";
      const markedLocations =
        subscription?.isPremium && Array.isArray(data.answers.locations) && data.answers.locations.length
          ? Array.from(new Set<string>([...(data.answers.locations as string[]), activeLocation]))
          : [activeLocation];
      const orderedLocations = [
        ...markedLocations.filter((loc) => loc !== activeLocation),
        activeLocation
      ];

      for (const loc of orderedLocations) {
        const response = await fetchWithAuth("/api/workout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id, force: true, location: loc })
        });

        const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível gerar seu treino agora.");
        }
      }

      trackEvent("workout_generated", data.user.id, {
        goal: data.user.goal ?? null,
        source: "dashboard_regenerate"
      });

      setLoadingProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setIsGenerating(false);
      setGenerateError(getRequestErrorMessage(err, "Não foi possível gerar seu treino agora."));
    }
  }

  const SAUDACOES = [
    "Boa sor... ops... Bom treino, {nome}!",
    "O sofá vai sentir sua falta, {nome}!",
    "Hoje não tem desculpa, {nome}!",
    "Você veio! O difícil já foi, {nome}!",
    "VAMOS DESTRUIR, {nome}! 💥",
    "{nome} chegou! O treino treme!",
    "Modo fera ativado, {nome}!",
    "Bora, {nome}! 💪",
    "Vamos quebrar tudo hoje, {nome}?",
    "Hora de suar, {nome}!",
    "Força total, {nome}!",
    "Chegou a hora, {nome}! 🔥",
    "Sem dó hoje, {nome}!",
    "É hoje, {nome}!",
    "{nome} no treino, ninguém para!"
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saudacao = useMemo(() => {
    const template = SAUDACOES[Math.floor(Math.random() * SAUDACOES.length)];
    return template.replace(/\{nome\}/g, firstName);
  }, []);

  return (
    <AppShell className="space-y-4 sm:space-y-4">
      <Card className="overflow-hidden rounded-[24px] border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.13),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.016))] px-5 pb-[22px] pt-[22px] shadow-[0_12px_28px_rgba(0,0,0,0.2)] sm:px-5 sm:pb-[22px] sm:pt-[22px]">
        <div className="flex items-center justify-between mb-4">
          <img
            src={HOME_LOGO_URL}
            alt="Hora do Treino"
            className="h-auto max-w-[130px]"
          />
          <div className="flex items-center gap-1.5">
            {!program && (
              <button
                type="button"
                onClick={handleGenerateWorkoutClick}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/54 transition hover:border-white/20 hover:text-white/80"
                title="Gerar Novo Programa de Treino"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <Link
              href="/perfil"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/54 transition hover:border-white/20 hover:text-white/80"
              title="Dados para Treino"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="text-center">
          <h1 className="mb-[10px] text-[20px] font-bold leading-[1.15] tracking-tight text-white">
            {saudacao}
          </h1>
          {levelData && (
            <div className="mb-[22px] flex justify-center">
              <div className="rounded-full border border-white/20 px-4 py-1.5">
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">Nível</span>
                <LevelBadge data={levelData} />
              </div>
            </div>
          )}
          {plannedNext?.todayIsRest ? (
            <p className="mx-auto mb-1.5 text-center text-[13px] font-semibold text-white/60">
              Hoje é day off 😌 A recuperação também faz parte do treino.
            </p>
          ) : null}
          <p className="mx-auto mb-[18px] max-w-[18rem] text-center text-[18px] font-bold leading-[1.15]">
            <span className="text-primary/86">Próximo: </span>
            <span className="text-white">{featuredWorkoutText}</span>
            {plannedNextDayLabel ? <span className="text-white/60"> ({plannedNextDayLabel})</span> : null}
            {data.averageDurationMinutes > 0 && (
              <span className="text-white/46"> · ⏱ {data.averageDurationMinutes} min</span>
            )}
          </p>

          {program && (
            <div className="mb-[18px] flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onChangeProgramWeek?.(program.currentWeek - 1)}
                disabled={changingWeek || program.currentWeek <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Semana anterior"
                aria-label="Semana anterior"
              >
                ‹
              </button>
              <span className="min-w-[9rem] text-center text-[13px] font-semibold text-white/80">
                {program.weekLabel} · {program.currentWeek}/{program.totalWeeks}
              </span>
              <button
                type="button"
                onClick={() => onChangeProgramWeek?.(program.currentWeek + 1)}
                disabled={changingWeek || program.currentWeek >= program.totalWeeks}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Próxima semana"
                aria-label="Próxima semana"
              >
                ›
              </button>
            </div>
          )}
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
            <span className="text-[15px] font-bold leading-none">Ver treino</span>
          </div>
        </Link>
      </Card>

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

      <GoalCard
        activeGoal={activeGoal}
        showForm={showGoalForm}
        goalTarget={goalTarget}
        goalDays={goalDays}
        saving={savingGoal}
        onShowForm={() => setShowGoalForm(true)}
        onCancelForm={() => setShowGoalForm(false)}
        onChangeTarget={setGoalTarget}
        onChangeDays={setGoalDays}
        onSubmit={async () => {
          const target = Number(goalTarget);
          const days = Number(goalDays);
          if (!target || !days) return;
          setSavingGoal(true);
          try {
            const res = await fetchWithAuth("/api/goals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targetCount: target, periodDays: days })
            });
            const json = await res.json();
            if (json.success) {
              invalidateWorkoutCache();
              setActiveGoal(json.data);
              setShowGoalForm(false);
            }
          } finally {
            setSavingGoal(false);
          }
        }}
      />

      {/* Fim de ciclo (fluxo de IA): destaque para montar o próximo programa. */}
      {isCycleCompleteAi ? (
        subscriptionLoading ? null : (
          <CycleCompleteCard
            mode={resolveCycleCompleteMode(Boolean(subscription?.isPremium), data.freeCycleRenewalAvailable)}
            completedSessions={coverage.coveredSessions}
            onOpen={() => setShowCycleCelebration(true)}
          />
        )
      ) : (
      <Link href="/treino" className="block">
        <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none transition duration-200 hover:border-primary/20 sm:p-[18px]">
          <p className="mb-[10px] text-xs font-bold uppercase tracking-[0.12em] text-primary/88">Ciclo do plano</p>
          <h2 className="mb-3 text-[17px] font-bold leading-[1.15] text-white">
            {coverage.coveredSessions}/{coverage.totalSessions} sessões
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
            <span>{coverage.percentage}% do ciclo</span>
          </div>
        </Card>
      </Link>
      )}

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

      {/* Card de progresso — geração em andamento */}
      {isGenerating ? (
        <div ref={generatingCardRef} className="overflow-hidden rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/14 via-[#0f0f0f] to-[#151515] p-5">
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/90">Montagem do treino</p>
              <p className="text-xl font-semibold text-white">Montando seu novo treino...</p>
              <p className="text-sm leading-6 text-white/66">
                Estamos usando seus dados atualizados para criar um plano mais alinhado ao seu objetivo e rotina.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-4xl font-semibold text-white">{Math.round(loadingProgress)}%</p>
                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/38">Progresso estimado</p>
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.06] p-1">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-primary via-primaryStrong to-[#7BF1A8] transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.round(loadingProgress)}%` }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              {WORKOUT_LOADING_STAGES.map((stage, index) => {
                const stageIndex = getWorkoutLoadingStageIndex(Math.round(loadingProgress));
                const isDone = index < stageIndex;
                const isCurrent = index === stageIndex;
                return (
                  <div
                    key={stage}
                    className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 transition ${
                      isCurrent
                        ? "border-primary/30 bg-primary/12 text-white"
                        : isDone
                          ? "border-primary/18 bg-white/[0.03] text-white/78"
                          : "border-white/8 bg-white/[0.02] text-white/52"
                    }`}
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        isCurrent
                          ? "border-primary bg-primary/18 text-primary"
                          : isDone
                            ? "border-primary/40 bg-primary text-[#052b12]"
                            : "border-white/12 text-white/38"
                      }`}
                    >
                      {isDone ? "✓" : index + 1}
                    </span>
                    <p className={`min-w-0 flex-1 text-sm font-medium ${isCurrent ? "text-white" : ""}`}>{stage}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : generateError ? (
        <div className="rounded-[18px] border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
          {generateError}
        </div>
      ) : null}

      {/* Indique e Ganhe — só plano free (Premium não ganha nada indicando) */}
      {isFreePlan ? <ReferralCard /> : null}

      <RecommendationsCard
        goal={data.user.goal}
        level={data.user.level}
        equipment={data.answers.equipment}
        location={data.answers.location}
      />


      <div>
        {achievement ? (
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
        ) : null}

      </div>


      {isFreePlan ? <GoogleAd placement="home_fim" /> : null}


      {showWorkoutUpsell ? (
        <UpsellModal reason="generate_workout" onClose={() => setShowWorkoutUpsell(false)} />
      ) : null}

      {/* Modal de confirmação — gerar novo programa (idêntico ao perfil) */}
      {showGenerateConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/12">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="mb-1 text-base font-semibold text-white">Gerar novo programa?</p>
            <p className="mb-5 text-sm leading-5 text-white/56">
              Seu programa atual será substituído e <strong className="text-white/80">todas as sessões registradas serão reiniciadas</strong>. Não poderá ser desfeita, recomendamos seguir caso houve alteração no seu Perfil (objetivo, equipamentos, tempo...)
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void (generateRequiresVideo ? handleGenerateWithVideo() : handleGenerateWorkout())}
                disabled={loadingGenerateVideo}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {generateRequiresVideo ? (
                  loadingGenerateVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />
                ) : null}
                {generateRequiresVideo
                  ? loadingGenerateVideo ? "Carregando vídeo..." : "Ver vídeo e gerar novo programa"
                  : "Sim, gerar novo programa"}
              </button>
              <button
                type="button"
                onClick={() => setShowGenerateConfirm(false)}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Popup de limite free — gerar programa ───────────────────── */}
      {showMissingOut && !anotherPopupOpen ? (
        <MissingOutPopup
          firstName={firstName}
          totalWorkouts={data.totalWorkoutsAllTime}
          weightIncreases={data.totalWeightIncreasesAllTime}
          daysUsing={missingOutDaysUsing}
          isNative={isNative}
          onClose={() => setShowMissingOut(false)}
        />
      ) : null}

      {showFreeLimitPopup ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <p className="mb-1 text-base font-semibold text-white">Gerar novo programa de treino?</p>
            <p className="mb-1 text-sm leading-5 text-white/56">
              Essa função estará disponível novamente dentro de:{" "}
              <strong className="text-white/80">{daysUntilNextFreeGeneration(lastWorkoutGeneratedAt)} dias</strong>.
            </p>
            <p className="mb-5 text-sm leading-5 text-white/56">
              Assine o Premium e gere programas livremente.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setShowFreeLimitPopup(false); router.push("/premium"); }}
                className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
              >
                Assinar o Premium
              </button>
              {/* Só no app com AdMob: libera gerar agora em troca de um vídeo */}
              <RewardedAdButton
                purpose="generate_workout"
                label="Assistir um vídeo e gerar agora"
                onRewarded={() => {
                  setShowFreeLimitPopup(false);
                  void handleGenerateWorkout();
                }}
              />
              <button
                type="button"
                onClick={() => setShowFreeLimitPopup(false)}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
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

// ─── Geração de treino — barra de progresso ───────────────────────────────────

const WORKOUT_LOADING_STAGES = [
  "Analisando seu perfil atualizado",
  "Selecionando os melhores exercícios",
  "Criando a estratégia de treino",
  "Montando seu plano personalizado",
  "Treino pronto!"
];

const WORKOUT_LOADING_INITIAL = 4;
const WORKOUT_LOADING_MAX = 97;
const WORKOUT_LOADING_DECAY_MS = 8000;

function getWorkoutLoadingProgress(elapsed: number) {
  if (elapsed <= 0) return WORKOUT_LOADING_INITIAL;
  return WORKOUT_LOADING_INITIAL + (WORKOUT_LOADING_MAX - WORKOUT_LOADING_INITIAL) * (1 - Math.exp(-elapsed / WORKOUT_LOADING_DECAY_MS));
}

function getWorkoutLoadingStageIndex(progress: number) {
  if (progress >= 100) return 4;
  if (progress >= 75) return 3;
  if (progress >= 50) return 2;
  if (progress >= 25) return 1;
  return 0;
}

// Retorna quantos dias faltam para o free poder gerar de novo (0 = já pode)
function daysUntilNextFreeGeneration(lastGeneratedAt: string | null | undefined): number {
  if (!lastGeneratedAt) return 0;
  const last = new Date(lastGeneratedAt).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((last + 30 * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000));
  return diffDays > 0 ? diffDays : 0;
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
