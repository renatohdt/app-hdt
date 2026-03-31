import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return jsonError("Não foi possível excluir sua conta agora.", 500);
  }

  const externalLimitations = [
    "Registros historicos e integracoes externas, como plataformas de analytics, anuncios e automacao, podem exigir remocao operacional separada fora do app."
  ];

  const { error } = await supabase.auth.admin.deleteUser(auth.user.id);

  if (error) {
    return jsonError("Não foi possível excluir sua conta agora.", 500);
  }

  return jsonSuccess(
    {
      deleted: true,
      userId: auth.user.id,
      deletedAt: new Date().toISOString(),
      externalLimitations,
      message:
        "Sua conta foi excluida e os dados vinculados ao app foram apagados em cascata. Servicos externos podem exigir tratamento operacional complementar."
    },
    200
  );
}
