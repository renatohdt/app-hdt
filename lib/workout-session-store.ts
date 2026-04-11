import { logError, logWarn } from "@/lib/server-logger";
import {
  getSupabaseErrorCode,
  isSupabaseMissingColumnError,
  isSupabaseMissingRelationError
} from "@/lib/supabase-errors";
import type { WorkoutSessionLogEntry, WorkoutSessionStatus } from "@/lib/workout-sessions";

type SupabaseLike = {
  from: (table: string) => any;
};

type SessionLogRow = {
  id: string;
  workout_id: string;
  workout_key?: string | null;
  session_number: number;
  status?: WorkoutSessionStatus;
  completed_at: string;
  created_at?: string | null;
};

export async function getWorkoutSessionStats(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
  }
) {
  const currentResult = await readWorkoutSessionStats(supabase, input, {
    includeWorkoutHash: Boolean(input.workoutHash),
    useLegacyLatestSelect: false
  });

  if (isMissingSessionLogsTable(currentResult.countResult.error) || isMissingSessionLogsTable(currentResult.latestResult.error)) {
    logWarn("WORKOUT", "Workout session logs table unavailable", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.countResult.error ?? currentResult.latestResult.error)
    });

    return emptyWorkoutSessionStats();
  }

  if (
    input.workoutHash &&
    (isMissingSessionLogColumn(currentResult.countResult.error, "workout_hash") ||
      isMissingSessionLogColumn(currentResult.latestResult.error, "workout_hash"))
  ) {
    logWarn("WORKOUT", "Workout session stats fallback without workout_hash", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.countResult.error ?? currentResult.latestResult.error)
    });

    return readWorkoutSessionStatsSafely(supabase, input, {
      includeWorkoutHash: false,
      useLegacyLatestSelect: false
    });
  }

  if (hasLegacyLatestSelectIssue(currentResult.latestResult.error)) {
    logWarn("WORKOUT", "Workout session latest fetch fallback with legacy fields", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.latestResult.error)
    });

    return readWorkoutSessionStatsSafely(supabase, input, {
      includeWorkoutHash: Boolean(input.workoutHash),
      useLegacyLatestSelect: true
    });
  }

  return finalizeWorkoutSessionStats(currentResult, input.workoutId);
}

export async function listWorkoutSessionLogs(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
    limit?: number | null;
  }
) {
  const result = await readWorkoutSessionLogs(supabase, input, {
    includeWorkoutHash: Boolean(input.workoutHash),
    useLegacySelect: false
  });

  if (isMissingSessionLogsTable(result.error)) {
    logWarn("WORKOUT", "Workout session log list unavailable", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return [] as WorkoutSessionLogEntry[];
  }

  if (input.workoutHash && isMissingSessionLogColumn(result.error, "workout_hash")) {
    logWarn("WORKOUT", "Workout session log list fallback without workout_hash", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return readWorkoutSessionLogsSafely(supabase, input, {
      includeWorkoutHash: false,
      useLegacySelect: false
    });
  }

  if (hasLegacyLatestSelectIssue(result.error)) {
    logWarn("WORKOUT", "Workout session log list fallback with legacy fields", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return readWorkoutSessionLogsSafely(supabase, input, {
      includeWorkoutHash: Boolean(input.workoutHash),
      useLegacySelect: true
    });
  }

  return finalizeWorkoutSessionLogs(result, input.workoutId);
}

export async function createWorkoutSessionLog(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    userId: string;
    workoutHash?: string | null;
    workoutKey?: string | null;
    sessionNumber: number;
    completedAt: string;
  }
) {
  const currentResult = await insertWorkoutSessionLog(supabase, input, {
    includeWorkoutHash: true,
    includeWorkoutKey: true,
    useLegacySelect: false
  });

  if (isMissingSessionLogsTable(currentResult.error)) {
    logWarn("WORKOUT", "Workout session log insert skipped because table is unavailable", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    return {
      data: null,
      error: currentResult.error ?? { message: "Workout session insert failed" }
    };
  }

  if (
    isMissingSessionLogColumn(currentResult.error, "workout_hash") ||
    isMissingSessionLogColumn(currentResult.error, "workout_key")
  ) {
    logWarn("WORKOUT", "Workout session log insert fallback without optional cycle fields", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const fallbackResult = await insertWorkoutSessionLog(supabase, input, {
      includeWorkoutHash: false,
      includeWorkoutKey: false,
      useLegacySelect: true
    });

    if (fallbackResult.error || !fallbackResult.data) {
      return {
        data: null,
        error: fallbackResult.error ?? { message: "Workout session insert failed" }
      };
    }

    return {
      data: mapSessionLogRow(fallbackResult.data as SessionLogRow),
      error: null
    };
  }

  if (currentResult.error || !currentResult.data) {
    if (hasLegacyLatestSelectIssue(currentResult.error)) {
      const fallbackResult = await insertWorkoutSessionLog(supabase, input, {
        includeWorkoutHash: true,
        includeWorkoutKey: true,
        useLegacySelect: true
      });

      if (fallbackResult.error || !fallbackResult.data) {
        return {
          data: null,
          error: fallbackResult.error ?? { message: "Workout session insert failed" }
        };
      }

      return {
        data: mapSessionLogRow(fallbackResult.data as SessionLogRow),
        error: null
      };
    }

    logError("WORKOUT", "Workout session log insert failed", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    return {
      data: null,
      error: currentResult.error ?? { message: "Workout session insert failed" }
    };
  }

  return {
    data: mapSessionLogRow(currentResult.data as SessionLogRow),
    error: null
  };
}

function mapSessionLogRow(row: SessionLogRow): WorkoutSessionLogEntry {
  return {
    id: row.id,
    workoutId: row.workout_id,
    workoutKey: row.workout_key ?? null,
    sessionNumber: row.session_number,
    status: row.status ?? "completed",
    completedAt: row.completed_at,
    createdAt: row.created_at ?? null
  };
}

async function readWorkoutSessionStatsSafely(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
  },
  options: {
    includeWorkoutHash: boolean;
    useLegacyLatestSelect: boolean;
  }
) {
  const result = await readWorkoutSessionStats(supabase, input, options);

  if (isMissingSessionLogsTable(result.countResult.error) || isMissingSessionLogsTable(result.latestResult.error)) {
    return emptyWorkoutSessionStats();
  }

  return finalizeWorkoutSessionStats(result, input.workoutId);
}

async function readWorkoutSessionLogsSafely(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
    limit?: number | null;
  },
  options: {
    includeWorkoutHash: boolean;
    useLegacySelect: boolean;
  }
) {
  const result = await readWorkoutSessionLogs(supabase, input, options);

  if (isMissingSessionLogsTable(result.error)) {
    return [] as WorkoutSessionLogEntry[];
  }

  return finalizeWorkoutSessionLogs(result, input.workoutId);
}

async function readWorkoutSessionStats(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
  },
  options: {
    includeWorkoutHash: boolean;
    useLegacyLatestSelect: boolean;
  }
) {
  let countQuery = supabase.from("workout_session_logs").select("id", { count: "exact", head: true }).eq("workout_id", input.workoutId);
  let latestQuery = supabase
    .from("workout_session_logs")
    .select(buildLatestSessionFields(options.useLegacyLatestSelect))
    .eq("workout_id", input.workoutId)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (options.includeWorkoutHash && input.workoutHash) {
    countQuery = countQuery.eq("workout_hash", input.workoutHash);
    latestQuery = latestQuery.eq("workout_hash", input.workoutHash);
  }

  const [countResult, latestResult] = await Promise.all([countQuery, latestQuery]);

  return {
    countResult,
    latestResult
  };
}

async function readWorkoutSessionLogs(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    workoutHash?: string | null;
    limit?: number | null;
  },
  options: {
    includeWorkoutHash: boolean;
    useLegacySelect: boolean;
  }
) {
  let query = supabase
    .from("workout_session_logs")
    .select(buildLatestSessionFields(options.useLegacySelect))
    .eq("workout_id", input.workoutId)
    .order("completed_at", { ascending: false })
    .limit(Math.max(Number(input.limit) || 120, 1));

  if (options.includeWorkoutHash && input.workoutHash) {
    query = query.eq("workout_hash", input.workoutHash);
  }

  return query;
}

async function insertWorkoutSessionLog(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    userId: string;
    workoutHash?: string | null;
    workoutKey?: string | null;
    sessionNumber: number;
    completedAt: string;
  },
  options: {
    includeWorkoutHash: boolean;
    includeWorkoutKey: boolean;
    useLegacySelect: boolean;
  }
) {
  const payload: Record<string, unknown> = {
    workout_id: input.workoutId,
    user_id: input.userId,
    session_number: input.sessionNumber,
    status: "completed",
    completed_at: input.completedAt
  };

  if (options.includeWorkoutHash) {
    payload.workout_hash = input.workoutHash ?? null;
  }

  if (options.includeWorkoutKey) {
    payload.workout_key = input.workoutKey ?? null;
  }

  return supabase
    .from("workout_session_logs")
    .insert(payload)
    .select(buildLatestSessionFields(options.useLegacySelect))
    .single();
}

function finalizeWorkoutSessionStats(
  result: {
    countResult: { count?: number | null; error?: unknown };
    latestResult: { data?: unknown; error?: unknown };
  },
  workoutId: string
) {
  if (result.countResult.error) {
    logError("WORKOUT", "Workout session count query failed", {
      workout_id: workoutId,
      error_code: getSupabaseErrorCode(result.countResult.error)
    });

    return emptyWorkoutSessionStats();
  }

  if (result.latestResult.error) {
    logError("WORKOUT", "Workout latest session query failed", {
      workout_id: workoutId,
      error_code: getSupabaseErrorCode(result.latestResult.error)
    });

    return {
      completedSessions: Number(result.countResult.count) || 0,
      lastLog: null
    };
  }

  return {
    completedSessions: Number(result.countResult.count) || 0,
    lastLog: result.latestResult.data ? mapSessionLogRow(result.latestResult.data as SessionLogRow) : null
  };
}

function finalizeWorkoutSessionLogs(
  result: {
    data?: unknown;
    error?: unknown;
  },
  workoutId: string
) {
  if (result.error) {
    logError("WORKOUT", "Workout session log list failed", {
      workout_id: workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return [] as WorkoutSessionLogEntry[];
  }

  if (!Array.isArray(result.data)) {
    return [] as WorkoutSessionLogEntry[];
  }

  return result.data.map((row) => mapSessionLogRow(row as SessionLogRow));
}

function buildLatestSessionFields(useLegacySelect: boolean) {
  return useLegacySelect
    ? "id, workout_id, session_number, completed_at"
    : "id, workout_id, workout_key, session_number, status, completed_at, created_at";
}

function emptyWorkoutSessionStats() {
  return {
    completedSessions: 0,
    lastLog: null
  };
}

function hasLegacyLatestSelectIssue(error: unknown) {
  return (
    isMissingSessionLogColumn(error, "workout_key") ||
    isMissingSessionLogColumn(error, "status") ||
    isMissingSessionLogColumn(error, "created_at")
  );
}

function isMissingSessionLogsTable(error: unknown) {
  return isSupabaseMissingRelationError(error, "workout_session_logs");
}

function isMissingSessionLogColumn(error: unknown, column: string) {
  return isSupabaseMissingColumnError(error, column);
}
