import {
  normalizeConsentInput,
  getCurrentConsentVersion,
  getUserConsentMap,
  hasStoredConsentDecisions,
  saveUserConsents
} from "@/lib/consents";
import { type ConsentScope } from "@/lib/consent-types";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";

type ConsentRequestBody = {
  consents?: Partial<Record<ConsentScope, boolean>>;
  source?: string;
};

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? jsonError("Sua sessao expirou. Faca login novamente.", 401);
  }

  const supabase = createSupabaseUserClient(request);
  if (!supabase) {
    return jsonError("Nao foi possivel carregar os consentimentos.", 500);
  }

  try {
    const consentMap = await getUserConsentMap(supabase, auth.user.id);
    const hasStoredConsents = await hasStoredConsentDecisions(supabase, auth.user.id);

    return jsonSuccess(
      {
        version: getCurrentConsentVersion(),
        consents: consentMap,
        hasStoredConsents
      },
      200
    );
  } catch {
    return jsonError("Nao foi possivel carregar os consentimentos.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? jsonError("Sua sessao expirou. Faca login novamente.", 401);
  }

  const supabase = createSupabaseUserClient(request);
  if (!supabase) {
    return jsonError("Nao foi possivel salvar os consentimentos.", 500);
  }

  const body = (await request.json().catch(() => null)) as ConsentRequestBody | null;
  const normalizedConsents = normalizeConsentInput(body?.consents);

  if (!Object.keys(normalizedConsents).length) {
    return jsonError("Nenhum consentimento valido foi informado.", 400);
  }

  const result = await saveUserConsents(supabase, auth.user.id, normalizedConsents, {
    source: typeof body?.source === "string" ? body.source : "preference_center"
  });

  if (result.error) {
    return jsonError("Nao foi possivel salvar os consentimentos.", 500);
  }

  const consentMap = await getUserConsentMap(supabase, auth.user.id);

  return jsonSuccess(
    {
      version: getCurrentConsentVersion(),
      consents: consentMap
    },
    200
  );
}
