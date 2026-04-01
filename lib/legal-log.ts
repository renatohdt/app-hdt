import "server-only";

import { TERMS_OF_USE_VERSION } from "@/lib/legal-content";
import { logWarn } from "@/lib/server-logger";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function recordTermsOfUseAcceptance(userId: string, acceptedAt: string, source = "signup_account_step") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("user_consents").upsert({
    user_id: userId,
    scope: "terms_of_use",
    granted: true,
    version: TERMS_OF_USE_VERSION,
    source,
    granted_at: acceptedAt,
    revoked_at: null
  }, {
    onConflict: "user_id,scope"
  });

  if (error) {
    logWarn("LEGAL", "Terms acceptance log failed", {
      user_id: userId,
      source
    });
  }
}
