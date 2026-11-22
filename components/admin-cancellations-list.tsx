"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";
import { CANCELLATION_REASONS } from "@/lib/cancellation-feedback";

type CancellationRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  reason: string | null;
  comment: string | null;
  source: "stripe_web" | "stripe_app" | "app_store" | "play_store";
  plan: "monthly" | "annual" | null;
  cancelled_at: string | null;
  created_at: string;
};

const REASON_LABELS: Record<string, string> = Object.fromEntries(
  CANCELLATION_REASONS.map((reason) => [reason.value, reason.label])
);

const SOURCE_LABELS: Record<CancellationRow["source"], string> = {
  stripe_web: "Stripe · site",
  stripe_app: "Stripe · app",
  app_store: "App Store",
  play_store: "Google Play",
};

const FILTER_OPTIONS = [
  { label: "Todos", value: "all" },
  { label: "Stripe", value: "stripe" },
  { label: "Lojas", value: "stores" },
  { label: "Só quem cancelou", value: "cancelled" },
] as const;

type Filter = (typeof FILTER_OPTIONS)[number]["value"];

function applyFilter(rows: CancellationRow[], filter: Filter) {
  switch (filter) {
    case "stripe":
      return rows.filter((row) => row.source === "stripe_web" || row.source === "stripe_app");
    case "stores":
      return rows.filter((row) => row.source === "app_store" || row.source === "play_store");
    case "cancelled":
      return rows.filter((row) => row.cancelled_at);
    default:
      return rows;
  }
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="text-[11px] text-white/40">{hint}</p> : null}
    </div>
  );
}

function CancellationSummary({ rows }: { rows: CancellationRow[] }) {
  const cancelled = rows.filter((row) => row.cancelled_at).length;
  const skipped = rows.filter((row) => !row.reason).length;
  const answered = rows.length - skipped;

  // Ranking de motivos (só quem escolheu um motivo; "Pular" fica de fora da %).
  const ranking = CANCELLATION_REASONS.map((reason) => {
    const count = rows.filter((row) => row.reason === reason.value).length;
    return { ...reason, count, percent: answered ? Math.round((count / answered) * 100) : 0 };
  }).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-5 rounded-[20px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap gap-8">
        <Metric label="Respostas" value={rows.length} />
        <Metric label="Cancelaram" value={cancelled} hint="confirmado no Stripe/loja" />
        <Metric label="Não confirmado" value={rows.length - cancelled} hint="desistiu ou ainda não cancelou na loja" />
        <Metric label="Pularam" value={skipped} hint="não escolheram motivo" />
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-white/50">Motivos</p>
        {ranking.map((reason) => (
          <div key={reason.value} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-white/75">{reason.label}</span>
              <span className="whitespace-nowrap text-white/50">
                {reason.count} · {reason.percent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-primary" style={{ width: `${reason.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminCancellationsList() {
  const [rows, setRows] = useState<CancellationRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetchWithAuth("/api/admin/cancellations");
        const result = await parseJsonResponse<{
          success: boolean;
          data?: CancellationRow[];
          error?: string;
        }>(response);

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível carregar os cancelamentos.");
        }

        if (active) {
          setRows(result.data ?? []);
          setMessage(null);
        }
      } catch (requestError) {
        if (active) {
          setRows([]);
          setMessage(getRequestErrorMessage(requestError, "Não foi possível carregar os cancelamentos."));
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => applyFilter(rows ?? [], filter), [rows, filter]);

  return (
    <div className="space-y-5">
      {filtered.length > 0 && <CancellationSummary rows={filtered} />}

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs transition",
              filter === option.value
                ? "border-primary bg-primary/15 text-white"
                : "border-white/10 text-white/60 hover:border-white/30 hover:text-white",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      {message && <p className="text-sm text-red-400">{message}</p>}

      {!rows ? (
        <div className="text-sm text-white/60">Carregando...</div>
      ) : (
        <AdminTable headers={["Data", "Usuário", "Motivo", "Comentário", "Origem", "Status"]}>
          {filtered.length ? (
            filtered.map((row) => (
              <tr key={row.id} className="border-b border-white/8 last:border-b-0">
                <td className="whitespace-nowrap px-5 py-4 text-sm text-white/50">{formatDate(row.created_at)}</td>
                <td className="px-5 py-4 text-sm">
                  <p className="text-white/80">{row.user_name ?? "—"}</p>
                  <p className="text-xs text-white/40">{row.user_email ?? row.user_id}</p>
                </td>
                <td className="px-5 py-4 text-sm text-white/72">
                  {row.reason ? (
                    REASON_LABELS[row.reason] ?? row.reason
                  ) : (
                    <span className="text-white/30">Pulou</span>
                  )}
                </td>
                <td className="min-w-[240px] max-w-md px-5 py-4 text-sm text-white/72">
                  {row.comment ? (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{row.comment}</p>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-sm text-white/50">
                  {SOURCE_LABELS[row.source] ?? row.source}
                  {row.plan ? ` · ${row.plan === "annual" ? "anual" : "mensal"}` : ""}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-sm">
                  {row.cancelled_at ? (
                    <span className="text-red-300">Cancelou · {formatDate(row.cancelled_at)}</span>
                  ) : (
                    <span className="text-white/40">Não confirmado</span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-white/60">
                Nenhuma resposta ainda.
              </td>
            </tr>
          )}
        </AdminTable>
      )}
    </div>
  );
}
