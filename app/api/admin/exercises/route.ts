import { recordAdminAuditLog } from "@/lib/admin-audit";
import {
  buildExerciseSearchBlob,
  getPrimaryExerciseMuscle,
  normalizeExerciseMuscleGroups,
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
  level?: string[] | string;
  video_url?: string | null;
  videoUrl?: string | null;
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
    const search = normalizeSearchTerm(searchParams.get("search")?.trim() ?? "");
    const { data, error } = await supabase.from("exercises").select("*").order("name");

    if (error) {
      logError("ADMIN", "Exercises fetch failed", { error: error.message });
      return jsonError("Não foi possível carregar os exercícios.", 500);
    }

    const exercises = ((data ?? []) as ExerciseRecord[]).filter((exercise) =>
      search ? buildExerciseSearchBlob(exercise).includes(search) : true
    );

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
    const muscleGroups = normalizeExerciseMuscleGroups(body.muscle_groups ?? body.muscle_group ?? body.muscle);
    const primaryMuscle = muscleGroups[0] ?? null;
    const type = normalizeStoredExerciseType(body.type) ?? undefined;
    const location = normalizeArray(body.location);
    const equipment = normalizeArray(body.equipment);
    const level = normalizeArray(body.level);

    if (method === "PATCH" && !body.id) {
      return jsonError("Exercício inválido.", 400);
    }

    if (!body.name?.trim() || !muscleGroups.length || !type) {
      return jsonError("Preencha os campos obrigatórios: nome, grupo muscular e tipo.", 400);
    }

    const formattedData = removeUndefined({
      name: body.name.trim(),
      muscle: primaryMuscle,
      muscle_groups: muscleGroups,
      type,
      location,
      equipment,
      level,
      metadata: {
        muscle: primaryMuscle ?? "",
        muscle_groups: muscleGroups,
        muscles: muscleGroups,
        type,
        location: location ?? [],
        equipment: equipment ?? [],
        level: level ?? []
      },
      video_url: (body.video_url ?? body.videoUrl)?.trim() || null
    });

    let data: unknown = null;
    let error: { message: string } | null = null;

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
      logError("ADMIN", "Exercise save failed", { error: error.message });
      return jsonError("Não foi possível salvar o exercício.", 500);
    }

    const normalizedData = Array.isArray(data) ? data[0] ?? null : data;

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
        muscle: getPrimaryExerciseMuscle(normalizedData as ExerciseRecord | null)
      }
    });

    return jsonSuccess(normalizedData, 200);
  } catch (error) {
    logError("ADMIN", "Exercises save route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível salvar o exercício.", 500);
  }
}

function normalizeArray(value?: string[] | string | null) {
  if (Array.isArray(value)) {
    return value.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
  }

  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? [normalized] : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function normalizeSearchTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
