import "server-only";
import { createClient } from "@supabase/supabase-js";

function getEnvValue(value?: string | null) {
  return value?.trim() || "";
}

export function createSupabaseServerAuthClient() {
  const url = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
