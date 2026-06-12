import {
  isAnonymousTrackableEventName,
  isTrackableAnalyticsEventName
} from "@/lib/analytics-events";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { logError, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

type TrackEventInput = {
  event_name?: unknown;
  user_id?: unknown;
  visitor_id?: unknown;
  metadata?: unknown;
};

type TrackBody = TrackEventInput & {
  // Formato em lote: { events: [...] }. O formato antigo (evento único no
  // corpo) continua aceito para clientes com bundle antigo em cache.
  events?: unknown;
};

const MAX_BATCH_SIZE = 20;

export async function POST(request: Request) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const body = (await request.json().catch(() => null)) as TrackBody | null;

    const isBatch = Array.isArray(body?.events);
    const rawEvents: TrackEventInput[] = isBatch
      ? (body!.events as TrackEventInput[]).slice(0, MAX_BATCH_SIZE)
      : body
        ? [body]
        : [];

    const rows: Array<{
      event_name: string;
      user_id: string | null;
      visitor_id: string | null;
      metadata: Record<string, string | number | boolean | null>;
    }> = [];

    for (const event of rawEvents) {
      if (!isTrackableAnalyticsEventName(event?.event_name)) {
        continue;
      }

      // Visitantes anônimos só podem registrar eventos da lista anônima.
      if (!authenticatedUser && !isAnonymousTrackableEventName(event.event_name)) {
        continue;
      }

      const visitorId = normalizeVisitorId(event?.visitor_id);

      if (!authenticatedUser && !visitorId) {
        continue;
      }

      if (typeof event?.user_id === "string" && authenticatedUser && event.user_id !== authenticatedUser.id) {
        logWarn("TRACK", "Mismatched user_id ignored", { user_id: authenticatedUser.id });
      }

      rows.push({
        event_name: event.event_name,
        user_id: authenticatedUser?.id ?? null,
        visitor_id: visitorId,
        metadata: sanitizeMetadata(event?.metadata)
      });
    }

    if (rows.length === 0) {
      // Lote sem eventos válidos não é erro do cliente (202 = aceito e ignorado).
      // Evento único inválido mantém o comportamento antigo (400).
      return isBatch ? jsonSuccess(null, 202) : jsonError("Evento invalido.", 400);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonSuccess(null, 200);
    }

    // Um único insert para todos os eventos do lote, sem retornar as linhas
    // (.select() removido — a resposta não era usada pelo cliente).
    const { error } = await supabase.from("analytics_events").insert(rows);

    if (error) {
      logError("TRACK", "Insert failed", {
        user_id: authenticatedUser?.id ?? null,
        batch_size: rows.length
      });
      return jsonError("Não foi possível registrar o evento agora.", 500);
    }

    return jsonSuccess({ inserted: rows.length }, 200);
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
