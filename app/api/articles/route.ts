import { getEvergreenFallbackArticles } from "@/lib/articles";
import { getOrCreateContentRecommendations } from "@/lib/content-recommendations";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { getUserAnswersByUserId } from "@/lib/user-answers";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);

    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      return jsonSuccess(getEvergreenFallbackArticles().slice(0, 3), 200);
    }

    const answers = await getUserAnswersByUserId(supabase as any, auth.user.id);
    const articles = await getOrCreateContentRecommendations(supabase as any, auth.user.id, answers);

    return jsonSuccess(articles.slice(0, 3), 200);
  } catch (error) {
    console.error("ARTICLES API ERROR:", error);
    return jsonSuccess(getEvergreenFallbackArticles().slice(0, 3), 200);
  }
}
