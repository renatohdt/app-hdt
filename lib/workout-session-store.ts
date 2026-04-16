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

type SessionStatsCandidate = {
  filterMode: SessionFilterMode;
  completedSessions: number;
  lastLog: WorkoutSessionLogEntry | null;
  rawCount: number;
  derivedCompletedSessions: number;
};

type UserSessionDayLookupInput = {
  userId: string;
  referenceDate?: Date | string | number | null;
  timeZone?: string;
};

type LocalDayRange = {
  dayKey: string;
  timeZone: string;
  startUtcIso: string;
  endUtcIso: string;
};

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const WORKOUT_SESSION_TIMEZONE = "America/Sao_Paulo";

export async function getWorkoutSessionStats(supabase: SupabaseLike, input: SessionStatsInput) {
  const candidates = [] as SessionStatsCandidate[];

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

      candidates.push(buildSessionStatsCandidate(finalizeWorkoutSessionStats(legacyResult, input.workoutId), legacyResult, filterMode));
      continue;
    }

    candidates.push(buildSessionStatsCandidate(finalizeWorkoutSessionStats(result, input.workoutId), result, filterMode));
  }

  return selectPreferredWorkoutSessionStats(input.workoutId, candidates);
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

export async function getUserWorkoutSessionForLocalDay(supabase: SupabaseLike, input: UserSessionDayLookupInput) {
  const dayRange = getLocalDayRange(input.referenceDate, input.timeZone ?? WORKOUT_SESSION_TIMEZONE);
  const completedDayResult = await readUserWorkoutSessionForCompletedDay(supabase, input.userId, dayRange, {
    useLegacySelect: false
  });

  if (isMissingSessionLogsTable(completedDayResult.error)) {
    logWarn("WORKOUT", "Workout session local-day lookup unavailable", {
      user_id: input.userId,
      error_code: getSupabaseErrorCode(completedDayResult.error)
    });

    return {
      ...dayRange,
      log: null
    };
  }

  if (isMissingSessionLogColumn(completedDayResult.error, "completed_day_sp")) {
    return lookupUserWorkoutSessionForLocalDayRange(supabase, input.userId, dayRange);
  }

  if (hasLegacyLatestSelectIssue(completedDayResult.error)) {
    const legacyResult = await readUserWorkoutSessionForCompletedDay(supabase, input.userId, dayRange, {
      useLegacySelect: true
    });

    if (isMissingSessionLogsTable(legacyResult.error)) {
      return {
        ...dayRange,
        log: null
      };
    }

    if (legacyResult.error) {
      logError("WORKOUT", "Workout session local-day legacy lookup failed", {
        user_id: input.userId,
        error_code: getSupabaseErrorCode(legacyResult.error)
      });

      return {
        ...dayRange,
        log: null
      };
    }

    if (legacyResult.data) {
      return {
        ...dayRange,
        log: mapSessionLogRow(legacyResult.data as SessionLogRow)
      };
    }

    return lookupUserWorkoutSessionForLocalDayRange(supabase, input.userId, dayRange);
  }

  if (completedDayResult.error) {
    logError("WORKOUT", "Workout session completed_day_sp lookup failed", {
      user_id: input.userId,
      error_code: getSupabaseErrorCode(completedDayResult.error)
    });

    return lookupUserWorkoutSessionForLocalDayRange(supabase, input.userId, dayRange);
  }

  if (completedDayResult.data) {
    return {
      ...dayRange,
      log: mapSessionLogRow(completedDayResult.data as SessionLogRow)
    };
  }

  return lookupUserWorkoutSessionForLocalDayRange(supabase, input.userId, dayRange);
}

export async function getAllTimeWorkoutCount(
  supabase: SupabaseLike,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("workout_session_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
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
    completedDaySp?: string | null;
  }
) {
  let insertOptions = {
    includePlanCycleId: Boolean(input.planCycleId),
    includeWorkoutHash: Boolean(input.workoutHash),
    includeWorkoutKey: Boolean(input.workoutKey),
    includeCompletedDaySp: Boolean(input.completedDaySp),
    useLegacySelect: false
  };
  let currentResult = await insertWorkoutSessionLog(supabase, input, insertOptions);

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

    insertOptions = {
      ...insertOptions,
      includePlanCycleId: false
    };
    currentResult = await insertWorkoutSessionLog(supabase, input, insertOptions);
  }

  if (isMissingSessionLogColumn(currentResult.error, "completed_day_sp")) {
    logWarn("WORKOUT", "Workout session log insert fallback without completed_day_sp", {
      workout_id: input.workoutId,
      error_code: getSupabaseErrorCode(currentResult.error)
    });

    insertOptions = {
      ...insertOptions,
      includeCompletedDaySp: false
    };
    currentResult = await insertWorkoutSessionLog(supabase, input, insertOptions);
  }

  if (currentResult.error || !currentResult.data) {
    return handleLegacyWorkoutSessionInsert(supabase, input, currentResult, insertOptions);
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
    completedDaySp?: string | null;
  },
  result: {
    data?: unknown;
    error?: unknown;
  },
  options: {
    includePlanCycleId: boolean;
    includeWorkoutHash: boolean;
    includeWorkoutKey: boolean;
    includeCompletedDaySp: boolean;
    useLegacySelect: boolean;
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
      includeCompletedDaySp: false,
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
      includePlanCycleId: options.includePlanCycleId,
      includeWorkoutHash: options.includeWorkoutHash,
      includeWorkoutKey: options.includeWorkoutKey,
      includeCompletedDaySp: options.includeCompletedDaySp,
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
    completedDaySp?: string | null;
  },
  options: {
    includePlanCycleId: boolean;
    includeWorkoutHash: boolean;
    includeWorkoutKey: boolean;
    includeCompletedDaySp: boolean;
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

  if (options.includeCompletedDaySp) {
    payload.completed_day_sp = input.completedDaySp ?? null;
  }

  return supabase
    .from("workout_session_logs")
    .insert(payload)
    .select(buildLatestSessionFields(options.useLegacySelect))
    .single();
}

async function readUserWorkoutSessionForCompletedDay(
  supabase: SupabaseLike,
  userId: string,
  dayRange: LocalDayRange,
  options: {
    useLegacySelect: boolean;
  }
) {
  return supabase
    .from("workout_session_logs")
    .select(buildLatestSessionFields(options.useLegacySelect))
    .eq("user_id", userId)
    .eq("completed_day_sp", dayRange.dayKey)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function readUserWorkoutSessionForLocalDayRange(
  supabase: SupabaseLike,
  userId: string,
  dayRange: LocalDayRange,
  options: {
    useLegacySelect: boolean;
  }
) {
  return supabase
    .from("workout_session_logs")
    .select(buildLatestSessionFields(options.useLegacySelect))
    .eq("user_id", userId)
    .gte("completed_at", dayRange.startUtcIso)
    .lt("completed_at", dayRange.endUtcIso)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

async function lookupUserWorkoutSessionForLocalDayRange(
  supabase: SupabaseLike,
  userId: string,
  dayRange: LocalDayRange
) {
  const result = await readUserWorkoutSessionForLocalDayRange(supabase, userId, dayRange, {
    useLegacySelect: false
  });

  if (isMissingSessionLogsTable(result.error)) {
    return {
      ...dayRange,
      log: null
    };
  }

  if (hasLegacyLatestSelectIssue(result.error)) {
    const legacyResult = await readUserWorkoutSessionForLocalDayRange(supabase, userId, dayRange, {
      useLegacySelect: true
    });

    if (isMissingSessionLogsTable(legacyResult.error)) {
      return {
        ...dayRange,
        log: null
      };
    }

    if (legacyResult.error) {
      logError("WORKOUT", "Workout session local-day legacy lookup failed", {
        user_id: userId,
        error_code: getSupabaseErrorCode(legacyResult.error)
      });

      return {
        ...dayRange,
        log: null
      };
    }

    return {
      ...dayRange,
      log: legacyResult.data ? mapSessionLogRow(legacyResult.data as SessionLogRow) : null
    };
  }

  if (result.error) {
    logError("WORKOUT", "Workout session local-day lookup failed", {
      user_id: userId,
      error_code: getSupabaseErrorCode(result.error)
    });

    return {
      ...dayRange,
      log: null
    };
  }

  return {
    ...dayRange,
    log: result.data ? mapSessionLogRow(result.data as SessionLogRow) : null
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

function buildSessionStatsCandidate(
  stats: {
    completedSessions: number;
    lastLog: WorkoutSessionLogEntry | null;
  },
  result: {
    countResult: { count?: number | null };
  },
  filterMode: SessionFilterMode
) {
  const rawCount = Number(result.countResult.count) || 0;
  const lastSessionNumber = stats.lastLog?.sessionNumber ?? 0;

  return {
    filterMode,
    completedSessions: stats.completedSessions,
    lastLog: stats.lastLog,
    rawCount,
    derivedCompletedSessions: Math.max(rawCount, lastSessionNumber)
  } satisfies SessionStatsCandidate;
}

function emptyWorkoutSessionStats() {
  return {
    completedSessions: 0,
    lastLog: null
  };
}

function selectPreferredWorkoutSessionStats(workoutId: string, candidates: SessionStatsCandidate[]) {
  if (!candidates.length) {
    return emptyWorkoutSessionStats();
  }

  const preferredCandidates = candidates.filter((candidate) => candidate.filterMode !== "none");
  const candidatePool = preferredCandidates.length ? preferredCandidates : candidates;
  const bestCandidate = candidatePool.reduce((currentBest, candidate) => {
    if (!currentBest) {
      return candidate;
    }

    if (candidate.derivedCompletedSessions > currentBest.derivedCompletedSessions) {
      return candidate;
    }

    if (
      candidate.derivedCompletedSessions === currentBest.derivedCompletedSessions &&
      getSessionFilterPriority(candidate.filterMode) < getSessionFilterPriority(currentBest.filterMode)
    ) {
      return candidate;
    }

    return currentBest;
  }, null as SessionStatsCandidate | null);

  if (!bestCandidate) {
    return emptyWorkoutSessionStats();
  }

  if (bestCandidate.derivedCompletedSessions > bestCandidate.rawCount) {
    logWarn("WORKOUT", "Workout session stats repaired from legacy cycle gaps", {
      workout_id: workoutId,
      filter_mode: bestCandidate.filterMode,
      raw_completed_sessions: bestCandidate.rawCount,
      derived_completed_sessions: bestCandidate.derivedCompletedSessions,
      last_session_number: bestCandidate.lastLog?.sessionNumber ?? null
    });
  }

  return {
    completedSessions: bestCandidate.derivedCompletedSessions,
    lastLog: bestCandidate.lastLog
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

function getSessionFilterPriority(filterMode: SessionFilterMode) {
  if (filterMode === "plan_cycle_id") return 0;
  if (filterMode === "workout_hash") return 1;
  if (filterMode === "cycle_started_at") return 2;
  return 3;
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

function getLocalDayRange(referenceDate: Date | string | number | null | undefined, timeZone: string): LocalDayRange {
  const reference = normalizeReferenceDate(referenceDate);
  const localNow = getTimeZoneParts(reference, timeZone);
  const nextLocalDay = addUtcCalendarDays(localNow.year, localNow.month, localNow.day, 1);
  const startUtc = zonedDateTimeToUtc(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: 0,
      minute: 0,
      second: 0
    },
    timeZone
  );
  const endUtc = zonedDateTimeToUtc(
    {
      year: nextLocalDay.year,
      month: nextLocalDay.month,
      day: nextLocalDay.day,
      hour: 0,
      minute: 0,
      second: 0
    },
    timeZone
  );

  return {
    dayKey: `${localNow.year}-${padNumber(localNow.month)}-${padNumber(localNow.day)}`,
    timeZone,
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString()
  };
}

function normalizeReferenceDate(referenceDate: Date | string | number | null | undefined) {
  if (referenceDate instanceof Date && Number.isFinite(referenceDate.getTime())) {
    return referenceDate;
  }

  if (typeof referenceDate === "string" || typeof referenceDate === "number") {
    const parsed = new Date(referenceDate);

    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function getTimeZoneParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map<string, string>();

  parts.forEach((part) => {
    if (part.type !== "literal") {
      lookup.set(part.type, part.value);
    }
  });

  return {
    year: Number(lookup.get("year") ?? "0"),
    month: Number(lookup.get("month") ?? "0"),
    day: Number(lookup.get("day") ?? "0"),
    hour: Number(lookup.get("hour") ?? "0"),
    minute: Number(lookup.get("minute") ?? "0"),
    second: Number(lookup.get("second") ?? "0")
  };
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timeZone: string) {
  const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guessUtc = targetUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolved = getTimeZoneParts(new Date(guessUtc), timeZone);
    const resolvedUtc = Date.UTC(
      resolved.year,
      resolved.month - 1,
      resolved.day,
      resolved.hour,
      resolved.minute,
      resolved.second
    );
    const diff = targetUtc - resolvedUtc;

    if (diff === 0) {
      break;
    }

    guessUtc += diff;
  }

  return new Date(guessUtc);
}

function addUtcCalendarDays(year: number, month: number, day: number, daysToAdd: number) {
  const next = new Date(Date.UTC(year, month - 1, day + daysToAdd, 0, 0, 0));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}
