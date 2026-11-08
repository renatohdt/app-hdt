/**
 * Regras por gênero (decisão do Renato, 30/out/2026):
 * - Homem: sem exercício ISOLADO de glúteo, a menos que a ênfase escolhida seja "Pernas e Glúteo".
 * - Mulher: no máximo 1 isolador de bíceps OU tríceps por treino (somando os dois),
 *   a menos que a ênfase escolhida seja "Braços".
 * Compostos (ex.: supino fechado, elevação pélvica cadastrada como composto) não contam.
 * Aquecimento e mobilidade ficam fora da regra.
 */
import type { ExerciseRecord, FocusRegion, QuizAnswers } from "@/lib/types";
import { buildExerciseProfile } from "@/lib/workout-strategy";

export const FEMALE_MAX_ARM_ISOLATORS_PER_SESSION = 1;

export type GenderRules = {
  blockIsolatedGlutes: boolean;
  /** null = sem limite */
  maxArmIsolatorsPerSession: number | null;
};

const ARM_MUSCLES = new Set(["biceps", "triceps"]);

export function resolveGenderRules(answers: Pick<QuizAnswers, "gender" | "focusRegion" | "genderRuleFocus">): GenderRules {
  const focus: FocusRegion = answers.genderRuleFocus ?? answers.focusRegion ?? "balanced";
  return {
    blockIsolatedGlutes: answers.gender === "male" && focus !== "legs_glutes",
    maxArmIsolatorsPerSession: answers.gender === "female" && focus !== "arms" ? FEMALE_MAX_ARM_ISOLATORS_PER_SESSION : null
  };
}

type MovementInfo = { movementType?: string | null; primaryMuscles?: string[] | null };

function firstMuscle(info: MovementInfo) {
  return info.primaryMuscles?.[0] ?? "";
}

export function isIsolatedGluteInfo(info: MovementInfo) {
  return info.movementType === "isolation" && firstMuscle(info) === "glutes";
}

export function isArmIsolatorInfo(info: MovementInfo) {
  return info.movementType === "isolation" && ARM_MUSCLES.has(firstMuscle(info));
}

export function isIsolatedGluteExercise(exercise: ExerciseRecord) {
  return isIsolatedGluteInfo(buildExerciseProfile(exercise));
}

export function isArmIsolatorExercise(exercise: ExerciseRecord) {
  return isArmIsolatorInfo(buildExerciseProfile(exercise));
}

/** Exercício que nunca pode entrar no catálogo deste usuário. */
export function isBlockedByGenderRules(exercise: ExerciseRecord, rules: GenderRules) {
  return rules.blockIsolatedGlutes && isIsolatedGluteExercise(exercise);
}

/**
 * Aplica as regras numa sessão já montada: remove glúteo isolado (homem) e o
 * excesso de isoladores de braço (mulher), mantendo os primeiros na ordem do treino.
 */
export function enforceGenderRulesOnSession<T extends MovementInfo & { blockType?: string | null }>(
  exercises: T[],
  rules: GenderRules
): { kept: T[]; removed: T[] } {
  const kept: T[] = [];
  const removed: T[] = [];
  let armIsolators = 0;
  for (const exercise of exercises) {
    const isPrep = exercise.blockType === "warmup" || exercise.blockType === "mobility";
    if (!isPrep && rules.blockIsolatedGlutes && isIsolatedGluteInfo(exercise)) {
      removed.push(exercise);
      continue;
    }
    if (!isPrep && rules.maxArmIsolatorsPerSession !== null && isArmIsolatorInfo(exercise)) {
      if (armIsolators >= rules.maxArmIsolatorsPerSession) {
        removed.push(exercise);
        continue;
      }
      armIsolators += 1;
    }
    kept.push(exercise);
  }
  return { kept, removed };
}

/** Linha do prompt da IA (só quando alguma regra está ativa). */
export function buildGenderRulePromptLines(rules: GenderRules): string[] {
  const lines: string[] = [];
  if (rules.blockIsolatedGlutes) {
    lines.push("- Aluno homem: NAO use exercicio isolador de gluteo.");
  }
  if (rules.maxArmIsolatorsPerSession !== null) {
    lines.push(`- Aluna: no maximo ${rules.maxArmIsolatorsPerSession} isolador de biceps OU triceps por treino (somando os dois).`);
  }
  return lines.length ? ["", "REGRAS DO PERFIL:", ...lines] : [];
}

/** Treino Extra: o foco escolhido na hora libera a regra correspondente. */
export function focusRegionFromExtraFocus(label?: string | null): FocusRegion | undefined {
  const value = (label ?? "").trim().toLowerCase();
  if (value === "glúteos" || value === "gluteos") return "legs_glutes";
  if (value === "bíceps" || value === "biceps" || value === "tríceps" || value === "triceps") return "arms";
  return undefined;
}
