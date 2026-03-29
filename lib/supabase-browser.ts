import {
  createSupabaseBrowserClient as createSharedSupabaseBrowserClient,
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabase
} from "@/lib/supabase";

export function getSupabaseBrowserConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const missing: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    url,
    anonKey,
    missing,
    ok: missing.length === 0
  };
}

export function getSupabaseBrowserSetupError() {
  return getSupabaseConfigError();
}

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase ?? createSharedSupabaseBrowserClient();
}
