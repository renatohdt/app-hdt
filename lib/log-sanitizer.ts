const REDACTED = "[REDACTED]";
const REDACTED_AUTH_RESPONSE = "[REDACTED_AUTH_RESPONSE]";
const REDACTED_ANSWERS = "[REDACTED_ANSWERS]";
const REDACTED_PROFILE = "[REDACTED_PROFILE]";

const WHOLE_OBJECT_KEYS = ["answers", "session", "auth_response", "sign_up_response", "login_response"];
const SENSITIVE_KEYS = ["password", "token", "authorization", "secret", "refresh", "access_key", "access_token"];
const PROFILE_KEYS = ["body_type", "body_type_raw", "weight", "height", "age", "wrist"];

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") ?? "";
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split("@");
  if (!localPart || !domain) {
    return REDACTED;
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(1, localPart.length - visibleLocal.length))}@${domain}`;
}

function maskStringValue(key: string, value: string) {
  const normalizedKey = normalizeKey(key);

  if (normalizedKey.includes("email")) {
    return maskEmail(value);
  }

  if (SENSITIVE_KEYS.some((tokenKey) => normalizedKey.includes(tokenKey))) {
    return REDACTED;
  }

  if (PROFILE_KEYS.some((profileKey) => normalizedKey.includes(profileKey))) {
    return REDACTED_PROFILE;
  }

  if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) {
    return REDACTED;
  }

  return value;
}

function shouldRedactWholeObject(key: string) {
  const normalizedKey = normalizeKey(key);
  return WHOLE_OBJECT_KEYS.some((candidate) => normalizedKey.includes(candidate));
}

function sanitizeInternal(value: unknown, key: string, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return maskStringValue(key, value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    if (PROFILE_KEYS.some((profileKey) => normalizeKey(key).includes(profileKey))) {
      return REDACTED_PROFILE;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternal(item, key, seen));
  }

  if (typeof value === "object") {
    if (shouldRedactWholeObject(key)) {
      return key.includes("answer") ? REDACTED_ANSWERS : REDACTED_AUTH_RESPONSE;
    }

    if (seen.has(value as object)) {
      return "[Circular]";
    }

    seen.add(value as object);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => {
        const normalizedEntryKey = normalizeKey(entryKey);

        if (normalizedEntryKey === "answers") {
          return [entryKey, REDACTED_ANSWERS];
        }

        if (normalizedEntryKey.includes("auth") || normalizedEntryKey.includes("session")) {
          return [entryKey, REDACTED_AUTH_RESPONSE];
        }

        return [entryKey, sanitizeInternal(entryValue, entryKey, seen)];
      })
    );
  }

  return value;
}

export function sanitizeForLogs<T>(value: T): T {
  return sanitizeInternal(value, "", new WeakSet<object>()) as T;
}
