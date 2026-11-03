// Regras de EXERCÍCIOS COMBINADOS (método do Renato) — funções puras, sem rede nem banco.
//
// A IA escolhe os exercícios; este módulo decide QUEM combina com QUEM e QUANTO do
// treino é combinado. Mantém o padrão igual em todos os treinos do programa: a
// proporção depende só do perfil (nível, tempo, estilo), não do treino A ou B.
//
// Regras fixas de qualquer bloco:
//  - nunca máquina com máquina (exercícios vizinhos no bloco);
//  - mesmo nº de séries (o menor valor — aplicado por quem chama);
//  - descanso 0 s dentro do bloco, descanso normal no fim da rodada (idem);
//  - mobilidade e aquecimento ficam de fora; isometria PODE entrar;
//  - dois compostos podem combinar (prioridade: segmentos diferentes);
//  - tri-set: só avançado, 3 exercícios do MESMO músculo;
//  - circuito: 3 exercícios de músculos DIFERENTES, do intermediário em diante;
//  - treino funcional sempre tem exercícios combinados (mínimo 2 blocos).

import type { CombinedBlockType, TrainingStyle } from "@/lib/types";

export type CombineLevel = "beginner" | "intermediate" | "advanced";

export type CombinableExercise = {
  movementType: string;
  blockType?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  isMachine: boolean;
};

export type CombinePlanInput = {
  level: CombineLevel;
  style: TrainingStyle;
  availableMinutes: number;
  // "conditioning" (emagrecimento/condicionamento) favorece circuitos.
  goalStyle?: string | null;
};

export type CombinedGroup = {
  blockType: CombinedBlockType;
  /** Posições (na lista recebida) dos exercícios do bloco, na ordem de execução. */
  indexes: number[];
};

type CombinePolicy = {
  enabled: boolean;
  /** Mínimo de blocos no treino (funcional = 2). */
  minBlocks: number;
};

// Por estilo. Hoje todos combinam (pode ser ajustado aqui sem mexer no resto).
// Como cada treino do plano (premium multi-estilo) tem o seu estilo, um estilo
// pode ter blocos e o outro não.
const COMBINE_POLICY_BY_STYLE: Record<TrainingStyle, CombinePolicy> = {
  musculacao: { enabled: true, minBlocks: 0 },
  personal: { enabled: true, minBlocks: 0 },
  calistenia: { enabled: true, minBlocks: 0 },
  funcional: { enabled: true, minBlocks: 2 },
  // HIIT monta o próprio circuito (applyHiitFormat) — não passa por aqui.
  hiit: { enabled: false, minBlocks: 0 }
};

const UPPER = new Set(["chest", "back", "shoulders", "biceps", "triceps", "forearms"]);
const LOWER = new Set(["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "tibialis"]);
const CORE = new Set(["abs", "lower_back", "hip_flexors"]);
const PUSH = new Set(["chest", "shoulders", "triceps"]);
const PULL = new Set(["back", "biceps", "forearms"]);

// Blocos de coluna "não combináveis".
const EXCLUDED_BLOCK_TYPES = new Set(["warmup", "mobility", "drop-set", "rest-pause", "cluster", "parciais", "pre-exaustao", "pos-exaustao"]);

function primaryOf(exercise: CombinableExercise) {
  return exercise.primaryMuscles[0] ?? "";
}

function segmentOf(exercise: CombinableExercise): "upper" | "lower" | "core" | "other" {
  const muscle = primaryOf(exercise);
  if (UPPER.has(muscle)) return "upper";
  if (LOWER.has(muscle)) return "lower";
  if (CORE.has(muscle)) return "core";
  return "other";
}

export function isCombinable(exercise: CombinableExercise) {
  if (exercise.movementType === "mobility") return false;
  if (exercise.blockType && EXCLUDED_BLOCK_TYPES.has(exercise.blockType)) return false;
  return true;
}

function isAntagonist(a: CombinableExercise, b: CombinableExercise) {
  const pa = primaryOf(a);
  const pb = primaryOf(b);
  if ((PUSH.has(pa) && PULL.has(pb)) || (PULL.has(pa) && PUSH.has(pb))) return true;
  if ((pa === "quadriceps" && pb === "hamstrings") || (pa === "hamstrings" && pb === "quadriceps")) return true;
  if ((pa === "abs" && pb === "lower_back") || (pa === "lower_back" && pb === "abs")) return true;
  return false;
}

function isPrimarySecondary(a: CombinableExercise, b: CombinableExercise) {
  const pa = primaryOf(a);
  const pb = primaryOf(b);
  if (!pa || !pb || pa === pb) return false;
  return a.secondaryMuscles.includes(pb) || b.secondaryMuscles.includes(pa);
}

/** Pontuação do par A+B. 0 = proibido. */
function scorePair(a: CombinableExercise, b: CombinableExercise, level: CombineLevel) {
  // Regra fixa: nunca máquina com máquina.
  if (a.isMachine && b.isMachine) return 0;

  const sameMuscle = primaryOf(a) !== "" && primaryOf(a) === primaryOf(b);
  const segmentA = segmentOf(a);
  const segmentB = segmentOf(b);
  const differentSegment = segmentA !== segmentB || segmentA === "other";
  const bothCompound = a.movementType === "compound" && b.movementType === "compound";

  // Dois compostos: ok, de preferência em segmentos diferentes.
  if (bothCompound && !differentSegment && level !== "advanced") return 0;
  // Mesmo músculo (bi-set) só para avançado.
  if (sameMuscle) return level === "advanced" ? 4 : 0;

  if (level === "beginner") {
    // Alternado por segmento (não sobrecarrega músculo/articulação). Se o treino só tem
    // um segmento (ex.: só superiores), aceita agonista/antagonista (empurrar + puxar),
    // nunca dois compostos.
    if (!differentSegment) {
      if (bothCompound || !isAntagonist(a, b)) return 0;
      return 3;
    }
    let score = 5;
    if (segmentA === "core" || segmentB === "core") score += 1;
    if (a.movementType === "compound" || b.movementType === "compound") score += 1;
    return score;
  }

  let score = 1;
  if (isPrimarySecondary(a, b)) score = 7;
  else if (isAntagonist(a, b)) score = 6;
  else if (differentSegment) score = 4;
  if (bothCompound && differentSegment) score += 0; // permitido, sem bônus extra
  return score;
}

function countBlocksTarget(eligibleCount: number, input: CombinePlanInput, policy: CombinePolicy) {
  if (eligibleCount < 2) return { exercises: 0 };

  let exercises: number;
  if (input.level === "beginner") {
    const blocks = input.availableMinutes <= 35 ? 1 : 2;
    exercises = blocks * 2;
  } else {
    const fullWorkout = input.availableMinutes <= 30;
    const share = fullWorkout ? 1 : input.level === "advanced" ? 0.85 : 0.6;
    exercises = Math.round(eligibleCount * share);
  }

  // Funcional: sempre combinado, no mínimo 2 blocos.
  exercises = Math.max(exercises, policy.minBlocks * 2);
  return { exercises: Math.min(exercises, eligibleCount) };
}

/**
 * Decide os blocos combinados do treino. `exercises` já vem na ordem de execução
 * (aquecimento primeiro). Devolve só os blocos; quem não entrou em nenhum fica isolado.
 */
export function planCombinedGroups(exercises: CombinableExercise[], input: CombinePlanInput): CombinedGroup[] {
  const policy = COMBINE_POLICY_BY_STYLE[input.style] ?? COMBINE_POLICY_BY_STYLE.musculacao;
  if (!policy.enabled) return [];

  const eligibleIdx = exercises.map((exercise, index) => (isCombinable(exercise) ? index : -1)).filter((i) => i >= 0);
  const target = countBlocksTarget(eligibleIdx.length, input, policy).exercises;
  if (target < 2) return [];

  const used = new Set<number>();
  const groups: CombinedGroup[] = [];
  let covered = 0;
  const free = () => eligibleIdx.filter((i) => !used.has(i));

  const takeGroup = (blockType: CombinedBlockType, indexes: number[]) => {
    indexes.forEach((i) => used.add(i));
    groups.push({ blockType, indexes });
    covered += indexes.length;
  };

  // 1) Circuito (3 músculos diferentes): intermediário+ em funcional/condicionamento.
  const circuitFriendly = input.style === "funcional" || input.goalStyle === "conditioning";
  if (circuitFriendly && input.level !== "beginner") {
    while (covered + 3 <= target) {
      const circuit = pickCircuit(exercises, free());
      if (!circuit) break;
      takeGroup("circuit", circuit);
    }
  }

  // 2) Tri-set (3 do MESMO músculo): só avançado, no máximo 1 por treino.
  if (input.level === "advanced" && !circuitFriendly && covered + 3 <= target) {
    const tri = pickTriSet(exercises, free());
    if (tri) takeGroup("tri-set", tri);
  }

  // 3) Pares: percorre na ordem; cada exercício leva o melhor parceiro que vem depois.
  for (const a of free()) {
    if (covered >= target) break;
    if (used.has(a)) continue;
    let best: { index: number; score: number } | null = null;
    for (const b of eligibleIdx) {
      if (b <= a || used.has(b)) continue;
      const score = scorePair(exercises[a], exercises[b], input.level);
      if (score <= 0) continue;
      // empate: o mais próximo na lista ganha (mantém a ordem do treino).
      if (!best || score > best.score) best = { index: b, score };
    }
    if (!best) continue;
    const sameMuscle = primaryOf(exercises[a]) === primaryOf(exercises[best.index]);
    takeGroup(sameMuscle ? "bi-set" : "superset", [a, best.index]);
  }

  // Funcional exige no mínimo `minBlocks` blocos: se faltou, tenta de novo sem o limite de cobertura.
  if (groups.length < policy.minBlocks) {
    for (const a of free()) {
      if (groups.length >= policy.minBlocks) break;
      if (used.has(a)) continue;
      let best: { index: number; score: number } | null = null;
      for (const b of eligibleIdx) {
        if (b <= a || used.has(b)) continue;
        const score = scorePair(exercises[a], exercises[b], input.level);
        if (score > 0 && (!best || score > best.score)) best = { index: b, score };
      }
      if (best) takeGroup(primaryOf(exercises[a]) === primaryOf(exercises[best.index]) ? "bi-set" : "superset", [a, best.index]);
    }
  }

  return groups.sort((left, right) => left.indexes[0] - right.indexes[0]);
}

function hasMachineConflict(items: CombinableExercise[]) {
  return items.filter((item) => item.isMachine).length > 1;
}

function pickCircuit(exercises: CombinableExercise[], candidates: number[]): number[] | null {
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      for (let k = j + 1; k < candidates.length; k += 1) {
        const trio = [candidates[i], candidates[j], candidates[k]];
        const items = trio.map((index) => exercises[index]);
        const muscles = new Set(items.map(primaryOf));
        if (muscles.size < 3 || muscles.has("")) continue;
        if (hasMachineConflict(items)) continue;
        return trio;
      }
    }
  }
  return null;
}

function pickTriSet(exercises: CombinableExercise[], candidates: number[]): number[] | null {
  const byMuscle = new Map<string, number[]>();
  candidates.forEach((index) => {
    const muscle = primaryOf(exercises[index]);
    if (!muscle) return;
    byMuscle.set(muscle, [...(byMuscle.get(muscle) ?? []), index]);
  });

  for (const indexes of byMuscle.values()) {
    if (indexes.length < 3) continue;
    for (let i = 0; i + 2 < indexes.length; i += 1) {
      const trio = [indexes[i], indexes[i + 1], indexes[i + 2]];
      if (!hasMachineConflict(trio.map((index) => exercises[index]))) return trio;
    }
  }
  return null;
}
