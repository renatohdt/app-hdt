"use client";

import clsx from "clsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Crown, Loader2, Play } from "lucide-react";
import { TrainingInlineAd } from "@/components/TrainingInlineAd";
import { AppShell } from "@/components/app-shell";
import { AchievementPopup } from "@/components/achievement-popup";
import { LevelPopup } from "@/components/level-badge";
import { ExpandableExerciseCard } from "@/components/expandable-exercise-card";
import { Button, Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { WorkoutCompletionPopup } from "@/components/workout-completion-popup";
import { CycleCompleteCard, CycleCompleteCelebration, resolveCycleCompleteMode } from "@/components/cycle-complete";
import { useSubscription } from "@/components/use-subscription";
import { PREMIUM_NUDGE_AT_WORKOUTS } from "@/components/workout-premium-nudge";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import {
  buildTrainingExerciseRows,
  formatDurationLabel,
  getFeaturedWorkoutKey,
  formatSessionCounter,
  formatWorkoutDisplayTitle,
  type AppWorkoutData
} from "@/lib/app-workout";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { getNewlyUnlockedAchievement, getNewlyUnlockedWeightAchievement, type Achievement } from "@/lib/achievements";
import type { WorkoutSessionProgress } from "@/lib/workout-sessions";
import { ExtraWorkoutButton } from "@/components/ExtraWorkoutButton";
import { WorkoutProgressDock } from "@/components/workout-progress-dock";
import { AlreadyTrainedTodayPopup } from "@/components/already-trained-today-popup";
import { StatsRow } from "@/components/active-workout-watcher";
import {
  AUTO_FINISHED_EVENT,
  REQUEST_FINISH_EVENT,
  buildTimingPayload,
  clearActiveWorkout,
  clearExerciseDrafts,
  formatDurationMinutes,
  getSessionDurationSeconds,
  hasTrainedTodayLocally,
  isAutoFinishDue,
  markTrainedToday,
  readActiveWorkout,
  readExerciseDraftRaw,
  requestScreenWakeLock,
  subscribeActiveWorkout,
  writeActiveWorkout,
  type ActiveWorkoutSession
} from "@/lib/active-workout-session";
import { scheduleIdleWorkoutNotification } from "@/lib/workout-idle-notification";
import { normalizeExerciseName } from "@/lib/exercise-weight-store";
import { getPlannedNext } from "@/lib/weekly-plan-app";

const TRAINING_STYLE_LABELS: Record<string, string> = {
  musculacao: "Tradicional",
  funcional: "Funcional",
  hiit: "HIIT",
  calistenia: "Calistenia"
};

const LOCATION_LABELS: Record<string, string> = {
  home: "Casa",
  condo_gym: "Condomínio",
  gym: "Academia"
};

// Locais que o usuário pode adicionar pelo botão "+ Local". "gym" fica oculto
// por ora (evolução futura), embora seja suportado no back-end e nas abas.
const SELECTABLE_LOCATIONS = ["home", "condo_gym"] as const;

function formatLocationLabel(value?: string | null) {
  if (!value) return "";
  return LOCATION_LABELS[value] ?? value;
}

function formatTrainingStyleLabel(value?: string) {
  if (!value) return "";
  return TRAINING_STYLE_LABELS[value] ?? "";
}

type XpResult = {
  phasedUp: boolean;
  phaseUpMessage: { title: string; phrase: string } | null;
  newPhase: string;
  xpGained: number;
  newXp: number;
};

type CompletionResponse = {
  success: boolean;
  already_completed_today?: boolean;
  message?: string;
  data?: {
    sessionProgress: WorkoutSessionProgress;
    nextWorkoutKey?: string | null;
    completion?: {
      workoutKey: string | null;
      sessionNumber: number;
      completedAt: string;
    } | null;
    prevTotalWorkouts?: number;
    newTotalWorkouts?: number;
    prevWeightIncreases?: number;
    newWeightIncreases?: number;
    program_completed?: boolean;
    user_plan?: string | null;
    xp_result?: XpResult | null;
  };
  error?: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  text: string;
};

const COMPLETE_WORKOUT_ERROR_MESSAGE = "Não foi possível marcar o treino como concluído.";

export function TrainingScreen({ data, reloadWorkout, applyWorkoutUpdate }: {
  data: AppWorkoutData;
  reloadWorkout: () => Promise<void>;
  applyWorkoutUpdate: (workout: import("@/lib/types").WorkoutPlan) => void;
}) {
  // Modo programa: presente apenas quando o usuário tem um programa comprado ativo.
  const isProgram = Boolean(data.raw.program);
  // Se existe um treino em andamento salvo no aparelho, reabre direto nele.
  const [restoredWorkoutKey] = useState<string | null>(() => {
    const saved = readActiveWorkout();
    if (saved && saved.userId === data.user.id) {
      if (saved.workoutType === "extra") return null;
      return data.workouts[saved.workoutKey] && !isAutoFinishDue(saved) ? saved.workoutKey : null;
    }
    // Sem treino em andamento: séries marcadas que sobraram de antes não valem mais
    // (roda antes dos cards lerem os rascunhos, para não reaparecerem marcadas).
    data.workoutOrder.forEach((key) => clearExerciseDrafts(data.user.id, key));
    return null;
  });
  const [activeWorkoutKey, setActiveWorkoutKey] = useState(
    restoredWorkoutKey ?? data.featuredWorkoutKey ?? data.workoutOrder[0] ?? ""
  );
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [sessionProgress, setSessionProgress] = useState(data.sessionProgress);
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState(false);
  const [sessionLiked, setSessionLiked] = useState<boolean | null>(null);
  const [sessionIntensity, setSessionIntensity] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [switchingLocation, setSwitchingLocation] = useState(false);
  const [showLocationUpsell, setShowLocationUpsell] = useState(false);
  // "+ Local": abre o seletor de novos locais e gera o treino do local escolhido.
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [generatingLocation, setGeneratingLocation] = useState<string | null>(null);
  const [replacementCount, setReplacementCount] = useState(data.replacementCount);
  // Mapa de nome normalizado → último peso registrado, carregado em batch ao abrir a tela
  const [lastWeightsMap, setLastWeightsMap] = useState<Record<string, number>>({});
  // Contador de substituições por sessão (Treino A, B, C...) — usado para o limite do premium
  const [replacementsPerWorkoutKey, setReplacementsPerWorkoutKey] = useState<Record<string, number>>({});
  const [replacedExerciseNames, setReplacedExerciseNames] = useState<Set<string>>(new Set());
  const [totalWorkoutsAllTime, setTotalWorkoutsAllTime] = useState(data.totalWorkoutsAllTime);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [phaseUpPopup, setPhaseUpPopup] = useState<{ title: string; phrase: string } | null>(null);
  // Tela cheia de "Programa concluído" (fim de ciclo) — abre sozinha ao finalizar
  // a última sessão e também pelo card de destaque.
  const [showCycleCelebration, setShowCycleCelebration] = useState(false);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  // Popup "Você já treinou hoje" — exibido antes da confirmação quando a pessoa
  // tenta finalizar um treino tendo já concluído uma sessão no mesmo dia.
  const [showAlreadyTrainedPopup, setShowAlreadyTrainedPopup] = useState(false);
  // Conjunto de exercícios com TODAS as séries concluídas (reportado por cada card)
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());
  // Garante que o popup automático abra apenas uma vez por sessão de treino
  const [autoPrompted, setAutoPrompted] = useState(false);
  // Séries marcadas por exercício (alimenta a barra de progresso do treino).
  const [exerciseProgress, setExerciseProgress] = useState<Record<string, { done: number; total: number }>>({});
  // Treino em andamento salvo no aparelho (início, última atividade...).
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  // Muda para "remontar" os cards depois de finalizar (limpa as séries marcadas da tela).
  const [cardsResetToken, setCardsResetToken] = useState(0);
  // Resumo exibido no popup de comemoração (ex.: "47 min · 18 séries · 6/6 exercícios").
  const [completionSummary, setCompletionSummary] = useState<string | null>(null);
  // Plano free no 2º/5º treino concluído: o popup mostra o convite Premium.
  const [premiumNudgeWorkouts, setPremiumNudgeWorkouts] = useState<number | null>(null);
  // Regra de um treino por dia: avisa ao INICIAR (e não só ao finalizar).
  // Ao marcar séries, o aviso aparece uma única vez por abertura da tela.
  const alreadyTrainedWarnedRef = useRef(false);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const featuredWorkoutKey = useMemo(
    () => getFeaturedWorkoutKey(data.workoutOrder, sessionProgress.lastCompletedWorkoutKey),
    [data.workoutOrder, sessionProgress.lastCompletedWorkoutKey]
  );

  useEffect(() => {
    setSessionProgress(data.sessionProgress);
  }, [data.sessionProgress]);

  // Premium: o treino em destaque segue a "Minha semana" (regras de descanso e
  // de grupo muscular). Só ajusta enquanto a pessoa não escolheu outra aba.
  const userPickedTabRef = useRef(Boolean(restoredWorkoutKey));
  const followsWeeklyPlan = !subscriptionLoading && Boolean(subscription?.isPremium) && !isProgram;
  useEffect(() => {
    if (!followsWeeklyPlan || userPickedTabRef.current) return;
    const planned = getPlannedNext({ data })?.workoutKey;
    if (planned && data.workouts[planned]) setActiveWorkoutKey(planned);
  }, [followsWeeklyPlan, data]);

  useEffect(() => {
    if (!data.workouts[activeWorkoutKey]) {
      setActiveWorkoutKey(featuredWorkoutKey ?? data.workoutOrder[0] ?? "");
    }
  }, [activeWorkoutKey, data.workoutOrder, data.workouts, featuredWorkoutKey]);

  useEffect(() => {
    trackEvent("workout_viewed", data.user.id, {
      source: "training_screen",
      goal: data.user.goal ?? null,
      workout_count: data.workoutOrder.length
    });
  }, [data.user.goal, data.user.id, data.workoutOrder.length]);

  useEffect(() => {
    if (!confirmCompletion) {
      setSessionLiked(null);
      setSessionIntensity(null);
    }
  }, [confirmCompletion]);

  const workout = data.workouts[activeWorkoutKey] ?? data.workouts[data.workoutOrder[0] ?? ""];
  const exerciseRows = useMemo(() => buildTrainingExerciseRows(workout), [workout]);

  // Totais da barra de progresso: anda a cada SÉRIE marcada.
  const progressStats = useMemo(() => {
    let setsDone = 0;
    let setsTotal = 0;
    let exercisesDone = 0;
    const segments: number[] = [];
    exerciseRows.forEach((row) => {
      const reported = exerciseProgress[row.id];
      const total = reported?.total ?? Math.max(row.plannedSetsCount ?? 1, 1);
      const done = Math.min(reported?.done ?? 0, total);
      setsDone += done;
      setsTotal += total;
      segments.push(total);
      if (total > 0 && done >= total) exercisesDone += 1;
    });
    return { setsDone, setsTotal, exercisesDone, exercisesTotal: exerciseRows.length, segments };
  }, [exerciseProgress, exerciseRows]);

  const handleExerciseProgressChange = useCallback((exerciseId: string, done: number, total: number) => {
    setExerciseProgress((prev) => {
      const current = prev[exerciseId];
      if (current && current.done === done && current.total === total) return prev;
      return { ...prev, [exerciseId]: { done, total } };
    });
  }, []);

  // Acompanha o treino em andamento salvo no aparelho (inclusive mudanças feitas pelo vigia global).
  useEffect(() => {
    const sync = () => setActiveSession(readActiveWorkout());
    sync();
    return subscribeActiveWorkout(sync);
  }, []);

  // Mantém os totais do treino salvo atualizados (usados na pílula e no fechamento automático).
  useEffect(() => {
    const saved = readActiveWorkout();
    if (
      !saved ||
      saved.userId !== data.user.id ||
      saved.workoutType === "extra" ||
      saved.workoutKey !== activeWorkoutKey
    ) {
      return;
    }
    if (
      saved.setsDone === progressStats.setsDone &&
      saved.setsTotal === progressStats.setsTotal &&
      saved.exercisesDone === progressStats.exercisesDone &&
      saved.exercisesTotal === progressStats.exercisesTotal
    ) {
      return;
    }
    writeActiveWorkout({
      ...saved,
      setsDone: progressStats.setsDone,
      setsTotal: progressStats.setsTotal,
      exercisesDone: progressStats.exercisesDone,
      exercisesTotal: progressStats.exercisesTotal
    });
  }, [activeWorkoutKey, data.user.id, progressStats]);

  const userSession =
    activeSession && activeSession.userId === data.user.id && !isAutoFinishDue(activeSession) ? activeSession : null;
  // Barra desta tela só para o treino do programa; o Treino Extra tem tela própria.
  const sessionForUser = userSession && userSession.workoutType !== "extra" ? userSession : null;
  const extraSessionActive = userSession?.workoutType === "extra";
  const hasActiveSession = Boolean(sessionForUser);

  // Tela sempre acesa enquanto o treino está em andamento (quando o aparelho permite).
  useEffect(() => {
    if (!hasActiveSession) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      const acquired = await requestScreenWakeLock();
      if (cancelled) {
        void acquired?.release().catch(() => {});
        return;
      }
      lock = acquired;
    };
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [hasActiveSession]);

  // Busca o último peso de todos os exercícios em uma única chamada ao mudar de treino
  useEffect(() => {
    if (!exerciseRows.length) return;
    const names = exerciseRows.map((e) => e.name).join(",");
    fetchWithAuth(`/api/exercise-weight/batch?exercises=${encodeURIComponent(names)}`)
      .then((res) => res.json())
      .then((result) => {
        if (result?.success && result.data) {
          setLastWeightsMap(result.data as Record<string, number>);
        }
      })
      .catch(() => {});
  }, [exerciseRows]);

  // Cada card avisa aqui quando seu estado de conclusão muda. Atualizamos o conjunto
  // apenas quando há mudança real, evitando re-renderizações desnecessárias.
  const handleExerciseCompletionChange = useCallback((exerciseId: string, isComplete: boolean) => {
    setCompletedExerciseIds((prev) => {
      if (isComplete === prev.has(exerciseId)) return prev;
      const next = new Set(prev);
      if (isComplete) next.add(exerciseId);
      else next.delete(exerciseId);
      return next;
    });
  }, []);

  // Ao trocar de treino (ou avançar para o próximo após concluir), recomeçamos do zero.
  useEffect(() => {
    setCompletedExerciseIds(new Set());
    setAutoPrompted(false);
  }, [activeWorkoutKey]);

  // Quando TODAS as séries de TODOS os exercícios estão marcadas, abre o popup automaticamente.
  // Dispara só uma vez por sessão (autoPrompted); se a pessoa cancelar, não reabre sozinho.
  useEffect(() => {
    if (autoPrompted || !exerciseRows.length) return;
    const allComplete = exerciseRows.every((exercise) => completedExerciseIds.has(exercise.id));
    if (allComplete) {
      setAutoPrompted(true);
      requestCompletion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompted, completedExerciseIds, exerciseRows]);

  // Ponto único para iniciar a finalização: se a pessoa já treinou hoje, mostra o
  // popup antes de qualquer confirmação; caso contrário, abre o fluxo normal.
  // Já treinou hoje? Vale treino do programa OU Treino Extra (1 por dia no total).
  function trainedTodayAnyType() {
    return isCompletedTodaySaoPaulo(sessionProgress.lastCompletedAt) || hasTrainedTodayLocally(data.user.id);
  }

  function requestCompletion() {
    if (trainedTodayAnyType()) {
      // Já treinou hoje: este treino não vai contar, então encerramos o "em andamento".
      clearRegularActiveWorkout();
      setShowAlreadyTrainedPopup(true);
      return;
    }
    setConfirmCompletion(true);
  }

  // Pedidos vindos de fora da tela: "Já terminei" (pergunta dos 15 min) e
  // treino fechado automaticamente pelo vigia global.
  const requestCompletionRef = useRef(requestCompletion);
  requestCompletionRef.current = requestCompletion;
  useEffect(() => {
    const onRequestFinish = () => requestCompletionRef.current();
    const onAutoFinished = () => {
      setCardsResetToken((value) => value + 1);
      void reloadWorkout();
    };
    window.addEventListener(REQUEST_FINISH_EVENT, onRequestFinish);
    window.addEventListener(AUTO_FINISHED_EVENT, onAutoFinished);
    if (new URLSearchParams(window.location.search).get("finalizar") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      requestCompletionRef.current();
    }
    return () => {
      window.removeEventListener(REQUEST_FINISH_EVENT, onRequestFinish);
      window.removeEventListener(AUTO_FINISHED_EVENT, onAutoFinished);
    };
  }, [reloadWorkout]);

  const sessionLabel = formatSessionCounter(sessionProgress);
  const isCycleComplete = sessionProgress.cycleCompleted;
  const estimatedDurationLabel = formatDurationLabel(workout?.estimatedDurationMinutes, workout?.durationRange ?? null);
  const workoutDayId = String(data.workoutOrder.indexOf(activeWorkoutKey));
  const isPremiumUser = subscription?.isPremium ?? false;
  const cycleCompleteMode = resolveCycleCompleteMode(isPremiumUser, data.freeCycleRenewalAvailable);
  // Para exibir anúncios, só consideramos "free" depois que a assinatura carregou.
  // Evita anúncio piscar para premium durante o carregamento.
  const showAds = !subscriptionLoading && !isPremiumUser;
  // Free: limite de 2 por programa | Premium: limite de 2 por sessão (Treino A, B, C independentes)
  const replacementsForActiveDay = replacementsPerWorkoutKey[activeWorkoutKey] ?? 0;
  const replacementLimitReached = isPremiumUser
    ? replacementsForActiveDay >= 2
    : replacementCount >= 2;
  // Quantas substituições restam no contexto atual (para exibir no modal)
  const replacementsRemaining = Math.max(0, 2 - (isPremiumUser ? replacementsForActiveDay : replacementCount));

  async function handleExerciseReplaced(newExerciseName: string, updatedWorkout?: import("@/lib/types").WorkoutPlan) {
    setReplacementCount((prev) => prev + 1);
    // Incrementa o contador do treino ativo (A, B, C...) para controle do limite premium
    setReplacementsPerWorkoutKey((prev) => ({
      ...prev,
      [activeWorkoutKey]: (prev[activeWorkoutKey] ?? 0) + 1
    }));
    if (newExerciseName) {
      setReplacedExerciseNames((prev) => new Set([...prev, newExerciseName]));
    }
    if (updatedWorkout) {
      applyWorkoutUpdate(updatedWorkout);
    } else {
      await reloadWorkout();
    }
  }

  // Troca o local ATIVO do treino (casa/condomínio). Exclusivo Premium — o Free
  // vê o convite. Depois de trocar, recarrega o treino do novo local (ou, se ainda
  // não existir programa para ele, o back-end mantém o treino mais recente).
  async function handleSwitchLocation(nextLocation: string) {
    const current = (data.answers.location as string | undefined) ?? "home";
    if (nextLocation === current || switchingLocation) return;
    if (!isPremiumUser) {
      setShowLocationUpsell(true);
      return;
    }
    setSwitchingLocation(true);
    try {
      const response = await fetchWithAuth("/api/workout/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: nextLocation })
      });
      const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível trocar o local.");
      }
      await reloadWorkout();
    } catch {
      // v1: em caso de erro, mantém o local atual (sem toast).
    } finally {
      setSwitchingLocation(false);
    }
  }

  // "+ Local": gera um treino para um local que o usuário ainda não tem. Uma única
  // ação persiste o novo local e gera o programa (exclusivo Premium). Depois de
  // gerar, recarrega para o novo local aparecer como aba.
  async function handleGenerateForLocation(nextLocation: string) {
    if (generatingLocation) return;
    if (!isPremiumUser) {
      setShowLocationPicker(false);
      setShowLocationUpsell(true);
      return;
    }
    setGeneratingLocation(nextLocation);
    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, location: nextLocation })
      });
      const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível gerar o treino.");
      }
      setShowLocationPicker(false);
      await reloadWorkout();
    } catch {
      // v1: mantém o estado atual em caso de erro (sem toast).
    } finally {
      setGeneratingLocation(null);
    }
  }

  if (!workout) {
    return (
      <AppShell>
        <Card className="p-5 shadow-none sm:p-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Treinos</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Nenhum treino disponível</h1>
          <p className="mt-2 text-sm leading-6 text-white/62">
            Gere ou atualize seu plano no perfil para voltar ao fluxo principal do treino.
          </p>
        </Card>
      </AppShell>
    );
  }

  const workoutTitleLabel = formatWorkoutDisplayTitle(workout.title, activeWorkoutKey);
  const allSetsDone = progressStats.setsTotal > 0 && progressStats.setsDone >= progressStats.setsTotal;

  function isExerciseDone(exerciseId: string) {
    const reported = exerciseProgress[exerciseId];
    return Boolean(reported && reported.total > 0 && reported.done >= reported.total);
  }

  // Cria (ou atualiza) o treino em andamento. hadActivity = veio de uma série marcada.
  // Retorna false quando não pôde iniciar (já treinou hoje).
  function startOrTouchWorkout(hadActivity: boolean, fromStartButton = false): boolean {
    const now = Date.now();
    const saved = readActiveWorkout();
    const savedActive = saved && saved.userId === data.user.id && !isAutoFinishDue(saved, now) ? saved : null;
    // Só um treino aberto por vez: com um Treino Extra em andamento, o do programa não inicia.
    if (savedActive?.workoutType === "extra") {
      setFeedback({ tone: "error", text: "Você tem um Treino Extra em andamento. Finalize-o antes de começar este." });
      return false;
    }
    const base = savedActive;
    if (!base && trainedTodayAnyType()) {
      if (fromStartButton || !alreadyTrainedWarnedRef.current) {
        alreadyTrainedWarnedRef.current = true;
        setShowAlreadyTrainedPopup(true);
        trackEvent("cta_click", data.user.id, {
          source: "workout_start_blocked_already_trained",
          workout_key: activeWorkoutKey
        });
      }
      return false;
    }
    writeActiveWorkout({
      v: 1,
      userId: data.user.id,
      workoutType: "regular",
      workoutId: null,
      workoutKey: activeWorkoutKey,
      workoutTitle: workoutTitleLabel,
      estimatedLabel: estimatedDurationLabel || null,
      startedAt: base?.startedAt ?? now,
      lastActivityAt: now,
      hadActivity: Boolean(base?.hadActivity) || hadActivity,
      setsDone: progressStats.setsDone,
      setsTotal: progressStats.setsTotal,
      exercisesDone: progressStats.exercisesDone,
      exercisesTotal: progressStats.exercisesTotal,
      exercises: exerciseRows.map((row) => ({ id: row.id, name: row.name }))
    });
    // Lembrete no celular para 15 min depois desta atividade (pede permissão só no início).
    void scheduleIdleWorkoutNotification({ lastActivityAt: now, workoutTitle: workoutTitleLabel, askPermission: !base });
    if (!base) {
      trackEvent("cta_click", data.user.id, {
        source: hadActivity ? "workout_started_by_set" : "workout_started",
        workout_key: activeWorkoutKey
      });
    }
    return true;
  }

  function handleStartWorkout() {
    if (!startOrTouchWorkout(false, true)) return;
    if (!openExerciseId) {
      const first = exerciseRows.find((row) => !isExerciseDone(row.id));
      if (first) setOpenExerciseId(first.id);
    }
  }

  // Cada série marcada/desmarcada: inicia o treino (se preciso), conta como atividade
  // e, ao concluir um exercício, já abre o próximo que falta.
  function handleSetActivity(exerciseId: string, info: { completedSets: number; totalSets: number; isComplete: boolean }) {
    if (!startOrTouchWorkout(true)) return;
    if (!info.isComplete) return;
    try {
      navigator.vibrate?.(20);
    } catch {
      // sem vibração neste aparelho
    }
    const index = exerciseRows.findIndex((row) => row.id === exerciseId);
    const ordered = [...exerciseRows.slice(index + 1), ...exerciseRows.slice(0, Math.max(index, 0))];
    const next = ordered.find((row) => row.id !== exerciseId && !isExerciseDone(row.id));
    setOpenExerciseId(next?.id ?? null);
  }

  async function handleCompleteWorkout() {
    setCompletingWorkout(true);
    setFeedback(null);

    try {
      const exerciseWeights = collectExerciseWeights(data.user.id, activeWorkoutKey, exerciseRows);
      const savedSession = readActiveWorkout();
      const sessionForTiming =
        savedSession && savedSession.userId === data.user.id && savedSession.workoutType !== "extra"
          ? { ...savedSession, setsDone: progressStats.setsDone, setsTotal: progressStats.setsTotal }
          : null;
      const timing = sessionForTiming ? buildTimingPayload(sessionForTiming, allSetsDone ? "all_done" : "manual") : null;
      const finishedWorkoutKey = activeWorkoutKey;

      const response = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workoutKey: activeWorkoutKey,
          exerciseWeights,
          liked: sessionLiked,
          intensityLevel: sessionIntensity,
          timing
        })
      });

      const result = await parseJsonResponse<CompletionResponse>(response);

      if (result.already_completed_today) {
        if (result.data?.sessionProgress) {
          setSessionProgress(result.data.sessionProgress);
        }
        clearRegularActiveWorkout();
        // Servidor confirmou que já houve treino hoje: os próximos "Iniciar" já avisam.
        markTrainedToday(data.user.id);

        setConfirmCompletion(false);
        setShowAlreadyTrainedPopup(true);
        return;
      }

      if (!response.ok || !result.success || !result.data || !result.data.completion) {
        throw new Error(result.message ?? result.error ?? COMPLETE_WORKOUT_ERROR_MESSAGE);
      }

      setSessionProgress(result.data.sessionProgress);

      // Treino registrado: encerra o "em andamento" e limpa as séries marcadas.
      const durationSeconds = sessionForTiming ? getSessionDurationSeconds(sessionForTiming, "manual") : null;
      setCompletionSummary(
        durationSeconds !== null
          ? [
              formatDurationMinutes(durationSeconds),
              `${progressStats.setsDone} séries`,
              `${progressStats.exercisesDone}/${progressStats.exercisesTotal} exercícios`
            ].join(" · ")
          : null
      );
      clearExerciseDrafts(data.user.id, finishedWorkoutKey);
      clearRegularActiveWorkout();
      setCardsResetToken((value) => value + 1);
      setOpenExerciseId(null);
      // Progresso mudou: dashboard/calendário devem buscar a versão nova.
      invalidateWorkoutCache();
      markTrainedToday(data.user.id);
      const plannedNextKey = followsWeeklyPlan
        ? getPlannedNext({ data, sessionProgress: result.data.sessionProgress })?.workoutKey ?? null
        : null;
      const nextWorkoutKey =
        plannedNextKey ??
        result.data.nextWorkoutKey ??
        getFeaturedWorkoutKey(data.workoutOrder, result.data.sessionProgress.lastCompletedWorkoutKey);
      const nextWorkoutLabel = formatWorkoutDisplayTitle(data.workouts[nextWorkoutKey ?? ""]?.title, nextWorkoutKey);

      if (nextWorkoutKey) {
        setActiveWorkoutKey(nextWorkoutKey);
      }

      // Última sessão do ciclo: a celebração de fim de programa substitui o popup
      // comum de treino concluído (modo programa comprado segue o fluxo normal).
      const cycleJustCompleted = Boolean(result.data.program_completed) && !isProgram;

      setConfirmCompletion(false);
      if (cycleJustCompleted) {
        setShowCycleCelebration(true);
      } else {
        setShowCompletionPopup(true);
        setFeedback({
          tone: "success",
          text: `Próximo em destaque: ${nextWorkoutLabel}.`
        });
      }

      const prev = result.data.prevTotalWorkouts ?? totalWorkoutsAllTime;
      const next = result.data.newTotalWorkouts ?? totalWorkoutsAllTime + 1;
      setTotalWorkoutsAllTime(next);
      setPremiumNudgeWorkouts(
        !subscriptionLoading && !isPremiumUser && PREMIUM_NUDGE_AT_WORKOUTS.includes(next) ? next : null
      );
      const unlocked =
        getNewlyUnlockedAchievement(prev, next) ??
        getNewlyUnlockedWeightAchievement(
          result.data.prevWeightIncreases ?? 0,
          result.data.newWeightIncreases ?? 0
        );
      if (unlocked) {
        setNewAchievement(unlocked);
      }

      // Popup de conquista de fase (evolução de nível)
      if (result.data.xp_result?.phasedUp && result.data.xp_result.phaseUpMessage) {
        setPhaseUpPopup(result.data.xp_result.phaseUpMessage);
      }

      trackEvent("cta_click", data.user.id, {
        source: "complete_workout",
        workout_key: activeWorkoutKey,
        session_number: result.data.completion?.sessionNumber ?? null
      });

    } catch (requestError) {
      setFeedback({
        tone: "error",
        text: getRequestErrorMessage(requestError, COMPLETE_WORKOUT_ERROR_MESSAGE)
      });
    } finally {
      setCompletingWorkout(false);
    }
  }

  function handleWorkoutTabChange(workoutKey: string) {
    userPickedTabRef.current = true;
    setActiveWorkoutKey(workoutKey);
    setOpenExerciseId(null);
    setConfirmCompletion(false);
  }

  function handleToggleExercise(exerciseId: string) {
    setOpenExerciseId((current) => (current === exerciseId ? null : exerciseId));
  }

  return (
    <AppShell>
      <Card className="space-y-3 p-5 shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Treinos</p>
          </div>

          <div className="whitespace-nowrap rounded-full border border-primary/15 bg-primary/10 px-3.5 py-2 text-[13px] font-semibold leading-none text-primary">
            {sessionLabel}
          </div>
        </div>

        {!isProgram ? (() => {
          const activeLocation = (data.answers.location as string | undefined) ?? "home";
          const locationTabs = Array.isArray(data.availableLocations) && data.availableLocations.length
            ? data.availableLocations
            : [activeLocation];
          const missingLocations = SELECTABLE_LOCATIONS.filter((loc) => !locationTabs.includes(loc));
          const showAddButton = missingLocations.length > 0;
          const showTabs = locationTabs.length > 1;
          if (!showTabs && !showAddButton) return null;
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {showTabs
                  ? locationTabs.map((loc) => {
                      const isActive = loc === activeLocation;
                      return (
                        <button
                          key={loc}
                          type="button"
                          disabled={switchingLocation || Boolean(generatingLocation)}
                          onClick={() => handleSwitchLocation(loc)}
                          className={clsx(
                            "inline-flex min-h-9 items-center justify-center gap-1 rounded-full border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition disabled:opacity-60",
                            isActive
                              ? "border-primary/20 bg-primary text-white shadow-[0_16px_30px_rgba(34,197,94,0.22)]"
                              : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                          )}
                        >
                          {formatLocationLabel(loc)}
                          {/* Free não troca de local: coroa dourada = recurso Premium */}
                          {!isActive && !isPremiumUser ? (
                            <Crown className="h-3 w-3 text-premium" strokeWidth={2.5} aria-label="Premium" />
                          ) : null}
                        </button>
                      );
                    })
                  : null}
                {showAddButton ? (
                  <button
                    type="button"
                    disabled={Boolean(generatingLocation)}
                    onClick={() =>
                      isPremiumUser ? setShowLocationPicker((prev) => !prev) : setShowLocationUpsell(true)
                    }
                    className={clsx(
                      "inline-flex min-h-9 items-center justify-center gap-1 rounded-full border border-dashed px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition disabled:opacity-60",
                      isPremiumUser
                        ? "border-primary/40 bg-primary/[0.06] text-primary hover:bg-primary/10"
                        : "border-premium/50 bg-premium/[0.08] text-premium hover:bg-premium/15"
                    )}
                  >
                    {generatingLocation ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Gerando…
                      </>
                    ) : isPremiumUser ? (
                      "+ Local"
                    ) : (
                      <>
                        <Crown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> + Local
                      </>
                    )}
                  </button>
                ) : null}
              </div>

              {isPremiumUser && showLocationPicker && !generatingLocation ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs font-semibold text-white/70">Onde será o treino?</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {missingLocations.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => handleGenerateForLocation(loc)}
                        className="inline-flex min-h-9 items-center justify-center rounded-full border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary/[0.16]"
                      >
                        {formatLocationLabel(loc)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[0.7rem] leading-snug text-white/45">
                    Vamos gerar um treino novo para esse local. Depois você alterna entre os locais nas abas.
                  </p>
                </div>
              ) : null}
            </div>
          );
        })() : null}

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {data.workoutOrder.map((workoutKey) => {
            const currentWorkout = data.workouts[workoutKey];
            const active = workoutKey === activeWorkoutKey;

            return (
              <button
                key={workoutKey}
                type="button"
                onClick={() => handleWorkoutTabChange(workoutKey)}
                className={clsx(
                  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                  active
                    ? "border-primary/20 bg-primary text-white shadow-[0_16px_30px_rgba(34,197,94,0.22)]"
                    : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
                )}
              >
                {formatWorkoutDisplayTitle(currentWorkout?.title, workoutKey)}
              </button>
            );
          })}
          {!isProgram && (
            <ExtraWorkoutButton
              userId={data.user.id}
              defaultEquipment={Array.isArray(data.answers.equipment) ? data.answers.equipment as import("@/lib/types").HomeEquipment[] : []}
              defaultLocation={(data.answers.location as string | undefined) ?? "home"}
              availableLocations={data.availableLocations}
            />
          )}
        </div>
      </Card>

      <Card className="space-y-3 p-5 shadow-none sm:p-6">
        {/* Nome do treino e tempo estimado na mesma linha, alinhados ao centro. */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 flex-1 text-[22px] font-semibold leading-tight text-white">
            {formatWorkoutDisplayTitle(workout.title, workout.day)}
          </h2>
          <div className="shrink-0 text-right">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary/84">Tempo estimado</p>
            <p className="mt-0.5 text-base font-semibold text-white">{estimatedDurationLabel}</p>
          </div>
        </div>
        {formatTrainingStyleLabel(workout.trainingStyle) ||
        workout.sessionFormat?.protocol ||
        workout.sessionFormat?.description ||
        (isProgram && workout.rationale) ? (
          <div className="space-y-1">
            {formatTrainingStyleLabel(workout.trainingStyle) ? (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
                {formatTrainingStyleLabel(workout.trainingStyle)}
                {workout.sessionFormat ? ` · ${workout.sessionFormat.label}` : ""}
              </p>
            ) : null}
            {workout.sessionFormat?.protocol ? (
              <p className="text-xs text-white/55">{workout.sessionFormat.protocol}</p>
            ) : null}
            {workout.sessionFormat?.description ? (
              <p className="mt-1 text-xs leading-snug text-white/45">{workout.sessionFormat.description}</p>
            ) : null}
            {isProgram && workout.rationale ? (
              <div className="mt-2 rounded-2xl border border-primary/20 bg-primary/10 p-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Dica do treinador
                </p>
                <p className="mt-1 text-xs leading-snug text-white/75">{workout.rationale}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="space-y-3">
        {exerciseRows.map((exercise, index) => {
          // Exibe anúncio após o 4º e o 8º exercício — apenas para usuários free (máx. 2 anúncios)
          const adPosition = (index + 1) / 4;
          const showAd = showAds && (index + 1) % 4 === 0 && adPosition <= 2;

          return (
            <Fragment key={`${exercise.id}:${cardsResetToken}`}>
              <ExpandableExerciseCard
                data={data}
                workoutKey={activeWorkoutKey}
                exercise={exercise}
                index={index}
                expanded={openExerciseId === exercise.id}
                onToggle={handleToggleExercise}
                workoutId={data.workoutId}
                workoutDayId={workoutDayId}
                exerciseIndex={index}
                exerciseName={exercise.name}
                replacementLimitReached={replacementLimitReached}
                replacementCount={replacementCount}
                replacementsRemaining={replacementsRemaining}
                isPremiumUser={isPremiumUser}
                isReplaced={replacedExerciseNames.has(exercise.name)}
                onExerciseReplaced={handleExerciseReplaced}
                initialWeightKg={lastWeightsMap[normalizeExerciseName(exercise.name)] ?? null}
                onCompletionChange={handleExerciseCompletionChange}
                onProgressChange={handleExerciseProgressChange}
                onSetActivity={handleSetActivity}
              />
              {showAd ? <TrainingInlineAd /> : null}
            </Fragment>
          );
        })}

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        {isCycleComplete ? (
          isProgram ? (
            // Modo programa comprado: a navegação de semanas fica na Home.
            <div className="rounded-[24px] border border-primary/18 bg-primary/10 p-4">
              <p className="text-sm font-semibold text-white">🏁 Semana concluída!</p>
              <p className="mt-1 text-sm text-white/62">
                Você completou todas as sessões desta semana do programa.
              </p>
            </div>
          ) : subscriptionLoading ? null : (
            <CycleCompleteCard
              mode={cycleCompleteMode}
              completedSessions={sessionProgress.completedSessions}
              onOpen={() => setShowCycleCelebration(true)}
            />
          )
        ) : (
          // Antes do treino: "Iniciar treino". Durante: barra de progresso colada no menu.
          sessionForUser ? (
            <WorkoutProgressDock
              title={workoutTitleLabel}
              startedAt={sessionForUser.startedAt}
              setsDone={progressStats.setsDone}
              setsTotal={progressStats.setsTotal}
              exercisesDone={progressStats.exercisesDone}
              exercisesTotal={progressStats.exercisesTotal}
              segments={progressStats.segments}
              onFinish={requestCompletion}
            />
          ) : extraSessionActive ? null : (
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.9rem+var(--app-safe-bottom)+var(--admob-banner-h))] z-30 flex justify-center">
              <button
                type="button"
                onClick={handleStartWorkout}
                className="pointer-events-auto inline-flex h-[3.25rem] items-center gap-2.5 rounded-full bg-gradient-to-b from-primary to-primaryStrong px-7 text-[15px] font-bold text-black shadow-[0_12px_34px_rgba(34,197,94,0.45)] transition active:scale-95"
              >
                <Play className="h-4 w-4 fill-current" />
                Iniciar treino
              </button>
            </div>
          )
        )}
        {/* Espaço extra para o último exercício não ficar escondido atrás da barra/botão. */}
        {!isCycleComplete ? <div className="h-16" aria-hidden /> : null}
      </div>
      {newAchievement ? (
        <AchievementPopup
          achievement={newAchievement}
          onClose={() => setNewAchievement(null)}
        />
      ) : null}

      {/* ── Popup de conquista de fase ──────────────────────────────────── */}
      {phaseUpPopup ? (
        <LevelPopup
          emoji="🏆"
          title={phaseUpPopup.title}
          message={phaseUpPopup.phrase}
          onClose={() => setPhaseUpPopup(null)}
        />
      ) : null}

      {confirmCompletion ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-8 sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#111] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {allSetsDone ? "Treino completo! 💪" : "Finalizar treino?"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-white/62">
              {allSetsDone
                ? "Todas as séries marcadas. Mandou bem!"
                : progressStats.setsDone > 0
                  ? `Você fez ${progressStats.exercisesDone} de ${progressStats.exercisesTotal} exercícios. Treino parcial também conta na sua sequência.`
                  : "Mesmo sem marcar as séries, o treino conta na sua sequência."}
            </p>
            {sessionForUser ? (
              <StatsRow
                items={[
                  {
                    value: formatDurationMinutes(getSessionDurationSeconds(sessionForUser, "manual")),
                    label: "tempo"
                  },
                  { value: `${progressStats.setsDone}/${progressStats.setsTotal}`, label: "séries" },
                  {
                    value: `${progressStats.exercisesDone}/${progressStats.exercisesTotal}`,
                    label: "exercícios"
                  }
                ]}
              />
            ) : null}
            <hr className="my-4 border-white/10" />
            <p className="mb-3 text-sm text-white">
              Gostou do treino? Sua resposta ajuda a personalizar o próximo.
            </p>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setSessionLiked(true)}
                className={clsx(
                  "flex-1 rounded-xl border py-2 text-sm font-medium transition",
                  sessionLiked === true
                    ? "border-primary bg-primary/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/62 hover:text-white"
                )}
              >
                👍 Curti
              </button>
              <button
                type="button"
                onClick={() => setSessionLiked(false)}
                className={clsx(
                  "flex-1 rounded-xl border py-2 text-sm font-medium transition",
                  sessionLiked === false
                    ? "border-primary bg-primary/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/62 hover:text-white"
                )}
              >
                👎 Não muito
              </button>
            </div>
            <p className="mb-2 text-xs text-white/62">
              Qual foi a intensidade desse treino para você?
            </p>
            <div className="mb-3 flex gap-1.5">
              {[
                { level: 1, emoji: "😴", label: "muito fácil" },
                { level: 2, emoji: "😊", label: "fácil" },
                { level: 3, emoji: "😄", label: "ótimo" },
                { level: 4, emoji: "😤", label: "difícil" },
                { level: 5, emoji: "😵", label: "muito difícil" },
              ].map(({ level, emoji, label }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSessionIntensity(level)}
                  className={clsx(
                    "flex flex-col items-center gap-0.5 flex-1 rounded-xl border py-2 text-base transition",
                    sessionIntensity === level
                      ? "border-primary bg-primary/15"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-[9px] font-medium leading-none text-white/50">{label}</span>
                </button>
              ))}
            </div>
            <hr className="mb-4 border-white/10" />
            <p className="text-sm text-white/62">
              Confirmar que você concluiu {formatWorkoutDisplayTitle(workout.title, activeWorkoutKey)} agora?
            </p>
            <div className="mt-5 flex flex-col gap-3 min-[380px]:flex-row">
              <Button variant="secondary" onClick={() => setConfirmCompletion(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={() => void handleCompleteWorkout()} disabled={completingWorkout} className="flex-1">
                <span className="inline-flex items-center gap-2">
                  {completingWorkout ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {completingWorkout ? "Salvando..." : "Confirmar"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showCompletionPopup ? (
        <WorkoutCompletionPopup
          onClose={() => setShowCompletionPopup(false)}
          showAd={showAds}
          summary={completionSummary}
          premiumNudgeWorkouts={premiumNudgeWorkouts}
        />
      ) : null}

      {showAlreadyTrainedPopup ? (
        <AlreadyTrainedTodayPopup
          // 1 treino por dia vale também para o extra (o banco recusa um 2º registro no dia),
          // então o popup não oferece mais o Treino Extra como alternativa.
          showExtraOption={false}
          onClose={() => setShowAlreadyTrainedPopup(false)}
        />
      ) : null}

      {showCycleCelebration ? (
        <CycleCompleteCelebration
          userId={data.user.id}
          locations={data.availableLocations}
          activeLocation={(data.answers.location as string | undefined) ?? null}
          isPremium={isPremiumUser}
          freeRenewalAvailable={data.freeCycleRenewalAvailable}
          completedSessions={sessionProgress.completedSessions}
          weeks={data.plan.blockDurationWeeks}
          source="training_auto"
          onClose={() => setShowCycleCelebration(false)}
          onRenewed={reloadWorkout}
        />
      ) : null}

      {showLocationUpsell ? (
        <UpsellModal reason="unlock_location" onClose={() => setShowLocationUpsell(false)} />
      ) : null}
    </AppShell>
  );
}

function collectExerciseWeights(
  userId: string,
  workoutKey: string,
  exercises: ReturnType<typeof import("@/lib/app-workout").buildTrainingExerciseRows>
) {
  if (typeof window === "undefined") return [];

  return exercises.flatMap((exercise) => {
    const key = `hdt-exercise-draft:${userId}:${workoutKey}:${exercise.id}`;
    const raw = readExerciseDraftRaw(key);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as {
        setEntries?: { weightKg?: string; reps?: string; completed?: boolean }[];
      };
      const sets = Array.isArray(parsed.setEntries) ? parsed.setEntries : [];
      if (!sets.length) return [];

      return [{
        exerciseName: exercise.name,
        sets: sets.map((s, i) => ({
          setNumber: i + 1,
          weightKg: s.weightKg ?? "",
          reps: s.reps ?? "",
          completed: s.completed ?? false,
        })),
      }];
    } catch {
      return [];
    }
  });
}
// Verifica se a última sessão concluída aconteceu "hoje" no fuso de São Paulo,
// o mesmo usado pelo back-end para o limite diário. Evita erro na virada do dia.
function isCompletedTodaySaoPaulo(lastCompletedAt: string | null): boolean {
  if (!lastCompletedAt) return false;
  const last = new Date(lastCompletedAt);
  if (Number.isNaN(last.getTime())) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date()) === formatter.format(last);
}

// O programa conta 1 treino por dia (em qualquer local). Quem quiser treinar de
// novo no mesmo dia faz um Treino Extra, que não entra na sequência do programa.
function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  return (
    <div
      className={clsx(
        "rounded-[22px] border px-4 py-3 text-sm",
        feedback.tone === "success"
          ? "border-primary/20 bg-primary/10 text-white"
          : feedback.tone === "info"
            ? "border-white/10 bg-white/[0.04] text-white/72"
            : "border-red-400/25 bg-red-500/10 text-red-100"
      )}
    >
      {feedback.text}
    </div>
  );
}

// Encerra o "treino em andamento" só se for do programa (nunca apaga um Treino Extra aberto).
function clearRegularActiveWorkout() {
  if (readActiveWorkout()?.workoutType === "extra") return;
  clearActiveWorkout();
}
