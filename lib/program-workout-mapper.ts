import type { ProgramRow } from "@/lib/program-store";
import type { WorkoutBlockType, WorkoutExercise, WorkoutPlan, WorkoutSection } from "@/lib/types";

// Formato do conteúdo do programa (como salvo pelo admin em content.weeks).
type ProgramExercise = {
  exercise_id?: string;
  name?: string;
  sets?: number | string;
  reps?: number | string;
  rest_sec?: number | string;
  block?: string;
  notes?: string;
};

type ProgramSession = {
  key?: string;
  title?: string;
  tip?: string;
  exercises?: ProgramExercise[];
};

type ProgramWeek = {
  week?: number;
  label?: string;
  sessions?: ProgramSession[];
};

const ALLOWED_BLOCKS: WorkoutBlockType[] = [
  "normal",
  "mobility",
  "warmup",
  "superset",
  "bi-set",
  "tri-set",
  "drop-set",
  "rest-pause",
  "cluster",
  "isometria",
  "tempo_controlado",
  "parciais",
  "pre-exaustao",
  "pos-exaustao",
  "circuit",
];

export function getProgramWeeks(program: ProgramRow): ProgramWeek[] {
  const content = program.content as { weeks?: ProgramWeek[] } | null;
  return Array.isArray(content?.weeks) ? (content!.weeks as ProgramWeek[]) : [];
}

export function getProgramTotalWeeks(program: ProgramRow): number {
  const weeks = getProgramWeeks(program);
  return weeks.length || program.duration_weeks || 1;
}

// Garante que o número da semana está dentro do intervalo válido [1..total].
export function clampProgramWeek(program: ProgramRow, requested: number): number {
  const total = getProgramTotalWeeks(program);
  if (!Number.isFinite(requested) || requested < 1) return 1;
  if (requested > total) return total;
  return Math.floor(requested);
}

function toBlockType(value?: string): WorkoutBlockType {
  return value && (ALLOWED_BLOCKS as string[]).includes(value) ? (value as WorkoutBlockType) : "normal";
}

function formatRest(rest?: number | string): string {
  if (rest === undefined || rest === null || rest === "") return "";
  const num = typeof rest === "number" ? rest : Number(rest);
  if (Number.isFinite(num)) return `${num}s`;
  return String(rest);
}

/**
 * Converte a semana escolhida do programa para o formato WorkoutPlan que a tela
 * de treino já consome. Cada treino da semana vira uma "section".
 * O videoUrl vem do catálogo de exercícios (map exercise_id -> video_url).
 */
export function mapProgramWeekToWorkoutPlan(
  program: ProgramRow,
  weekNumber: number,
  videoByExerciseId: Map<string, string | null>
): WorkoutPlan {
  const weeks = getProgramWeeks(program);
  const week =
    weeks.find((w) => Number(w.week) === weekNumber) ?? weeks[weekNumber - 1] ?? { sessions: [] };
  const sessions = Array.isArray(week.sessions) ? week.sessions : [];
  const weekLabel = week.label ?? `Semana ${weekNumber}`;

  const sections: WorkoutSection[] = sessions.map((session) => {
    const exercises: WorkoutExercise[] = (session.exercises ?? []).map((ex) => ({
      name: ex.name ?? "",
      sets: ex.sets !== undefined && ex.sets !== null ? String(ex.sets) : "",
      reps: ex.reps !== undefined && ex.reps !== null ? String(ex.reps) : "",
      rest: formatRest(ex.rest_sec),
      blockType: toBlockType(ex.block),
      notes: ex.notes || null,
      videoUrl: ex.exercise_id ? videoByExerciseId.get(ex.exercise_id) ?? null : null,
    }));

    return {
      title: session.title ?? `Treino ${session.key ?? ""}`.trim(),
      subtitle: weekLabel,
      focus: "",
      // Dica do treinador (escrita no admin) — exibida no card da sessão.
      rationale: session.tip?.trim() || null,
      mobility: [],
      exercises,
    };
  });

  const allExercises = sections.flatMap((s) => s.exercises);

  return {
    title: program.title,
    subtitle: weekLabel,
    estimatedDuration: "",
    focus: [],
    sessionCount: sections.length,
    totalSessions: sections.length,
    planCycleId: `program:${program.id}:w${weekNumber}`,
    sections,
    exercises: allExercises,
  };
}
