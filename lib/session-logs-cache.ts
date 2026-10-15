"use client";

// Histórico COMPLETO de treinos (todos os programas, locais e extras).
// O payload do treino só traz as sessões do programa atual; a semana da Home e
// a página Evolução precisam de tudo. Cache no aparelho para aparecer na hora.

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import type { WorkoutSessionLogEntry } from "@/lib/workout-sessions";

const SESSION_LOGS_CACHE_KEY = "hdt_session_logs_cache_v1";

export function readSessionLogsCache(userId: string): WorkoutSessionLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSION_LOGS_CACHE_KEY);
    if (!raw) return [];
    const entry = JSON.parse(raw) as { userId?: string; logs?: WorkoutSessionLogEntry[] };
    return entry?.userId === userId && Array.isArray(entry.logs) ? entry.logs : [];
  } catch {
    return [];
  }
}

export function writeSessionLogsCache(userId: string, logs: WorkoutSessionLogEntry[]) {
  try {
    window.localStorage.setItem(SESSION_LOGS_CACHE_KEY, JSON.stringify({ userId, logs }));
  } catch {
    // sem espaço/bloqueado: segue sem cache
  }
}

/** Lê o cache na hora e atualiza pela API (de novo ao voltar para o app). */
export function useAllSessionLogs(userId: string, fallback: WorkoutSessionLogEntry[] = []) {
  const [logs, setLogs] = useState<WorkoutSessionLogEntry[]>(() => {
    const cached = readSessionLogsCache(userId);
    return cached.length ? cached : fallback;
  });

  useEffect(() => {
    let active = true;
    function fetchLogs() {
      fetchWithAuth("/api/workout/session-logs")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (active && json?.success && Array.isArray(json.data)) {
            setLogs(json.data);
            writeSessionLogsCache(userId, json.data);
          }
        })
        .catch(() => {
          /* falha silenciosa: fica com o cache */
        });
    }
    fetchLogs();
    function handleVisibilityChange() {
      if (!document.hidden) fetchLogs();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId]);

  return logs;
}
