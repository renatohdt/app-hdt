export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function getSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as SupabaseErrorLike).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const parts = [
    (error as SupabaseErrorLike).message,
    (error as SupabaseErrorLike).details,
    (error as SupabaseErrorLike).hint
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return parts.join(" ").trim().toLowerCase();
}

export function isSupabaseMissingColumnError(error: unknown, column: string) {
  const code = getSupabaseErrorCode(error);
  const message = getSupabaseErrorMessage(error);
  const normalizedColumn = column.trim().toLowerCase();

  if (!normalizedColumn) {
    return false;
  }

  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes(normalizedColumn) &&
      (message.includes("column") || message.includes("schema cache") || message.includes("could not find")))
  );
}

export function isSupabaseMissingRelationError(error: unknown, relation: string) {
  const code = getSupabaseErrorCode(error);
  const message = getSupabaseErrorMessage(error);
  const normalizedRelation = relation.trim().toLowerCase();

  if (!normalizedRelation) {
    return false;
  }

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes(normalizedRelation) &&
      (message.includes("relation") ||
        message.includes("table") ||
        message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find")))
  );
}
