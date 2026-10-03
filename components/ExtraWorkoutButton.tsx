"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Zap, X, ChevronRight, Clock, CheckCircle2, Loader2, Play } from "lucide-react";
import { clsx } from "clsx";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { buildTrainingExerciseRows } from "@/lib/app-workout";
import type { AppWorkoutData } from "@/lib/app-workout";
import { ExpandableExerciseCard } from "@/components/expandable-exercise-card";
import type { HomeEquipment, WorkoutPlan } from "@/lib/types";
import { WorkoutProgressDock } from "@/components/workout-progress-dock";
import { WorkoutCompletionPopup } from "@/components/workout-completion-popup";
import { FeedbackFields, StatsRow } from "@/components/active-workout-watcher";
import { AlreadyTrainedTodayPopup } from "@/components/already-trained-today-popup";
import { scheduleIdleWorkoutNotification } from "@/lib/workout-idle-notification";
import {
  AUTO_FINISHED_EVENT,
  buildTimingPayload,
  clearActiveWorkout,
  clearExerciseDrafts,
  collectWeightsFromDrafts,
  formatDurationMinutes,
  getSessionDurationSeconds,
  hasTrainedTodayLocally,
  isAutoFinishDue,
  markTrainedToday,
  readActiveWorkout,
  subscribeActiveWorkout,
  writeActiveWorkout,
  type ActiveWorkoutSession
} from "@/lib/active-workout-session";

const EXTRA_WORKOUT_KEY = "extra_A";

type ExtraStatus = {
  isPremium: boolean;
  hasExtraWorkout: boolean;
  workoutId: string | null;
  workout: WorkoutPlan | null;
  expiresAt: string | null;
  usedThisMonth: number;
  monthlyLimit: number;
  /** Já existe treino (programa ou extra) registrado hoje — 1 por dia. */
  trainedToday?: boolean;
};

type ModalState =
  | "closed"
  | "upsell"
  | "intro"
  | "questionnaire"
  | "generating"
  | "view";

const EQUIPMENT_OPTIONS: { value: HomeEquipment; label: string }[] = [
  { value: "halteres", label: "HALTERES" },
  { value: "elasticos", label: "ELÁSTICOS" },
  { value: "fitball", label: "FITBALL" },
  { value: "fita_suspensa", label: "FITA SUSPENSA" },
  { value: "caneleira", label: "CANELEIRA" },
  { value: "kettlebell", label: "KETTLEBELL" },
  { value: "rolo_abdominal", label: "ROLO ABDOMINAL" },
  { value: "barra_fixa", label: "BARRA FIXA" },
  { value: "nenhum", label: "NENHUM" }
];

const FOCUS_OPTIONS = [
  "Peitoral", "Costas", "Ombros", "Bíceps",
  "Tríceps", "Core", "Glúteos", "Pernas", "Sem preferência"
];

const STYLE_OPTIONS = [
  { value: "personal", label: "Personal Escolhe" },
  { value: "musculacao", label: "Tradicional" },
  { value: "funcional", label: "Funcional" },
  { value: "hiit", label: "HIIT" },
  { value: "calistenia", label: "Calistenia" }
];

const TIME_OPTIONS: (20 | 30 | 45 | 60)[] = [20, 30, 45, 60];

const LOADING_MESSAGES = [
  "Analisando seu perfil...",
  "Selecionando exercícios ideais...",
  "Montando a sequência de treino...",
  "Ajustando duração e intensidade...",
  "Finalizando seu treino personalizado..."
];

const EXTRA_LOCATION_LABELS: Record<string, string> = {
  home: "Casa",
  condo_gym: "Condomínio",
  gym: "Academia"
};

export function ExtraWorkoutButton({ userId, defaultEquipment, defaultLocation, availableLocations }: {
  userId: string;
  defaultEquipment?: HomeEquipment[];
  defaultLocation?: string;
  availableLocations?: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ExtraStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [selectedMinutes, setSelectedMinutes] = useState<20 | 30 | 45 | 60>(45);
  const [selectedEquipment, setSelectedEquipment] = useState<HomeEquipment[]>(defaultEquipment ?? []);
  const [selectedFocus, setSelectedFocus] = useState("Sem preferência");
  const [selectedStyle, setSelectedStyle] = useState("personal");
  // Locais que o usuário pode escolher para o Treino Extra (os que têm programa).
  const locationOptions = Array.isArray(availableLocations) && availableLocations.length
    ? Array.from(new Set(availableLocations))
    : [defaultLocation ?? "home"];
  const [selectedLocation, setSelectedLocation] = useState<string>(
    defaultLocation && locationOptions.includes(defaultLocation) ? defaultLocation : locationOptions[0]
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [mounted, setMounted] = useState(false);
  // Comemoração com as frases engraçadas após concluir (com resumo opcional).
  const [celebration, setCelebration] = useState<{ summary: string | null } | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showAlreadyTrained, setShowAlreadyTrained] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const res = await fetchWithAuth("/api/workout/extra");
      const json = await parseJsonResponse<{ data?: ExtraStatus }>(res);
      if (json?.data) setStatus(json.data);
    } catch {
      // silently fail — button just won't appear
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchStatus();
  }, [fetchStatus]);

  // Countdown timer para treino extra ativo
  useEffect(() => {
    if (!status?.expiresAt) {
      setCountdown("");
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const update = () => {
      const diff = new Date(status.expiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("Expirado");
        setStatus((prev) => prev ? { ...prev, hasExtraWorkout: false, workout: null, expiresAt: null } : prev);
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setCountdown(h > 0 ? `${h}h ${m}min` : `${m}min`);
    };

    update();
    countdownRef.current = setInterval(update, 30_000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [status?.expiresAt]);

  // Loading messages rotation during generation
  useEffect(() => {
    if (!generating) return;
    setLoadingMsgIndex(0);
    const interval = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [generating]);

  const handleButtonClick = () => {
    if (!status) return;
    trackEvent("extra_workout_button_click", userId, {
      is_premium: status.isPremium,
      has_active: status.hasExtraWorkout
    });

    if (!status.isPremium) {
      setModalState("upsell");
      return;
    }
    // 1 treino por dia (programa ou extra): avisa ANTES de gerar ou iniciar o extra.
    // Exceção: um extra que já está em andamento pode ser reaberto normalmente.
    const saved = readActiveWorkout();
    const extraInProgress = Boolean(
      saved && saved.userId === userId && saved.workoutType === "extra" && !isAutoFinishDue(saved)
    );
    if (!extraInProgress && (status.trainedToday || hasTrainedTodayLocally(userId))) {
      setShowAlreadyTrained(true);
      trackEvent("cta_click", userId, { source: "extra_blocked_already_trained" });
      return;
    }
    if (status.hasExtraWorkout) {
      setModalState("view");
      return;
    }
    setModalState("intro");
  };

  // Outras telas podem abrir o Treino Extra (ex.: popup "Você já treinou hoje").
  useEffect(() => {
    const open = () => handleButtonClick();
    window.addEventListener("hdt-open-extra-workout", open);
    // Vindo da pílula "Treino Extra em andamento" de outra aba (/treino?extra=1).
    if (status && new URLSearchParams(window.location.search).get("extra") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      open();
    }
    return () => window.removeEventListener("hdt-open-extra-workout", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Treino Extra fechado automaticamente (ou finalizado pela pergunta dos 15 min) pelo vigia global.
  useEffect(() => {
    const onAutoFinished = (event: Event) => {
      const detail = (event as CustomEvent<{ workoutType?: string }>).detail;
      if (detail?.workoutType !== "extra") return;
      setModalState((prev) => (prev === "view" ? "closed" : prev));
      // Mesmo comportamento do "Finalizar": o extra concluído sai da tela.
      setStatus((prev) => (prev ? { ...prev, hasExtraWorkout: false, workout: null, expiresAt: null } : prev));
    };
    window.addEventListener(AUTO_FINISHED_EVENT, onAutoFinished);
    return () => window.removeEventListener(AUTO_FINISHED_EVENT, onAutoFinished);
  }, []);

  const handleGenerate = async () => {
    setGenerateError(null);
    setGenerating(true);
    setModalState("generating");

    try {
      const res = await fetchWithAuth("/api/workout/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availableMinutes: selectedMinutes,
          equipment: selectedEquipment,
          focusMuscleGroup: selectedFocus,
          trainingStyle: selectedStyle,
          location: selectedLocation
        })
      });

      const json = await parseJsonResponse<{ data?: ExtraStatus; error?: string; message?: string }>(res);
      if (!res.ok || !json?.data) {
        throw new Error(getRequestErrorMessage(json) || "Erro ao gerar treino extra.");
      }

      setStatus(json.data);
      trackEvent("extra_workout_generated", userId, {
        available_minutes: selectedMinutes,
        focus: selectedFocus
      });
      setModalState("view");
    } catch (err) {
      const msg = err instanceof Error ? err.message : null;
      setGenerateError(typeof msg === "string" && msg && !msg.includes("[object") ? msg : "Erro ao gerar treino. Tente novamente.");
      setModalState("questionnaire");
    } finally {
      setGenerating(false);
    }
  };

  // Registra o Treino Extra (com a avaliação, se respondida). Retorna true se deu certo.
  const handleComplete = async (feedback: { liked: boolean | null; intensity: number | null }) => {
    if (!status?.workoutId || completing) return false;
    setCompleting(true);
    setCompleteError(null);

    try {
      const saved = readActiveWorkout();
      const session = saved && saved.userId === userId && saved.workoutType === "extra" ? saved : null;
      const allDone = Boolean(session && session.setsTotal > 0 && session.setsDone >= session.setsTotal);
      const exercises = (status.workout?.sections ?? []).flatMap((section) =>
        buildTrainingExerciseRows(section).map((row) => ({ id: row.id, name: row.name }))
      );
      const res = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: "extra",
          workoutId: status.workoutId,
          workoutKey: EXTRA_WORKOUT_KEY,
          exerciseWeights: collectWeightsFromDrafts(userId, EXTRA_WORKOUT_KEY, exercises),
          liked: feedback.liked,
          intensityLevel: feedback.intensity,
          timing: session ? buildTimingPayload(session, allDone ? "all_done" : "manual") : null
        })
      });

      if (!res.ok) {
        setCompleteError("Não conseguimos registrar agora. Verifique a internet e tente de novo.");
        return false;
      }

      invalidateWorkoutCache();
      markTrainedToday(userId);
      const seconds = session ? getSessionDurationSeconds(session, "manual") : null;
      const summary =
        session && seconds !== null
          ? [
              formatDurationMinutes(seconds),
              `${session.setsDone} séries`,
              `${session.exercisesDone}/${session.exercisesTotal} exercícios`
            ].join(" · ")
          : null;
      clearExerciseDrafts(userId, EXTRA_WORKOUT_KEY);
      if (session) clearActiveWorkout();
      trackEvent("extra_workout_completed", userId, {
        with_feedback: feedback.liked !== null && feedback.intensity !== null
      });
      setModalState("closed");
      setStatus((prev) =>
        prev ? { ...prev, hasExtraWorkout: false, workout: null, expiresAt: null, trainedToday: true } : prev
      );
      setCelebration({ summary });
      return true;
    } catch {
      setCompleteError("Não conseguimos registrar agora. Verifique a internet e tente de novo.");
      return false;
    } finally {
      setCompleting(false);
    }
  };

  const closeModal = () => {
    setModalState("closed");
    setGenerateError(null);
  };

  if (loadingStatus || !status) return null;

  return (
    <>
      {/* Botão */}
      <button
        type="button"
        onClick={handleButtonClick}
        className={clsx(
          "relative inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition",
          status.hasExtraWorkout
            ? "border-yellow-500/30 bg-yellow-500/15 text-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.18)]"
            : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
        )}
      >
        <Zap className={clsx("h-3.5 w-3.5", status.hasExtraWorkout ? "text-yellow-400" : "")} />
        <span>Extra</span>
      </button>

      {/* Tela cheia ao ver o treino — portal direto no body, sem card embrulhando */}
      {mounted && modalState === "view" && status.workout && createPortal(
        <ModalViewWorkout
          workout={status.workout}
          workoutId={status.workoutId ?? ""}
          userId={userId}
          expiresIn={countdown}
          completing={completing}
          completeError={completeError}
          onComplete={handleComplete}
          onClose={closeModal}
        />,
        document.body
      )}

      {/* Overlay com card (upsell, intro, questionário, gerando) */}
      {mounted && modalState !== "closed" && modalState !== "view" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#0f0f0f] p-6 sm:rounded-[28px]">

            {/* ── UPSELL ── */}
            {modalState === "upsell" && (
              <ModalUpsell onClose={closeModal} onUpgrade={() => router.push("/escolher-plano")} />
            )}

            {/* ── INTRO ── */}
            {modalState === "intro" && (
              <ModalIntro
                usedThisMonth={status.usedThisMonth}
                monthlyLimit={status.monthlyLimit}
                onClose={closeModal}
                onStart={() => {
                  setSelectedEquipment(defaultEquipment ?? []);
                  setModalState("questionnaire");
                }}
              />
            )}

            {/* ── QUESTIONÁRIO ── */}
            {modalState === "questionnaire" && (
              <ModalQuestionnaire
                selectedMinutes={selectedMinutes}
                selectedEquipment={selectedEquipment}
                selectedFocus={selectedFocus}
                selectedStyle={selectedStyle}
                selectedLocation={selectedLocation}
                locationOptions={locationOptions}
                onSelectLocation={setSelectedLocation}
                generateError={generateError}
                onSelectMinutes={setSelectedMinutes}
                onToggleEquipment={(eq) => {
                  if (eq === "nenhum") {
                    setSelectedEquipment(["nenhum"]);
                    return;
                  }
                  setSelectedEquipment((prev) => {
                    const without = prev.filter((e) => e !== "nenhum");
                    return without.includes(eq) ? without.filter((e) => e !== eq) : [...without, eq];
                  });
                }}
                onSelectFocus={setSelectedFocus}
                onSelectStyle={setSelectedStyle}
                onGenerate={handleGenerate}
                onBack={() => setModalState("intro")}
                onClose={closeModal}
              />
            )}

            {/* ── GERANDO ── */}
            {modalState === "generating" && (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/15">
                  <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-400/90">Treino Extra</p>
                  <h2 className="mt-1 text-[18px] font-bold text-white">Gerando seu treino personalizado...</h2>
                </div>
                <p className="text-sm text-white/58 transition-all duration-500">{LOADING_MESSAGES[loadingMsgIndex]}</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Portal direto no body: o botão fica dentro de um card que cortava as janelas de tela cheia. */}
      {mounted && showAlreadyTrained
        ? createPortal(
            <AlreadyTrainedTodayPopup showExtraOption={false} onClose={() => setShowAlreadyTrained(false)} />,
            document.body
          )
        : null}

      {/* Comemoração (frases engraçadas + avaliação na loja), igual ao treino do programa */}
      {mounted && celebration
        ? createPortal(
            <WorkoutCompletionPopup summary={celebration.summary} onClose={() => setCelebration(null)} />,
            document.body
          )
        : null}
    </>
  );
}

// ── Sub-componentes de modal ─────────────────────────────────────────────────

function ModalUpsell({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <h2 className="text-[18px] font-bold text-white">Treino Extra!</h2>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <p className="text-sm leading-6 text-white/64">
        Crie um treino extra quando você estiver treinando em outro local, com outros materiais, mais ou menos tempo disponível ou se quer algo diferente. Esse treino é excluído do seu programa após 4 horas.
      </p>
      <div className="space-y-2">
        <button
          onClick={onUpgrade}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-yellow-500 text-sm font-bold text-black transition hover:brightness-110"
        >
          <Zap className="h-4 w-4" />
          Assine o Premium
        </button>
        <button
          onClick={onClose}
          className="flex h-10 w-full items-center justify-center rounded-[16px] text-sm font-semibold text-white/50 hover:text-white"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function ModalIntro({ usedThisMonth, monthlyLimit, onClose, onStart }: {
  usedThisMonth: number;
  monthlyLimit: number;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <h2 className="text-[18px] font-bold text-white">Treino Extra!</h2>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <p className="text-sm leading-6 text-white/64">
        Crie um treino extra quando você estiver treinando em outro local, com outros materiais, mais ou menos tempo disponível ou se quer algo diferente. Esse treino é excluído do seu programa após 4 horas.
      </p>
      <p className="text-xs text-white/36 text-center">{usedThisMonth}/{monthlyLimit} treinos extras usados este mês</p>
      {usedThisMonth >= monthlyLimit ? (
        <p className="rounded-[16px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-center text-sm text-red-300">
          Limite mensal atingido. Volta no primeiro dia do próximo mês.
        </p>
      ) : (
        <button
          onClick={onStart}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-yellow-500/15 border border-yellow-500/30 text-sm font-bold text-yellow-300 transition hover:bg-yellow-500/22"
        >
          <Zap className="h-4 w-4" />
          Criar meu Treino Extra!
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ModalQuestionnaire({
  selectedMinutes, selectedEquipment, selectedFocus, selectedStyle, selectedLocation, locationOptions, generateError,
  onSelectMinutes, onToggleEquipment, onSelectFocus, onSelectStyle, onSelectLocation, onGenerate, onBack, onClose
}: {
  selectedMinutes: 20 | 30 | 45 | 60;
  selectedEquipment: HomeEquipment[];
  selectedFocus: string;
  selectedStyle: string;
  selectedLocation: string;
  locationOptions: string[];
  generateError: string | null;
  onSelectMinutes: (v: 20 | 30 | 45 | 60) => void;
  onToggleEquipment: (eq: HomeEquipment) => void;
  onSelectFocus: (f: string) => void;
  onSelectStyle: (s: string) => void;
  onSelectLocation: (loc: string) => void;
  onGenerate: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5 max-h-[85vh] overflow-y-auto pr-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <h2 className="text-[17px] font-bold text-white">Configurar Treino Extra</h2>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
      </div>

      {/* Tempo */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/52">Quanto tempo você tem disponível?</p>
        <div className="flex gap-2">
          {TIME_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => onSelectMinutes(min)}
              className={clsx(
                "flex-1 rounded-[14px] border py-2.5 text-sm font-semibold transition",
                selectedMinutes === min
                  ? "border-yellow-500/40 bg-yellow-500/18 text-yellow-300"
                  : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
              )}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      {/* Local do treino */}
      {locationOptions.length > 1 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/52">Onde será o treino?</p>
          <div className="flex flex-wrap gap-2">
            {locationOptions.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => onSelectLocation(loc)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                  selectedLocation === loc
                    ? "border-yellow-500/40 bg-yellow-500/18 text-yellow-300"
                    : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
                )}
              >
                {EXTRA_LOCATION_LABELS[loc] ?? loc}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Equipamentos — só para treino em casa. No condomínio/academia o catálogo
          já usa os exercícios cadastrados do local. */}
      {selectedLocation === "home" ? (
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/52">Que equipamentos você tem agora?</p>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onToggleEquipment(value)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                selectedEquipment.includes(value)
                  ? "border-yellow-500/40 bg-yellow-500/18 text-yellow-300"
                  : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      ) : null}

      {/* Foco muscular */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/52">Quer intensificar algum grupo muscular?</p>
        <div className="flex flex-wrap gap-2">
          {FOCUS_OPTIONS.map((focus) => (
            <button
              key={focus}
              type="button"
              onClick={() => onSelectFocus(focus)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                selectedFocus === focus
                  ? "border-yellow-500/40 bg-yellow-500/18 text-yellow-300"
                  : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
              )}
            >
              {focus}
            </button>
          ))}
        </div>
      </div>

      {/* Estilo de treino */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/52">Qual estilo de treino você prefere?</p>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => onSelectStyle(style.value)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                selectedStyle === style.value
                  ? "border-yellow-500/40 bg-yellow-500/18 text-yellow-300"
                  : "border-white/10 bg-white/[0.04] text-white/56 hover:text-white"
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {generateError && (
        <div className="rounded-[16px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          {generateError}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 flex-1 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/56 transition hover:text-white"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onGenerate}
          className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-[14px] bg-yellow-500 text-sm font-bold text-black transition hover:brightness-110"
        >
          <Zap className="h-4 w-4" />
          Gerar Treino Extra
        </button>
      </div>
    </div>
  );
}

function ModalViewWorkout({ workout, workoutId, userId, expiresIn, completing, completeError, onComplete, onClose }: {
  workout: WorkoutPlan;
  workoutId: string;
  userId: string;
  expiresIn: string;
  completing: boolean;
  completeError: string | null;
  onComplete: (feedback: { liked: boolean | null; intensity: number | null }) => Promise<boolean>;
  onClose: () => void;
}) {
  // Tela "Finalizar treino?" com avaliação — abre sozinha ao marcar tudo, ou pelo botão Finalizar.
  const [showFinish, setShowFinish] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const autoPromptedRef = useRef(false);
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  // Séries marcadas por exercício (barra de progresso).
  const [exerciseProgress, setExerciseProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Stub mínimo: ExpandableExerciseCard só usa data.user.id internamente
  const stubData = { user: { id: userId } } as unknown as AppWorkoutData;

  // Todos os exercícios do extra, na ordem em que aparecem.
  const allRows = workout.sections.flatMap((section) => buildTrainingExerciseRows(section));

  useEffect(() => {
    const sync = () => setActiveSession(readActiveWorkout());
    sync();
    return subscribeActiveWorkout(sync);
  }, []);

  const handleProgressChange = useCallback((exerciseId: string, done: number, total: number) => {
    setExerciseProgress((prev) => {
      const current = prev[exerciseId];
      if (current && current.done === done && current.total === total) return prev;
      return { ...prev, [exerciseId]: { done, total } };
    });
  }, []);

  let setsDone = 0;
  let setsTotal = 0;
  let exercisesDone = 0;
  const segments: number[] = [];
  allRows.forEach((row) => {
    const reported = exerciseProgress[row.id];
    const total = reported?.total ?? Math.max(row.plannedSetsCount ?? 1, 1);
    const done = Math.min(reported?.done ?? 0, total);
    setsDone += done;
    setsTotal += total;
    segments.push(total);
    if (total > 0 && done >= total) exercisesDone += 1;
  });

  const extraSession =
    activeSession &&
    activeSession.userId === userId &&
    activeSession.workoutType === "extra" &&
    !isAutoFinishDue(activeSession)
      ? activeSession
      : null;

  // Mantém os totais do treino salvo atualizados (pílula e fechamento automático).
  useEffect(() => {
    const saved = readActiveWorkout();
    if (!saved || saved.userId !== userId || saved.workoutType !== "extra") return;
    if (
      saved.setsDone === setsDone &&
      saved.setsTotal === setsTotal &&
      saved.exercisesDone === exercisesDone &&
      saved.exercisesTotal === allRows.length
    ) {
      return;
    }
    writeActiveWorkout({ ...saved, setsDone, setsTotal, exercisesDone, exercisesTotal: allRows.length });
  }, [allRows.length, exercisesDone, setsDone, setsTotal, userId]);

  // Tela sempre acesa durante o extra em andamento.
  const hasExtraSession = Boolean(extraSession);

  // Marcou todas as séries: pergunta se quer finalizar (uma vez; se desmarcar algo, pode perguntar de novo).
  const allSetsDone = setsTotal > 0 && setsDone >= setsTotal;
  useEffect(() => {
    if (!allSetsDone) {
      autoPromptedRef.current = false;
      return;
    }
    if (hasExtraSession && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      setShowFinish(true);
    }
  }, [allSetsDone, hasExtraSession]);

  async function handleConfirmFinish() {
    const ok = await onComplete({ liked, intensity });
    if (ok) setShowFinish(false);
  }
  useEffect(() => {
    if (!hasExtraSession) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    void nav.wakeLock
      ?.request("screen")
      .then((acquired) => {
        if (cancelled) void acquired.release().catch(() => {});
        else lock = acquired;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release().catch(() => {});
    };
  }, [hasExtraSession]);

  function isExerciseDone(exerciseId: string) {
    const reported = exerciseProgress[exerciseId];
    return Boolean(reported && reported.total > 0 && reported.done >= reported.total);
  }

  // Inicia (ou atualiza) o extra em andamento. Só um treino aberto por vez.
  function startOrTouch(hadActivity: boolean): boolean {
    const now = Date.now();
    const saved = readActiveWorkout();
    const savedActive = saved && saved.userId === userId && !isAutoFinishDue(saved, now) ? saved : null;
    if (savedActive && savedActive.workoutType !== "extra") {
      setBlockedMessage("Você tem um treino do programa em andamento. Finalize-o antes de começar o extra.");
      return false;
    }
    const base = savedActive;
    writeActiveWorkout({
      v: 1,
      userId,
      workoutType: "extra",
      workoutId,
      workoutKey: EXTRA_WORKOUT_KEY,
      workoutTitle: "Treino Extra",
      estimatedLabel: null,
      startedAt: base?.startedAt ?? now,
      lastActivityAt: now,
      hadActivity: Boolean(base?.hadActivity) || hadActivity,
      setsDone,
      setsTotal,
      exercisesDone,
      exercisesTotal: allRows.length,
      exercises: allRows.map((row) => ({ id: row.id, name: row.name }))
    });
    void scheduleIdleWorkoutNotification({ lastActivityAt: now, workoutTitle: "Treino Extra", askPermission: !base });
    if (!base) {
      trackEvent("cta_click", userId, {
        source: hadActivity ? "extra_workout_started_by_set" : "extra_workout_started"
      });
    }
    return true;
  }

  function handleStart() {
    if (!startOrTouch(false)) return;
    if (!openExerciseId) {
      const first = allRows.find((row) => !isExerciseDone(row.id));
      if (first) setOpenExerciseId(first.id);
    }
  }

  function handleSetActivity(exerciseId: string, info: { completedSets: number; totalSets: number; isComplete: boolean }) {
    if (!startOrTouch(true)) return;
    if (!info.isComplete) return;
    try {
      navigator.vibrate?.(20);
    } catch {
      // sem vibração
    }
    const index = allRows.findIndex((row) => row.id === exerciseId);
    const ordered = [...allRows.slice(index + 1), ...allRows.slice(0, Math.max(index, 0))];
    const next = ordered.find((row) => row.id !== exerciseId && !isExerciseDone(row.id));
    setOpenExerciseId(next?.id ?? null);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0a0a0a] md:items-center md:justify-center md:bg-black/70">
      <div className="flex h-full w-full flex-col overflow-hidden md:h-auto md:max-h-[90vh] md:w-full md:max-w-2xl md:rounded-2xl md:border md:border-white/[0.08] md:bg-[#0a0a0a]">
      {/* Header fixo */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <p className="text-[18px] font-bold uppercase tracking-[0.12em] text-yellow-400">Treino Extra</p>
          </div>
          {expiresIn && expiresIn !== "Expirado" && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/40">
              <Clock className="h-3 w-3" />
              <span>Expira em {expiresIn}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Exercícios por seção */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 px-4 py-4">
        {workout.sections.map((section) => {
          const rows = buildTrainingExerciseRows(section);
          if (!rows.length) return null;

          return (
            <div key={section.title} className="space-y-2">
              {rows.map((exercise, index) => (
                <ExpandableExerciseCard
                  key={exercise.id}
                  data={stubData}
                  workoutKey={EXTRA_WORKOUT_KEY}
                  exercise={exercise}
                  index={index}
                  expanded={openExerciseId === exercise.id}
                  onToggle={(id) => setOpenExerciseId((prev) => (prev === id ? null : id))}
                  workoutId={workoutId}
                  workoutDayId="extra"
                  exerciseIndex={index}
                  exerciseName={exercise.name}
                  replacementLimitReached={false}
                  replacementCount={0}
                  replacementsRemaining={2}
                  isPremiumUser={true}
                  isReplaced={false}
                  onExerciseReplaced={() => {}}
                  onProgressChange={handleProgressChange}
                  onSetActivity={handleSetActivity}
                />
              ))}
            </div>
          );
        })}
        </div>
      </div>

      {/* Rodapé: Iniciar → barra de progresso → concluído */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 pb-[calc(1rem+var(--app-safe-bottom))] pt-4">
        {completing && !showFinish ? (
          <div className="flex h-14 items-center justify-center gap-2 text-sm font-semibold text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            Registrando...
          </div>
        ) : extraSession ? (
          <WorkoutProgressDock
            variant="inline"
            title="Treino Extra"
            startedAt={extraSession.startedAt}
            setsDone={setsDone}
            setsTotal={setsTotal}
            exercisesDone={exercisesDone}
            exercisesTotal={allRows.length}
            segments={segments}
            onFinish={() => setShowFinish(true)}
          />
        ) : (
          <>
            {blockedMessage ? <p className="mb-3 text-center text-xs leading-5 text-white/60">{blockedMessage}</p> : null}
            <button
              type="button"
              onClick={handleStart}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-primary text-[16px] font-bold text-black transition hover:brightness-110"
            >
              <Play className="h-4 w-4 fill-current" />
              Iniciar treino
            </button>
          </>
        )}
      </div>
      </div>

      {showFinish && extraSession ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 px-4 pb-8 sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#111] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">{allSetsDone ? "Treino completo! 💪" : "Finalizar treino?"}</h3>
            <p className="mt-1 text-sm leading-6 text-white/62">
              {allSetsDone
                ? "Todas as séries marcadas. Mandou bem!"
                : setsDone > 0
                  ? `Você fez ${exercisesDone} de ${allRows.length} exercícios. Quer finalizar mesmo assim?`
                  : "Você ainda não marcou nenhuma série. Quer finalizar mesmo assim?"}
            </p>
            <StatsRow
              items={[
                {
                  value: formatDurationMinutes(getSessionDurationSeconds(extraSession, "manual")),
                  label: "tempo"
                },
                { value: `${setsDone}/${setsTotal}`, label: "séries" },
                { value: `${exercisesDone}/${allRows.length}`, label: "exercícios" }
              ]}
            />
            <FeedbackFields liked={liked} intensity={intensity} onLiked={setLiked} onIntensity={setIntensity} />
            {completeError ? <p className="mt-3 text-sm text-red-300">{completeError}</p> : null}
            <div className="mt-5 flex flex-col gap-3 min-[380px]:flex-row">
              <button
                type="button"
                onClick={() => setShowFinish(false)}
                disabled={completing}
                className="h-12 flex-1 rounded-2xl border border-white/15 text-sm font-semibold text-white disabled:opacity-60"
              >
                Continuar treinando
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmFinish()}
                disabled={completing}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-black disabled:opacity-60"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {completing ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
