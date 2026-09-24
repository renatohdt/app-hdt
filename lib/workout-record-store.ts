import { logWarn } from "@/lib/server-logger";
import { getSupabaseErrorCode, isSupabaseMissingColumnError } from "@/lib/supabase-errors";

type SupabaseLike = {
  from: (table: string) => any;
};

export type WorkoutRecordRow = {
  id: string;
  user_id?: string;
  hash: string | null;
  exercises: unknown;
  total_sessions?: number | null;
  created_at?: string | null;
};

type FetchWorkoutOptions = {
  userId: string;
  includeCreatedAt?: boolean;
  includeUserId?: boolean;
  scope?: string;
  location?: string;
};

type SaveWorkoutOptions = {
  userId: string;
  existingWorkoutId?: string | null;
  hash: string | null;
  exercises: unknown;
  totalSessions: number;
  createdAt?: string | null;
  scope?: string;
  type?: "standard" | "extra";
  expiresAt?: string | null;
  location?: string;
};

export async function fetchLatestWorkoutRecord(supabase: SupabaseLike, options: FetchWorkoutOptions) {
  const scope = options.scope ?? "WORKOUT";
  const fields = buildWorkoutFields(options);
  let currentResult = await runWorkoutLookup(supabase, options.userId, fields, { excludeExtra: true, location: options.location });

  if (currentResult.error && options.location && isSupabaseMissingColumnError(currentResult.error, "location")) {
    currentResult = await runWorkoutLookup(supabase, options.userId, fields, { excludeExtra: true });
  }

  if (currentResult.error && isSupabaseMissingColumnError(currentResult.error, "total_sessions")) {
    logWarn(scope, "Workout query fallback without total_sessions", {
      user_id: options.userId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const legacyFields = fields.filter((field) => field !== "total_sessions");
    const legacyResult = await runWorkoutLookup(supabase, options.userId, legacyFields, { excludeExtra: true });

    // If type column also missing, retry without type filter
    if (legacyResult.error && isSupabaseMissingColumnError(legacyResult.error, "type")) {
      const noTypeResult = await runWorkoutLookup(supabase, options.userId, legacyFields, { excludeExtra: false });
      return {
        data: normalizeWorkoutRecord(noTypeResult.data),
        error: noTypeResult.error,
        compatibility: { totalSessionsColumnAvailable: false }
      };
    }

    return {
      data: normalizeWorkoutRecord(legacyResult.data),
      error: legacyResult.error,
      compatibility: {
        totalSessionsColumnAvailable: false
      }
    };
  }

  // If type column not yet created, retry without the filter
  if (currentResult.error && isSupabaseMissingColumnError(currentResult.error, "type")) {
    logWarn(scope, "Workout query fallback without type filter (column missing)", {
      user_id: options.userId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const fallbackResult = await runWorkoutLookup(supabase, options.userId, fields, { excludeExtra: false });

    if (fallbackResult.error && isSupabaseMissingColumnError(fallbackResult.error, "total_sessions")) {
      const legacyFields = fields.filter((field) => field !== "total_sessions");
      const legacyResult = await runWorkoutLookup(supabase, options.userId, legacyFields, { excludeExtra: false });
      return {
        data: normalizeWorkoutRecord(legacyResult.data),
        error: legacyResult.error,
        compatibility: { totalSessionsColumnAvailable: false }
      };
    }

    return {
      data: normalizeWorkoutRecord(fallbackResult.data),
      error: fallbackResult.error,
      compatibility: { totalSessionsColumnAvailable: true }
    };
  }

  return {
    data: normalizeWorkoutRecord(currentResult.data),
    error: currentResult.error,
    compatibility: {
      totalSessionsColumnAvailable: true
    }
  };
}

export async function saveWorkoutRecord(supabase: SupabaseLike, options: SaveWorkoutOptions) {
  const scope = options.scope ?? "WORKOUT";
  const fullPayload: Record<string, unknown> = {
    user_id: options.userId,
    hash: options.hash,
    exercises: options.exercises,
    total_sessions: options.totalSessions,
    type: options.type ?? "standard",
    location: options.location ?? "home"
  };

  if (typeof options.createdAt === "string" && options.createdAt.trim()) {
    fullPayload.created_at = options.createdAt;
  }

  if (typeof options.expiresAt === "string" && options.expiresAt.trim()) {
    fullPayload.expires_at = options.expiresAt;
  }

  let currentResult = await runWorkoutSave(supabase, options, fullPayload);

  if (currentResult.error && isSupabaseMissingColumnError(currentResult.error, "location")) {
    logWarn(scope, "Workout save fallback without location", {
      user_id: options.userId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });
    delete fullPayload.location;
    currentResult = await runWorkoutSave(supabase, options, fullPayload);
  }

  if (currentResult.error && isSupabaseMissingColumnError(currentResult.error, "type")) {
    logWarn(scope, "Workout save fallback without type", {
      user_id: options.userId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const { type: _ignoredType, ...noTypePayload } = fullPayload;

    if (isSupabaseMissingColumnError(currentResult.error, "total_sessions")) {
      const { total_sessions: _ignoredTs, ...legacyPayload } = noTypePayload;
      const legacyResult = await runWorkoutSave(supabase, options, legacyPayload);
      return {
        error: legacyResult.error,
        compatibility: { totalSessionsColumnAvailable: false }
      };
    }

    const noTypeResult = await runWorkoutSave(supabase, options, noTypePayload);
    return {
      error: noTypeResult.error,
      compatibility: { totalSessionsColumnAvailable: true }
    };
  }

  if (currentResult.error && isSupabaseMissingColumnError(currentResult.error, "total_sessions")) {
    logWarn(scope, "Workout save fallback without total_sessions", {
      user_id: options.userId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const { total_sessions: _ignored, ...legacyPayload } = fullPayload;
    const legacyResult = await runWorkoutSave(supabase, options, legacyPayload);

    return {
      error: legacyResult.error,
      compatibility: {
        totalSessionsColumnAvailable: false
      }
    };
  }

  return {
    error: currentResult.error,
    compatibility: {
      totalSessionsColumnAvailable: true
    }
  };
}

// Retorna os locais distintos (home/condo_gym/gym) para os quais o usuário já
// tem um treino padrão (type != extra). Usado para renderizar as abas de local
// na tela de treino — só aparecem abas para locais que já têm programa.
// Em produção pré-migração (coluna `location` ausente) retorna lista vazia e o
// chamador assume o comportamento legado de local único.
export async function fetchAvailableWorkoutLocations(
  supabase: SupabaseLike,
  userId: string
): Promise<string[]> {
  const result = await supabase
    .from("workouts")
    .select("location")
    .eq("user_id", userId)
    .neq("type", "extra");

  if (result.error || !Array.isArray(result.data)) {
    return [];
  }

  const locations = new Set<string>();
  for (const row of result.data) {
    const loc = (row as { location?: unknown }).location;
    if (typeof loc === "string" && loc.trim()) {
      locations.add(loc);
    }
  }
  return Array.from(locations);
}

function buildWorkoutFields(options: FetchWorkoutOptions) {
  const fields = ["id", "hash", "exercises", "total_sessions"] as string[];

  if (options.includeUserId) {
    fields.push("user_id");
  }

  if (options.includeCreatedAt) {
    fields.push("created_at");
  }

  return fields;
}

function normalizeWorkoutRecord(value: unknown): WorkoutRecordRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  return {
    id: typeof row.id === "string" ? row.id : "",
    user_id: typeof row.user_id === "string" ? row.user_id : undefined,
    hash: typeof row.hash === "string" && row.hash.trim() ? row.hash : null,
    exercises: row.exercises ?? null,
    total_sessions:
      typeof row.total_sessions === "number" && Number.isFinite(row.total_sessions) ? Math.round(row.total_sessions) : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null
  };
}

async function runWorkoutLookup(
  supabase: SupabaseLike,
  userId: string,
  fields: string[],
  options: { excludeExtra: boolean; location?: string }
) {
  let query = supabase
    .from("workouts")
    .select(fields.join(", "))
    .eq("user_id", userId);

  if (options.excludeExtra) {
    query = query.neq("type", "extra");
  }

  if (options.location) {
    query = query.eq("location", options.location);
  }

  return query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function runWorkoutSave(
  supabase: SupabaseLike,
  options: SaveWorkoutOptions,
  payload: Record<string, unknown>
) {
  if (options.existingWorkoutId) {
    return supabase.from("workouts").update(payload).eq("id", options.existingWorkoutId);
  }

  return supabase.from("workouts").insert(payload);
}
