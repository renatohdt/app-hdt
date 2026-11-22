import type { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { getSubscriptionSummary } from "@/lib/subscription";
import { logError, logInfo } from "@/lib/server-logger";
import { isCancellationReason, type CancellationSource } from "@/lib/cancellation-feedback";

export const dynamic = "force-dynamic";

// Salva a resposta do questionário de cancelamento do Premium.
// Chamado pela tela do questionário ANTES do cancelamento real
// (Stripe: /api/stripe/manage | Lojas: página de assinaturas da App Store / Google Play).
//
// O app só manda o motivo e o comentário. Origem (Stripe app/web ou loja) e plano
// são descobertos aqui no servidor, para não depender do que vem do celular.

type Body = {
  reason?: unknown;
  comment?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as Body | null;

    // Motivo: null = pessoa clicou em "Pular"; senão, precisa ser um dos conhecidos.
    const rawReason = body?.reason ?? null;
    if (rawReason !== null && !isCancellationReason(rawReason)) {
      return jsonError("Motivo inválido.", 400);
    }
    const reason = rawReason;

    const comment =
      typeof body?.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim().slice(0, 1000)
        : null;

    if (reason === "outro" && !comment) {
      return jsonError("Conte pra gente o motivo no campo de texto.", 400);
    }

    // Descobre por onde a pessoa assinou.
    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    const summary = await getSubscriptionSummary(auth.user.id, token);

    let source: CancellationSource;
    let plan: "monthly" | "annual" | null = null;

    if (summary.source === "stripe") {
      // O app nativo (Capacitor) marca o user agent com "HoraDoTreinoApp".
      const isNativeApp = (request.headers.get("user-agent") ?? "").includes("HoraDoTreinoApp");
      source = isNativeApp ? "stripe_app" : "stripe_web";
      plan = summary.plan === "annual" ? "annual" : "monthly";
    } else if (summary.source === "app_store" || summary.source === "play_store") {
      // O plano da loja não fica salvo no nosso banco, então fica em branco.
      source = summary.source;
    } else {
      return jsonError("Nenhuma assinatura ativa para cancelar.", 400);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível salvar sua resposta agora.", 500);
    }

    const { data, error } = await supabase
      .from("cancellation_feedbacks")
      .insert({ user_id: auth.user.id, reason, comment, source, plan })
      .select("id")
      .single();

    if (error || !data) {
      logError("CANCELLATION_FEEDBACK", "Insert failed", {
        user_id: auth.user.id,
        error_message: error?.message ?? "no data returned",
      });
      return jsonError("Não foi possível salvar sua resposta agora.", 500);
    }

    logInfo("CANCELLATION_FEEDBACK", "Resposta salva", {
      user_id: auth.user.id,
      feedback_id: data.id,
      reason,
      source,
    });

    return jsonSuccess({ id: data.id, source }, 201);
  } catch (error) {
    logError("CANCELLATION_FEEDBACK", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Não foi possível salvar sua resposta agora.", 500);
  }
}
