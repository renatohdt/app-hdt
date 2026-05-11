import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Rota de redirecionamento para compartilhamento social.
 *
 * URL curta:  https://app.horadotreino.com.br/go?s=threads&m=treino
 * Redireciona para a URL completa com parâmetros UTM.
 *
 * Parâmetros aceitos:
 *   s (source): threads | x | wa | bsky
 *   m (medium): treino | conquista
 */

const SOURCE_MAP: Record<string, string> = {
  threads: "threads",
  x: "twitter",
  wa: "whatsapp",
  bsky: "bluesky",
};

const MEDIUM_MAP: Record<string, string> = {
  treino: "workout",
  conquista: "achievement",
};

const BASE_URL = "https://app.horadotreino.com.br";
const FALLBACK_URL = BASE_URL;

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const sourceParam = searchParams.get("s") ?? "";
  const mediumParam = searchParams.get("m") ?? "";

  const utmSource = SOURCE_MAP[sourceParam];
  const utmMedium = MEDIUM_MAP[mediumParam];

  // Se os parâmetros forem inválidos, redireciona para a home sem UTM
  if (!utmSource || !utmMedium) {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 });
  }

  const destination = new URL(BASE_URL);
  destination.searchParams.set("utm_source", utmSource);
  destination.searchParams.set("utm_medium", utmMedium);
  destination.searchParams.set("utm_campaign", "social_share");

  return NextResponse.redirect(destination.toString(), { status: 302 });
}
