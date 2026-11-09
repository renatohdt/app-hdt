// MODELOS DE TREINO NO BANCO (tabela workout_models, montados pelo admin).
//
// Cada modelo traz TODOS os treinos do plano (A, B, C...). O app escolhe UM modelo
// por plano e usa os treinos dele — assim A e B saem sempre do mesmo modelo (ligados).
// Filtro: divisão, nível, estilo de cada treino, objetivo e tempo (vazio = qualquer tempo).
// Só modelos com status "ready" valem. Sem nenhum modelo pronto no banco, vale o piloto
// do código (lib/workout-templates.ts) como reserva.
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logWarn } from "@/lib/server-logger";
import type { SessionBlueprint, WorkoutStrategy } from "@/lib/workout-strategy";
import {
  selectSessionTemplates,
  type TemplateSlot,
  type TemplateSlotType,
  type WorkoutTemplate
} from "@/lib/workout-templates";

export type WorkoutModel = {
  id: string;
  code: string;
  name: string;
  splitType: string;
  level: string;
  trainingStyles: string[];
  goals: string[];
  durations: number[];
  days: Record<string, TemplateSlot[]>;
};

type WorkoutModelRow = {
  id: string;
  code: string;
  name: string;
  split_type: string;
  level: string;
  training_styles: string[] | null;
  goals: string[] | null;
  durations: number[] | null;
  days: unknown;
};

const CACHE_TTL_MS = 60_000;
let cache: { at: number; models: WorkoutModel[] } | null = null;

const SLOT_TYPES = new Set<TemplateSlotType>(["warmup", "compound", "isolation", "isometric", "cardio", "functional", "core"]);

function normalizeSlots(value: unknown): TemplateSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((slot): slot is TemplateSlot => Boolean(slot) && typeof slot === "object" && SLOT_TYPES.has((slot as TemplateSlot).type))
    .map((slot, index) => ({
      ...slot,
      n: typeof slot.n === "number" ? slot.n : index + 1,
      role: typeof slot.role === "string" ? slot.role : "",
      muscles: Array.isArray(slot.muscles) ? slot.muscles : []
    }))
    .sort((left, right) => left.n - right.n);
}

function toModel(row: WorkoutModelRow): WorkoutModel {
  const days: Record<string, TemplateSlot[]> = {};
  if (row.days && typeof row.days === "object") {
    for (const [day, slots] of Object.entries(row.days as Record<string, unknown>)) {
      const normalized = normalizeSlots(slots);
      if (normalized.length) days[day.toUpperCase()] = normalized;
    }
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    splitType: row.split_type,
    level: row.level,
    trainingStyles: row.training_styles ?? [],
    goals: row.goals ?? [],
    durations: row.durations ?? [],
    days
  };
}

/** Modelos prontos do banco (cache de 1 min). null = banco indisponível. */
export async function loadReadyWorkoutModels(): Promise<WorkoutModel[] | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workout_models")
    .select("id, code, name, split_type, level, training_styles, goals, durations, days")
    .eq("status", "ready");
  if (error) {
    logWarn("AI", "Falha ao ler modelos de treino do banco", { error: error.message });
    return null;
  }
  const models = ((data ?? []) as WorkoutModelRow[]).map(toModel);
  cache = { at: Date.now(), models };
  return models;
}

/** Modelos que servem para o plano inteiro (todos os treinos que a IA vai montar). */
export function findModelsForPlan(models: WorkoutModel[], strategy: WorkoutStrategy, sessions: SessionBlueprint[]) {
  return models.filter(
    (model) =>
      model.splitType === strategy.splitType &&
      model.level === strategy.level &&
      model.goals.includes(strategy.goalStyle) &&
      (model.durations.length === 0 || model.durations.includes(strategy.timeAvailable)) &&
      sessions.every(
        (session) =>
          Boolean(model.days[session.day]) &&
          model.trainingStyles.includes(session.trainingStyle ?? strategy.trainingStyle)
      )
  );
}

export function modelToSessionTemplates(model: WorkoutModel, sessions: SessionBlueprint[]) {
  const selected = new Map<string, WorkoutTemplate>();
  for (const session of sessions) {
    const slots = model.days[session.day];
    if (slots) selected.set(session.day, { id: `${model.code}-${session.day}`, label: model.name, slots });
  }
  return selected;
}

/**
 * Escolhe UM modelo para o plano e devolve os treinos dele por dia.
 * `pick` permite fixar a escolha (ex.: "não gostei" → próximo modelo); sem ele, sorteia.
 */
export async function selectPlanTemplates(
  strategy: WorkoutStrategy,
  sessions: SessionBlueprint[],
  pick: (options: WorkoutModel[]) => WorkoutModel = (options) => options[Math.floor(Math.random() * options.length)]
): Promise<Map<string, WorkoutTemplate>> {
  if (!sessions.length) return new Map();
  const models = await loadReadyWorkoutModels();
  // Banco indisponível ou ainda sem modelos prontos: vale o piloto do código.
  if (!models || models.length === 0) return selectSessionTemplates(strategy, sessions);
  const options = findModelsForPlan(models, strategy, sessions);
  if (!options.length) return new Map();
  return modelToSessionTemplates(pick(options), sessions);
}
