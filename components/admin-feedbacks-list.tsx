"use client";

import { useEffect, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";

type FeedbackRow = {
  id: string;
  user_id: string;
  rating: number;
  improvement_reason: string | null;
  comment: string | null;
  page_count_at_trigger: number | null;
  created_at: string;
};

const IMPROVEMENT_LABELS: Record<string, string> = {
  treinos_nao_sao_para_mim: "Treinos não são para mim",
  dificil_de_usar: "Difícil de usar",
  falta_algo_que_preciso: "Falta algo que preciso",
  outro: "Outro motivo",
};

const FILTER_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "⭐⭐⭐⭐⭐ Excelente (5)", value: "5" },
  { label: "⭐⭐⭐⭐ Bom (4)", value: "4" },
  { label: "⭐⭐⭐ Regular (3)", value: "3" },
  { label: "⭐⭐ Ruim (2)", value: "2" },
  { label: "⭐ Péssimo (1)", value: "1" },
  { label: "👎 Negativos (1-3)", value: "1,2,3" },
  { label: "👍 Positivos (4-5)", value: "4,5" },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="tracking-wide text-yellow-400">
      {"★".repeat(rating)}
      <span className="text-white/20">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function FeedbackSummary({ feedbacks }: { feedbacks: FeedbackRow[] }) {
  if (!feedbacks.length) return null;

  const avg = feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
  const dist = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: feedbacks.filter((f) => f.rating === star).length,
  }));

  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/50">Média</p>
          <p className="mt-1 text-3xl font-semibold text-white">
            {avg.toFixed(1)} <span className="text-yellow-400">★</span>
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-white/50">Total</p>
          <p className="mt-1 text-3xl font-semibold text-white">{feedbacks.length}</p>
        </div>
        <div className="flex gap-3">
          {dist.map(({ star, count }) => (
            <div key={star} className="text-center">
              <p className="text-xs text-yellow-400">{"★".repeat(star)}</p>
              <p className="text-sm font-semibold text-white">{count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminFeedbacksList() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("");

  useEffect(() => {
    let active = true;

    async function loadFeedbacks() {
      try {
        const url = activeFilter
          ? `/api/admin/feedbacks?rating=${activeFilter}`
          : "/api/admin/feedbacks";

        const response = await fetchWithAuth(url);
        const result = await parseJsonResponse<{
          success: boolean;
          data?: FeedbackRow[];
          error?: string;
        }>(response);

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível carregar os feedbacks.");
        }

        if (active) {
          setFeedbacks(result.data ?? []);
          setMessage(null);
        }
      } catch (requestError) {
        if (active) {
          setFeedbacks([]);
          setMessage(
            getRequestErrorMessage(requestError, "Não foi possível carregar os feedbacks.")
          );
        }
      }
    }

    void loadFeedbacks();

    return () => {
      active = false;
    };
  }, [activeFilter]);

  return (
    <div className="space-y-5">
      {/* Sumário com métricas */}
      {feedbacks && feedbacks.length > 0 && <FeedbackSummary feedbacks={feedbacks} />}

      {/* Filtros por nota */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setFeedbacks(null);
              setActiveFilter(opt.value);
            }}
            className={[
              "rounded-full border px-3 py-1.5 text-xs transition",
              activeFilter === opt.value
                ? "border-primary bg-primary/15 text-white"
                : "border-white/10 text-white/60 hover:border-white/30 hover:text-white",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mensagem de erro */}
      {message && (
        <p className="text-sm text-red-400">{message}</p>
      )}

      {/* Tabela */}
      {!feedbacks ? (
        <div className="text-sm text-white/60">Carregando...</div>
      ) : (
        <AdminTable headers={["Nota", "Motivo", "Comentário", "Páginas vistas", "Data"]}>
          {feedbacks.length ? (
            feedbacks.map((fb) => (
              <tr key={fb.id} className="border-b border-white/8 last:border-b-0">
                <td className="px-5 py-4 text-sm">
                  <StarRating rating={fb.rating} />
                </td>
                <td className="px-5 py-4 text-sm text-white/72">
                  {fb.improvement_reason
                    ? IMPROVEMENT_LABELS[fb.improvement_reason] ?? fb.improvement_reason
                    : <span className="text-white/30">—</span>}
                </td>
                <td className="max-w-xs px-5 py-4 text-sm text-white/72">
                  {fb.comment
                    ? <span className="line-clamp-2">{fb.comment}</span>
                    : <span className="text-white/30">—</span>}
                </td>
                <td className="px-5 py-4 text-sm text-white/50">
                  {fb.page_count_at_trigger ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-sm text-white/50">
                  {formatDate(fb.created_at)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-sm text-white/60">
                Nenhum feedback encontrado.
              </td>
            </tr>
          )}
        </AdminTable>
      )}
    </div>
  );
}
