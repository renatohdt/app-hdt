"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

type SubscriptionSummary = {
  plan: "free" | "monthly" | "annual";
  isPremium: boolean;
  renewsAt: string | null;
  cancelsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type UseSubscriptionResult = {
  subscription: SubscriptionSummary | null;
  loading: boolean;
};

const DEFAULT: SubscriptionSummary = {
  plan: "free",
  isPremium: false,
  renewsAt: null,
  cancelsAt: null,
  cancelAtPeriodEnd: false,
};

export function useSubscription(): UseSubscriptionResult {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        const response = await fetchWithAuth("/api/subscription");

        if (!response.ok) {
          if (!cancelled) {
            setSubscription(DEFAULT);
          }
          return;
        }

        const json = await response.json();
        if (!cancelled) {
          setSubscription(json?.data ?? DEFAULT);
        }
      } catch {
        if (!cancelled) {
          setSubscription(DEFAULT);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  return { subscription, loading };
}
