// Opções do cadastro de modelos de treino (admin e validação da API).
// Os códigos são os mesmos da estratégia do app; os rótulos são os da planilha do Renato.

export const MODEL_SPLITS = [
  { value: "full_body_single", label: "Full body único", days: ["A"] },
  { value: "full_body_repeated", label: "Full body repetido", days: ["A"] },
  { value: "full_body_ab", label: "Full body A/B", days: ["A", "B"] },
  { value: "full_body_emphasis", label: "Full body com ênfases", days: ["A", "B", "C"] },
  { value: "upper_lower_full", label: "Upper / Lower / Full", days: ["A", "B", "C"] },
  { value: "upper_lower", label: "Upper / Lower", days: ["A", "B"] },
  { value: "push_pull_legs_plus", label: "Push / Pull / Legs +", days: ["A", "B", "C"] },
  { value: "body_part_split", label: "Divisão por grupamentos", days: ["A", "B", "C", "D"] },
  { value: "focus_split", label: "Divisão com ênfase regional", days: ["A", "B", "C"] }
] as const;

export const MODEL_LEVELS = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" }
] as const;

export const MODEL_STYLES = [
  { value: "musculacao", label: "Musculação" },
  { value: "personal", label: "Personal escolhe" },
  { value: "funcional", label: "Funcional" },
  { value: "calistenia", label: "Calistenia" },
  { value: "hiit", label: "HIIT" }
] as const;

export const MODEL_GOALS = [
  { value: "hypertrophy", label: "Hipertrofia" },
  { value: "recomposition", label: "Definição" },
  { value: "fat_loss", label: "Emagrecimento" },
  { value: "conditioning", label: "Condicionamento" }
] as const;

export const MODEL_DURATIONS = [15, 30, 45, 60, 75, 90] as const;

export const MODEL_SLOT_TYPES = [
  { value: "warmup", label: "Aquecimento" },
  { value: "compound", label: "Composto" },
  { value: "isolation", label: "Isolador" },
  { value: "isometric", label: "Isométrico" },
  { value: "cardio", label: "Cardio" },
  { value: "functional", label: "Funcional" },
  { value: "core", label: "Qualquer tipo" }
] as const;

export const MODEL_TECHNIQUES = [
  { value: "drop-set", label: "Drop-set" },
  { value: "rest-pause", label: "Rest-pause" },
  { value: "cluster", label: "Cluster" },
  { value: "tempo_controlado", label: "Tempo controlado" },
  { value: "parciais", label: "Parciais" },
  { value: "pre-exaustao", label: "Pré-exaustão" },
  { value: "pos-exaustao", label: "Pós-exaustão" }
] as const;

/** Músculo da vaga. "Posterior ou glúteo" vira dois códigos. */
export const MODEL_MUSCLES = [
  { value: "chest", label: "Peito" },
  { value: "back", label: "Costas" },
  { value: "quadriceps", label: "Quadríceps" },
  { value: "hamstrings", label: "Posterior de coxa" },
  { value: "glutes", label: "Glúteo" },
  { value: "hamstrings,glutes", label: "Posterior ou glúteo" },
  { value: "shoulders", label: "Ombro" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "abs", label: "Abdômen" },
  { value: "calves", label: "Panturrilha" },
  { value: "tibialis", label: "Tibial" },
  { value: "hip_flexors", label: "Flexores de quadril" },
  { value: "forearms", label: "Antebraço" },
  { value: "lower_back", label: "Lombar" },
  { value: "abductors", label: "Abdutores" },
  { value: "adductors", label: "Adutores" }
] as const;

export const MODEL_MUSCLE_CODES = new Set(
  MODEL_MUSCLES.flatMap((muscle) => muscle.value.split(","))
);

export const MODEL_BLOCKS = ["B1", "B2", "B3", "B4", "B5"] as const;
export const MODEL_MAX_SLOTS = 10;
export const MODEL_DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function labelOf(list: readonly { value: string; label: string }[], value?: string | null) {
  return list.find((item) => item.value === value)?.label ?? value ?? "";
}

export function muscleLabel(muscles: string[]) {
  const key = muscles.join(",");
  return labelOf(MODEL_MUSCLES, key) || muscles.map((muscle) => labelOf(MODEL_MUSCLES, muscle)).join(" ou ");
}
