import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { queuePremiumInterestEmail, queueProgramInterestEmail } from "@/lib/strategic-emails";

export const dynamic = "force-dynamic";

// Chamado quando o usuário toca em "Tenho interesse" (Premium ou Programa)
// dentro do app nativo, onde não dá para pagar (regra das lojas).
// Envia por e-mail (Resend) como assinar/comprar pelo site, com a mesma conta.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as { type?: string; slug?: string } | null;
    const type = body?.type ?? "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";

    if (type === "premium") {
      queuePremiumInterestEmail(auth.user.id);
    } else if (type === "program" && /^[a-z0-9-]{1,80}$/.test(slug)) {
      queueProgramInterestEmail(auth.user.id, slug);
    } else {
      return jsonError("Tipo de interesse inválido.", 400);
    }

    logInfo("INTEREST", "Interesse registrado", { type, slug: slug || null, user_id: auth.user.id });
    return jsonSuccess({ ok: true });
  } catch (error) {
    logError("INTEREST", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
