"use client";

import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";
import { hasConsentPreference } from "@/lib/consent-storage";
import { clientLogError } from "@/lib/client-logger";

type AnalyticsEventName =
  | "home_view"
  | "page_view"
  | "quiz_started"
  | "quiz_start"
  | "signup"
  | "sign_up"
  | "quiz_completed"
  | "workout_viewed"
  | "cta_clicked"
  | "cta_click"
  | "article_click";

export function getTrackingUserId(explicitUserId?: string | null) {
  if (explicitUserId) {
    return explicitUserId;
  }

  if (typeof window === "undefined") {
    return "anonymous";
  }

  const existing = window.sessionStorage.getItem("hora-do-treino-tracking-id");
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}`;

  window.sessionStorage.setItem("hora-do-treino-tracking-id", nextId);
  return nextId;
}

export function trackEvent(
  event_name: AnalyticsEventName,
  user_id: string,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  if (!hasConsentPreference("analytics")) {
    return;
  }

  void (async () => {
    const token = await getAccessToken();
    if (!token) {
      return;
    }

    const body = JSON.stringify({
      event_name,
      user_id,
      metadata: metadata ?? {}
    });

    await fetchWithAuth("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });
  })().catch((error) => {
    clientLogError("TRACK EVENT ERROR", error);
  });
}
