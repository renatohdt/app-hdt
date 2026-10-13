import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

export type PremiumPotentialUser = {
  id: string;
  name: string;
  email: string;
  /** Treinos concluídos no período pedido (30 dias ou histórico todo). */
  session_count: number;
  /** Treinos concluídos desde o cadastro. */
  total_sessions: number;
  created_at: string;
  last_workout_at: string | null;
};

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) return jsonError("Supabase não configurado.", 500);

    // Período: ?days=30 (padrão) conta só os últimos 30 dias; ?days=all usa o histórico todo.
    const daysParam = new URL(request.url).searchParams.get("days");
    const days = daysParam === "all" ? null : Number(daysParam) > 0 ? Math.floor(Number(daysParam)) : 30;

    // Busca usuários free com 5+ treinos concluídos no período. A função do banco já
    // tira quem é Premium pelo Stripe, pelas lojas (Android/iOS) ou pelo Indique e Ganhe.
    let { data: potentialRows, error: potentialError } = await supabase.rpc(
      "get_premium_potential_users",
      { p_days: days }
    );

    // Segurança para a transição: se a migration nova ainda não foi aplicada neste
    // banco, a função antiga (sem parâmetro) continua respondendo.
    if (potentialError) {
      logError("ADMIN", "premium-potential RPC with period failed, falling back", {
        error: potentialError.message
      });
      ({ data: potentialRows, error: potentialError } = await supabase.rpc("get_premium_potential_users"));
    }

    if (potentialError) {
      logError("ADMIN", "premium-potential RPC failed", { error: potentialError.message });
      return jsonError("Não foi possível carregar os dados.", 500);
    }

    type PotentialRow = {
      user_id: string;
      session_count: number;
      total_sessions?: number;
      last_workout_at: string | null;
    };
    const rows = (potentialRows ?? []) as PotentialRow[];

    if (!rows.length) {
      return jsonSuccess([], 200);
    }

    const userIds = rows.map((r) => r.user_id);

    // Busca nome dos usuários
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, created_at")
      .in("id", userIds);

    const userMap = new Map(
      ((usersData ?? []) as { id: string; name: string; created_at: string }[]).map((u) => [
        u.id,
        u
      ])
    );

    // Busca e-mails via auth admin
    const emailMap = new Map<string, string>();
    const targetIds = new Set(userIds);
    let page = 1;
    let keepLoading = true;

    while (keepLoading) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        if (u.id && targetIds.has(u.id)) {
          emailMap.set(u.id, u.email ?? "");
        }
      }
      keepLoading = users.length === 100 && emailMap.size < targetIds.size;
      page += 1;
      if (emailMap.size >= targetIds.size) keepLoading = false;
    }

    const result: PremiumPotentialUser[] = rows
      .sort((a, b) => b.session_count - a.session_count)
      .map((row) => {
        const user = userMap.get(row.user_id);
        return {
          id: row.user_id,
          name: user?.name ?? "—",
          email: emailMap.get(row.user_id) ?? "—",
          session_count: row.session_count,
          total_sessions: row.total_sessions ?? row.session_count,
          created_at: user?.created_at ?? "",
          last_workout_at: row.last_workout_at
        };
      });

    return jsonSuccess(result, 200);
  } catch (error) {
    logError("ADMIN", "premium-potential route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Erro interno.", 500);
  }
}
