// Admin: modelos de treino (tabela workout_models). Listar, criar, editar e excluir.
import { recordAdminAuditLog } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import {
  MODEL_BLOCKS,
  MODEL_DAY_LETTERS,
  MODEL_DURATIONS,
  MODEL_GOALS,
  MODEL_LEVELS,
  MODEL_MAX_SLOTS,
  MODEL_MUSCLE_CODES,
  MODEL_SLOT_TYPES,
  MODEL_SPLITS,
  MODEL_STYLES,
  MODEL_TECHNIQUES
} from "@/lib/workout-model-options";
import type { TemplateSlot } from "@/lib/workout-templates";

export const dynamic = "force-dynamic";

const SELECT = "id, code, name, split_type, level, training_styles, goals, durations, days, status, notes, created_at, updated_at";

type ModelBody = {
  id?: string;
  code?: string;
  name?: string;
  split_type?: string;
  level?: string;
  training_styles?: string[];
  goals?: string[];
  durations?: number[];
  days?: Record<string, unknown>;
  status?: string;
  notes?: string | null;
};

const values = (list: readonly { value: string }[]) => new Set(list.map((item) => item.value));
const SPLITS = values(MODEL_SPLITS);
const LEVELS = values(MODEL_LEVELS);
const STYLES = values(MODEL_STYLES);
const GOALS = values(MODEL_GOALS);
const SLOT_TYPES = values(MODEL_SLOT_TYPES);
const TECHNIQUES = values(MODEL_TECHNIQUES);
const BLOCKS = new Set<string>(MODEL_BLOCKS);
const DAYS = new Set<string>(MODEL_DAY_LETTERS);
const DURATIONS = new Set<number>(MODEL_DURATIONS);

function cleanMuscles(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((m): m is string => typeof m === "string" && MODEL_MUSCLE_CODES.has(m)))] : [];
}

/** Valida e limpa o modelo. Devolve a mensagem de erro (em português) ou os dados prontos. */
function validateModel(body: ModelBody): { error: string } | { data: Record<string, unknown> } {
  const code = (body.code ?? "").trim().toUpperCase();
  const name = (body.name ?? "").trim();
  if (!code) return { error: "Informe o código do modelo (ex.: FBAB-1)." };
  if (!/^[A-Z0-9-]{2,30}$/.test(code)) return { error: "Código só pode ter letras, números e hífen (até 30)." };
  if (!name) return { error: "Informe o nome do modelo." };
  if (!body.split_type || !SPLITS.has(body.split_type)) return { error: "Escolha a divisão." };
  if (!body.level || !LEVELS.has(body.level)) return { error: "Escolha o nível." };
  const styles = (body.training_styles ?? []).filter((style) => STYLES.has(style));
  if (!styles.length) return { error: "Marque pelo menos um estilo." };
  const goals = (body.goals ?? []).filter((goal) => GOALS.has(goal));
  if (!goals.length) return { error: "Marque pelo menos um objetivo." };
  const durations = [...new Set((body.durations ?? []).map(Number).filter((minutes) => DURATIONS.has(minutes)))].sort((a, b) => a - b);
  const status = body.status === "ready" ? "ready" : "draft";

  const days: Record<string, TemplateSlot[]> = {};
  for (const [rawDay, rawSlots] of Object.entries(body.days ?? {})) {
    const day = rawDay.toUpperCase();
    if (!DAYS.has(day)) return { error: `Treino "${rawDay}" inválido.` };
    if (!Array.isArray(rawSlots)) continue;
    if (rawSlots.length > MODEL_MAX_SLOTS) return { error: `Treino ${day}: máximo de ${MODEL_MAX_SLOTS} vagas.` };
    const slots: TemplateSlot[] = [];
    for (const [index, raw] of rawSlots.entries()) {
      const slot = (raw ?? {}) as Record<string, unknown>;
      const label = `Treino ${day}, vaga ${index + 1}`;
      const type = String(slot.type ?? "");
      if (!SLOT_TYPES.has(type)) return { error: `${label}: escolha o tipo.` };
      const muscles = type === "warmup" ? [] : cleanMuscles(slot.muscles);
      if (type !== "warmup" && !muscles.length) return { error: `${label}: escolha o músculo.` };
      const clean: TemplateSlot = {
        n: index + 1,
        role: String(slot.role ?? "").trim() || (type === "warmup" ? "Aquecimento" : ""),
        muscles,
        type: type as TemplateSlot["type"]
      };
      if (!clean.role) return { error: `${label}: escreva o papel do exercício.` };
      if (typeof slot.block === "string" && BLOCKS.has(slot.block) && type !== "warmup") clean.block = slot.block;
      const cut = Number(slot.cut);
      if (Number.isInteger(cut) && cut >= 1 && cut <= MODEL_MAX_SLOTS) clean.cut = cut;
      if (typeof slot.technique === "string" && TECHNIQUES.has(slot.technique)) {
        clean.technique = slot.technique as TemplateSlot["technique"];
      }
      if (Array.isArray(slot.alsoAccept)) {
        const alsoAccept = slot.alsoAccept
          .map((extra) => {
            const item = (extra ?? {}) as Record<string, unknown>;
            const extraType = typeof item.type === "string" && SLOT_TYPES.has(item.type) && item.type !== "warmup" ? item.type : undefined;
            const extraMuscles = cleanMuscles(item.muscles);
            if (!extraType && !extraMuscles.length) return null;
            return {
              ...(extraType ? { type: extraType as TemplateSlot["type"] } : {}),
              ...(extraMuscles.length ? { muscles: extraMuscles } : {})
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        if (alsoAccept.length && type !== "warmup") clean.alsoAccept = alsoAccept;
      }
      slots.push(clean);
    }
    if (slots.length) days[day] = slots;
  }

  // Bloco combinado precisa de pelo menos 2 exercícios.
  for (const [day, slots] of Object.entries(days)) {
    const counts = new Map<string, number>();
    slots.forEach((slot) => slot.block && counts.set(slot.block, (counts.get(slot.block) ?? 0) + 1));
    const lonely = [...counts].find(([, count]) => count < 2);
    if (lonely) return { error: `Treino ${day}: o bloco ${lonely[0]} tem só 1 exercício. Combine com outro ou tire o bloco.` };
  }

  if (status === "ready") {
    const required = MODEL_SPLITS.find((split) => split.value === body.split_type)?.days ?? [];
    const missing = required.filter((day) => !days[day]);
    if (!Object.keys(days).length) return { error: "Para marcar como Pronto, monte pelo menos um treino." };
    if (missing.length) return { error: `Para marcar como Pronto, falta montar: Treino ${missing.join(", ")}.` };
  }

  return {
    data: {
      code,
      name,
      split_type: body.split_type,
      level: body.level,
      training_styles: styles,
      goals,
      durations,
      days,
      status,
      notes: (body.notes ?? "").trim() || null
    }
  };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;
    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Não foi possível carregar os modelos.", 500);
    const { data, error } = await supabase.from("workout_models").select(SELECT).order("code");
    if (error) {
      logError("ADMIN", "Workout models fetch failed", { error: error.message });
      return jsonError("Não foi possível carregar os modelos.", 500);
    }
    return jsonSuccess(data ?? [], 200);
  } catch (error) {
    logError("ADMIN", "Workout models GET failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Não foi possível carregar os modelos.", 500);
  }
}

export async function POST(request: Request) {
  return saveModel(request, "POST");
}

export async function PATCH(request: Request) {
  return saveModel(request, "PATCH");
}

async function saveModel(request: Request, method: "POST" | "PATCH") {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;
    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Não foi possível salvar o modelo.", 500);

    const body = (await request.json()) as ModelBody;
    if (method === "PATCH" && !body.id) return jsonError("Modelo inválido.", 400);
    const result = validateModel(body);
    if ("error" in result) return jsonError(result.error, 400);

    const query =
      method === "POST"
        ? supabase.from("workout_models").insert(result.data)
        : supabase.from("workout_models").update({ ...result.data, updated_at: new Date().toISOString() }).eq("id", body.id as string);
    const { data, error } = await query.select(SELECT).single();

    if (error) {
      if (error.code === "23505") return jsonError("Já existe um modelo com esse código.", 409);
      logError("ADMIN", "Workout model save failed", { error: error.message, method });
      return jsonError("Não foi possível salvar o modelo.", 500);
    }

    await recordAdminAuditLog({
      adminId: admin.user?.id ?? "unknown-admin",
      adminEmail: admin.user?.email ?? null,
      action: method === "POST" ? "workout_model_created" : "workout_model_updated",
      targetType: "workout_model",
      targetId: data.id,
      metadata: { code: data.code, status: data.status }
    });

    return jsonSuccess(data, method === "POST" ? 201 : 200);
  } catch (error) {
    logError("ADMIN", "Workout model save failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Não foi possível salvar o modelo.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;
    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Não foi possível excluir o modelo.", 500);
    const body = (await request.json()) as { id?: string };
    if (!body.id) return jsonError("Modelo inválido.", 400);
    const { error } = await supabase.from("workout_models").delete().eq("id", body.id);
    if (error) {
      logError("ADMIN", "Workout model delete failed", { error: error.message });
      return jsonError("Não foi possível excluir o modelo.", 500);
    }
    await recordAdminAuditLog({
      adminId: admin.user?.id ?? "unknown-admin",
      adminEmail: admin.user?.email ?? null,
      action: "workout_model_deleted",
      targetType: "workout_model",
      targetId: body.id,
      metadata: {}
    });
    return jsonSuccess({ id: body.id }, 200);
  } catch (error) {
    logError("ADMIN", "Workout model DELETE failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Não foi possível excluir o modelo.", 500);
  }
}
