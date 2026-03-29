import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "hora_do_treino_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

export type AdminSessionPayload = {
  sub: string;
  email: string;
  mode: "env" | "supabase";
  exp: number;
};

export function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  return secret || null;
}

export function signAdminSession(payload: AdminSessionPayload) {
  const secret = getAdminSessionSecret();
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET nao configurado.");
  }

  const serialized = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(serialized).digest("hex");
  return Buffer.from(JSON.stringify({ payload, signature }), "utf8").toString("base64url");
}

export function setAdminSessionCookie(response: NextResponse, payload: AdminSessionPayload) {
  response.cookies.set(ADMIN_SESSION_COOKIE, signAdminSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export function readAdminSession(request: Request): AdminSessionPayload | null {
  try {
    const secret = getAdminSessionSecret();
    if (!secret) {
      return null;
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const token = cookieHeader
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))
      ?.slice(`${ADMIN_SESSION_COOKIE}=`.length);

    if (!token) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      payload?: AdminSessionPayload;
      signature?: string;
    };

    if (!decoded.payload || !decoded.signature) {
      return null;
    }

    const serialized = JSON.stringify(decoded.payload);
    const expectedSignature = createHmac("sha256", secret).update(serialized).digest("hex");
    const left = Buffer.from(expectedSignature);
    const right = Buffer.from(decoded.signature);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return null;
    }

    if (!decoded.payload.exp || decoded.payload.exp < Date.now()) {
      return null;
    }

    return decoded.payload;
  } catch {
    return null;
  }
}
