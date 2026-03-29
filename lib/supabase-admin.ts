import "server-only";
import { createClient } from "@supabase/supabase-js";

function getEnvValue(value?: string) {
  return value?.trim() || null;
}

const supabaseUrl = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = getEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export function createSupabaseAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    console.warn("Supabase admin não configurado.");
    return null;
  }

  return createClient(supabaseUrl as string, supabaseServiceRoleKey as string, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
