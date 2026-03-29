"use client";

import { sanitizeForLogs } from "@/lib/log-sanitizer";

type ClientLogLevel = "log" | "warn" | "error";

function write(level: ClientLogLevel, message: string, meta?: unknown) {
  const sanitizedMeta = meta === undefined ? undefined : sanitizeForLogs(meta);

  if (sanitizedMeta === undefined) {
    console[level](message);
    return;
  }

  console[level](message, sanitizedMeta);
}

export function clientLogInfo(message: string, meta?: unknown) {
  write("log", message, meta);
}

export function clientLogWarn(message: string, meta?: unknown) {
  write("warn", message, meta);
}

export function clientLogError(message: string, meta?: unknown) {
  write("error", message, meta);
}
