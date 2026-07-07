import { logWarn } from "@/lib/server-logger";

// Cliente Supabase mínimo (mesmo padrão dos outros stores do projeto).
type SupabaseLike = {
  from: (table: string) => any;
};

// Uma linha da tabela `programs` (catálogo montado pelo admin).
export type ProgramRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  goal: string;
  level: string;
  duration_weeks: number;
  sessions_per_week: number;
  fixed_profile: Record<string, unknown>;
  content: Record<string, unknown>;
  cover_image_url: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  stripe_price_id: string | null;
  access_days: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

// Uma linha da tabela `program_entitlements` (quem comprou e até quando).
export type ProgramEntitlementRow = {
  id: string;
  user_id: string;
  program_id: string;
  status: "active" | "expired" | "refunded";
  purchased_at: string;
  expires_at: string;
  started_at: string | null;
  current_week: number;
};

/**
 * Retorna o entitlement de programa ATIVO e NÃO EXPIRADO do usuário, ou null.
 * "Ativo" = status 'active' e expires_at ainda no futuro.
 */
export async function getActiveProgramEntitlement(
  supabase: SupabaseLike,
  userId: string
): Promise<ProgramEntitlementRow | null> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("program_entitlements")
    .select(
      "id, user_id, program_id, status, purchased_at, expires_at, started_at, current_week"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1);

  if (error) {
    logWarn("PROGRAM", "Falha ao buscar entitlement ativo", {
      user_id: userId,
      error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as ProgramEntitlementRow[];
  return rows[0] ?? null;
}

/**
 * Versão booleana: o usuário tem algum programa ativo agora?
 * Usada pelo isPremium() para liberar Premium durante o período do programa.
 */
export async function hasActiveProgramEntitlement(
  supabase: SupabaseLike,
  userId: string
): Promise<boolean> {
  const entitlement = await getActiveProgramEntitlement(supabase, userId);
  return entitlement !== null;
}

/**
 * Busca um programa PUBLICADO pelo slug (para a página de vendas / listagem).
 */
export async function getPublishedProgramBySlug(
  supabase: SupabaseLike,
  slug: string
): Promise<ProgramRow | null> {
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .limit(1);

  if (error) {
    logWarn("PROGRAM", "Falha ao buscar programa por slug", {
      slug,
      error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as ProgramRow[];
  return rows[0] ?? null;
}

/**
 * Busca um programa pelo id (independente do status). Usado ao servir o
 * conteúdo para quem já comprou (o entitlement guarda o program_id).
 */
export async function getProgramById(
  supabase: SupabaseLike,
  programId: string
): Promise<ProgramRow | null> {
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("id", programId)
    .limit(1);

  if (error) {
    logWarn("PROGRAM", "Falha ao buscar programa por id", {
      program_id: programId,
      error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as ProgramRow[];
  return rows[0] ?? null;
}
