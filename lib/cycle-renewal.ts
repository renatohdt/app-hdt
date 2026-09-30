// Renovação de ciclo (novo programa ao concluir o atual).
//
// Regra de negócio (REGRAS_DE_NEGOCIO.md → "Ciclo de um programa de treino"):
//  - Premium: renovação ilimitada — sempre pode montar o próximo programa.
//  - Free: até 2 programas no total (1 no cadastro + 1 após concluir o primeiro).
//    Ou seja, 1 renovação de ciclo. Ao concluir o 2º, exibe o upsell.
//
// O contador fica em `user_answers` (JSON) no campo `cycleRenewalsCount`,
// incrementado pelo POST /api/workout quando regenera um ciclo CONCLUÍDO.

export const FREE_MAX_CYCLE_RENEWALS = 1;

export const FREE_CYCLE_LIMIT_ERROR_CODE = "free_cycle_limit";

export function getCycleRenewalsUsed(savedAnswers: unknown): number {
  const raw = (savedAnswers as { cycleRenewalsCount?: unknown } | null | undefined)?.cycleRenewalsCount;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function hasFreeCycleRenewalAvailable(savedAnswers: unknown): boolean {
  return getCycleRenewalsUsed(savedAnswers) < FREE_MAX_CYCLE_RENEWALS;
}

// Já concluiu algum ciclo antes do atual? (registrado a partir da renovação de ciclo)
export function hasCompletedCycleBefore(savedAnswers: unknown): boolean {
  const answers = savedAnswers as { lastCycleCompletedAt?: unknown } | null | undefined;
  return getCycleRenewalsUsed(savedAnswers) > 0 || typeof answers?.lastCycleCompletedAt === "string";
}
