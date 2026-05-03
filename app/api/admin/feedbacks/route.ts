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

    return jsonSuccess(data ?? [], 200);
  } catch (error) {
    logError("ADMIN FEEDBACKS", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar os feedbacks.", 500);
  }
}
