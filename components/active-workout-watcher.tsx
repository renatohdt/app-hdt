"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics-client";
import {
  AUTO_FINISHED_EVENT,
  OPEN_EXTRA_WORKOUT_EVENT,
  REQUEST_FINISH_EVENT,
  buildTimingPayload,
  clearActiveWorkout,
  clearExerciseDrafts,
  collectWeightsFromDrafts,
  formatDurationMinutes,
  formatElapsedClock,
  getSessionDurationSeconds,
  isAutoFinishDue,
  isIdlePromptDue,
  markTrainedToday,
  readActiveWorkout,
  subscribeActiveWorkout,
  writeActiveWorkout,
  type ActiveWorkoutSession,
  type WorkoutEndReason
} from "@/lib/active-workout-session";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { WorkoutCompletionPopup } from "@/components/workout-completion-popup";
import { cancelIdleWorkoutNotification, scheduleIdleWorkoutNotification } from "@/lib/workout-idle-notification";

// Vigia o "treino em andamento" em QUALQUER tela do app:
// - Pílula "Treino em andamento" nas outras abas (volta para o treino).
// - 15 min sem atividade: pergunta "Ainda está treinando?".
// - 50 min sem atividade: avisa que o treino foi fechado automaticamente,
//   pede o "Como foi?" e registra no momento da última atividade.

type Sheet = "idle" | "auto" | null;

type CompleteResponse = {
  success?: boolean;
  already_completed_today?: boolean;
  message?: string;
  error?: string;
};

const INTENSITY_OPTIONS = [
  { level: 1, emoji: "😴", label: "muito fácil" },
  { level: 2, emoji: "😊", label: "fácil" },
  { level: 3, emoji: "😄", label: "ótimo" },
  { level: 4, emoji: "😤", label: "difícil" },
  { level: 5, emoji: "😵", label: "muito difícil" }
] as const;

export function ActiveWorkoutWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);

  const isTrainingPage = pathname === "/treino";

  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setUserId(data.session?.user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Lê o treino ativo e decide se alguma pergunta/aviso deve aparecer.
  const evaluate = useCallback(() => {
    const current = readActiveWorkout();
    setSession(current);
    const t = Date.now();
    setNow(t);
    if (!current) {
      // Treino encerrado (finalizado, fechado ou descartado): cancela o lembrete do celular.
      void cancelIdleWorkoutNotification();
      setSheet((prev) => (prev === "auto" ? prev : null));
      return;
    }
    if (userId && current.userId !== userId) return;
    if (isAutoFinishDue(current, t)) {
      setSheet("auto");
    } else if (isIdlePromptDue(current, t)) {
      setSheet((prev) => prev ?? "idle");
    }
  }, [userId]);

  useEffect(() => {
    evaluate();
    const unsubscribe = subscribeActiveWorkout(evaluate);
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", evaluate);
    const timer = window.setInterval(evaluate, 15000);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", evaluate);
      window.clearInterval(timer);
    };
  }, [evaluate]);

  // Relógio da pílula (só roda quando ela aparece).
  const belongsToUser = Boolean(session && (!userId || session.userId === userId));
  // Treino do programa: a própria tela de treino mostra a barra. Treino Extra: a pílula
  // aparece também em /treino (o extra abre numa tela própria, por cima).
  const isExtraSession = session?.workoutType === "extra";
  const showPill = Boolean(
    session && belongsToUser && (!isTrainingPage || isExtraSession) && !sheet && !celebration
  );
  useEffect(() => {
    if (!showPill) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showPill]);

  function handleKeepTraining() {
    const current = readActiveWorkout();
    if (current) {
      const touchedAt = Date.now();
      writeActiveWorkout({ ...current, lastActivityAt: touchedAt });
      void scheduleIdleWorkoutNotification({ lastActivityAt: touchedAt, workoutTitle: current.workoutTitle });
    }
    setSheet(null);
    trackEvent("cta_click", current?.userId ?? userId ?? "", { source: "workout_idle_keep_training" });
  }

  function handleAlreadyFinished() {
    const current = readActiveWorkout();
    // Treino Extra: registra direto (o extra não tem tela de confirmação).
    if (current?.workoutType === "extra") {
      void completeSession("manual", false);
      return;
    }
    // Conta como atividade: se a pessoa desistir de finalizar, a pergunta não volta na hora.
    if (current) writeActiveWorkout({ ...current, lastActivityAt: Date.now() });
    setSheet(null);
    if (isTrainingPage) {
      window.dispatchEvent(new Event(REQUEST_FINISH_EVENT));
    } else {
      router.push("/treino?finalizar=1");
    }
  }

  function openActiveWorkout() {
    if (session?.workoutType === "extra") {
      if (isTrainingPage) window.dispatchEvent(new Event(OPEN_EXTRA_WORKOUT_EVENT));
      else router.push("/treino?extra=1");
      return;
    }
    router.push("/treino");
  }

  async function handleSaveAutoFinished(withFeedback: boolean) {
    await completeSession("auto_idle", withFeedback);
  }

  async function completeSession(endReason: WorkoutEndReason, withFeedback: boolean) {
    const current = readActiveWorkout();
    if (!current) {
      setSheet(null);
      return;
    }
    setSaving(true);
    setErrorText(null);
    try {
      const response = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutKey: current.workoutKey,
          ...(current.workoutType === "extra" ? { workoutType: "extra", workoutId: current.workoutId } : {}),
          exerciseWeights: collectWeightsFromDrafts(current.userId, current.workoutKey, current.exercises),
          liked: withFeedback ? liked : null,
          intensityLevel: withFeedback ? intensity : null,
          timing: buildTimingPayload(current, endReason)
        })
      });
      const result = await parseJsonResponse<CompleteResponse>(response);

      if (result.already_completed_today) {
        clearExerciseDrafts(current.userId, current.workoutKey);
        clearActiveWorkout();
        setInfoText("Você já tinha um treino registrado nesse dia, então esse não contou de novo.");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? result.error ?? "save_failed");
      }

      const seconds = getSessionDurationSeconds(current, endReason);
      const summary = [
        formatDurationMinutes(seconds, current.estimatedLabel),
        `${current.setsDone} séries`,
        `${current.exercisesDone}/${current.exercisesTotal} exercícios`
      ].join(" · ");

      clearExerciseDrafts(current.userId, current.workoutKey);
      clearActiveWorkout();
      invalidateWorkoutCache();
      markTrainedToday(current.userId, endReason === "auto_idle" ? current.lastActivityAt : Date.now());
      window.dispatchEvent(new CustomEvent(AUTO_FINISHED_EVENT, { detail: { workoutType: current.workoutType } }));
      trackEvent("cta_click", current.userId, {
        source: endReason === "auto_idle" ? "workout_auto_finished" : "workout_finished_from_idle_prompt",
        workout_type: current.workoutType,
        workout_key: current.workoutKey,
        sets_done: current.setsDone,
        sets_total: current.setsTotal,
        with_feedback: withFeedback && liked !== null && intensity !== null
      });
      setSheet(null);
      setLiked(null);
      setIntensity(null);
      setCelebration(summary);
    } catch {
      setErrorText("Não conseguimos registrar agora. Verifique a internet e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (celebration) {
    return <WorkoutCompletionPopup summary={celebration} onClose={() => setCelebration(null)} />;
  }

  if (!session || !belongsToUser) {
    if (infoText) {
      return (
        <BottomSheet>
          <h3 className="text-xl font-bold text-white">Tudo certo</h3>
          <p className="mt-2 text-sm leading-6 text-white/62">{infoText}</p>
          <button
            type="button"
            onClick={() => {
              setInfoText(null);
              setSheet(null);
            }}
            className="mt-6 h-12 w-full rounded-2xl bg-primary text-[15px] font-bold text-black"
          >
            Ok
          </button>
        </BottomSheet>
      );
    }
    return null;
  }

  if (sheet === "auto") {
    const seconds = getSessionDurationSeconds(session, "auto_idle");
    const endedAt = new Date(session.lastActivityAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return (
      <BottomSheet>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finalizado automaticamente</p>
        <h3 className="mt-2 text-xl font-bold text-white">Fechamos seu treino por você</h3>
        <p className="mt-2 text-sm leading-6 text-white/62">
          Ficou um tempão sem atividade, então encerramos o {session.workoutTitle} às {endedAt}. Ele conta na sua sequência.
        </p>
        <StatsRow
          items={[
            { value: formatDurationMinutes(seconds, session.estimatedLabel), label: "tempo" },
            { value: `${session.setsDone}/${session.setsTotal}`, label: "séries" },
            { value: `${session.exercisesDone}/${session.exercisesTotal}`, label: "exercícios" }
          ]}
        />
        <FeedbackFields liked={liked} intensity={intensity} onLiked={setLiked} onIntensity={setIntensity} />
        {errorText ? <p className="mt-3 text-sm text-red-300">{errorText}</p> : null}
        <button
          type="button"
          onClick={() => void handleSaveAutoFinished(true)}
          disabled={saving}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-black disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Salvando..." : "Ok, salvar"}
        </button>
        <button
          type="button"
          onClick={() => void handleSaveAutoFinished(false)}
          disabled={saving}
          className="mt-2 h-11 w-full rounded-2xl text-sm font-semibold text-white/55"
        >
          Pular avaliação
        </button>
      </BottomSheet>
    );
  }

  if (sheet === "idle") {
    return (
      <BottomSheet>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Treino em andamento</p>
        <h3 className="mt-2 text-xl font-bold text-white">Ainda está treinando?</h3>
        <p className="mt-2 text-sm leading-6 text-white/62">
          Faz um tempinho que você não marca nenhuma série. Se já terminou, finalize para o treino contar.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleKeepTraining}
            className="h-12 rounded-2xl bg-primary text-[15px] font-bold text-black"
          >
            Sim, continuar treinando
          </button>
          <button
            type="button"
            onClick={handleAlreadyFinished}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Registrando..." : "Já terminei"}
          </button>
        </div>
        {errorText ? <p className="mt-3 text-sm text-red-300">{errorText}</p> : null}
      </BottomSheet>
    );
  }

  if (showPill) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.9rem+var(--app-safe-bottom))] z-30 flex justify-center px-4">
        <button
          type="button"
          onClick={openActiveWorkout}
          className="pointer-events-auto flex h-11 items-center gap-2.5 rounded-full border border-primary/35 bg-[#0c110c]/95 pl-4 pr-1.5 text-[13px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {isExtraSession ? "Treino Extra em andamento" : "Treino em andamento"}
          <span className="tabular-nums text-white/50">
            {formatElapsedClock(now - session.startedAt)} · {session.exercisesDone}/{session.exercisesTotal}
          </span>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-black">
            <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </div>
    );
  }

  return null;
}

function BottomSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 sm:items-center">
      <div className="w-full max-w-[var(--app-shell-max)] rounded-t-[28px] border border-white/10 bg-[#111411] px-5 pb-[calc(1.75rem+var(--app-safe-bottom))] pt-6 shadow-2xl sm:rounded-[28px] sm:pb-6">
        {children}
      </div>
    </div>
  );
}

export function StatsRow({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-white/[0.04] px-1.5 py-3 text-center">
          <p className="text-lg font-bold tabular-nums text-white">{item.value}</p>
          <p className="mt-0.5 text-[11px] text-white/50">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function FeedbackFields({
  liked,
  intensity,
  onLiked,
  onIntensity
}: {
  liked: boolean | null;
  intensity: number | null;
  onLiked: (value: boolean) => void;
  onIntensity: (value: number) => void;
}) {
  return (
    <>
      <p className="mb-2 mt-5 text-sm text-white">Como foi? Sua resposta ajuda a personalizar o próximo.</p>
      <div className="mb-3 flex gap-2">
        {[
          { value: true, label: "👍 Curti" },
          { value: false, label: "👎 Não muito" }
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onLiked(option.value)}
            className={clsx(
              "flex-1 rounded-xl border py-2 text-sm font-medium transition",
              liked === option.value
                ? "border-primary bg-primary/15 text-white"
                : "border-white/10 bg-white/[0.04] text-white/62"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {INTENSITY_OPTIONS.map(({ level, emoji, label }) => (
          <button
            key={level}
            type="button"
            onClick={() => onIntensity(level)}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 text-base transition",
              intensity === level ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.04]"
            )}
          >
            <span>{emoji}</span>
            <span className="text-[9px] font-medium leading-none text-white/50">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
