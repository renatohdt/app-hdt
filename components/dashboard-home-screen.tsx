"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dumbbell,
  RefreshCw,
  Settings,
  Target,
  Trophy
} from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { ReferralRewardPopup } from "@/components/referral-reward-popup";
import { ReferralExpiryPopup } from "@/components/referral-expiry-popup";
import { useSubscription } from "@/components/use-subscription";
import { LevelBadge, LevelPopup } from "@/components/level-badge";
import { REGRESSION_MESSAGE } from "@/lib/user-level";
import {
  formatSessionCounter,
  getPlanCoverage,
  type AppWorkoutData
} from "@/lib/app-workout";
import { getLastUnlockedAchievement, REFERRAL_REWARD_ACHIEVEMENT } from "@/lib/achievements";
import { AchievementPopup } from "@/components/achievement-popup";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { GoalCard, type ActiveGoalShape } from "@/components/goal-card";
import { RecommendationsCard } from "@/components/recommendations-card";

const HOME_LOGO_URL = "https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png";

export function DashboardHomeScreen({ data }: { data: AppWorkoutData }) {
  const [showUpsellBanner, setShowUpsellBanner] = useState(false);
  const [showWorkoutUpsell, setShowWorkoutUpsell] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTarget, setGoalTarget] = useState("12");
  const [goalDays, setGoalDays] = useState("30");
  const [savingGoal, setSavingGoal] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActiveGoalShape>(data.activeGoal ?? null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showFreeLimitPopup, setShowFreeLimitPopup] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [lastWorkoutGeneratedAt, setLastWorkoutGeneratedAt] = useState<string | null | undefined>(undefined);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generatingAnimFrameRef = useRef(0);
  const generatingCardRef = useRef<HTMLDivElement | null>(null);
  const { subscription, loading: subscriptionLoading } = useSubscription();
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
  const featuredWorkoutText = data.featuredWorkoutLabel || "Treino";
  // Só trata como free depois que a assinatura terminou de carregar.
  // Evita mostrar anúncio/banner premium para quem é premium durante o carregamento.
  const isFreePlan = !subscriptionLoading && !subscription?.isPremium;

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

  // Busca lastWorkoutGeneratedAt para verificar cooldown do plano free
  useEffect(() => {
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
  }, []);

  const remainingSessions = Math.max(coverage.totalSessions - coverage.coveredSessions, 0);
  const progressBarWidth = Math.max(Math.min(coverage.percentage, 100), 0);

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
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, force: true })
      });

      const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível gerar seu treino agora.");
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
            <button
              type="button"
              onClick={handleGenerateWorkoutClick}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/54 transition hover:border-white/20 hover:text-white/80"
              title="Gerar Novo Programa de Treino"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
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
          <p className="mx-auto mb-[18px] max-w-[18rem] text-center text-[18px] font-bold leading-[1.15]">
            <span className="text-primary/86">Próximo: </span>
            <span className="text-white">{featuredWorkoutText}</span>
            {data.averageDurationMinutes > 0 && (
              <span className="text-white/46"> · ⏱ {data.averageDurationMinutes} min</span>
            )}
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
            <span className="text-[15px] font-bold leading-none">Ver treino</span>
          </div>
        </Link>
      </Card>

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
              setActiveGoal(json.data);
              setShowGoalForm(false);
            }
          } finally {
            setSavingGoal(false);
          }
        }}
      />

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

      <RecommendationsCard
        goal={data.user.goal}
        level={data.user.level}
        equipment={data.answers.equipment}
      />

      {/* Banner Premium — exibido apenas para usuários do plano free */}
      {isFreePlan && (
        <button
          onClick={() => setShowUpsellBanner(true)}
          className="w-full rounded-[24px] border border-primary/20 bg-[linear-gradient(135deg,rgba(34,197,94,0.10),rgba(16,185,129,0.05))] p-[18px] text-left transition hover:border-primary/35"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mb-0.5 text-xs font-bold uppercase tracking-[0.12em] text-primary/80">
                Premium
              </p>
              <p className="text-[15px] font-bold leading-snug text-white">
                Evolua sem limites por R$&nbsp;9,90/mês
              </p>
              <p className="mt-1 text-[13px] text-white/50">
                Programas e substituições ilimitados
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary">
              Ver planos
            </div>
          </div>
        </button>
      )}

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


      {isFreePlan ? <GoogleAd /> : null}

      {showUpsellBanner ? (
        <UpsellModal reason="home_banner" onClose={() => setShowUpsellBanner(false)} />
      ) : null}

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
                onClick={() => void handleGenerateWorkout()}
                className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
              >
                Sim, gerar novo programa
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
