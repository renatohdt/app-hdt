import { isSafeProviderVideoId, isSupportedVideoProvider } from "@/lib/exercise-video";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { getYmoveVideo } from "@/lib/ymove";

export const dynamic = "force-dynamic";

/**
 * Entrega um link NOVO do vídeo de um fornecedor externo (YMove) na hora do play.
 *   GET /api/exercise-video?provider=ymove&id=<id>
 * Resposta: { success: true, data: { available: true, videoUrl, hlsUrl, thumbUrl } }
 *       ou  { success: true, data: { available: false, reason } }  → o app mostra só a capa.
 * Nunca devolve erro 500 por causa da YMove: o app não pode quebrar por um serviço externo.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    const id = url.searchParams.get("id");
    if (!isSupportedVideoProvider(provider) || !isSafeProviderVideoId(id)) {
      return jsonError("Vídeo inválido.", 400);
    }

    const result = await getYmoveVideo(id);
    const response =
      result.status === "ok"
        ? jsonSuccess({ available: true, videoUrl: result.videoUrl, hlsUrl: result.hlsUrl, thumbUrl: result.thumbUrl })
        : jsonSuccess({ available: false, reason: result.reason });
    // O link vence em 48h e não pode ser guardado: proíbe cache.
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logError("exercise-video", "Erro inesperado", { error: error instanceof Error ? error.message : String(error) });
    return jsonSuccess({ available: false, reason: "error" });
  }
}
