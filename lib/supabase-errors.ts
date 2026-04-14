export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function getSupabaseErrorParts(error: unknown) {
  if (!error || typeof error !== "object") {
    return [] as string[];
  }

  return [
    (error as SupabaseErrorLike).message,
    (error as SupabaseErrorLike).details,
    (error as SupabaseErrorLike).hint
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function getSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as SupabaseErrorLike).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export function getSupabaseErrorMessage(error: unknown) {
  return getSupabaseErrorParts(error).join(" ").trim().toLowerCase();
}

export function getSupabaseErrorConstraint(error: unknown) {
  for (const part of getSupabaseErrorParts(error)) {
    const match = part.match(/(?:constraint|index)\s+"([^"]+)"/i);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

export function isSupabaseUniqueViolation(error: unknown) {
  const code = getSupabaseErrorCode(error);
  const message = getSupabaseErrorMessage(error);

  return (
    code === "23505" ||
    message.includes("duplicate key value") ||
    message.includes("unique constraint") ||
    message.includes("already exists")
  );
}

export function isSupabaseUniqueConstraintError(error: unknown, constraint: string) {
  const normalizedConstraint = constraint.trim().toLowerCase();

  if (!normalizedConstraint || !isSupabaseUniqueViolation(error)) {
    return false;
  }

  const resolvedConstraint = getSupabaseErrorConstraint(error);

  return (
    resolvedConstraint?.toLowerCase() === normalizedConstraint ||
    getSupabaseErrorMessage(error).includes(normalizedConstraint)
  );
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
