import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

type AppSessionBody = {
  source?: unknown;
  path?: unknown;
};

// app_session is a first-party usage signal for retention reporting in the admin.
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonSuccess(null, 200);
    }

    const body = (await request.json().catch(() => null)) as AppSessionBody | null;
    const metadata = removeUndefined({
      source: normalizeMetadataText(body?.source),
      path: normalizeMetadataText(body?.path)
    });

    const { data, error } = await supabase
      .from("analytics_events")
      .insert({
        event_name: "app_session",
        user_id: auth.user.id,
        metadata
      })
      .select()
      .single();

    if (error) {
      logError("TRACK", "App session insert failed", { user_id: auth.user.id });
      return jsonError("Não foi possível registrar a sessão agora.", 500);
    }

    return jsonSuccess(data, 201);
  } catch (error) {
    logError("TRACK", "App session route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível registrar a sessão agora.", 500);
  }
}

function normalizeMetadataText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
