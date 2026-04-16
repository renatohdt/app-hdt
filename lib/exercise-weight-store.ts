import type { SupabaseClient } from "@supabase/supabase-js";

export type WeightSetEntry = {
  setNumber: number;
  weightKg: number;
  reps: string;
  completed: boolean;
};

export type ExerciseWeightLogRow = {
  id: string;
  user_id: string;
  exercise_name: string;
  exercise_name_normalized: string;
  workout_session_log_id: string | null;
  max_weight_kg: number;
  sets_data: WeightSetEntry[];
  workout_key: string | null;
  completed_at: string;
  created_at: string;
};

export type ExerciseWeightInput = {
  userId: string;
  exerciseName: string;
  exerciseNameNormalized: string;
  workoutSessionLogId: string | null;
  maxWeightKg: number;
  setsData: WeightSetEntry[];
  workoutKey: string | null;
  completedAt: string;
};

export function normalizeExerciseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function saveExerciseWeightLogs(
  supabase: SupabaseClient,
  entries: ExerciseWeightInput[]
) {
  if (!entries.length) return { error: null };

  const rows = entries.map((entry) => ({
    user_id: entry.userId,
    exercise_name: entry.exerciseName,
    exercise_name_normalized: entry.exerciseNameNormalized,
    workout_session_log_id: entry.workoutSessionLogId,
    max_weight_kg: entry.maxWeightKg,
    sets_data: entry.setsData,
    workout_key: entry.workoutKey,
    completed_at: entry.completedAt
  }));

  const { error } = await supabase.from("exercise_weight_logs").insert(rows);
  return { error };
}

export async function getLastWeightForExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseNameNormalized: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("exercise_weight_logs")
    .select("max_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_name_normalized", exerciseNameNormalized)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.max_weight_kg;
}

export async function getWeightHistoryForExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseNameNormalized: string,
  limit = 20
): Promise<{ date: string; maxWeightKg: number }[]> {
  const { data, error } = await supabase
    .from("exercise_weight_logs")
    .select("completed_at, max_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_name_normalized", exerciseNameNormalized)
    .order("completed_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    date: row.completed_at,
    maxWeightKg: row.max_weight_kg
  }));
}

export async function countWeightIncreases(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("exercise_weight_logs")
    .select("exercise_name_normalized, max_weight_kg, completed_at")
    .eq("user_id", userId)
    .order("exercise_name_normalized")
    .order("completed_at", { ascending: true });

  if (error || !data) return 0;

  let increases = 0;
  const lastMax: Record<string, number> = {};

  for (const row of data) {
    const key = row.exercise_name_normalized;
    if (key in lastMax && row.max_weight_kg > lastMax[key]) {
      increases++;
    }
    lastMax[key] = Math.max(lastMax[key] ?? 0, row.max_weight_kg);
  }

  return increases;
}
