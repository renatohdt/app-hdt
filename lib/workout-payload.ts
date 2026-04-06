import { DiagnosisResult, QuizAnswers, WorkoutExercise, WorkoutPlan, WorkoutSection } from "@/lib/types";
import { buildWorkoutSectionItems, flattenWorkoutSectionItems } from "@/lib/workout-section-items";
import { formatSplitTypeLabel, normalizeBlockType } from "@/lib/workout-strategy";
import { buildSessionTimeBudget } from "@/lib/workout-time";

type UnknownRecord = Record<string, unknown>;

type LegacyWorkoutDay = {
  day?: string;
  title?: string;
  subtitle?: string;
  focus?: string[] | string;
  splitType?: string;
  sessionFocus?: string;
  rationale?: string;
  mobility?: unknown[];
  exercises?: unknown[];
};

export function normalizeWorkoutPayload(
  rawWorkout: unknown,
  options?: {
    diagnosis?: DiagnosisResult;
    answers?: Partial<QuizAnswers> | null;
  }
): WorkoutPlan | null {
  if (!rawWorkout) {
    return null;
  }

  if (isWorkoutPlan(rawWorkout)) {
    const sections = rawWorkout.sections.map(normalizeSection);
    const splitType = typeof rawWorkout.splitType === "string" ? rawWorkout.splitType : guessSplitType(sections);

    return {
      ...rawWorkout,
      estimatedDurationMinutes:
        typeof rawWorkout.estimatedDurationMinutes === "number"
          ? rawWorkout.estimatedDurationMinutes
          : buildFallbackTiming(options?.answers?.time).estimatedDurationMinutes,
      durationRange:
        typeof rawWorkout.durationRange === "string"
          ? rawWorkout.durationRange
          : buildFallbackTiming(options?.answers?.time).durationRange,
      timeFitRationale:
        typeof rawWorkout.timeFitRationale === "string"
          ? rawWorkout.timeFitRationale
          : buildFallbackTiming(options?.answers?.time).timeFitRationale,
      splitType,
      rationale:
        typeof rawWorkout.rationale === "string" && rawWorkout.rationale.trim()
          ? rawWorkout.rationale
          : buildWorkoutRationale(splitType, sections.length),
      sessionCount: sections.length,
      progressionNotes:
        typeof rawWorkout.progressionNotes === "string" ? rawWorkout.progressionNotes : null,
      sections,
      exercises: sections.flatMap((section) => [...section.mobility, ...section.exercises])
    };
  }

  const legacySections = extractLegacySections(rawWorkout);

  if (legacySections.length) {
    const sections = legacySections.map(normalizeLegacyDay);
    const splitType = buildSplitType(rawWorkout, sections);

    return {
      title: buildWorkoutTitle(rawWorkout, options?.diagnosis),
      subtitle: buildWorkoutSubtitle(rawWorkout),
      estimatedDuration: buildEstimatedDuration(options?.answers?.time),
      ...buildFallbackTiming(options?.answers?.time),
      focus: buildFocusList(options?.answers),
      splitType,
      rationale: buildWorkoutRationale(splitType, sections.length),
      sessionCount: sections.length,
      progressionNotes:
        rawWorkout && typeof rawWorkout === "object" && typeof (rawWorkout as UnknownRecord).progressionNotes === "string"
          ? String((rawWorkout as UnknownRecord).progressionNotes)
          : null,
      sections,
      exercises: sections.flatMap((section) => [...section.mobility, ...section.exercises])
    };
  }

  const exercises = extractExerciseArray(rawWorkout);

  if (!exercises.length) {
    return null;
  }

  const fallbackSection: WorkoutSection = {
    title: "Treino A",
    subtitle: buildWorkoutSubtitle(rawWorkout),
    focus: "full_body",
    splitType: "full_body_single",
    sessionFocus: "Full body principal",
    rationale: "Treino convertido do formato legado para manter compatibilidade.",
    mobility: exercises.filter((exercise) => exercise.type === "mobility"),
    exercises: exercises.filter((exercise) => exercise.type !== "mobility")
  };

  return {
    title: buildWorkoutTitle(rawWorkout, options?.diagnosis),
    subtitle: buildWorkoutSubtitle(rawWorkout),
    estimatedDuration: buildEstimatedDuration(options?.answers?.time),
    ...buildFallbackTiming(options?.answers?.time),
    focus: buildFocusList(options?.answers),
    splitType: "full_body_single",
    rationale: buildWorkoutRationale("full_body_single", 1),
    sessionCount: 1,
    progressionNotes: null,
    sections: [fallbackSection],
    exercises: [...fallbackSection.mobility, ...fallbackSection.exercises]
  };
}

function isWorkoutPlan(value: unknown): value is WorkoutPlan {
  return Boolean(value && typeof value === "object" && Array.isArray((value as WorkoutPlan).sections));
}

function extractLegacySections(rawWorkout: unknown) {
  if (Array.isArray(rawWorkout) && rawWorkout.every(isLegacyWorkoutDay)) {
    return rawWorkout as LegacyWorkoutDay[];
  }

  if (!rawWorkout || typeof rawWorkout !== "object") {
    return [];
  }

  const record = rawWorkout as UnknownRecord;

  if (Array.isArray(record.plan) && record.plan.every(isLegacyWorkoutDay)) {
    return record.plan as LegacyWorkoutDay[];
  }

  if (Array.isArray(record.sessions) && record.sessions.every(isLegacyWorkoutDay)) {
    return record.sessions as LegacyWorkoutDay[];
  }

  if (Array.isArray(record.workout) && record.workout.every(isLegacyWorkoutDay)) {
    return record.workout as LegacyWorkoutDay[];
  }

  if (Array.isArray(record.sections) && record.sections.every(isLegacyWorkoutDay)) {
    return record.sections as LegacyWorkoutDay[];
  }

  return [];
}

function isLegacyWorkoutDay(value: unknown): value is LegacyWorkoutDay {
  return Boolean(value && typeof value === "object" && Array.isArray((value as LegacyWorkoutDay).exercises));
}

function normalizeLegacyDay(day: LegacyWorkoutDay, index: number): WorkoutSection {
  const rawMobility = Array.isArray(day.mobility) ? day.mobility : [];
  const rawExercises = Array.isArray(day.exercises) ? day.exercises : [];
  const normalizedExercises = rawExercises.map(normalizeExercise).filter(Boolean) as WorkoutExercise[];
  const mobility = [
    ...rawMobility.map(normalizeExercise).filter(Boolean),
    ...normalizedExercises.filter((exercise) => exercise.type === "mobility")
  ] as WorkoutExercise[];
  const exercises = normalizedExercises.filter((exercise) => exercise.type !== "mobility");
  const focus = Array.isArray(day.focus) ? String(day.focus[0] ?? "full_body") : String(day.focus ?? "full_body");
  const label = extractWorkoutDayLabel(day.day || day.title, index);

  return {
    title: `Treino ${label}`,
    subtitle: typeof day.subtitle === "string" && day.subtitle.trim() ? day.subtitle : `Primario: ${formatFocus(focus)}`,
    focus,
    splitType: typeof day.splitType === "string" ? day.splitType : undefined,
    sessionFocus:
      typeof day.sessionFocus === "string" && day.sessionFocus.trim() ? day.sessionFocus : `Enfase em ${formatFocus(focus)}`,
    focusLabel:
      typeof day.sessionFocus === "string" && day.sessionFocus.trim() ? day.sessionFocus : `Enfase em ${formatFocus(focus)}`,
    rationale: typeof day.rationale === "string" && day.rationale.trim() ? day.rationale : null,
    progressionTip: null,
    mobility,
    exercises,
    items: buildWorkoutSectionItems(mobility, exercises)
  };
}

function extractExerciseArray(rawWorkout: unknown) {
  if (Array.isArray(rawWorkout)) {
    return rawWorkout.map(normalizeExercise).filter(Boolean) as WorkoutExercise[];
  }

  if (!rawWorkout || typeof rawWorkout !== "object") {
    return [];
  }

  const record = rawWorkout as UnknownRecord;

  if (Array.isArray(record.exercises)) {
    return record.exercises.map(normalizeExercise).filter(Boolean) as WorkoutExercise[];
  }

  if (Array.isArray(record.workout) && record.workout.every((item) => !isLegacyWorkoutDay(item))) {
    return record.workout.map(normalizeExercise).filter(Boolean) as WorkoutExercise[];
  }

  return [];
}

function normalizeSection(section: WorkoutSection): WorkoutSection {
  const normalizedMobility = Array.isArray(section.mobility)
    ? (section.mobility.map(normalizeExercise).filter(Boolean) as WorkoutExercise[])
    : [];
  const normalizedExercises = Array.isArray(section.exercises)
    ? (section.exercises.map(normalizeExercise).filter(Boolean) as WorkoutExercise[])
    : [];
  const normalizedItems = Array.isArray(section.items)
    ? buildWorkoutSectionItems(
        flattenWorkoutSectionItems(section.items).mobility,
        flattenWorkoutSectionItems(section.items).exercises
      )
    : buildWorkoutSectionItems(normalizedMobility, normalizedExercises);
  const flattened = flattenWorkoutSectionItems(normalizedItems);

  return {
    ...section,
    title: `Treino ${extractWorkoutDayLabel(section.title, 0)}`,
    splitType: typeof section.splitType === "string" ? section.splitType : undefined,
    sessionFocus: typeof section.sessionFocus === "string" ? section.sessionFocus : undefined,
    focusLabel:
      typeof section.focusLabel === "string"
        ? section.focusLabel
        : typeof section.sessionFocus === "string"
          ? section.sessionFocus
          : undefined,
    rationale: typeof section.rationale === "string" ? section.rationale : null,
    progressionTip: typeof section.progressionTip === "string" ? section.progressionTip : null,
    mobility: flattened.mobility,
    exercises: flattened.exercises,
    items: normalizedItems
  };
}

function normalizeExercise(value: unknown): WorkoutExercise | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const exercise = value as UnknownRecord;
  const name = typeof exercise.name === "string" ? exercise.name.trim() : "";

  if (!name) {
    return null;
  }

  const blockType = normalizeBlockType(
    typeof exercise.blockType === "string"
      ? exercise.blockType
      : typeof exercise.block_type === "string"
        ? (exercise.block_type as string)
        : typeof exercise.type === "string"
          ? exercise.type
          : typeof exercise.trainingTechnique === "string"
            ? exercise.trainingTechnique
            : typeof exercise.technique === "string"
              ? exercise.technique
              : undefined
  );

  return {
    name,
    sets: normalizeMetric(exercise.sets, "3"),
    reps: normalizeMetric(exercise.reps, "10"),
    rest: normalizeRest(exercise.rest),
    method:
      typeof exercise.method === "string"
        ? exercise.method
        : typeof exercise.trainingTechnique === "string"
          ? (exercise.trainingTechnique as string)
          : typeof exercise.technique === "string"
            ? (exercise.technique as string)
            : null,
    type: typeof exercise.type === "string" ? exercise.type : blockType === "mobility" ? "mobility" : undefined,
    technique:
      typeof exercise.technique === "string"
        ? exercise.technique
        : typeof exercise.trainingTechnique === "string"
          ? (exercise.trainingTechnique as string)
          : blockType !== "normal"
            ? blockType
            : null,
    blockType,
    trainingTechnique:
      typeof exercise.trainingTechnique === "string"
        ? exercise.trainingTechnique
        : typeof exercise.technique === "string"
          ? (exercise.technique as string)
          : null,
    rationale: typeof exercise.rationale === "string" ? exercise.rationale : null,
    notes:
      typeof exercise.notes === "string"
        ? exercise.notes
        : typeof exercise.observations === "string"
          ? (exercise.observations as string)
          : null,
    primaryMuscles: normalizeStringList(exercise.primaryMuscles ?? exercise.primary_muscles),
    secondaryMuscles: normalizeStringList(exercise.secondaryMuscles ?? exercise.secondary_muscles),
    order: typeof exercise.order === "string" ? exercise.order : null,
    blockId: typeof exercise.blockId === "string" ? exercise.blockId : null,
    blockLabel:
      typeof exercise.blockLabel === "string"
        ? exercise.blockLabel
        : typeof exercise.block_label === "string"
          ? (exercise.block_label as string)
          : null,
    rounds:
      typeof exercise.rounds === "string"
        ? exercise.rounds
        : typeof exercise.rounds === "number"
          ? String(exercise.rounds)
          : null,
    restAfterRound:
      typeof exercise.restAfterRound === "string"
        ? exercise.restAfterRound
        : typeof exercise.rest_after_round === "string"
          ? (exercise.rest_after_round as string)
          : null,
    blockNotes:
      typeof exercise.blockNotes === "string"
        ? exercise.blockNotes
        : typeof exercise.block_notes === "string"
          ? (exercise.block_notes as string)
          : null,
    videoUrl:
      typeof exercise.videoUrl === "string"
        ? exercise.videoUrl
        : typeof exercise.video_url === "string"
          ? (exercise.video_url as string)
          : null
  };
}

function normalizeMetric(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function normalizeRest(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.round(value)}s`;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim().endsWith("s") ? value.trim() : `${value.trim()}s`;
  }

  return "60s";
}

function buildWorkoutTitle(rawWorkout: unknown, diagnosis?: DiagnosisResult) {
  if (rawWorkout && typeof rawWorkout === "object" && typeof (rawWorkout as UnknownRecord).title === "string") {
    return String((rawWorkout as UnknownRecord).title);
  }

  return diagnosis ? `Sugestao ${diagnosis.title}` : "Plano sugerido";
}

function buildWorkoutSubtitle(rawWorkout: unknown) {
  if (rawWorkout && typeof rawWorkout === "object" && typeof (rawWorkout as UnknownRecord).subtitle === "string") {
    return String((rawWorkout as UnknownRecord).subtitle);
  }

  return "Treino organizado automaticamente a partir do seu plano salvo.";
}

function buildEstimatedDuration(time?: number) {
  const minutes = Number(time);

  if (Number.isFinite(minutes) && minutes > 0) {
    return `${minutes} min`;
  }

  return "45 min";
}

function buildFallbackTiming(time?: number) {
  const minutes = Number(time);
  const budget = buildSessionTimeBudget({
    availableTimeMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 45,
    level: "intermediate",
    goalStyle: "recomposition"
  });

  return {
    estimatedDurationMinutes: budget.targetDurationMinutes,
    durationRange: `${budget.minDurationMinutes}-${budget.maxDurationMinutes} min`,
    timeFitRationale: budget.timeFitRationale
  };
}

function buildFocusList(answers?: Partial<QuizAnswers> | null) {
  const items = [
    answers?.goal ? `Objetivo: ${answers.goal}` : null,
    answers?.experience ? `Nivel: ${answers.experience}` : null,
    Number.isFinite(Number(answers?.days)) && Number(answers?.days) > 0 ? `Frequencia: ${Number(answers?.days)} dia(s)` : null
  ];

  return items.filter(Boolean) as string[];
}

function buildSplitType(rawWorkout: unknown, sections: WorkoutSection[]) {
  if (rawWorkout && typeof rawWorkout === "object" && typeof (rawWorkout as UnknownRecord).splitType === "string") {
    return String((rawWorkout as UnknownRecord).splitType);
  }

  return guessSplitType(sections);
}

function guessSplitType(sections: WorkoutSection[]) {
  if (sections.every((section) => typeof section.splitType === "string" && section.splitType.trim())) {
    return sections[0]?.splitType ?? "full_body_single";
  }

  if (sections.length <= 1) return "full_body_single";
  if (sections.length === 2) return "full_body_ab";
  if (sections.length === 3) return "upper_lower_full";
  if (sections.length === 4) return "upper_lower";
  return "push_pull_legs_plus";
}

function buildWorkoutRationale(splitType: string | undefined, sessionCount: number) {
  const splitLabel = formatSplitTypeLabel(splitType);
  return `${splitLabel} com ${sessionCount} sess${sessionCount === 1 ? "ao" : "oes"} organizado automaticamente a partir do plano salvo.`;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function formatFocus(value: string) {
  const labels: Record<string, string> = {
    chest: "Peito",
    back: "Costas",
    quadriceps: "Quadriceps",
    hamstrings: "Posterior",
    glutes: "Gluteos",
    shoulders: "Ombros",
    biceps: "Biceps",
    triceps: "Triceps",
    abs: "Abdômen",
    lower_back: "Lombar",
    full_body: "Corpo inteiro"
  };

  return labels[value] ?? value;
}

function extractWorkoutDayLabel(value: string | null | undefined, fallbackIndex: number) {
  const raw = typeof value === "string" ? value.trim() : "";
  const fallbackLabel = String.fromCharCode(65 + fallbackIndex);

  if (!raw) {
    return fallbackLabel;
  }

  const treinoMatch = raw.match(/treino\s+([a-z0-9]+)/i);
  if (treinoMatch?.[1]) {
    return treinoMatch[1].toUpperCase();
  }

  const normalized = raw.replace(/^treino\s+/i, "").split(/[\s–—-]/)[0]?.trim();
  return normalized ? normalized.toUpperCase() : fallbackLabel;
}
