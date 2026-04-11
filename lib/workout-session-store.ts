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

type SessionStatsInput = {
  workoutId: string;
  workoutHash?: string | null;
  planCycleId?: string | null;
  cycleStartedAt?: string | null;
};

type SessionListInput = SessionStatsInput & {
  limit?: number | null;
  allCycles?: boolean;
};

type SessionFilterMode = "plan_cycle_id" | "workout_hash" | "cycle_started_at" | "none";

export async function getWorkoutSessionStats(supabase: SupabaseLike, input: SessionStatsInput) {
  for (const filterMode of getSessionFilterModes(input)) {
    const result = await readWorkoutSessionStats(supabase, input, {
      filterMode,
      useLegacyLatestSelect: false
    });

    if (isMissingSessionLogsTable(result.countResult.error) || isMissingSessionLogsTable(result.latestResult.error)) {
      logWarn("WORKOUT", "Workout session logs table unavailable", {
        workout_id: input.workoutId,
        error_code: getSupabaseErrorCode(result.countResult.error ?? result.latestResult.error)
      });

      return emptyWorkoutSessionStats();
    }

    if (shouldFallbackSessionFilter(filterMode, result.countResult.error, result.latestResult.error)) {
      logWarn("WORKOUT", "Workout session stats fallback with older cycle filter", {
        workout_id: input.workoutId,
        filter_mode: filterMode,
        error_code: getSupabaseErrorCode(result.countResult.error ?? result.latestResult.error)
      });
      continue;
    }

    if (hasLegacyLatestSelectIssue(result.latestResult.error)) {
      logWarn("WORKOUT", "Workout session latest fetch fallback with legacy fields", {
        workout_id: input.workoutId,
        error_code: getSupabaseErrorCode(result.latestResult.error)
      });

      const legacyResult = await readWorkoutSessionStats(supabase, input, {
        filterMode,
        useLegacyLatestSelect: true
      });

      if (isMissingSessionLogsTable(legacyResult.countResult.error) || isMissingSessionLogsTable(legacyResult.latestResult.error)) {
        return emptyWorkoutSessionStats();
      }

      if (shouldFallbackSessionFilter(filterMode, legacyResult.countResult.error, legacyResult.latestResult.error)) {
        continue;
      }

      return finalizeWorkoutSessionStats(legacyResult, input.workoutId);
    }

    return finalizeWorkoutSessionStats(result, input.workoutId);
  }

  return emptyWorkoutSessionStats();
}

export async function listWorkoutSessionLogs(supabase: SupabaseLike, input: SessionListInput) {
  if (input.allCycles) {
    const result = await readWorkoutSessionLogs(supabase, input, {
      filterMode: "none",
      useLegacySelect: false
    });

    if (isMissingSessionLogsTable(result.error)) {
      logWarn("WORKOUT", "Workout session log list unavailable", {
        workout_id: input.workoutId,
        error_code: getSupabaseErrorCode(result.error)
      });

      return [] as WorkoutSessionLogEntry[];
    }

    if (hasLegacyLatestSelectIssue(result.error)) {
      const legacyResult = await readWorkoutSessionLogs(supabase, input, {
        filterMode: "none",
        useLegacySelect: true
      });

      if (isMissingSessionLogsTable(legacyResult.error)) {
        return [] as WorkoutSessionLogEntry[];
      }

      return finalizeWorkoutSessionLogs(legacyResult, input.workoutId);
    }

    return finalizeWorkoutSessionLogs(result, input.workoutId);
  }

  for (const filterMode of getSessionFilterModes(input)) {
    const result = await readWorkoutSessionLogs(supabase, input, {
      filterMode,
      useLegacySelect: false
    });

    if (isMissingSessionLogsTable(result.error)) {
      logWarn("WORKOUT", "Workout session log list unavailable", {
        workout_id: input.workoutId,
        error_code: getSupabaseErrorCode(result.error)
      });

      return [] as WorkoutSessionLogEntry[];
    }

    if (shouldFallbackSessionFilter(filterMode, result.error)) {
      logWarn("WORKOUT", "Workout session log list fallback with older cycle filter", {
        workout_id: input.workoutId,
        filter_mode: filterMode,
        error_code: getSupabaseErrorCode(result.error)
      });
      continue;
    }

    if (hasLegacyLatestSelectIssue(result.error)) {
      logWarn("WORKOUT", "Workout session log list fallback with legacy fields", {
        workout_id: input.workoutId,
        error_code: getSupabaseErrorCode(result.error)
      });

      const legacyResult = await readWorkoutSessionLogs(supabase, input, {
        filterMode,
        useLegacySelect: true
      });

      if (isMissingSessionLogsTable(legacyResult.error)) {
        return [] as WorkoutSessionLogEntry[];
      }

      if (shouldFallbackSessionFilter(filterMode, legacyResult.error)) {
        continue;
      }

      return finalizeWorkoutSessionLogs(legacyResult, input.workoutId);
    }

    return finalizeWorkoutSessionLogs(result, input.workoutId);
  }

  return [] as WorkoutSessionLogEntry[];
}

export async function createWorkoutSessionLog(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    userId: string;
    workoutHash?: string | null;
    workoutKey?: string | null;
    planCycleId?: string | null;
    sessionNumber: number;
    completedAt: string;
  }
) {
  const currentResult = await insertWorkoutSessionLog(supabase, input, {
    includePlanCycleId: Boolean(input.planCycleId),
    includeWorkoutHash: Boolean(input.workoutHash),
    includeWorkoutKey: Boolean(input.workoutKey),
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

  if (isMissingSessionLogColumn(currentResult.error, "plan_cycle_id")) {
    logWarn("WORKOUT", "Workout session log insert fallback without plan_cycle_id", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    const fallbackResult = await insertWorkoutSessionLog(supabase, input, {
      includePlanCycleId: false,
      includeWorkoutHash: Boolean(input.workoutHash),
      includeWorkoutKey: Boolean(input.workoutKey),
      useLegacySelect: false
    });

    if (fallbackResult.error || !fallbackResult.data) {
      return handleLegacyWorkoutSessionInsert(supabase, input, fallbackResult);
    }

    return {
      data: mapSessionLogRow(fallbackResult.data as SessionLogRow),
      error: null
    };
  }

  if (currentResult.error || !currentResult.data) {
    return handleLegacyWorkoutSessionInsert(supabase, input, currentResult);
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

async function handleLegacyWorkoutSessionInsert(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    userId: string;
    workoutHash?: string | null;
    workoutKey?: string | null;
    planCycleId?: string | null;
    sessionNumber: number;
    completedAt: string;
  },
  result: {
    data?: unknown;
    error?: unknown;
  }
) {
  if (
    isMissingSessionLogColumn(result.error, "workout_hash") ||
    isMissingSessionLogColumn(result.error, "workout_key")
  ) {
    logWarn("WORKOUT", "Workout session log insert fallback without optional legacy fields", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    const fallbackResult = await insertWorkoutSessionLog(supabase, input, {
      includePlanCycleId: false,
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

  if (hasLegacyLatestSelectIssue(result.error)) {
    const fallbackResult = await insertWorkoutSessionLog(supabase, input, {
      includePlanCycleId: false,
      includeWorkoutHash: Boolean(input.workoutHash),
      includeWorkoutKey: Boolean(input.workoutKey),
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

  if (result.error || !result.data) {
    logError("WORKOUT", "Workout session log insert failed", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return {
      data: null,
      error: result.error ?? { message: "Workout session insert failed" }
    };
  }

  return {
    data: mapSessionLogRow(result.data as SessionLogRow),
    error: null
  };
}

async function readWorkoutSessionStats(
  supabase: SupabaseLike,
  input: SessionStatsInput,
  options: {
    filterMode: SessionFilterMode;
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

  countQuery = applySessionLogFilter(countQuery, input, options.filterMode);
  latestQuery = applySessionLogFilter(latestQuery, input, options.filterMode);

  const [countResult, latestResult] = await Promise.all([countQuery, latestQuery]);

  return {
    countResult,
    latestResult
  };
}

async function readWorkoutSessionLogs(
  supabase: SupabaseLike,
  input: SessionListInput,
  options: {
    filterMode: SessionFilterMode;
    useLegacySelect: boolean;
  }
) {
  let query = supabase
    .from("workout_session_logs")
    .select(buildLatestSessionFields(options.useLegacySelect))
    .eq("workout_id", input.workoutId)
    .order("completed_at", { ascending: false })
    .limit(Math.max(Number(input.limit) || 120, 1));

  query = applySessionLogFilter(query, input, options.filterMode);

  return query;
}

async function insertWorkoutSessionLog(
  supabase: SupabaseLike,
  input: {
    workoutId: string;
    userId: string;
    workoutHash?: string | null;
    workoutKey?: string | null;
    planCycleId?: string | null;
    sessionNumber: number;
    completedAt: string;
  },
  options: {
    includePlanCycleId: boolean;
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

  if (options.includePlanCycleId) {
    payload.plan_cycle_id = input.planCycleId ?? null;
  }

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

function applySessionLogFilter<TQuery extends { eq: Function; gte: Function }>(
  query: TQuery,
  input: SessionStatsInput,
  filterMode: SessionFilterMode
) {
  if (filterMode === "plan_cycle_id" && input.planCycleId) {
    return query.eq("plan_cycle_id", input.planCycleId);
  }

  if (filterMode === "workout_hash" && input.workoutHash) {
    return query.eq("workout_hash", input.workoutHash);
  }

  if (filterMode === "cycle_started_at" && input.cycleStartedAt) {
    return query.gte("completed_at", input.cycleStartedAt);
  }

  return query;
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

function getSessionFilterModes(input: SessionStatsInput) {
  const orderedModes = [
    input.planCycleId ? "plan_cycle_id" : null,
    input.workoutHash ? "workout_hash" : null,
    input.cycleStartedAt ? "cycle_started_at" : null,
    "none"
  ].filter((mode): mode is SessionFilterMode => Boolean(mode));

  return Array.from(new Set(orderedModes));
}

function shouldFallbackSessionFilter(filterMode: SessionFilterMode, ...errors: unknown[]) {
  if (filterMode === "plan_cycle_id") {
    return errors.some((error) => isMissingSessionLogColumn(error, "plan_cycle_id"));
  }

  if (filterMode === "workout_hash") {
    return errors.some((error) => isMissingSessionLogColumn(error, "workout_hash"));
  }

  return false;
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
