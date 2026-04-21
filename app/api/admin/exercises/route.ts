import { recordAdminAuditLog } from "@/lib/admin-audit";
import {
  buildExerciseSearchBlob,
  getExerciseEquipment,
  getExerciseLevels,
  getExerciseMuscleGroups,
  getPrimaryExerciseMuscle,
  normalizeExerciseCatalogText,
  normalizeExerciseEquipment,
  normalizeExerciseEquipmentList,
  normalizeExerciseLocations,
  normalizeExerciseLevel,
  normalizeExerciseMuscleGroup,
  normalizeExerciseMuscleGroups,
  normalizeExerciseName,
  normalizeExerciseRecord,
  normalizeStoredExerciseType
} from "@/lib/exercise-library";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import type { ExerciseRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type ExerciseRequestBody = {
  id?: string;
  name?: string;
  muscle?: string;
  muscle_group?: string[] | string;
  muscle_groups?: string[] | string;
  type?: string;
  location?: string[] | string;
  equipment?: string[] | string;
  required_equipment?: string[] | string;
  level?: string[] | string;
  video_url?: string | null;
  videoUrl?: string | null;
};

type ExerciseNameLookupRow = Pick<ExerciseRecord, "id" | "name">;

type ExerciseSaveError = {
  message: string;
  code?: string;
  details?: string | null;
};

export async function POST(request: Request) {
  return saveExercise(request, "POST");
}

export async function PATCH(request: Request) {
  return saveExercise(request, "PATCH");
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível carregar os exercícios.", 500);
    }

    const { searchParams } = new URL(request.url);
    const search = normalizeExerciseCatalogText(searchParams.get("search") ?? "");
    const muscleGroup = normalizeExerciseMuscleGroup(searchParams.get("muscle_group"));
    const level = normalizeExerciseLevel(searchParams.get("level"));
    const equipment = normalizeExerciseEquipment(searchParams.get("equipment"));
    const { data, error } = await supabase.from("exercises").select("*").order("name");

    if (error) {
      logError("ADMIN", "Exercises fetch failed", { error: error.message });
      return jsonError("Não foi possível carregar os exercícios.", 500);
    }

    const exercises = ((data ?? []) as ExerciseRecord[])
      .map((exercise) => normalizeExerciseRecord(exercise))
      .filter((exercise) => {
      if (search && !buildExerciseSearchBlob(exercise).includes(search)) {
        return false;
      }

      if (muscleGroup && !getExerciseMuscleGroups(exercise).includes(muscleGroup)) {
        return false;
      }

      if (level && !getExerciseLevels(exercise).includes(level)) {
        return false;
      }

      if (equipment && !getExerciseEquipment(exercise).includes(equipment)) {
        return false;
      }

      return true;
      });

    return jsonSuccess(exercises, 200);
  } catch (error) {
    logError("ADMIN", "Exercises GET failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar os exercícios.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível deletar o exercício.", 500);
    }

    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      return jsonError("Exercício inválido.", 400);
    }

    const { error } = await supabase.from("exercises").delete().eq("id", body.id);

    if (error) {
      logError("ADMIN", "Exercise delete failed", { error: error.message });
      return jsonError("Não foi possível deletar o exercício.", 500);
    }

    await recordAdminAuditLog({
      adminId: admin.user?.id ?? "unknown-admin",
      adminEmail: admin.user?.email ?? null,
      action: "exercise_deleted",
      targetType: "exercise",
      targetId: body.id,
      metadata: {}
    });

    return jsonSuccess({ id: body.id }, 200);
  } catch (error) {
    logError("ADMIN", "Exercises DELETE failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível deletar o exercício.", 500);
  }
}

async function saveExercise(request: Request, method: "POST" | "PATCH") {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível salvar o exercício.", 500);
    }

    const body = (await request.json()) as ExerciseRequestBody;
    const name = sanitizeExerciseName(body.name);
    const normalizedName = normalizeExerciseName(name);
    const muscleGroups = normalizeExerciseMuscleGroups(body.muscle_groups ?? body.muscle_group ?? body.muscle);
    const primaryMuscle = muscleGroups[0] ?? null;
    const type = normalizeStoredExerciseType(body.type) ?? undefined;
    const location = normalizeExerciseLocations(body.location);
    const equipment = normalizeExerciseEquipmentList(body.equipment);
    const required_equipment = normalizeExerciseEquipmentList(body.required_equipment);
    const level = normalizeExerciseLevelList(body.level);

    if (method === "PATCH" && !body.id) {
      return jsonError("Exercício inválido.", 400);
    }

    if (!name || !normalizedName || !muscleGroups.length || !type) {
      return jsonError("Preencha os campos obrigatórios: nome, grupo muscular e tipo.", 400);
    }

    const duplicateCheck = await supabase.from("exercises").select("id, name").order("name");

    if (duplicateCheck.error) {
      logError("ADMIN", "Exercise duplicate check failed", { error: duplicateCheck.error.message });
      return jsonError("Não foi possível validar o nome do exercício.", 500);
    }

    const duplicateExercise = ((duplicateCheck.data ?? []) as ExerciseNameLookupRow[]).find(
      (exercise) => exercise.id !== body.id && normalizeExerciseName(exercise.name) === normalizedName
    );

    if (duplicateExercise) {
      return jsonError(
        `Já existe um exercício com esse nome: "${duplicateExercise.name}". Edite o cadastro existente para evitar duplicidade.`,
        409
      );
    }

    const formattedData = removeUndefined({
      name,
      name_normalized: normalizedName,
      muscle: primaryMuscle,
      muscle_groups: muscleGroups,
      type,
      location,
      equipment,
      required_equipment,
      level,
      metadata: {
        muscle: primaryMuscle ?? "",
        muscle_groups: muscleGroups,
        muscles: muscleGroups,
        type,
        location: location ?? [],
        equipment: equipment ?? [],
        required_equipment: required_equipment ?? [],
        level: level ?? []
      },
      video_url: (body.video_url ?? body.videoUrl)?.trim() || null
    });

    let data: unknown = null;
    let error: ExerciseSaveError | null = null;

    if (method === "POST") {
      const result = await supabase.from("exercises").insert([formattedData]).select();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase.from("exercises").update(formattedData).eq("id", body.id as string).select();
      data = result.data;
      error = result.error;
    }

    if (error) {
      if (isExerciseNameConflict(error)) {
        return jsonError(
          "Já existe um exercício com esse nome. Ajuste o cadastro existente em vez de criar um duplicado.",
          409
        );
      }

      logError("ADMIN", "Exercise save failed", { error: error.message, code: error.code });
      return jsonError("Não foi possível salvar o exercício.", 500);
    }

    const normalizedData = Array.isArray(data) ? data[0] ?? null : data;
    const normalizedExercise =
      normalizedData && typeof normalizedData === "object"
        ? normalizeExerciseRecord(normalizedData as ExerciseRecord)
        : normalizedData;

    await recordAdminAuditLog({
      adminId: admin.user?.id ?? "unknown-admin",
      adminEmail: admin.user?.email ?? null,
      action: method === "POST" ? "exercise_created" : "exercise_updated",
      targetType: "exercise",
      targetId:
        typeof normalizedData === "object" && normalizedData && "id" in normalizedData
          ? String((normalizedData as { id?: string }).id ?? body.id ?? "")
          : body.id ?? null,
      metadata: {
        method,
        name: formattedData.name,
        muscle: getPrimaryExerciseMuscle(normalizedExercise as ExerciseRecord | null)
      }
    });

    return jsonSuccess(normalizedExercise, 200);
  } catch (error) {
    logError("ADMIN", "Exercises save route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível salvar o exercício.", 500);
  }
}

function sanitizeExerciseName(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeExerciseLevelList(value?: string[] | string | null) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeExerciseLevel(item)).filter(Boolean))) as string[];
  }

  const normalized = normalizeExerciseLevel(value);
  return normalized ? [normalized] : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isExerciseNameConflict(error: ExerciseSaveError) {
  if (error.code === "23505") {
    return true;
  }

  const fullMessage = `${error.message} ${error.details ?? ""}`.toLowerCase();
  return fullMessage.includes("name_normalized");
}
