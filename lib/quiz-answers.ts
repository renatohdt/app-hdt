import { QuizAnswers } from "@/lib/types";

const LEGACY_HEALTH_FIELDS = ["injuries", "pain", "limitations", "health_info"] as const;

export function stripLegacyQuizFields<T extends Record<string, unknown> | null | undefined>(answers: T) {
  if (!answers || typeof answers !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => !LEGACY_HEALTH_FIELDS.includes(key as (typeof LEGACY_HEALTH_FIELDS)[number]))
  ) as QuizAnswers;
}
