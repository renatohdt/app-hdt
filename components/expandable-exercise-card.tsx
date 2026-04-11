"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { trackEvent } from "@/lib/analytics-client";
import { type AppWorkoutData, type TrainingExerciseRow } from "@/lib/app-workout";

type ExerciseSetEntry = {
  weightKg: string;
  reps: string;
  completed: boolean;
};

type ExerciseExecutionDraft = {
  setEntries: ExerciseSetEntry[];
  completedSets: number;
  preferredRestSeconds: number | null;
  lastCompletedWeightKg: string | null;
  lastCompletedReps: string | null;
};

type FeedbackState = {
  tone: "success" | "info";
  text: string;
};

export function ExpandableExerciseCard({
  data,
  workoutKey,
  exercise,
  index,
  expanded,
  onToggle
}: {
  data: AppWorkoutData;
  workoutKey: string;
  exercise: TrainingExerciseRow;
  index: number;
  expanded: boolean;
  onToggle: (exerciseId: string) => void;
}) {
  const storageKey = useMemo(
    () => `hdt-exercise-draft:${data.user.id}:${workoutKey}:${exercise.id}`,
    [data.user.id, exercise.id, workoutKey]
  );
  const [draft, setDraft] = useState<ExerciseExecutionDraft | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(readExerciseDraft(storageKey, exercise.plannedRestSeconds, exercise.plannedRepsLabel, exercise.plannedSetsCount));
  }, [exercise.plannedRepsLabel, exercise.plannedRestSeconds, exercise.plannedSetsCount, storageKey]);

  useEffect(() => {
    if (!draft || typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  useEffect(() => {
    if (!expanded) {
      setShowVideo(false);
      setFeedback(null);
      return;
    }

    trackEvent("cta_click", data.user.id, {
      source: "exercise_inline_open",
      workout_key: workoutKey,
      exercise_name: exercise.name
    });
  }, [data.user.id, exercise.name, expanded, workoutKey]);

  useEffect(() => {
    if (!expanded || typeof window === "undefined") {
      return;
    }

    let frameA = 0;
    let frameB = 0;

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("hdt-rest-suggestion", {
        detail: {
          seconds: draft?.preferredRestSeconds ?? exercise.plannedRestSeconds ?? 60
        }
      })
    );
  }, [draft?.preferredRestSeconds, expanded, exercise.plannedRestSeconds]);

  const draftState =
    draft ?? readExerciseDraft(storageKey, exercise.plannedRestSeconds, exercise.plannedRepsLabel, exercise.plannedSetsCount);
  const muscleBadges = exercise.muscles.length ? exercise.muscles : ["Treino principal"];
  const totalSetRows = Math.max(exercise.plannedSetsCount ?? 1, draftState.setEntries.length, 1);
  const setEntries = ensureSetEntries(draftState.setEntries, totalSetRows);
  const panelId = `exercise-panel-${exercise.id}`;
  const posterUrl = resolveVideoPoster(exercise.videoUrl);
  const isMobilityExercise = exercise.isMobility;
  const isCombinedExercise = matchesCombinedTechnique(exercise.blockType ?? exercise.technique);
  const hasTechniqueTag = shouldShowTechniqueTag(exercise.technique, exercise.isMobility);
  const techniqueDescription = getTechniqueDescription(exercise.technique);
  const combinedBadgeLabel = isCombinedExercise
    ? [exercise.blockOrder, exercise.technique].filter(Boolean).join(" · ") || "Bloco combinado"
    : null;
  const referenceLabel = buildSetReferenceLabel(draftState.lastCompletedReps, exercise.plannedRepsLabel);
  const restLabel = formatRestLabel(draftState.preferredRestSeconds ?? exercise.plannedRestSeconds);

  function updateDraft(next: Partial<ExerciseExecutionDraft>) {
    setDraft((current) => {
      const base = current ?? draftState;
      const hasChanges = Object.entries(next).some(([key, value]) => base[key as keyof ExerciseExecutionDraft] !== value);

      if (!hasChanges) {
        return base;
      }

      return {
        ...base,
        ...next
      };
    });
  }

  function updateSetEntry(setIndex: number, next: Partial<ExerciseSetEntry>) {
    const nextEntries = setEntries.map((entry, index) => (index === setIndex ? { ...entry, ...next } : entry));

    updateDraft({
      setEntries: nextEntries,
      completedSets: nextEntries.filter((entry) => entry.completed).length
    });
  }

  function handleToggleSetCompletion(setIndex: number) {
    const currentEntry = setEntries[setIndex] ?? createEmptySetEntry();
    const nextCompleted = !currentEntry.completed;
    const nextEntries = setEntries.map((entry, index) => (index === setIndex ? { ...entry, completed: nextCompleted } : entry));
    const completedSets = nextEntries.filter((entry) => entry.completed).length;

    const nextDraft = {
      ...draftState,
      setEntries: nextEntries,
      completedSets,
      lastCompletedWeightKg: nextCompleted ? currentEntry.weightKg || draftState.lastCompletedWeightKg : draftState.lastCompletedWeightKg,
      lastCompletedReps: nextCompleted
        ? currentEntry.reps || draftState.lastCompletedReps || extractSuggestedReps(exercise.plannedRepsLabel)
        : draftState.lastCompletedReps
    } satisfies ExerciseExecutionDraft;

    setDraft(nextDraft);
    setFeedback({
      tone: nextCompleted ? "success" : "info",
      text: nextCompleted
        ? `Série ${setIndex + 1} registrada em ${exercise.name}.`
        : `Série ${setIndex + 1} desmarcada em ${exercise.name}.`
    });

    if (nextCompleted) {
      trackEvent("cta_click", data.user.id, {
        source: "complete_set_inline",
        workout_key: workoutKey,
        exercise_name: exercise.name,
        completed_sets: nextDraft.completedSets
      });
    }
  }

  return (
    <div ref={containerRef} className="scroll-mt-4">
      <Card
        className={clsx(
          "rounded-[26px] p-4 shadow-none transition sm:p-5",
          isCombinedExercise
            ? "border border-[#f59e0b]/18 bg-[linear-gradient(180deg,rgba(245,158,11,0.1),rgba(18,20,16,0.96))]"
            : isMobilityExercise
              ? "border border-[#38bdf8]/18 bg-[linear-gradient(180deg,rgba(56,189,248,0.09),rgba(18,20,16,0.96))]"
              : "border border-white/10 bg-[#0d100d]/80",
          expanded &&
            (isCombinedExercise
              ? "border-[#f59e0b]/28 bg-[linear-gradient(180deg,rgba(245,158,11,0.14),rgba(18,20,16,0.98))]"
              : isMobilityExercise
                ? "border-[#38bdf8]/28 bg-[linear-gradient(180deg,rgba(56,189,248,0.13),rgba(18,20,16,0.98))]"
                : "border-primary/18 bg-[linear-gradient(180deg,rgba(34,197,94,0.08),rgba(255,255,255,0.02))]")
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(exercise.id)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="w-full text-left"
        >
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border text-base font-semibold",
                isCombinedExercise
                  ? "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f7b955]"
                  : isMobilityExercise
                    ? "border-[#38bdf8]/22 bg-[#38bdf8]/10 text-[#67d3ff]"
                  : "border-primary/15 bg-primary/10 text-primary"
              )}
            >
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="text-base font-semibold leading-6 text-white">{exercise.name}</h3>
                    {combinedBadgeLabel ? (
                      <span className="inline-flex items-center rounded-full border border-[#f59e0b]/18 bg-[#f59e0b]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7b955]">
                        {combinedBadgeLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <span className="mt-1 text-white/38">
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <div className="overflow-x-auto no-scrollbar">
                  <p className="whitespace-nowrap text-[11px] font-medium leading-5 tracking-[-0.01em] text-white/62 min-[380px]:text-[12px]">
                    <span>Séries: {exercise.sets}</span>
                    <span className="mx-2.5 min-[380px]:mx-3">Repetições: {exercise.reps}</span>
                    <span>Descanso: {exercise.rest}</span>
                  </p>
                </div>
                {hasTechniqueTag ? (
                  <span className="mt-2 inline-flex rounded-full border border-[#f59e0b]/18 bg-[#f59e0b]/10 px-3 py-1 text-[12px] font-semibold leading-none text-[#f7b955]">
                    Técnica: {exercise.technique}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </button>

        {expanded ? (
          <div id={panelId} className="fade-in mt-4 space-y-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
            {hasTechniqueTag && techniqueDescription ? (
              <p className="text-[12px] leading-5 text-[#f7b955]">{techniqueDescription}</p>
            ) : null}

            <section className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-white/50 min-[380px]:text-[11px]">Músculos:</p>
              {muscleBadges.map((muscle) => (
                <span key={muscle} className="text-[11px] font-medium leading-5 text-white/78 min-[380px]:text-[12px]">
                  {muscle}
                </span>
              ))}
            </section>

            <div className="overflow-hidden rounded-none bg-black/20">
              {showVideo && exercise.videoUrl ? (
                <iframe
                  className="aspect-video w-full"
                  src={toEmbedUrl(exercise.videoUrl)}
                  title={`Vídeo demonstrativo de ${exercise.name}`}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div
                  className="relative aspect-video overflow-hidden bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.2),transparent_45%),linear-gradient(180deg,rgba(17,24,17,0.96),rgba(6,8,6,0.98))]"
                  style={
                    posterUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(4,5,4,0.18), rgba(4,5,4,0.72)), url(${posterUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center"
                        }
                      : undefined
                  }
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => exercise.videoUrl && setShowVideo(true)}
                      disabled={!exercise.videoUrl}
                      className={clsx(
                        "inline-flex h-16 w-16 items-center justify-center rounded-full border backdrop-blur-sm transition",
                        exercise.videoUrl
                          ? "border-primary/22 bg-black/30 text-primary shadow-[0_18px_40px_rgba(34,197,94,0.18)]"
                          : "border-white/10 bg-black/20 text-white/30"
                      )}
                      aria-label="Ver vídeo"
                    >
                      <PlayCircle className="h-8 w-8" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {exercise.mediaDurationLabel ? (
              <div className="flex justify-end px-1">
                <span className="text-[11px] font-medium text-white/42">{exercise.mediaDurationLabel}</span>
              </div>
            ) : null}

            <section className="space-y-3 rounded-[20px] border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Execução</p>
                <span className="text-[11px] font-medium text-white/48">{restLabel}</span>
              </div>

              <div className="grid grid-cols-[2rem_2.45rem_.25rem_3.35rem_3.35rem_2.35rem] items-center gap-x-1.5 gap-y-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">
                <span className="text-center">Série</span>
                <span className="text-center">Reps</span>
                <span className="mx-auto h-4 w-px rounded-full bg-white/8" aria-hidden />
                <span className="text-center">Kg</span>
                <span className="text-center">Feitas</span>
                <span className="text-center">Ok</span>
              </div>

              <div className="space-y-2">
                {setEntries.map((entry, setIndex) => (
                  <div
                    key={`${exercise.id}-set-${setIndex}`}
                    className="grid grid-cols-[2rem_2.45rem_.25rem_3.35rem_3.35rem_2.35rem] items-center gap-x-1.5 gap-y-2"
                  >
                    <span
                      className={clsx(
                        "inline-flex h-10 items-center justify-center text-sm font-semibold text-center",
                        entry.completed ? "text-primary" : "text-white/82"
                      )}
                    >
                      {setIndex + 1}
                    </span>

                    <span className="truncate text-center text-[11px] font-medium text-white/54">
                      {buildPreviousSetValue(setEntries, setIndex, referenceLabel)}
                    </span>

                    <span className="mx-auto h-6 w-px rounded-full bg-white/8" aria-hidden />

                    <input
                      type="text"
                      inputMode="decimal"
                      value={entry.weightKg}
                      onChange={(event) =>
                        updateSetEntry(setIndex, {
                          weightKg: normalizeDecimalInput(event.target.value)
                        })
                      }
                      placeholder="-"
                      className="h-10 w-full rounded-[12px] border border-white/10 bg-white/[0.04] px-2 text-center text-sm font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-primary/28"
                    />

                    <input
                      type="text"
                      inputMode="numeric"
                      value={entry.reps}
                      onChange={(event) =>
                        updateSetEntry(setIndex, {
                          reps: normalizeIntegerInput(event.target.value)
                        })
                      }
                      placeholder="-"
                      className="h-10 w-full rounded-[12px] border border-white/10 bg-white/[0.04] px-2 text-center text-sm font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-primary/28"
                    />

                    <button
                      type="button"
                      onClick={() => handleToggleSetCompletion(setIndex)}
                      className={clsx(
                        "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                        entry.completed
                          ? "border-primary/24 bg-primary text-white shadow-[0_14px_24px_rgba(34,197,94,0.2)]"
                          : "border-white/10 bg-white/[0.05] text-white/34 hover:text-white/60"
                      )}
                      aria-label={entry.completed ? `Desmarcar série ${setIndex + 1}` : `Concluir série ${setIndex + 1}`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {feedback ? (
              <div
                className={clsx(
                  "rounded-[22px] border px-4 py-3 text-sm",
                  feedback.tone === "success"
                    ? "border-primary/20 bg-primary/10 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/72"
                )}
              >
                {feedback.text}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function shouldShowTechniqueTag(value?: string | null, isMobility?: boolean) {
  if (isMobility) {
    return false;
  }

  const normalized = normalizeTechniqueLabel(value);
  return Boolean(normalized && normalized !== "normal" && normalized !== "tradicional");
}

function matchesCombinedTechnique(value?: string | null) {
  const normalized = normalizeTechniqueLabel(value);

  if (!normalized) {
    return false;
  }

  return [
    "superset",
    "superserie",
    "bi-set",
    "biset",
    "tri-set",
    "triset",
    "circuit",
    "circuito",
    "conjugado",
    "conjugada",
    "conjugados",
    "conjugadas"
  ].some((token) => normalized.includes(token));
}

function normalizeTechniqueLabel(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getTechniqueDescription(value?: string | null) {
  const normalized = normalizeTechniqueLabel(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("superset") || normalized.includes("superserie")) {
    return "Alterne com o próximo exercício do bloco e descanse só ao final.";
  }

  if (normalized.includes("bi-set") || normalized.includes("biset")) {
    return "Execute os dois exercícios em sequência e recupere apenas no fim da dupla.";
  }

  if (normalized.includes("tri-set") || normalized.includes("triset")) {
    return "Faca os tres exercicios seguidos e descanse somente ao terminar o bloco.";
  }

  if (normalized.includes("circuit") || normalized.includes("circuito")) {
    return "Passe por todo o bloco em sequência antes de fazer a recuperação.";
  }

  if (normalized.includes("conjugado") || normalized.includes("conjugada")) {
    return "Este exercício faz parte de um bloco combinado e deve seguir para o próximo sem pausa longa.";
  }

  if (normalized.includes("drop-set") || normalized.includes("dropset")) {
    return "Ao terminar a serie, reduza a carga e continue sem descanso prolongado.";
  }

  if (normalized.includes("rest-pause") || normalized.includes("restpause")) {
    return "Faca uma pausa bem curta e retome a serie para completar repeticoes extras.";
  }

  if (normalized.includes("tempo controlado") || normalized.includes("tempo_controlado") || normalized === "tempo") {
    return "Controle a velocidade do movimento, principalmente na fase de descida.";
  }

  if (normalized.includes("isometria") || normalized.includes("isometric")) {
    return "Segure a posicao pelo tempo prescrito mantendo tensao constante.";
  }

  return null;
}

function createEmptySetEntry(): ExerciseSetEntry {
  return {
    weightKg: "",
    reps: "",
    completed: false
  };
}

function ensureSetEntries(entries: ExerciseSetEntry[] | null | undefined, count: number) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const targetCount = Math.max(count, safeEntries.length, 1);

  return Array.from({ length: targetCount }, (_, index) => normalizeSetEntry(safeEntries[index]));
}

function normalizeSetEntry(entry?: Partial<ExerciseSetEntry> | null): ExerciseSetEntry {
  return {
    weightKg: typeof entry?.weightKg === "string" ? entry.weightKg : "",
    reps: typeof entry?.reps === "string" ? entry.reps : "",
    completed: Boolean(entry?.completed)
  };
}

function buildSetReferenceLabel(lastCompletedReps?: string | null, plannedRepsLabel?: string | null) {
  if (lastCompletedReps?.trim()) {
    return lastCompletedReps.trim();
  }

  return plannedRepsLabel?.trim() || "-";
}

function buildPreviousSetValue(setEntries: ExerciseSetEntry[], setIndex: number, fallback: string) {
  const previousEntry = setEntries[setIndex - 1];
  if (previousEntry?.reps.trim()) {
    return previousEntry.reps.trim();
  }

  return fallback;
}

function readExerciseDraft(
  storageKey: string,
  plannedRestSeconds?: number | null,
  plannedRepsLabel?: string | null,
  plannedSetsCount?: number | null
): ExerciseExecutionDraft {
  const targetSetCount = Math.max(plannedSetsCount ?? 1, 1);

  if (typeof window !== "undefined") {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<ExerciseExecutionDraft> & {
          weightKg?: string;
          completedReps?: string;
        };

        const baseEntries = Array.isArray(parsed.setEntries)
          ? parsed.setEntries.map((entry) => normalizeSetEntry(entry))
          : [];
        const legacyWeight = typeof parsed.weightKg === "string" ? parsed.weightKg : "";
        const legacyReps = typeof parsed.completedReps === "string" ? parsed.completedReps : "";
        const migratedEntries = baseEntries.length
          ? baseEntries
          : legacyWeight || legacyReps
            ? [{ weightKg: legacyWeight, reps: legacyReps, completed: false }]
            : [];

        let setEntries = ensureSetEntries(migratedEntries, targetSetCount);
        const legacyCompletedCount = normalizeNonNegativeInteger(parsed.completedSets) ?? 0;

        if (!setEntries.some((entry) => entry.completed) && legacyCompletedCount > 0) {
          setEntries = setEntries.map((entry, index) => ({
            ...entry,
            completed: index < legacyCompletedCount
          }));
        }

        return {
          setEntries,
          completedSets: setEntries.filter((entry) => entry.completed).length,
          preferredRestSeconds: normalizePositiveInteger(parsed.preferredRestSeconds) ?? normalizePositiveInteger(plannedRestSeconds) ?? 60,
          lastCompletedWeightKg: typeof parsed.lastCompletedWeightKg === "string" ? parsed.lastCompletedWeightKg : null,
          lastCompletedReps:
            typeof parsed.lastCompletedReps === "string"
              ? parsed.lastCompletedReps
              : legacyReps || extractSuggestedReps(plannedRepsLabel),
        };
      } catch {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  }

  return {
    setEntries: ensureSetEntries([], targetSetCount),
    completedSets: 0,
    preferredRestSeconds: normalizePositiveInteger(plannedRestSeconds) ?? 60,
    lastCompletedWeightKg: null,
    lastCompletedReps: extractSuggestedReps(plannedRepsLabel)
  };
}

function extractSuggestedReps(value?: string | null) {
  const match = value?.match(/\d+/);
  return match?.[0] ?? null;
}

function normalizeDecimalInput(value: string) {
  const sanitized = value.replace(/[^\d.,]/g, "");
  const parts = sanitized.replace(",", ".").split(".");
  if (parts.length <= 1) {
    return sanitized.replace(",", ".");
  }

  return `${parts[0]}.${parts.slice(1).join("")}`.slice(0, 8);
}

function normalizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 3);
}

function normalizePositiveInteger(value?: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeNonNegativeInteger(value?: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function formatRestLabel(value?: number | null) {
  const seconds = normalizePositiveInteger(value);
  if (!seconds) {
    return "Livre";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
}

function toEmbedUrl(url: string) {
  if (url.includes("youtube.com/embed/")) return url;
  if (url.includes("watch?v=")) return url.replace("watch?v=", "embed/");
  if (url.includes("youtu.be/")) return url.replace("youtu.be/", "youtube.com/embed/");
  return url;
}

function resolveVideoPoster(url?: string | null) {
  if (!url) {
    return null;
  }

  const youtubeId = resolveYoutubeId(url);
  if (!youtubeId) {
    return null;
  }

  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

function resolveYoutubeId(url: string) {
  const watchMatch = url.match(/[?&]v=([^&]+)/i);
  if (watchMatch?.[1]) {
    return watchMatch[1];
  }

  const shortMatch = url.match(/youtu\.be\/([^?]+)/i);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }

  const embedMatch = url.match(/embed\/([^?]+)/i);
  return embedMatch?.[1] ?? null;
}
