import { NextResponse } from "next/server";

/**
 * Link curto da comunidade no WhatsApp.
 *
 * URL: https://app.horadotreino.com.br/comunidade
 * Redireciona para o convite da comunidade.
 *
 * Para trocar o convite (ex.: depois de redefinir o link no WhatsApp), mude só
 * a constante abaixo e publique na Vercel. Os botões do app continuam iguais.
 */
const WHATSAPP_COMMUNITY_INVITE = "https://chat.whatsapp.com/ClOGOwOHeA5DwGYA3rlE0V";

export function GET() {
  return NextResponse.redirect(WHATSAPP_COMMUNITY_INVITE, { status: 302 });
}
