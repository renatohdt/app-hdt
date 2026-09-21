"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSubscription } from "@/components/use-subscription";
import { identifyUser, resetUser, setUserProperties } from "@/lib/posthog-client";

// Liga a identidade do usuario ao PostHog:
// - identify() no login (id do Supabase + email)
// - reset() no logout
// - propriedade "plan"/"is_premium" assim que a assinatura e conhecida
export function PostHogIdentify() {
  const { subscription, loading } = useSubscription();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const client = supabase;

    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      const user = data.session?.user;
      if (user) {
        userIdRef.current = user.id;
        identifyUser(user.id, { email: user.email ?? undefined });
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (event === "SIGNED_OUT" || !user) {
        userIdRef.current = null;
        resetUser();
        return;
      }
      userIdRef.current = user.id;
      identifyUser(user.id, { email: user.email ?? undefined });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || !subscription || !userIdRef.current) {
      return;
    }
    setUserProperties({ plan: subscription.plan, is_premium: subscription.isPremium });
  }, [loading, subscription]);

  return null;
}
