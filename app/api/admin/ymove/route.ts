import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { searchYmoveExercises } from "@/lib/ymove";

export const dynamic = "force-dynamic";

/**
 * Busca exercícios na YMove pelo nome (só admin). Não puxa vídeos: não gasta o limite do plano.
 *   GET /api/admin/ymove?q=bench press
 */
export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
    if (query.length < 2) {
      return jsonError("Digite pelo menos 2 letras para buscar.", 400);
    }

    const results = await searchYmoveExercises(query, 20);
    if (results === null) {
      return jsonError("Não foi possível buscar na YMove agora. Confira a chave YMOVE_API_KEY.", 502);
    }

    return jsonSuccess(results, 200);
  } catch (error) {
    logError("ADMIN", "YMove search failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Não foi possível buscar na YMove agora.", 500);
  }
}
