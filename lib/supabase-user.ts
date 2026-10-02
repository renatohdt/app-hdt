import "server-only";

import { createClient } from "@supabase/supabase-js";

function getEnvValue(value?: string) {
  return value?.trim() || null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

// O Next.js guarda em cache (Data Cache) as chamadas fetch feitas no servidor.
// Como o supabase-js usa fetch por baixo, a resposta do banco podia ficar
// "congelada" (ex.: calendário sem o treino recém-concluído). Dados do usuário
// precisam vir sempre frescos do banco, então desligamos o cache aqui.
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

const supabaseUrl = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = getEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function createSupabaseUserClient(request: Request) {
  const accessToken = getBearerToken(request);

  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      fetch: noStoreFetch
    }
  });
}
