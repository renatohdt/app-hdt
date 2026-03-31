import { recordAdminAuditLog } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

type ExerciseRequestBody = {
  id?: string;
  name?: string;
  muscle?: string;
  muscle_group?: string;
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
    const search = searchParams.get("search")?.trim() ?? "";
    const query = supabase.from("exercises").select("*");
    const filteredQuery = search
      ? query.or(`name.ilike.%${search}%,muscle.ilike.%${search}%,type.ilike.%${search}%`)
      : query;

    const { data, error } = await filteredQuery.order("name");

    if (error) {
      logError("ADMIN", "Exercises fetch failed", { error: error.message });
      return jsonError("Não foi possível carregar os exercícios.", 500);
    }

    return jsonSuccess(data ?? [], 200);
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
      return jsonError("Exercicio invalido.", 400);
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

    if (method === "PATCH" && !body.id) {
      return jsonError("Exercicio invalido.", 400);
    }

    const formattedData = removeUndefined({
      name: body.name?.trim(),
      muscle: (body.muscle ?? body.muscle_group)?.trim(),
      type: body.type?.trim(),
      location: normalizeArray(body.location),
      equipment: normalizeArray(body.equipment),
      level: normalizeArray(body.level),
      video_url: (body.video_url ?? body.videoUrl)?.trim() || null
    });

    if (!formattedData.name || !formattedData.muscle || !formattedData.type) {
      return jsonError("Preencha os campos obrigatorios: nome, musculo e tipo.", 400);
    }

    let data: unknown = null;
    let error: { message: string } | null = null;

    if (method === "POST") {
      const result = await supabase.from("exercises").insert([formattedData]).select();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from("exercises")
        .update(formattedData)
        .eq("id", body.id as string)
        .select();

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
        name: formattedData.name
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
