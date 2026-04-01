"use client";

import { useEffect } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";

const APP_SESSION_STORAGE_PREFIX = "hora-do-treino-app-session";

export function AppSessionTracker({ userId, source }: { userId: string | null | undefined; source: string }) {
  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }

    const storageKey = `${APP_SESSION_STORAGE_PREFIX}:${userId}:${getTodayBucket()}`;
    const pendingKey = `${storageKey}:pending`;

    try {
      if (window.localStorage.getItem(storageKey) || window.sessionStorage.getItem(pendingKey)) {
        return;
      }

      window.sessionStorage.setItem(pendingKey, "1");
    } catch {
      // Ignore storage failures and still attempt to register the session once.
    }

    void registerAppSession(userId, source, storageKey, pendingKey);
  }, [source, userId]);

  return null;
}

async function registerAppSession(userId: string, source: string, storageKey: string, pendingKey: string) {
  try {
    const response = await fetchWithAuth("/api/app-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source,
        path: typeof window !== "undefined" ? window.location.pathname : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`app-session-${response.status}`);
    }

    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Ignore storage failures after the request succeeds.
    }
  } catch (error) {
    clientLogError("APP SESSION TRACK ERROR", {
      error: error instanceof Error ? error.message : "unknown",
      user_id: userId,
      source
    });
  } finally {
    try {
      window.sessionStorage.removeItem(pendingKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

function getTodayBucket() {
  return new Date().toISOString().slice(0, 10);
}
