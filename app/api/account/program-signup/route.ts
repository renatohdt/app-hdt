import { NextResponse } from "next/server";
import { normalizeConsentInput, saveUserConsents } from "@/lib/consents";
import type { ConsentScope } from "@/lib/consent-types";
import { recordTermsOfUseAcceptance } from "@/lib/legal-log";
import { jsonError } from "@/lib/server-response";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo } from "@/lib/server-logger";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type ProgramSignupBody = {
  name?: string;
  acceptedTerms?: boolean;
  consents?: Partial<Record<ConsentScope, boolean>>;
};

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";
const SAVE_PROFILE_ERROR_MESSAGE = "Não foi possível criar sua conta no momento.";
const ACCEPT_TERMS_ERROR_MESSAGE = "Você precisa aceitar os Termos de Uso para continuar.";

// Cadastro enxuto para compradores de programa: cria o registro do usuário,
// consentimentos e aceite de termos — SEM gerar treino por IA (o programa é o
// conteúdo). O perfil detalhado pode ser preenchido depois, se necessário.
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    const body = (await request.json()) as ProgramSignupBody;
    const userId = auth.user.id;

    if (body.acceptedTerms !== true) {
      return jsonError(ACCEPT_TERMS_ERROR_MESSAGE, 400);
    }

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Aluno";
    const requestedConsents = normalizeConsentInput(body.consents);

    // Cria o registro do usuário se ainda não existir (idempotente).
    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingUserError) {
      logError("PROGRAM_SIGNUP", "User lookup failed", { user_id: userId });
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    if (!existingUser) {
      const { error: insertError } = await supabase.from("users").insert({ id: userId, name });
      if (insertError) {
        logError("PROGRAM_SIGNUP", "User insert failed", { user_id: userId, error: insertError.message });
        return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
      }
    }

    const consentResult = await saveUserConsents(supabase, userId, requestedConsents, {
      source: "program_signup",
    });
    if (consentResult.error) {
      logError("PROGRAM_SIGNUP", "Consent save failed", { user_id: userId });
      return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
    }

    await recordTermsOfUseAcceptance(userId, new Date().toISOString());

    logInfo("PROGRAM_SIGNUP", "Conta de comprador criada", { user_id: userId });

    return NextResponse.json({ success: true, data: { userId } });
  } catch (error) {
    logError("PROGRAM_SIGNUP", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonError(SAVE_PROFILE_ERROR_MESSAGE, 500);
  }
}
