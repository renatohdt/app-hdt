import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request, "ADMIN_PUSH_STATS");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { count, error } = await supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true });

    if (error) {
      logError("ADMIN_PUSH_STATS", "Erro ao contar subscriptions", { error: error.message });
      return jsonError("Erro ao buscar dados.", 500);
    }

    return jsonSuccess({ total: count ?? 0 });
  } catch (error) {
    logError("ADMIN_PUSH_STATS", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
