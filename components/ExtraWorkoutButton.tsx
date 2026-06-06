"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Zap, X, ChevronRight, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { buildTrainingExerciseRows } from "@/lib/app-workout";
import type { AppWorkoutData } from "@/lib/app-workout";
import { ExpandableExerciseCard } from "@/components/expandable-exercise-card";
import type { HomeEquipment, WorkoutPlan } from "@/lib/types";

type ExtraStatus = {
  isPremium: boolean;
  hasExtraWorkout: boolean;
  workoutId: string | null;
  workout: WorkoutPlan | null;
  expiresAt: string | null;
  usedThisMonth: number;
  monthlyLimit: number;
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

export function ExtraWorkoutButton({ userId, defaultEquipment }: {
  userId: string;
  defaultEquipment?: HomeEquipment[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ExtraStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [selectedMinutes, setSelectedMinutes] = useState<20 | 30 | 45 | 60>(45);
  const [selectedEquipment, setSelectedEquipment] = useState<HomeEquipment[]>(defaultEquipment ?? []);
  const [selectedFocus, setSelectedFocus] = useState("Sem preferência");
  const [selectedStyle, setSelectedStyle] = useState("personal");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [mounted, setMounted] = useState(false);
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
    if (status.hasExtraWorkout) {
      setModalState("view");
      return;
    }
    setModalState("intro");
  };

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
          trainingStyle: selectedStyle
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

  const handleComplete = async () => {
    if (!status?.workoutId || completing || completed) return;
    setCompleting(true);

    try {
      const res = await fetchWithAuth("/api/workout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: "extra",
          workoutId: status.workoutId,
          workoutKey: "extra_A"
        })
      });

      if (res.ok) {
        setCompleted(true);
        trackEvent("extra_workout_completed", userId, {});
        setTimeout(() => {
          setModalState("closed");
          setCompleted(false);
          setStatus((prev) => prev ? { ...prev, hasExtraWorkout: false, workout: null, expiresAt: null } : prev);
        }, 2000);
      }
    } catch {
      // silently fail
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
          completed={completed}
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
  selectedMinutes, selectedEquipment, selectedFocus, selectedStyle, generateError,
  onSelectMinutes, onToggleEquipment, onSelectFocus, onSelectStyle, onGenerate, onBack, onClose
}: {
  selectedMinutes: 20 | 30 | 45 | 60;
  selectedEquipment: HomeEquipment[];
  selectedFocus: string;
  selectedStyle: string;
  generateError: string | null;
  onSelectMinutes: (v: 20 | 30 | 45 | 60) => void;
  onToggleEquipment: (eq: HomeEquipment) => void;
  onSelectFocus: (f: string) => void;
  onSelectStyle: (s: string) => void;
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

      {/* Equipamentos */}
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

function ModalViewWorkout({ workout, workoutId, userId, expiresIn, completing, completed, onComplete, onClose }: {
  workout: WorkoutPlan;
  workoutId: string;
  userId: string;
  expiresIn: string;
  completing: boolean;
  completed: boolean;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);

  // Stub mínimo: ExpandableExerciseCard só usa data.user.id internamente
  const stubData = { user: { id: userId } } as unknown as AppWorkoutData;

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
                  workoutKey="extra_A"
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
                />
              ))}
            </div>
          );
        })}
        </div>
      </div>

      {/* Botão no rodapé */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-4">
        {completed ? (
          <div className="flex items-center justify-center gap-2 rounded-[16px] bg-green-500/15 py-3.5 text-sm font-semibold text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Treino concluído!
          </div>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            disabled={completing}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-primary text-[16px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {completing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {completing ? "Registrando..." : "Finalizar Treino!"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

