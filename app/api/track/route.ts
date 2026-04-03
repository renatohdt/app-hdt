import {
  isAnonymousTrackableEventName,
  isTrackableAnalyticsEventName
} from "@/lib/analytics-events";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { logError, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

type TrackBody = {
  event_name?: unknown;
  user_id?: unknown;
  visitor_id?: unknown;
  metadata?: unknown;
};

export async function POST(request: Request) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const body = (await request.json().catch(() => null)) as TrackBody | null;

    if (!isTrackableAnalyticsEventName(body?.event_name)) {
      return jsonError("Evento invalido.", 400);
    }

    const visitorId = normalizeVisitorId(body?.visitor_id);

    if (!authenticatedUser && !isAnonymousTrackableEventName(body.event_name)) {
      return jsonSuccess(null, 202);
    }

    if (typeof body?.user_id === "string" && authenticatedUser && body.user_id !== authenticatedUser.id) {
      logWarn("TRACK", "Mismatched user_id ignored", { user_id: authenticatedUser.id });
    }

    if (!authenticatedUser && typeof body?.user_id === "string" && body.user_id.trim().length > 0) {
      logWarn("TRACK", "Anonymous user_id ignored", {});
    }

    if (!authenticatedUser && !visitorId) {
      return jsonError("Identificador do visitante invalido.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonSuccess(null, 200);
    }

    const { data, error } = await supabase
      .from("analytics_events")
      .insert({
        event_name: body.event_name,
        user_id: authenticatedUser?.id ?? null,
        visitor_id: visitorId,
        metadata: sanitizeMetadata(body?.metadata)
      })
      .select()
      .single();

    if (error) {
      logError("TRACK", "Insert failed", {
        user_id: authenticatedUser?.id ?? null,
        visitor_id: visitorId,
        event_name: body.event_name
      });
      return jsonError("Não foi possível registrar o evento agora.", 500);
    }

    return jsonSuccess(data, 200);
  } catch (error) {
    logError("TRACK", "Unhandled exception", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível registrar o evento agora.", 500);
  }
}

function normalizeVisitorId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, string | number | boolean | null]> = [];

  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (typeof raw === "string") {
      entries.push([key, raw.slice(0, 280)]);
      continue;
    }

    if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      entries.push([key, raw]);
    }
  }

  return Object.fromEntries(entries);
}
