"use client";

import clsx from "clsx";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { TrainingInlineAd } from "@/components/TrainingInlineAd";
import { AppShell } from "@/components/app-shell";
import { AchievementPopup } from "@/components/achievement-popup";
import { LevelPopup } from "@/components/level-badge";
import { ExpandableExerciseCard } from "@/components/expandable-exercise-card";
import { Badge, Button, Card } from "@/components/ui";
import { UpsellModal } from "@/components/upsell-modal";
import { WorkoutCompletionPopup } from "@/components/workout-completion-popup";
import { useSubscription } from "@/components/use-subscription";
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
import { getNewlyUnlockedAchievement, getNewlyUnlockedWeightAchievement, type Achievement } from "@/lib/achievements";
import type { WorkoutSessionProgress } from "@/lib/workout-sessions";
import { ExtraWorkoutButton } from "@/components/ExtraWorkoutButton";
import { normalizeExerciseName } from "@/lib/exercise-weight-store";

const TRAINING_STYLE_LABELS: Record<string, string> = {
  musculacao: "Tradicional",
  funcional: "Funcional",
  hiit: "HIIT",
  calistenia: "Calistenia"
};

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
const ALREADY_COMPLETED_TODAY_MESSAGE = "Você já treinou hoje. Agora é descansar e voltar amanhã.";

export function TrainingScreen({ data, reloadWorkout, applyWorkoutUpdate }: {
  data: AppWorkoutData;
  reloadWorkout: () => Promise<void>;
  applyWorkoutUpdate: (workout: import("@/lib/types").WorkoutPlan) => void;
}) {
  const [activeWorkoutKey, setActiveWorkoutKey] = useState(data.featuredWorkoutKey ?? data.workoutOrder[0] ?? "");
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [sessionProgress, setSessionProgress] = useState(data.sessionProgress);
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState(false);
  const [sessionLiked, setSessionLiked] = useState<boolean | null>(null);
  const [sessionIntensity, setSessionIntensity] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [replacementCount, setReplacementCount] = useState(data.replacementCount);
  // Mapa de nome normalizado → último peso registrado, carregado em batch ao abrir a tela
  const [lastWeightsMap, setLastWeightsMap] = useState<Record<string, number>>({});
  // Contador de substituições por sessão (Treino A, B, C...) — usado para o limite do premium
  const [replacementsPerWorkoutKey, setReplacementsPerWorkoutKey] = useState<Record<string, number>>({});
  const [replacedExerciseNames, setReplacedExerciseNames] = useState<Set<string>>(new Set());
  const [totalWorkoutsAllTime, setTotalWorkoutsAllTime] = useState(data.totalWorkoutsAllTime);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [phaseUpPopup, setPhaseUpPopup] = useState<{ title: string; phrase: string } | null>(null);
  const [showProgramUpsell, setShowProgramUpsell] = useState(false);
  const [showProgramContinuation, setShowProgramContinuation] = useState(false);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  // Conjunto de exercícios com TODAS as séries concluídas (reportado por cada card)
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());
  // Garante que o popup automático abra apenas uma vez por sessão de treino
  const [autoPrompted, setAutoPrompted] = useState(false);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const featuredWorkoutKey = useMemo(
    () => getFeaturedWorkoutKey(data.workoutOrder, sessionProgress.lastCompletedWorkoutKey),
    [data.workoutOrder, sessionProgress.lastCompletedWorkoutKey]
  );

  useEffect(() => {
    setSessionProgress(data.sessionProgress);
  }, [data.sessionProgress]);

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
      setConfirmCompletion(true);
    }
  }, [autoPrompted, completedExerciseIds, exerciseRows]);

  const sessionLabel = formatSessionCounter(sessionProgress);
  const isCycleComplete = sessionProgress.cycleCompleted;
  const estimatedDurationLabel = formatDurationLabel(workout?.estimatedDurationMinutes, workout?.durationRange ?? null);
  const workoutDayId = String(data.workoutOrder.indexOf(activeWorkoutKey));
  const isPremiumUser = subscription?.isPremium ?? false;
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

  async function handleCompleteWorkout() {
    setCompletingWorkout(true);
    setFeedback(null);

    try {
      const exerciseWeights = collectExerciseWeights(data.user.id, activeWorkoutKey, exerciseRows);

      const response = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workoutKey: activeWorkoutKey,
          exerciseWeights,
          liked: sessionLiked,
          intensityLevel: sessionIntensity
        })
      });

      const result = await parseJsonResponse<CompletionResponse>(response);

      if (result.already_completed_today) {
        if (result.data?.sessionProgress) {
          setSessionProgress(result.data.sessionProgress);
        }

        setConfirmCompletion(false);
        setFeedback({
          tone: "info",
          text: result.message ?? result.error ?? ALREADY_COMPLETED_TODAY_MESSAGE
        });
        return;
      }

      if (!response.ok || !result.success || !result.data || !result.data.completion) {
        throw new Error(result.message ?? result.error ?? COMPLETE_WORKOUT_ERROR_MESSAGE);
      }

      setSessionProgress(result.data.sessionProgress);
      const nextWorkoutKey =
        result.data.nextWorkoutKey ??
        getFeaturedWorkoutKey(data.workoutOrder, result.data.sessionProgress.lastCompletedWorkoutKey);
      const nextWorkoutLabel = formatWorkoutDisplayTitle(data.workouts[nextWorkoutKey ?? ""]?.title, nextWorkoutKey);

      if (nextWorkoutKey) {
        setActiveWorkoutKey(nextWorkoutKey);
      }

      setConfirmCompletion(false);
      setShowCompletionPopup(true);
      setFeedback({
        tone: "success",
        text: `Próximo em destaque: ${nextWorkoutLabel}.`
      });

      const prev = result.data.prevTotalWorkouts ?? totalWorkoutsAllTime;
      const next = result.data.newTotalWorkouts ?? totalWorkoutsAllTime + 1;
      setTotalWorkoutsAllTime(next);
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

      // Exibe upsell se o programa foi concluído e o usuário é free
      if (result.data.program_completed && result.data.user_plan === "free") {
        setShowProgramUpsell(true);
      }

      if (result.data.program_completed && result.data.user_plan === "premium") {
        setShowProgramContinuation(true);
        setTimeout(() => {
          void reloadWorkout().finally(() => setShowProgramContinuation(false));
        }, 1500);
      }
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
          <ExtraWorkoutButton
            userId={data.user.id}
            defaultEquipment={Array.isArray(data.answers.equipment) ? data.answers.equipment as import("@/lib/types").HomeEquipment[] : []}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-5 shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Sessao selecionada</p>
            <h2 className="text-[22px] font-semibold leading-tight text-white">
              {formatWorkoutDisplayTitle(workout.title, workout.day)}
            </h2>
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
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary/84">Tempo estimado</p>
            <p className="mt-1 text-sm font-semibold text-white">{estimatedDurationLabel}</p>
          </div>
        </div>

      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Exercicios</p>
          </div>

          <Badge className="border-white/10 bg-white/[0.04] text-white/58">{exerciseRows.length} itens</Badge>
        </div>

        {exerciseRows.map((exercise, index) => {
          // Exibe anúncio após o 4º e o 8º exercício — apenas para usuários free (máx. 2 anúncios)
          const adPosition = (index + 1) / 4;
          const showAd = showAds && (index + 1) % 4 === 0 && adPosition <= 2;

          return (
            <Fragment key={exercise.id}>
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
              />
              {showAd ? <TrainingInlineAd /> : null}
            </Fragment>
          );
        })}

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        {isCycleComplete ? (
          isPremiumUser ? (
            <div className="rounded-[24px] border border-primary/18 bg-primary/10 p-4">
              <p className="text-sm font-semibold text-white">🏁 Ciclo concluído!</p>
              <p className="mt-1 text-sm text-white/62">
                Você completou todas as sessões do ciclo atual. Quando renovar o programa, os treinos serão atualizados e o ciclo recomeça.
              </p>
            </div>
          ) : (
            <div className="rounded-[24px] border border-primary/30 bg-primary/10 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary shrink-0" />
                <p className="text-sm font-bold text-white">Ciclo concluído!</p>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Você completou todas as sessões. Que tal um programa que evolui junto com você — gerado pela IA, adaptado ao seu ritmo?
              </p>
              <Link
                href="/premium"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-4 py-3 text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.99]"
              >
                <Sparkles size={14} />
                Conheça o Premium
              </Link>
            </div>
          )
        ) : (
          // Botão "domo" (semicírculo) fixo, centralizado, saindo de trás do menu inferior.
          // z-30 fica ABAIXO do menu (z-40), então a base reta some atrás da barra de navegação,
          // criando o efeito de estar emergindo do menu. Sempre visível, mesmo ao rolar a tela.
          <button
            type="button"
            onClick={() => setConfirmCompletion(true)}
            aria-label="Finalizar treino"
            className="fixed bottom-[calc(4.9rem+var(--app-safe-bottom))] left-1/2 z-30 flex h-[3rem] w-[6.25rem] -translate-x-1/2 items-center justify-center rounded-t-full bg-gradient-to-b from-primary to-primaryStrong text-[12px] font-bold uppercase tracking-wider text-black shadow-[0_-6px_22px_rgba(34,197,94,0.5)] transition active:scale-95"
          >
            <span className="-translate-y-0.5">Finalizar</span>
          </button>
        )}
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
        />
      ) : null}

      {showProgramUpsell ? (
        <UpsellModal reason="program_completed" onClose={() => setShowProgramUpsell(false)} />
      ) : null}

      {showProgramContinuation ? (
        <PremiumContinuationCard sessionCount={sessionProgress.completedSessions} />
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
    const raw = window.sessionStorage.getItem(key);
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
function PremiumContinuationCard({ sessionCount }: { sessionCount: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
      <div className="w-full max-w-sm rounded-[24px] border border-primary/20 bg-[#111] p-6 text-center shadow-2xl">
        <p className="text-3xl">🎉</p>
        <p className="mt-3 text-lg font-bold text-white">Programa concluído!</p>
        <p className="mt-3 text-lg font-bold text-white">Programa concluído!</p>
        <p className="mt-1 text-sm text-white/60">{sessionCount} sessões realizadas</p>
        <p className="mt-4 text-sm leading-relaxed text-white/72">
          Estamos gerando seu próximo plano personalizado com base na sua evolução...
        </p>
        <div className="mt-5 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    </div>
  );
}

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

