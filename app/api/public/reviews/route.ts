import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

export interface PublicReview {
  rating: number;
  comment: string;
  first_name: string;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Banco de dados indisponível.", 500);
    }

    // 1ª query: busca feedbacks com nota alta e comentário preenchido
    const { data: feedbacks, error: feedbacksError } = await supabase
      .from("user_feedbacks")
      .select("user_id, rating, comment")
      .gte("rating", 4)
      .not("comment", "is", null)
      .neq("comment", "")
      .order("created_at", { ascending: false })
      .limit(12);

    if (feedbacksError) {
      logError("PUBLIC REVIEWS", "Fetch failed", { error_message: feedbacksError.message });
      return jsonError("Não foi possível carregar as avaliações.", 500);
    }

    // Filtra comentários válidos (mínimo 5 caracteres)
    const validFeedbacks = (feedbacks ?? []).filter((row) => {
      const comment = row.comment as string | null;
      return comment && comment.trim().length >= 5;
    });

    if (validFeedbacks.length === 0) {
      return jsonSuccess([], 200);
    }

    // 2ª query: busca os nomes dos usuários na public.users usando os user_ids coletados
    const userIds = validFeedbacks.map((row) => row.user_id as string);

    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, name")
      .in("id", userIds);

    if (usersError) {
      logError("PUBLIC REVIEWS", "Users fetch failed", { error_message: usersError.message });
      // Continua sem nomes em vez de retornar erro
    }

    // Monta um mapa id → primeiro nome para lookup rápido
    const nameMap = new Map<string, string>();
    for (const user of usersData ?? []) {
      const firstName = (user.name as string).trim().split(" ")[0] ?? "Usuário";
      nameMap.set(user.id as string, firstName);
    }

    // Monta a resposta final
    const reviews: PublicReview[] = validFeedbacks
      .slice(0, 8)
      .map((row) => ({
        rating: row.rating as number,
        comment: (row.comment as string).trim(),
        first_name: nameMap.get(row.user_id as string) ?? "Usuário",
      }));

    return jsonSuccess(reviews, 200);
  } catch (error) {
    logError("PUBLIC REVIEWS", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível carregar as avaliações.", 500);
  }
}
