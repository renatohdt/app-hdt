import { estimateCostUsd } from "@/lib/ai-telemetry";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

type RawLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  workout_id: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  prompt_chars: number | null;
  response_chars: number | null;
  catalog_size_before_filter: number | null;
  catalog_size_after_filter: number | null;
  split_type: string | null;
  day_count: number | null;
  duration_ms: number | null;
  cost_cents: number | null;
  status: string;
  error_message: string | null;
};

type TotalsSummary = {
  count: number;
  total_tokens: number;
  total_cost_usd: number;
  success: number;
  errors: number;
};

// Campos que NUNCA vão no payload de listagem (payload ficaria gigante).
// Eles só aparecem no endpoint de detalhe.
const LIST_SELECT =
  "id, created_at, user_id, workout_id, model, prompt_tokens, completion_tokens, total_tokens, prompt_chars, response_chars, catalog_size_before_filter, catalog_size_after_filter, split_type, day_count, duration_ms, cost_cents, status, error_message";

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseStatusParam(value: string | null): "all" | "success" | "error" {
  if (value === "success" || value === "error") return value;
  return "all";
}

function emptyTotals(): TotalsSummary {
  return {
    count: 0,
    total_tokens: 0,
    total_cost_usd: 0,
    success: 0,
    errors: 0
  };
}

function addRowToTotals(totals: TotalsSummary, row: RawLogRow): void {
  totals.count += 1;
  totals.total_tokens += row.total_tokens ?? 0;

  const cost = estimateCostUsd(row.model, row.prompt_tokens, row.completion_tokens);
  if (cost != null) {
    totals.total_cost_usd += cost;
  }

  if (row.status === "success") {
    totals.success += 1;
  } else {
    totals.errors += 1;
  }
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return jsonError("Supabase admin não configurado.", 500);
    }

    const url = new URL(request.url);
    const page = parseIntParam(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = parseIntParam(url.searchParams.get("pageSize"), 20, 1, 100);
    const status = parseStatusParam(url.searchParams.get("status"));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // ---------------------------
    // 1) Lista paginada
    // ---------------------------
    let listQuery = supabase
      .from("ai_workout_generations")
      .select(LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status !== "all") {
      listQuery = listQuery.eq("status", status);
    }

    const listResult = await listQuery;

    if (listResult.error) {
      logError("ADMIN", "ai-logs list query failed", {
        message: listResult.error.message
      });
      return jsonError("Não foi possível carregar os logs da IA.", 500);
    }

    const rawItems = (listResult.data ?? []) as RawLogRow[];

    const items = rawItems.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      user_id: row.user_id,
      workout_id: row.workout_id,
      model: row.model,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      prompt_chars: row.prompt_chars,
      response_chars: row.response_chars,
      catalog_size_before_filter: row.catalog_size_before_filter,
      catalog_size_after_filter: row.catalog_size_after_filter,
      split_type: row.split_type,
      day_count: row.day_count,
      duration_ms: row.duration_ms,
      cost_usd: estimateCostUsd(row.model, row.prompt_tokens, row.completion_tokens),
      status: row.status,
      error_message: row.error_message
    }));

    // ---------------------------
    // 2) Totais (hoje / 7d / 15d)
    // ---------------------------
    // Buscamos apenas as colunas necessárias para somar. Como a retenção é 15d,
    // o "last15days" tende a equivaler ao volume inteiro da tabela.
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    const TOTALS_SELECT =
      "created_at, model, prompt_tokens, completion_tokens, total_tokens, status";

    const totalsResult = await supabase
      .from("ai_workout_generations")
      .select(TOTALS_SELECT)
      .gte("created_at", last15.toISOString())
      .limit(5000);

    if (totalsResult.error) {
      logError("ADMIN", "ai-logs totals query failed", {
        message: totalsResult.error.message
      });
      return jsonError("Não foi possível calcular totais dos logs da IA.", 500);
    }

    const totalsRows = (totalsResult.data ?? []) as Pick<
      RawLogRow,
      "created_at" | "model" | "prompt_tokens" | "completion_tokens" | "total_tokens" | "status"
    >[];

    const today = emptyTotals();
    const last7days = emptyTotals();
    const last15days = emptyTotals();

    for (const row of totalsRows) {
      const createdAt = new Date(row.created_at);
      const enriched: RawLogRow = {
        id: "",
        created_at: row.created_at,
        user_id: null,
        workout_id: null,
        model: row.model,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        total_tokens: row.total_tokens,
        prompt_chars: null,
        response_chars: null,
        catalog_size_before_filter: null,
        catalog_size_after_filter: null,
        split_type: null,
        day_count: null,
        duration_ms: null,
        cost_cents: null,
        status: row.status,
        error_message: null
      };

      addRowToTotals(last15days, enriched);
      if (createdAt >= last7) addRowToTotals(last7days, enriched);
      if (createdAt >= startOfToday) addRowToTotals(today, enriched);
    }

    return jsonSuccess(
      {
        items,
        totals: { today, last7days, last15days },
        pagination: {
          page,
          pageSize,
          total: listResult.count ?? items.length
        }
      },
      200
    );
  } catch (error) {
    logError("ADMIN", "ai-logs route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar os logs da IA.", 500);
  }
}
