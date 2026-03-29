import { timingSafeEqual } from "crypto";
import { enforceRateLimit, getRequestFingerprint } from "@/lib/rate-limit";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import {
  ADMIN_SESSION_MAX_AGE,
  getAdminSessionSecret,
  setAdminSessionCookie
} from "@/lib/admin-session";
import { recordAdminAuditLog } from "@/lib/admin-audit";

function getEnvAdminConfig() {
  const rawEmail = process.env.ADMIN_EMAIL ?? "";
  const rawPassword = process.env.ADMIN_PASSWORD ?? "";

  return {
    email: rawEmail.trim().toLowerCase(),
    password: rawPassword.trim(),
    hasEmail: Boolean(rawEmail.trim()),
    hasPassword: Boolean(rawPassword.trim())
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase() ?? "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return jsonError("Informe e-mail e senha.", 400);
    }

    const rateKey = `admin-login:${getRequestFingerprint(request, email)}:${email}`;
    const rateLimit = enforceRateLimit(rateKey, 5, 15 * 60 * 1000);

    if (!rateLimit.allowed) {
      logWarn("ADMIN", "Admin login rate limited", { email });
      return jsonError("Muitas tentativas de login. Tente novamente em alguns minutos.", 429);
    }

    const adminSessionSecret = getAdminSessionSecret();
    if (!adminSessionSecret) {
      logWarn("ADMIN", "Admin session secret missing");
      return jsonError("Nao foi possivel validar o acesso admin agora.", 500);
    }

    const envAdmin = getEnvAdminConfig();

    if (envAdmin.hasEmail !== envAdmin.hasPassword) {
      logWarn("ADMIN", "Incomplete env admin configuration", {
        has_admin_email: envAdmin.hasEmail,
        has_admin_password: envAdmin.hasPassword
      });
      return jsonError("Nao foi possivel validar o acesso admin agora.", 500);
    }

    if (envAdmin.hasEmail && envAdmin.hasPassword) {
      const isEmailMatch = envAdmin.email === email;
      const isPasswordMatch = safeStringEquals(envAdmin.password, password);

      if (!isEmailMatch || !isPasswordMatch) {
        logWarn("ADMIN", "Env admin login denied", { email });
        return jsonError("E-mail ou senha de admin invalidos.", 401);
      }

      const response = jsonSuccess({ mode: "env" }, 200);
      setAdminSessionCookie(response, {
        sub: "env-admin",
        email,
        mode: "env",
        exp: Date.now() + ADMIN_SESSION_MAX_AGE * 1000
      });
      await recordAdminAuditLog({
        adminId: "env-admin",
        adminEmail: email,
        action: "login",
        targetType: "admin_session",
        targetId: "env-admin",
        metadata: {
          mode: "env"
        }
      });
      logInfo("ADMIN", "Env admin login OK", { email });
      return response;
    }

    const supabaseAuth = createSupabaseServerAuthClient();
    const supabaseAdmin = createSupabaseAdminClient();

    if (!supabaseAuth || !supabaseAdmin) {
      logWarn("ADMIN", "Admin login unavailable", {
        has_env_admin: false,
        has_supabase_auth: Boolean(supabaseAuth),
        has_supabase_admin: Boolean(supabaseAdmin)
      });
      return jsonError("Nao foi possivel validar o acesso admin agora.", 500);
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user?.id) {
      logWarn("ADMIN", "Supabase admin login denied", { email });
      return jsonError("E-mail ou senha de admin invalidos.", 401);
    }

    const { data: userRow, error: roleError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (roleError) {
      logError("ADMIN", "Role lookup failed during login", { email });
      return jsonError("Nao foi possivel validar o acesso admin agora.", 500);
    }

    const role = typeof userRow?.role === "string" ? userRow.role.trim().toLowerCase() : "";

    if (role !== "admin") {
      logWarn("ADMIN", "Non-admin user denied", { email, user_id: data.user.id });
      return jsonError("Acesso negado ao admin.", 403);
    }

    const response = jsonSuccess({ mode: "supabase" }, 200);
    setAdminSessionCookie(response, {
      sub: data.user.id,
      email,
      mode: "supabase",
      exp: Date.now() + ADMIN_SESSION_MAX_AGE * 1000
    });
    await recordAdminAuditLog({
      adminId: data.user.id,
      adminEmail: email,
      action: "login",
      targetType: "admin_session",
      targetId: data.user.id,
      metadata: {
        mode: "supabase"
      }
    });
    logInfo("ADMIN", "Supabase admin login OK", { user_id: data.user.id });
    return response;
  } catch (error) {
    logError("ADMIN", "Admin login route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Nao foi possivel entrar no admin agora.", 500);
  }
}

function safeStringEquals(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
