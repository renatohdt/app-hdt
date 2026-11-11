// PROGRESSÃO DO PROGRAMA (decisão do Renato, nov/2026).
// O formato do treino é o método dele (o modelo sempre troca na renovação). O que ajusta
// o próximo programa é a INTENSIDADE e o TEMPO que o aluno relatou/registrou:
//
//                 | achou fácil      | na medida        | achou difícil
//   gostou (≥50%) | mantém leve      | progride um pouco| mantém
//   não gostou    | dificulta        | progride um pouco| facilita
//   sem avaliação → progride um pouco
//
// Dificultar/facilitar = escala de dificuldade dos exercícios (1–5, dentro do nível),
// repetições (+/−2) e descanso (−/+15 s). "Progride um pouco" = só alguns exercícios
// um degrau acima na escala.
// Tempo: média real 15% acima do escolhido → 1 exercício a menos por treino;
// 25% abaixo → 1 exercício a mais. Séries não mudam.

export type DifficultyPlan = "keep" | "progress" | "harder" | "easier";
export type TimePlan = "keep" | "shorter" | "longer";

export type ProgressionPlan = {
  difficulty: DifficultyPlan;
  time: TimePlan;
  /** Dificuldade média (1–5) dos exercícios do programa anterior; null = sem referência. */
  previousDifficulty: number | null;
  /** Alvo de dificuldade média para o novo programa; null = sem referência. */
  targetDifficulty: number | null;
  reason: string;
};

export type ProgressionInput = {
  avgLiked: number | null;
  avgIntensity: number | null;
  sessionCount: number;
  avgRealDurationMinutes?: number | null;
  timedSessionCount?: number;
};

export const LIKED_THRESHOLD = 0.5;
export const LONG_SESSION_RATIO = 1.15;
export const SHORT_SESSION_RATIO = 0.75;
export const MIN_TIMED_SESSIONS = 3;
export const REPS_STEP = 2;
export const REST_STEP_SECONDS = 15;

function intensityBucket(avgIntensity: number) {
  if (avgIntensity <= 2.5) return "easy" as const;
  if (avgIntensity >= 3.5) return "hard" as const;
  return "medium" as const;
}

export function resolveProgressionPlan(
  input: ProgressionInput | null | undefined,
  timeAvailableMinutes: number,
  previousDifficulty: number | null
): ProgressionPlan {
  let difficulty: DifficultyPlan = "progress";
  let reason = "sem avaliacoes: progride um pouco";

  if (input && input.sessionCount > 0 && input.avgLiked !== null && input.avgIntensity !== null) {
    const liked = input.avgLiked >= LIKED_THRESHOLD;
    const bucket = intensityBucket(input.avgIntensity);
    const label = `${liked ? "gostou" : "nao gostou"} + ${bucket === "easy" ? "facil" : bucket === "hard" ? "dificil" : "na medida"}`;
    if (bucket === "medium") difficulty = "progress";
    else if (liked) difficulty = "keep";
    else difficulty = bucket === "easy" ? "harder" : "easier";
    reason = label;
  }

  let time: TimePlan = "keep";
  const timed = input?.timedSessionCount ?? 0;
  const avg = input?.avgRealDurationMinutes ?? null;
  if (timed >= MIN_TIMED_SESSIONS && avg && timeAvailableMinutes > 0) {
    if (avg > timeAvailableMinutes * LONG_SESSION_RATIO) time = "shorter";
    else if (avg < timeAvailableMinutes * SHORT_SESSION_RATIO) time = "longer";
  }

  const step = difficulty === "harder" ? 1 : difficulty === "easier" ? -1 : difficulty === "progress" ? 0.5 : 0;
  const targetDifficulty =
    previousDifficulty === null ? null : Math.min(5, Math.max(1, Math.round((previousDifficulty + step) * 10) / 10));

  return { difficulty, time, previousDifficulty, targetDifficulty, reason };
}

/** Repetições: "10-12" → "12-14" (dificultar) ou "8-10" (facilitar). Tempo ("30s") não muda. */
export function adjustRepsForDifficulty(reps: string, difficulty: DifficultyPlan): string {
  if (difficulty !== "harder" && difficulty !== "easier") return reps;
  if (!/^\s*\d+(\s*[-–a]\s*\d+)?\s*$/.test(reps)) return reps;
  const delta = difficulty === "harder" ? REPS_STEP : -REPS_STEP;
  return reps.replace(/\d+/g, (value) => String(Math.max(6, Number(value) + delta)));
}

/** Descanso em segundos: dificultar tira 15 s (mínimo 30), facilitar soma 15 s (máximo 150). */
export function adjustRestForDifficulty(restSeconds: number, difficulty: DifficultyPlan): number {
  if (difficulty === "harder") return Math.max(30, restSeconds - REST_STEP_SECONDS);
  if (difficulty === "easier") return Math.min(150, restSeconds + REST_STEP_SECONDS);
  return restSeconds;
}

/** Linhas do prompt da IA com a progressão decidida pelo app. */
export function buildProgressionPromptLines(plan: ProgressionPlan): string[] {
  const target = plan.targetDifficulty !== null ? plan.targetDifficulty.toFixed(1) : null;
  const previous = plan.previousDifficulty !== null ? plan.previousDifficulty.toFixed(1) : null;
  const ref = previous ? ` (programa anterior: dificuldade media ${previous}; campo "d" do catalogo, 1 a 5)` : ' (campo "d" do catalogo, 1 a 5)';
  const lines = ["", "PROGRESSAO DO PROGRAMA (decidida pelo app):"];
  if (plan.difficulty === "harder") {
    lines.push(`- O aluno achou o programa anterior facil e nao gostou: escolha exercicios MAIS DIFICEIS${ref}${target ? `, media perto de ${target}` : ""}.`);
  } else if (plan.difficulty === "easier") {
    lines.push(`- O aluno achou o programa anterior dificil e nao gostou: escolha exercicios MAIS ACESSIVEIS${ref}${target ? `, media perto de ${target}` : ""}.`);
  } else if (plan.difficulty === "keep") {
    lines.push(`- O aluno gostou da intensidade atual: mantenha a mesma faixa de dificuldade${ref}, trocando os exercicios.`);
  } else {
    lines.push(`- Progrida um pouco: alguns exercicios um degrau acima na dificuldade${ref}, o resto na mesma faixa.`);
  }
  lines.push("- Troque os exercicios: evite repetir os do programa anterior.");
  return lines;
}
