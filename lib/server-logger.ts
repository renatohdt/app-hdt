import { sanitizeForLogs } from "@/lib/log-sanitizer";

type LogLevel = "INFO" | "WARN" | "ERROR";

function write(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  const line = `[${scope}] ${message}`;
  const sanitizedMeta = meta ? sanitizeForLogs(meta) : "";

  if (level === "ERROR") {
    console.error(line, sanitizedMeta);
    return;
  }

  if (level === "WARN") {
    console.warn(line, sanitizedMeta);
    return;
  }

  console.log(line, sanitizedMeta);
}

export function logInfo(scope: string, message: string, meta?: Record<string, unknown>) {
  write("INFO", scope, message, meta);
}

export function logWarn(scope: string, message: string, meta?: Record<string, unknown>) {
  write("WARN", scope, message, meta);
}

export function logError(scope: string, message: string, meta?: Record<string, unknown>) {
  write("ERROR", scope, message, meta);
}
