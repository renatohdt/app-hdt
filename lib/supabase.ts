import { createClient } from "@supabase/supabase-js";

function getEnvValue(value?: string) {
  return value?.trim() || null;
}

const supabaseUrl = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseConfigError() {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!missing.length) return null;
  return `Supabase não configurado. Variáveis ausentes: ${missing.join(", ")}`;
}

export const supabase =
  isSupabaseConfigured() ? createClient(supabaseUrl as string, supabaseAnonKey as string) : null;

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    console.warn(getSupabaseConfigError());
    return null;
  }

  return createClient(supabaseUrl as string, supabaseAnonKey as string);
}
