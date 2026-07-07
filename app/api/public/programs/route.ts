import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

// Catálogo de programas muda raramente — cache de 5 min no edge.
export const revalidate = 300;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Banco de dados indisponível.", 500);
    }

    const { data, error } = await supabase
      .from("programs")
      .select(
        "id, slug, title, description, goal, level, duration_weeks, sessions_per_week, price_cents, compare_at_cents, cover_image_url"
      )
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      logError("PUBLIC PROGRAMS", "Fetch failed", { error_message: error.message });
      return jsonError("Não foi possível carregar os programas.", 500);
    }

    return jsonSuccess(data ?? [], 200);
  } catch (error) {
    logError("PUBLIC PROGRAMS", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar os programas.", 500);
  }
}
