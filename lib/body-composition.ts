// Estimativa de composicao corporal.
//
// Metodo US Navy (circunferencias) para estimar o percentual de gordura quando
// o usuario nao tem balanca de bioimpedancia. Todas as medidas em centimetros.
// Se o usuario ja informar o % de gordura manualmente, esse valor tem prioridade
// (a estimativa e apenas um fallback).
//
// Formulas (unidades metricas, log base 10):
//   Homens:   %G = 495 / (1.0324 - 0.19077*log10(cintura - pescoco) + 0.15456*log10(altura)) - 450
//   Mulheres: %G = 495 / (1.29579 - 0.35004*log10(cintura + quadril - pescoco) + 0.22100*log10(altura)) - 450
//
// IMPORTANTE: e uma estimativa, nao substitui avaliacao profissional.

export type Gender = "male" | "female";

export type NavyBodyFatInput = {
  gender: Gender;
  heightCm?: number | null;
  neckCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null; // obrigatorio apenas para mulheres
};

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Estima o % de gordura pelo metodo US Navy.
 * Retorna null quando faltam medidas ou os valores sao incoerentes
 * (ex.: cintura menor que o pescoco, que quebraria o logaritmo).
 */
export function estimateBodyFatNavy(input: NavyBodyFatInput): number | null {
  const { gender, heightCm, neckCm, waistCm, hipCm } = input;

  if (!isPositive(heightCm) || !isPositive(neckCm) || !isPositive(waistCm)) {
    return null;
  }

  let result: number;

  if (gender === "female") {
    if (!isPositive(hipCm)) return null;
    const sum = waistCm + hipCm - neckCm;
    if (sum <= 0) return null;
    result =
      495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
  } else {
    const diff = waistCm - neckCm;
    if (diff <= 0) return null;
    result =
      495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
  }

  if (!Number.isFinite(result) || result <= 0 || result > 75) {
    return null;
  }

  return Math.round(result * 10) / 10; // 1 casa decimal
}

/** Percentual de massa magra a partir do % de gordura. */
export function leanMassPct(bodyFatPct: number | null | undefined): number | null {
  if (typeof bodyFatPct !== "number" || !Number.isFinite(bodyFatPct)) return null;
  if (bodyFatPct < 0 || bodyFatPct > 100) return null;
  return Math.round((100 - bodyFatPct) * 10) / 10;
}

/** Massa de gordura (kg) a partir do peso e do % de gordura. */
export function fatMassKg(weightKg: number | null | undefined, bodyFatPct: number | null | undefined): number | null {
  if (!isPositive(weightKg) || typeof bodyFatPct !== "number" || !Number.isFinite(bodyFatPct)) return null;
  return Math.round(weightKg * (bodyFatPct / 100) * 10) / 10;
}

/** Massa magra (kg) a partir do peso e do % de gordura. */
export function leanMassKg(weightKg: number | null | undefined, bodyFatPct: number | null | undefined): number | null {
  if (!isPositive(weightKg) || typeof bodyFatPct !== "number" || !Number.isFinite(bodyFatPct)) return null;
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}
