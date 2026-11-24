import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Banco de dados indisponível.", 500);
    }

    const url = new URL(request.url);
    const ratingFilter = url.searchParams.get("rating");

    let query = supabase
      .from("user_feedbacks")
      .select("id, user_id, rating, improvement_reason, comment, page_count_at_trigger, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    // Filtro por nota (ex: ?rating=1,2,3 para feedbacks negativos)
    if (ratingFilter) {
      const ratings = ratingFilter
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
      if (ratings.length) {
        query = query.in("rating", ratings);
      }
    }

    const { data, error } = await query;

    if (error) {
      logError("ADMIN FEEDBACKS", "Fetch failed", { error_message: error.message });
      return jsonError("Não foi possível carregar os feedbacks.", 500);
    }

    const rows = data ?? [];

    // Primeiro nome de cada autor (para exibir/compartilhar o comentário)
    const userIds = Array.from(new Set(rows.map((row) => row.user_id as string).filter(Boolean)));
    const firstNameById = new Map<string, string>();
    if (userIds.length) {
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, name")
        .in("id", userIds);
      if (usersError) {
        logError("ADMIN FEEDBACKS", "Users fetch failed", { error_message: usersError.message });
      }
      for (const user of usersData ?? []) {
        const raw = typeof user.name === "string" ? user.name.trim() : "";
        const first = raw.split(/\s+/)[0] ?? "";
        if (first) {
          // "MARIA" ou "maria" vira "Maria"
          firstNameById.set(
            user.id as string,
            first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR")
          );
        }
      }
    }

    const result = rows.map((row) => ({
      ...row,
      first_name: firstNameById.get(row.user_id as string) ?? null,
    }));

    return jsonSuccess(result, 200);
  } catch (error) {
    logError("ADMIN FEEDBACKS", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar os feedbacks.", 500);
  }
}
