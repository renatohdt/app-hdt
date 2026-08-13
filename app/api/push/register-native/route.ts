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

// Remove o token de push nativo (quando o usuário desliga as notificações no
// app). Se vier um token no corpo, remove só o deste aparelho; senão, remove
// todos os tokens do usuário. Sempre com escopo pelo user_id logado.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Não autenticado.", 401);
    }

    const body = (await request.json().catch(() => null)) as { token?: string } | null;
    const token = body?.token;

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Serviço indisponível.", 500);

    let query = supabase.from("native_push_tokens").delete().eq("user_id", auth.user.id);
    if (token) {
      query = query.eq("token", token);
    }

    const { error } = await query;

    if (error) {
      logError("PUSH", "Erro ao remover token nativo", { error: error.message });
      return jsonError("Não foi possível remover o dispositivo.", 500);
    }

    return jsonSuccess({ removed: true });
  } catch (error) {
    logError("PUSH", "Erro inesperado em DELETE register-native", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
