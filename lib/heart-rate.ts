// Zonas de frequencia cardiaca de treino.
//
// FC maxima pela formula de Tanaka (2001), mais precisa em faixas amplas de
// idade que a classica "220 - idade":
//   FCmax = 208 - 0.7 * idade
//
// Zona alvo pela formula de Karvonen (usa a FC de repouso -> mais individual):
//   FC alvo = FC_repouso + (FCmax - FC_repouso) * intensidade
//
// A diferenca (FCmax - FC_repouso) e a "reserva de frequencia cardiaca" (FCR).
//
// IMPORTANTE: estimativas para pessoas saudaveis. Nao substituem avaliacao
// medica. Medicacoes (ex.: betabloqueadores) e condicoes cardiacas alteram
// esses valores — nesses casos, orientar o usuario a seguir recomendacao medica.

export type HeartRateZone = {
  key: string;
  label: string;
  intensityLow: number; // 0..1
  intensityHigh: number; // 0..1
  bpmLow: number;
  bpmHigh: number;
};

/** FC maxima estimada pela formula de Tanaka. */
export function estimateMaxHeartRate(age: number | null | undefined): number | null {
  if (typeof age !== "number" || !Number.isFinite(age) || age <= 0 || age > 120) {
    return null;
  }
  return Math.round(208 - 0.7 * age);
}

/** FC alvo (Karvonen) para uma intensidade entre 0 e 1. */
export function karvonenTarget(maxHr: number, restingHr: number, intensity: number): number {
  const reserve = maxHr - restingHr;
  return Math.round(restingHr + reserve * intensity);
}

// Faixas de intensidade classicas (percentual da reserva de FC).
const ZONE_DEFS: Array<{ key: string; label: string; low: number; high: number }> = [
  { key: "recovery", label: "Recuperacao", low: 0.5, high: 0.6 },
  { key: "fat_burn", label: "Queima de gordura", low: 0.6, high: 0.7 },
  { key: "aerobic", label: "Aerobico", low: 0.7, high: 0.8 },
  { key: "anaerobic", label: "Anaerobico", low: 0.8, high: 0.9 },
  { key: "maximal", label: "Maximo", low: 0.9, high: 1.0 }
];

/**
 * Calcula as 5 zonas de treino pela formula de Karvonen.
 * Retorna null quando falta idade ou FC de repouso, ou quando os valores sao
 * incoerentes (ex.: FC de repouso >= FC maxima estimada).
 */
export function computeKarvonenZones(
  age: number | null | undefined,
  restingHr: number | null | undefined
): { maxHr: number; restingHr: number; reserve: number; zones: HeartRateZone[] } | null {
  const maxHr = estimateMaxHeartRate(age);
  if (maxHr == null) return null;
  if (typeof restingHr !== "number" || !Number.isFinite(restingHr) || restingHr < 30 || restingHr >= maxHr) {
    return null;
  }

  const zones: HeartRateZone[] = ZONE_DEFS.map((zone) => ({
    key: zone.key,
    label: zone.label,
    intensityLow: zone.low,
    intensityHigh: zone.high,
    bpmLow: karvonenTarget(maxHr, restingHr, zone.low),
    bpmHigh: karvonenTarget(maxHr, restingHr, zone.high)
  }));

  return { maxHr, restingHr, reserve: maxHr - restingHr, zones };
}
