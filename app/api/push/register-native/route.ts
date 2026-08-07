import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

type RegisterBody = {
  token: string;
  platform: "ios" | "android";
};

// Salva o token de push nativo (FCM) do aparelho, associado ao usuário logado.
// Usado pelos apps Android/iOS (Capacitor). Upsert por token para não duplicar.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Não autenticado.", 401);
    }

    const body = (await request.json()) as RegisterBody;

    if (!body?.token || (body.platform !== "ios" && body.platform !== "android")) {
      return jsonError("Token ou plataforma inválidos.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    const { error } = await supabase.from("native_push_tokens").upsert(
      {
        user_id: auth.user.id,
        token: body.token,
        platform: body.platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );

    if (error) {
      logError("PUSH", "Erro ao salvar token nativo", { error: error.message });
      return jsonError("Não foi possível registrar o dispositivo.", 500);
    }

    return jsonSuccess({ registered: true });
  } catch (error) {
    logError("PUSH", "Erro inesperado em register-native", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
