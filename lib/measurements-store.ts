import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateBodyFatNavy, leanMassPct, type Gender } from "@/lib/body-composition";
import type { QuizAnswers } from "@/lib/types";

// Acesso a tabela public.body_measurements (historico de medicoes corporais).
// Ver migration 20260813_body_measurements.sql.

export type MeasurementRow = {
  id: string;
  measured_at: string; // YYYY-MM-DD
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_pct: number | null;
  resting_hr: number | null;
  neck_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  forearm_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;
  notes: string | null;
  created_at: string;
};

// Campos numericos que o usuario preenche (todos opcionais).
export type MeasurementValues = {
  measured_at?: string;
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  lean_mass_pct?: number | null;
  resting_hr?: number | null;
  neck_cm?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  arm_cm?: number | null;
  forearm_cm?: number | null;
  thigh_cm?: number | null;
  calf_cm?: number | null;
  notes?: string | null;
};

const SELECT_COLUMNS =
  "id, measured_at, weight_kg, body_fat_pct, lean_mass_pct, resting_hr, neck_cm, chest_cm, waist_cm, hip_cm, arm_cm, forearm_cm, thigh_cm, calf_cm, notes, created_at";

/** Lista as medicoes do usuario, da mais antiga para a mais recente (bom para graficos). */
export async function listMeasurements(
  supabase: SupabaseClient,
  userId: string
): Promise<MeasurementRow[]> {
  const { data, error } = await supabase
    .from("body_measurements")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("measured_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as MeasurementRow[];
}

/** Medicao mais recente (por data de coleta). */
export async function getLatestMeasurement(
  supabase: SupabaseClient,
  userId: string
): Promise<MeasurementRow | null> {
  const { data, error } = await supabase
    .from("body_measurements")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as MeasurementRow;
}

export async function createMeasurement(
  supabase: SupabaseClient,
  userId: string,
  values: MeasurementValues
): Promise<{ data: MeasurementRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("body_measurements")
    .insert({ user_id: userId, ...values })
    .select(SELECT_COLUMNS)
    .single();

  return { data: (data as MeasurementRow) ?? null, error };
}

export async function updateMeasurement(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  values: MeasurementValues
): Promise<{ data: MeasurementRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("body_measurements")
    .update(values)
    .eq("id", id)
    .eq("user_id", userId)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  return { data: (data as MeasurementRow) ?? null, error };
}

export async function deleteMeasurement(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return { error };
}

/** Peso da medicao mais recente que tenha peso preenchido (para sincronizar o perfil). */
export async function getLatestRecordedWeight(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("body_measurements")
    .select("weight_kg, measured_at")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("measured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof data.weight_kg !== "number") return null;
  return data.weight_kg;
}

// ── Parsing / validação / derivação ─────────────────────────────────────────

// Faixas de validação por campo (coerentes com os CHECKs da migration).
const NUMERIC_FIELDS: Record<string, { min: number; max: number; integer?: boolean }> = {
  weight_kg: { min: 20, max: 500 },
  body_fat_pct: { min: 1, max: 75 },
  lean_mass_pct: { min: 1, max: 100 },
  resting_hr: { min: 30, max: 150, integer: true },
  neck_cm: { min: 15, max: 100 },
  chest_cm: { min: 30, max: 200 },
  waist_cm: { min: 30, max: 200 },
  hip_cm: { min: 30, max: 200 },
  arm_cm: { min: 10, max: 100 },
  forearm_cm: { min: 10, max: 100 },
  thigh_cm: { min: 20, max: 120 },
  calf_cm: { min: 15, max: 100 }
};

/**
 * Valida o corpo da requisição e monta os valores a salvar.
 * - Campos vazios viram null.
 * - % de gordura manual tem prioridade; senão, estima pelo US Navy.
 * - Massa magra deriva do % de gordura quando não informada.
 */
export function buildMeasurementValues(
  body: Record<string, unknown>,
  answers: Partial<QuizAnswers> | null
): { ok: true; data: MeasurementValues } | { ok: false; error: string } {
  const values: MeasurementValues = {};

  const measuredAt = parseDate(body.measured_at);
  if (body.measured_at != null && body.measured_at !== "" && !measuredAt) {
    return { ok: false, error: "Informe uma data de coleta válida." };
  }
  if (measuredAt) {
    values.measured_at = measuredAt;
  }

  for (const [field, range] of Object.entries(NUMERIC_FIELDS)) {
    const raw = body[field];
    if (raw == null || raw === "") {
      values[field as keyof MeasurementValues] = null as never;
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) {
      return { ok: false, error: `Valor fora do intervalo em "${field}".` };
    }
    values[field as keyof MeasurementValues] = (range.integer ? Math.round(parsed) : parsed) as never;
  }

  if (typeof body.notes === "string" && body.notes.trim()) {
    values.notes = body.notes.trim().slice(0, 500);
  } else {
    values.notes = null;
  }

  if (values.body_fat_pct == null) {
    const estimated = estimateBodyFatNavy({
      gender: (answers?.gender as Gender) ?? "male",
      heightCm: typeof answers?.height === "number" ? answers.height : Number(answers?.height) || null,
      neckCm: values.neck_cm ?? null,
      waistCm: values.waist_cm ?? null,
      hipCm: values.hip_cm ?? null
    });
    if (estimated != null) {
      values.body_fat_pct = estimated;
    }
  }

  if (values.lean_mass_pct == null && values.body_fat_pct != null) {
    values.lean_mass_pct = leanMassPct(values.body_fat_pct);
  }

  return { ok: true, data: values };
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (date.getTime() > today.getTime()) return null;
  return trimmed;
}
