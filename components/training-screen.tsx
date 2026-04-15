"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { AppShell } from "@/components/app-shell";
import { ExpandableExerciseCard } from "@/components/expandable-exercise-card";
import { Badge, Button, Card } from "@/components/ui";
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
import type { WorkoutSessionProgress } from "@/lib/workout-sessions";

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
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [replacementCount, setReplacementCount] = useState(data.replacementCount);
  const [replacedExerciseNames, setReplacedExerciseNames] = useState<Set<string>>(new Set());
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

  const workout = data.workouts[activeWorkoutKey] ?? data.workouts[data.workoutOrder[0] ?? ""];
  const exerciseRows = useMemo(() => buildTrainingExerciseRows(workout), [workout]);
  const sessionLabel = formatSessionCounter(sessionProgress);
  const isCycleComplete = sessionProgress.cycleCompleted;
  const estimatedDurationLabel = formatDurationLabel(workout?.estimatedDurationMinutes, workout?.durationRange ?? null);
  const workoutDayId = String(data.workoutOrder.indexOf(activeWorkoutKey));
  const replacementLimitReached = replacementCount >= 2;

  async function handleExerciseReplaced(newExerciseName: string, updatedWorkout?: import("@/lib/types").WorkoutPlan) {
    setReplacementCount((prev) => prev + 1);
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
      const response = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workoutKey: activeWorkoutKey
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
      setFeedback({
        tone: "success",
        text: `${formatWorkoutDisplayTitle(workout.title, activeWorkoutKey)} contou +1 sessão no plano. Próximo em destaque: ${nextWorkoutLabel}.`
      });

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
        </div>
      </Card>

      <Card className="space-y-3 p-5 shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Sessao selecionada</p>
            <h2 className="text-[22px] font-semibold leading-tight text-white">
              {formatWorkoutDisplayTitle(workout.title, workout.day)}
            </h2>
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
          const shouldRenderAd = (index + 1) % 3 === 0 && index < exerciseRows.length - 1;

          return (
            <div key={exercise.id} className="space-y-3">
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
                isReplaced={replacedExerciseNames.has(exercise.name)}
                onExerciseReplaced={handleExerciseReplaced}
              />

              {shouldRenderAd ? <GoogleAd /> : null}
            </div>
          );
        })}

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        {isCycleComplete ? (
          <div className="rounded-[24px] border border-primary/18 bg-primary/10 p-4">
            <p className="text-sm font-semibold text-white">Ciclo concluído</p>
            <p className="mt-1 text-sm text-white/62">
              Você já registrou todas as sessões do plano atual. Quando renovar, todos os treinos do plano serão trocados juntos.
            </p>
          </div>
        ) : confirmCompletion ? (
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Confirmar conclusão</p>
            <p className="mt-1 text-sm text-white/62">
              Confirmar que você concluiu {formatWorkoutDisplayTitle(workout.title, activeWorkoutKey)} agora?
            </p>
            <div className="mt-4 flex flex-col gap-3 min-[380px]:flex-row">
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
        ) : (
          <Button onClick={() => setConfirmCompletion(true)} className="min-h-14 w-full text-base">
            Marcar treino como feito
          </Button>
        )}
      </div>
    </AppShell>
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
