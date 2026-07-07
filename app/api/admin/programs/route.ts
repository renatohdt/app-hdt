import { recordAdminAuditLog } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

type ProgramRequestBody = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string | null;
  goal?: string;
  level?: string;
  duration_weeks?: number;
  sessions_per_week?: number;
  fixed_profile?: Record<string, unknown>;
  content?: Record<string, unknown>;
  cover_image_url?: string | null;
  price_cents?: number;
  compare_at_cents?: number | null;
  stripe_price_id?: string | null;
  access_days?: number;
  status?: string;
};

type ProgramSaveError = {
  message: string;
  code?: string;
  details?: string | null;
};

export async function POST(request: Request) {
  return saveProgram(request, "POST");
}

export async function PATCH(request: Request) {
  return saveProgram(request, "PATCH");
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível carregar os programas.", 500);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        logError("ADMIN", "Program fetch by id failed", { error: error.message });
        return jsonError("Não foi possível carregar o programa.", 500);
      }

      if (!data) return jsonError("Programa não encontrado.", 404);
      return jsonSuccess(data, 200);
    }

    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logError("ADMIN", "Programs fetch failed", { error: error.message });
      return jsonError("Não foi possível carregar os programas.", 500);
    }

    return jsonSuccess(data ?? [], 200);
  } catch (error) {
    logError("ADMIN", "Programs GET failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar os programas.", 500);
  }
}

async function saveProgram(request: Request, method: "POST" | "PATCH") {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Não foi possível salvar o programa.", 500);
    }

    const body = (await request.json()) as ProgramRequestBody;

    if (method === "PATCH" && !body.id) {
      return jsonError("Programa inválido.", 400);
    }

    const validation = validateProgramBody(body, method);
    if (validation) return jsonError(validation, 400);

    const formattedData = buildProgramData(body, method);

    let data: unknown = null;
    let error: ProgramSaveError | null = null;

    if (method === "POST") {
      const result = await supabase.from("programs").insert([formattedData]).select();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from("programs")
        .update(formattedData)
        .eq("id", body.id as string)
        .select();
      data = result.data;
      error = result.error;
    }

    if (error) {
      if (isSlugConflict(error)) {
        return jsonError(
          "Já existe um programa com esse identificador (slug). Escolha outro.",
          409
        );
      }

      logError("ADMIN", "Program save failed", { error: error.message, code: error.code });
      return jsonError("Não foi possível salvar o programa.", 500);
    }

    const savedRow = Array.isArray(data) ? data[0] ?? null : data;
    const savedId =
      savedRow && typeof savedRow === "object" && "id" in savedRow
        ? String((savedRow as { id?: string }).id ?? body.id ?? "")
        : body.id ?? null;

    await recordAdminAuditLog({
      adminId: admin.user?.id ?? "unknown-admin",
      adminEmail: admin.user?.email ?? null,
      action: method === "POST" ? "program_created" : "program_updated",
      targetType: "program",
      targetId: savedId,
      metadata: {
        method,
        slug: formattedData.slug,
        status: formattedData.status,
      },
    });

    return jsonSuccess(savedRow, 200);
  } catch (error) {
    logError("ADMIN", "Programs save route failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível salvar o programa.", 500);
  }
}

function validateProgramBody(body: ProgramRequestBody, method: "POST" | "PATCH"): string | null {
  // No POST (criação) os campos essenciais são obrigatórios.
  if (method === "POST") {
    if (!body.slug || !body.slug.trim()) return "Informe o identificador (slug).";
    if (!body.title || !body.title.trim()) return "Informe o título do programa.";
    if (!body.goal || !body.goal.trim()) return "Informe o objetivo do programa.";
    if (!isPositiveInt(body.duration_weeks)) return "Duração (semanas) deve ser um número maior que zero.";
    if (!isPositiveInt(body.sessions_per_week)) return "Treinos por semana deve ser um número maior que zero.";
    if (!isNonNegativeInt(body.price_cents)) return "Preço (em centavos) inválido.";
  }

  // Validações que valem para POST e PATCH quando o campo é enviado.
  if (body.status !== undefined && body.status !== "draft" && body.status !== "published") {
    return "Status inválido (use 'draft' ou 'published').";
  }
  if (body.duration_weeks !== undefined && !isPositiveInt(body.duration_weeks)) {
    return "Duração (semanas) deve ser um número maior que zero.";
  }
  if (body.sessions_per_week !== undefined && !isPositiveInt(body.sessions_per_week)) {
    return "Treinos por semana deve ser um número maior que zero.";
  }
  if (body.access_days !== undefined && !isPositiveInt(body.access_days)) {
    return "Dias de acesso deve ser um número maior que zero.";
  }
  if (body.price_cents !== undefined && !isNonNegativeInt(body.price_cents)) {
    return "Preço (em centavos) inválido.";
  }
  if (body.fixed_profile !== undefined && !isPlainObject(body.fixed_profile)) {
    return "Perfil fixo inválido.";
  }
  if (body.content !== undefined && !isPlainObject(body.content)) {
    return "Conteúdo do programa inválido.";
  }

  return null;
}

function buildProgramData(body: ProgramRequestBody, method: "POST" | "PATCH") {
  // Monta apenas os campos enviados; no POST aplica defaults seguros.
  const data: Record<string, unknown> = {};

  if (body.slug !== undefined) data.slug = body.slug.trim();
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.goal !== undefined) data.goal = body.goal.trim();
  if (body.level !== undefined) data.level = body.level.trim();
  if (body.duration_weeks !== undefined) data.duration_weeks = body.duration_weeks;
  if (body.sessions_per_week !== undefined) data.sessions_per_week = body.sessions_per_week;
  if (body.fixed_profile !== undefined) data.fixed_profile = body.fixed_profile;
  if (body.content !== undefined) data.content = body.content;
  if (body.cover_image_url !== undefined) data.cover_image_url = body.cover_image_url?.trim() || null;
  if (body.price_cents !== undefined) data.price_cents = body.price_cents;
  if (body.compare_at_cents !== undefined) data.compare_at_cents = body.compare_at_cents;
  if (body.stripe_price_id !== undefined) data.stripe_price_id = body.stripe_price_id?.trim() || null;
  if (body.access_days !== undefined) data.access_days = body.access_days;
  if (body.status !== undefined) data.status = body.status;

  if (method === "POST") {
    if (data.level === undefined) data.level = "beginner";
    if (data.access_days === undefined) data.access_days = 90;
    if (data.status === undefined) data.status = "draft";
    if (data.fixed_profile === undefined) data.fixed_profile = {};
    if (data.content === undefined) data.content = { weeks: [] };
  }

  // updated_at sempre que salvar.
  data.updated_at = new Date().toISOString();

  return data;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlugConflict(error: ProgramSaveError) {
  if (error.code === "23505") return true;
  const fullMessage = `${error.message} ${error.details ?? ""}`.toLowerCase();
  return fullMessage.includes("slug");
}
