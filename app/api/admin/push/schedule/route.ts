import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";
import type { PushAudience } from "@/lib/push-dispatch";

export const dynamic = "force-dynamic";

type ScheduleBody = {
  title: string;
  body: string;
  url?: string;
  audience: PushAudience;
  scheduledFor: string; // ISO
};

// GET: lista os agendamentos (pendentes + últimos enviados).
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request, "ADMIN_PUSH");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { data, error } = await supabase
      .from("scheduled_notifications")
      .select("*")
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (error) {
      logError("ADMIN_PUSH_SCHEDULE", "Erro ao listar", { error: error.message });
      return jsonError("Erro ao listar agendamentos.", 500);
    }

    return jsonSuccess({ items: data ?? [] });
  } catch (error) {
    logError("ADMIN_PUSH_SCHEDULE", "Erro inesperado (GET)", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}

// POST: cria um novo agendamento.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request, "ADMIN_PUSH");
    if (admin.response) return admin.response;

    const body = (await request.json()) as ScheduleBody;

    if (!body?.title?.trim() || !body?.body?.trim()) {
      return jsonError("Título e mensagem são obrigatórios.", 400);
    }
    if (!["all", "premium", "inactive"].includes(body.audience)) {
      return jsonError("Audiência inválida.", 400);
    }
    const when = new Date(body.scheduledFor);
    if (isNaN(when.getTime())) {
      return jsonError("Data/hora inválida.", 400);
    }
    if (when.getTime() < Date.now() - 60 * 1000) {
      return jsonError("A data/hora precisa ser no futuro.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { data, error } = await supabase
      .from("scheduled_notifications")
      .insert({
        title: body.title.trim(),
        body: body.body.trim(),
        url: body.url?.trim() || "/dashboard",
        audience: body.audience,
        scheduled_for: when.toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      logError("ADMIN_PUSH_SCHEDULE", "Erro ao agendar", { error: error.message });
      return jsonError("Não foi possível agendar.", 500);
    }

    return jsonSuccess({ item: data });
  } catch (error) {
    logError("ADMIN_PUSH_SCHEDULE", "Erro inesperado (POST)", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}

// DELETE: cancela um agendamento pendente (?id=...).
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request, "ADMIN_PUSH");
    if (admin.response) return admin.response;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id é obrigatório.", 400);

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { error } = await supabase
      .from("scheduled_notifications")
      .update({ status: "canceled" })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      logError("ADMIN_PUSH_SCHEDULE", "Erro ao cancelar", { error: error.message });
      return jsonError("Não foi possível cancelar.", 500);
    }

    return jsonSuccess({ canceled: true });
  } catch (error) {
    logError("ADMIN_PUSH_SCHEDULE", "Erro inesperado (DELETE)", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
