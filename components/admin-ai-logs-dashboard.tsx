"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { Button } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";

type StatusFilter = "all" | "success" | "error";

type TotalsSummary = {
  count: number;
  total_tokens: number;
  total_cost_usd: number;
  success: number;
  errors: number;
};

type AiLogItem = {
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
  cost_usd: number | null;
  status: "success" | "error";
  error_message: string | null;
};

type AiLogListResponse = {
  items: AiLogItem[];
  totals: {
    today: TotalsSummary;
    last7days: TotalsSummary;
    last15days: TotalsSummary;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type AiLogDetail = AiLogItem & {
  expires_at: string | null;
  prompt_body: string | null;
  response_body: string | null;
};

const PAGE_SIZE = 20;

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null) return "-";
  if (usd === 0) return "$0.0000";
  // 6 casas para totais pequenos; arredonda pra 4 se já passar de 1 cent
  if (usd >= 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(6)}`;
}

function statusBadge(status: "success" | "error") {
  if (status === "success") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
        sucesso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-300">
      erro
    </span>
  );
}

function TotalsCard({ label, totals }: { label: string; totals: TotalsSummary }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(totals.count)}</p>
      <p className="mt-1 text-xs text-white/60">gerações</p>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-white/60">Sucessos</dt>
        <dd className="text-right text-emerald-300">{formatNumber(totals.success)}</dd>
        <dt className="text-white/60">Erros</dt>
        <dd className="text-right text-red-300">{formatNumber(totals.errors)}</dd>
        <dt className="text-white/60">Tokens</dt>
        <dd className="text-right text-white">{formatNumber(totals.total_tokens)}</dd>
        <dt className="text-white/60">Custo USD</dt>
        <dd className="text-right text-white">{formatCostUsd(totals.total_cost_usd)}</dd>
      </dl>
    </div>
  );
}

export function AdminAiLogsDashboard() {
  const [data, setData] = useState<AiLogListResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/admin/ai-logs?page=${page}&pageSize=${PAGE_SIZE}&status=${status}`
      );
      const result = await parseJsonResponse<{
        success: boolean;
        data?: AiLogListResponse;
        error?: string;
      }>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Não foi possível carregar os logs da IA.");
      }

      setData(result.data);
      setMessage(null);
    } catch (requestError) {
      setData({
        items: [],
        totals: {
          today: { count: 0, total_tokens: 0, total_cost_usd: 0, success: 0, errors: 0 },
          last7days: { count: 0, total_tokens: 0, total_cost_usd: 0, success: 0, errors: 0 },
          last15days: { count: 0, total_tokens: 0, total_cost_usd: 0, success: 0, errors: 0 }
        },
        pagination: { page, pageSize: PAGE_SIZE, total: 0 }
      });
      setMessage(getRequestErrorMessage(requestError, "Não foi possível carregar os logs da IA."));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);

    async function loadDetail() {
      try {
        const response = await fetchWithAuth(`/api/admin/ai-logs/${detailId}`);
        const result = await parseJsonResponse<{
          success: boolean;
          data?: AiLogDetail;
          error?: string;
        }>(response);

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error ?? "Não foi possível carregar o detalhe.");
        }

        if (active) {
          setDetail(result.data);
        }
      } catch (requestError) {
        if (active) {
          setDetailError(getRequestErrorMessage(requestError, "Não foi possível carregar o detalhe."));
        }
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      active = false;
    };
  }, [detailId]);

  if (!data) {
    return <div className="text-sm text-white/60">Carregando...</div>;
  }

  const { items, totals, pagination } = data;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <TotalsCard label="Hoje" totals={totals.today} />
        <TotalsCard label="Últimos 7 dias" totals={totals.last7days} />
        <TotalsCard label="Últimos 15 dias" totals={totals.last15days} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-white/72">
          Filtrar por status:
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StatusFilter);
            }}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white"
          >
            <option value="all">Todos</option>
            <option value="success">Sucessos</option>
            <option value="error">Erros</option>
          </select>
        </label>

        <div className="flex items-center gap-3 text-xs text-white/72">
          <span>
            Página {pagination.page} de {totalPages} ({formatNumber(pagination.total)} registros)
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((previous) => Math.max(1, previous - 1))}
            disabled={loading || pagination.page <= 1}
            className="h-8 border-white/10 bg-transparent px-3 text-xs text-white/80"
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPage((previous) => previous + 1)}
            disabled={loading || pagination.page >= totalPages}
            className="h-8 border-white/10 bg-transparent px-3 text-xs text-white/80"
          >
            Próxima
          </Button>
        </div>
      </div>

      {message ? <p className="text-xs text-amber-300">{message}</p> : null}

      <AdminTable
        headers={[
          "Data",
          "Modelo",
          "Split",
          "Dias",
          "Tokens (in / out / total)",
          "Custo USD",
          "Duração",
          "Status",
          ""
        ]}
      >
        {items.length ? (
          items.map((item) => (
            <tr key={item.id} className="border-b border-white/8 last:border-b-0">
              <td className="px-5 py-4 text-sm text-white/72">{formatDate(item.created_at)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{item.model ?? "-"}</td>
              <td className="px-5 py-4 text-sm text-white/72">{item.split_type ?? "-"}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatNumber(item.day_count)}</td>
              <td className="px-5 py-4 text-sm text-white/72">
                {formatNumber(item.prompt_tokens)} / {formatNumber(item.completion_tokens)} /{" "}
                {formatNumber(item.total_tokens)}
              </td>
              <td className="px-5 py-4 text-sm text-white">{formatCostUsd(item.cost_usd)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatDuration(item.duration_ms)}</td>
              <td className="px-5 py-4 text-sm">{statusBadge(item.status)}</td>
              <td className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => setDetailId(item.id)}
                  className="rounded-lg border border-primary/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary transition hover:border-primary/60 hover:bg-primary/10"
                >
                  Ver detalhe
                </button>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={9} className="px-5 py-8 text-sm text-white/60">
              Nenhuma geração encontrada para esse filtro.
            </td>
          </tr>
        )}
      </AdminTable>

      {detailId ? (
        <DetailModal
          loading={detailLoading}
          error={detailError}
          detail={detail}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  );
}

function DetailModal({
  loading,
  error,
  detail,
  onClose
}: {
  loading: boolean;
  error: string | null;
  detail: AiLogDetail | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101014] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
              Detalhe da geração
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">
              {detail ? formatDate(detail.created_at) : "..."}
            </h3>
            {detail ? <p className="mt-1 text-xs text-white/50">{detail.id}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
          >
            Fechar
          </button>
        </div>

        {loading ? <p className="mt-6 text-sm text-white/60">Carregando...</p> : null}
        {error ? <p className="mt-6 text-sm text-red-300">{error}</p> : null}

        {detail ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 text-xs sm:grid-cols-2">
              <Metadata label="Status" value={detail.status} />
              <Metadata label="Modelo" value={detail.model ?? "-"} />
              <Metadata label="Split" value={detail.split_type ?? "-"} />
              <Metadata label="Dias" value={formatNumber(detail.day_count)} />
              <Metadata label="Prompt tokens" value={formatNumber(detail.prompt_tokens)} />
              <Metadata label="Completion tokens" value={formatNumber(detail.completion_tokens)} />
              <Metadata label="Total tokens" value={formatNumber(detail.total_tokens)} />
              <Metadata label="Custo USD" value={formatCostUsd(detail.cost_usd)} />
              <Metadata label="Duração" value={formatDuration(detail.duration_ms)} />
              <Metadata
                label="Catálogo (antes / depois)"
                value={`${formatNumber(detail.catalog_size_before_filter)} / ${formatNumber(
                  detail.catalog_size_after_filter
                )}`}
              />
              <Metadata label="User ID" value={detail.user_id ?? "-"} />
              <Metadata label="Workout ID" value={detail.workout_id ?? "-"} />
              <Metadata
                label="Expira em"
                value={detail.expires_at ? formatDate(detail.expires_at) : "-"}
              />
              {detail.error_message ? (
                <Metadata label="Erro" value={detail.error_message} />
              ) : null}
            </div>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                Prompt enviado
              </p>
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-2xl border border-white/8 bg-black/40 p-4 text-xs leading-relaxed text-white/80 whitespace-pre-wrap break-words">
                {detail.prompt_body ?? "(vazio)"}
              </pre>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                Resposta recebida
              </p>
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-2xl border border-white/8 bg-black/40 p-4 text-xs leading-relaxed text-white/80 whitespace-pre-wrap break-words">
                {detail.response_body ?? "(vazio)"}
              </pre>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
    </div>
  );
}
