import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

// Lista as respostas do questionário de cancelamento para o admin
// (seção "Cancelamentos do Premium" no Dashboard), com nome e e-mail de quem respondeu.
export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Banco de dados indisponível.", 500);
    }

    const { data: rows, error } = await supabase
      .from("cancellation_feedbacks")
      .select("id, user_id, reason, comment, source, plan, cancelled_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      logError("ADMIN CANCELLATIONS", "Fetch failed", { error_message: error.message });
      return jsonError("Não foi possível carregar os cancelamentos.", 500);
    }

    // Nome e e-mail ficam na tabela users (a resposta aponta para auth.users,
    // por isso a busca é separada em vez de um join).
    const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)));
    const usersById = new Map<string, { name: string | null; email: string | null }>();

    if (userIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", userIds);
      for (const user of users ?? []) {
        usersById.set(user.id, { name: user.name ?? null, email: user.email ?? null });
      }
    }

    const data = (rows ?? []).map((row) => ({
      ...row,
      user_name: usersById.get(row.user_id)?.name ?? null,
      user_email: usersById.get(row.user_id)?.email ?? null,
    }));

    return jsonSuccess(data, 200);
  } catch (error) {
    logError("ADMIN CANCELLATIONS", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar os cancelamentos.", 500);
  }
}
