import "server-only";

import { readAdminSession } from "@/lib/admin-session";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server-auth";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import { logInfo, logWarn } from "@/lib/server-logger";
import { jsonError } from "@/lib/server-response";

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

// Cliente reaproveitado entre requisições (a função "quente" na Vercel guarda
// o módulo em memória). As chaves públicas do Supabase (JWKS) ficam em cache.
let authClient: ReturnType<typeof createSupabaseServerAuthClient> | undefined;

function getAuthClient() {
  if (authClient === undefined) {
    authClient = createSupabaseServerAuthClient();
  }
  return authClient;
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(request);
  const supabase = getAuthClient();

  if (!token || !supabase) {
    return null;
  }

  // getClaims() confere a assinatura do token LOCALMENTE (chave ES256 pública
  // do projeto, em cache) — sem ida ao servidor de Auth a cada requisição.
  // Se o projeto usasse chave simétrica, a própria lib cai no getUser().
  // Observação: um token continua válido até expirar (1h), mesmo após logout
  // em outro aparelho — comportamento padrão do Supabase com JWT.
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as { sub?: unknown; email?: unknown; role?: unknown } | undefined;

  if (error || !claims || typeof claims.sub !== "string" || !claims.sub || claims.role !== "authenticated") {
    return null;
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null
  };
}

export async function requireAuthenticatedUser(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      user: null,
      response: jsonError("Sua sessão expirou. Faça login novamente.", 401)
    };
  }

  return {
    user,
    response: null
  };
}

export async function requireAdminUser(request: Request, scope = "ADMIN") {
  const adminSession = readAdminSession(request);

  if (adminSession) {
    logInfo(scope, "Access granted", { admin_mode: adminSession.mode, email: adminSession.email });
    return {
      user: {
        id: adminSession.sub,
        email: adminSession.email
      },
      response: null
    };
  }

  const auth = await requireAuthenticatedUser(request);

  if (auth.response || !auth.user) {
    logWarn(scope, "Access denied", { reason: "unauthenticated" });
    return {
      user: null,
      response: auth.response ?? jsonError("Acesso negado.", 401)
    };
  }

  const supabase = createSupabaseUserClient(request);
  const { data: userRow, error } = supabase
    ? await supabase.from("users").select("role").eq("id", auth.user.id).maybeSingle()
    : { data: null, error: new Error("Supabase user client indisponível") };
  const role = typeof userRow?.role === "string" ? userRow.role.trim().toLowerCase() : "";

  if (error) {
    logWarn(scope, "Access denied", { user_id: auth.user.id, reason: "role_lookup_failed" });
    return {
      user: null,
      response: jsonError("Acesso negado.", 403)
    };
  }

  if (role !== "admin") {
    logWarn(scope, "Access denied", { user_id: auth.user.id });
    return {
      user: null,
      response: jsonError("Acesso negado.", 403)
    };
  }

  logInfo(scope, "Access granted", { user_id: auth.user.id });
  return {
    user: auth.user,
    response: null
  };
}
