import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { logError, logInfo } from "@/lib/server-logger";
import { sendLeadLoversInterest } from "@/lib/leadlovers";

export const dynamic = "force-dynamic";

// Mapeia o tipo de interesse para o NOME da sequência no LeadLovers.
// Os nomes precisam bater EXATAMENTE com os cadastrados no painel do LeadLovers.
const SEQUENCE_NAME_BY_TYPE: Record<string, string> = {
  premium: "Interesse Premium",
  program: "Interesse Programa"
};

// Chamado quando o usuário toca em "Tenho interesse" (Premium ou Programa)
// dentro do app. Identifica o usuário logado e o adiciona na sequência de
// e-mails correspondente no LeadLovers.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const body = (await request.json().catch(() => null)) as { type?: string } | null;
    const type = body?.type ?? "";
    const sequenceName = SEQUENCE_NAME_BY_TYPE[type];

    if (!sequenceName) {
      return jsonError("Tipo de interesse inválido.", 400);
    }

    const email = auth.user.email;
    if (!email) {
      return jsonError("Sua conta não tem e-mail cadastrado.", 400);
    }

    // Nome: busca no perfil; se não achar, usa a parte antes do @ do e-mail.
    let name = email.split("@")[0] || "Interessado";
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const { data } = await supabase.from("users").select("name").eq("id", auth.user.id).maybeSingle();
      if (data?.name) {
        name = data.name;
      }
    }

    const result = await sendLeadLoversInterest({ email, name, sequenceName });

    logInfo("INTEREST", "Interesse registrado", {
      type,
      user_id: auth.user.id,
      ok: result.ok,
      reason: result.reason ?? null
    });

    // Não quebramos a experiência do usuário se o LeadLovers falhar:
    // o botão já mostrou "interesse registrado" no app. Só reportamos o status.
    return jsonSuccess({ registered: result.ok });
  } catch (error) {
    logError("INTEREST", "Erro inesperado", { error: String(error) });
    return jsonError("Erro interno.", 500);
  }
}
