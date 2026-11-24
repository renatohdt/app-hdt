"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";

type FeedbackRow = {
  id: string;
  user_id: string;
  rating: number;
  improvement_reason: string | null;
  comment: string | null;
  page_count_at_trigger: number | null;
  created_at: string;
  first_name: string | null;
};

// Verde da marca Hora do Treino
const BRAND = "#5de563";

const IMPROVEMENT_LABELS: Record<string, string> = {
  treinos_nao_sao_para_mim: "Treinos não são para mim",
  dificil_de_usar: "Difícil de usar",
  falta_algo_que_preciso: "Falta algo que preciso",
  outro: "Outro motivo",
};

const FILTER_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "5 ★", value: "5" },
  { label: "4 ★", value: "4" },
  { label: "3 ★", value: "3" },
  { label: "2 ★", value: "2" },
  { label: "1 ★", value: "1" },
  { label: "Positivos (4-5)", value: "4,5" },
  { label: "Negativos (1-3)", value: "1,2,3" },
];

function formatShareDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function displayName(fb: FeedbackRow) {
  return fb.first_name ?? "Usuário";
}

function Stars({ rating, size = "text-base" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} leading-none tracking-[0.15em]`} aria-label={`${rating} de 5 estrelas`}>
      <span className="text-yellow-400">{"★".repeat(rating)}</span>
      <span className="text-white/15">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function Avatar({ name, big = false }: { name: string; big?: boolean }) {
  const initial = name.charAt(0).toLocaleUpperCase("pt-BR") || "?";
  return (
    <span
      className={[
        "flex shrink-0 items-center justify-center rounded-full font-bold text-black",
        big ? "h-14 w-14 text-2xl" : "h-10 w-10 text-base",
      ].join(" ")}
      style={{ background: `linear-gradient(135deg, ${BRAND}, #1fa34a)` }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function FeedbackSummary({ feedbacks }: { feedbacks: FeedbackRow[] }) {
  if (!feedbacks.length) return null;

  const avg = feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
  const withComment = feedbacks.filter((f) => f.comment?.trim()).length;
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: feedbacks.filter((f) => f.rating === star).length,
  }));
  const max = Math.max(...dist.map((d) => d.count), 1);

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 sm:grid-cols-[auto_auto_1fr] sm:items-center sm:gap-8 sm:p-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">Média</p>
        <p className="mt-1 text-4xl font-semibold text-white">
          {avg.toFixed(1)} <span className="text-yellow-400">★</span>
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">Avaliações</p>
        <p className="mt-1 text-4xl font-semibold text-white">{feedbacks.length}</p>
        <p className="text-xs text-white/40">{withComment} com comentário</p>
      </div>
      <div className="space-y-1.5">
        {dist.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-3 text-xs">
            <span className="w-6 text-right text-white/60">{star}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${(count / max) * 100}%`, background: BRAND }}
              />
            </div>
            <span className="w-6 text-white/60">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({ fb, onExpand }: { fb: FeedbackRow; onExpand: () => void }) {
  const name = displayName(fb);
  const comment = fb.comment?.trim();
  const reason = fb.improvement_reason
    ? IMPROVEMENT_LABELS[fb.improvement_reason] ?? fb.improvement_reason
    : null;

  return (
    <article className="group relative flex flex-col gap-4 overflow-hidden rounded-[24px] border border-white/10 bg-[#0f1411] p-5 transition hover:border-white/25">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-6 select-none font-serif text-[110px] leading-none opacity-10"
        style={{ color: BRAND }}
      >
        &rdquo;
      </span>

      <Stars rating={fb.rating} />

      {comment ? (
        <p className="relative whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/90">
          {comment}
        </p>
      ) : (
        <p className="text-sm italic text-white/35">Sem comentário</p>
      )}

      {reason && (
        <span className="w-fit rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[11px] text-red-300">
          {reason}
        </span>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/8 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="text-xs text-white/45">{formatShareDate(fb.created_at)}</p>
          </div>
        </div>
        {comment && (
          <button
            type="button"
            onClick={onExpand}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/40 hover:text-white"
          >
            Ampliar para print
          </button>
        )}
      </div>
    </article>
  );
}

// Visual limpo, sem nada do admin, pensado para print e compartilhamento
function ShareView({ fb, onClose }: { fb: FeedbackRow; onClose: () => void }) {
  const name = displayName(fb);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[440px]" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-11 right-0 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:text-white"
        >
          Fechar ✕
        </button>

        <div
          className="relative overflow-hidden rounded-[32px] border border-white/10 p-8 sm:p-10"
          style={{
            background: `radial-gradient(120% 80% at 100% 0%, ${BRAND}33 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, ${BRAND}1f 0%, transparent 60%), #0b0f0c`,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-6 top-2 select-none font-serif text-[160px] leading-none opacity-20"
            style={{ color: BRAND }}
          >
            &rdquo;
          </span>

          <Stars rating={fb.rating} size="text-2xl" />

          <p className="relative mt-6 whitespace-pre-wrap break-words text-[22px] font-medium leading-snug text-white sm:text-2xl">
            {fb.comment?.trim()}
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Avatar name={name} big />
            <div>
              <p className="text-lg font-semibold text-white">{name}</p>
              <p className="text-sm text-white/50">Aluno(a) Hora do Treino</p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
            <p className="text-sm font-bold tracking-wide" style={{ color: BRAND }}>
              HORA DO TREINO
            </p>
            <p className="text-xs text-white/40">app.horadotreino.com.br</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminFeedbacksList() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("");
  const [onlyWithComment, setOnlyWithComment] = useState(true);
  const [expanded, setExpanded] = useState<FeedbackRow | null>(null);

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
          setMessage(getRequestErrorMessage(requestError, "Não foi possível carregar os feedbacks."));
        }
      }
    }

    void loadFeedbacks();

    return () => {
      active = false;
    };
  }, [activeFilter]);

  const visible = useMemo(() => {
    if (!feedbacks) return null;
    // Ignora comentários vazios ou de 1-2 letras ("Oi", ".")
    return onlyWithComment
      ? feedbacks.filter((f) => (f.comment?.trim().length ?? 0) >= 3)
      : feedbacks;
  }, [feedbacks, onlyWithComment]);

  return (
    <div className="space-y-5">
      {feedbacks && feedbacks.length > 0 && <FeedbackSummary feedbacks={feedbacks} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setFeedbacks(null);
                setActiveFilter(opt.value);
              }}
              className={[
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
                activeFilter === opt.value
                  ? "border-primary bg-primary/15 text-white"
                  : "border-white/10 text-white/60 hover:border-white/30 hover:text-white",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={onlyWithComment}
            onChange={(event) => setOnlyWithComment(event.target.checked)}
            className="h-4 w-4 accent-[#5de563]"
          />
          Só com comentário
        </label>
      </div>

      {message && <p className="text-sm text-red-400">{message}</p>}

      {!visible ? (
        <div className="text-sm text-white/60">Carregando...</div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((fb) => (
            <FeedbackCard key={fb.id} fb={fb} onExpand={() => setExpanded(fb)} />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-white/10 px-5 py-10 text-center text-sm text-white/60">
          Nenhum feedback encontrado.
        </div>
      )}

      {expanded && <ShareView fb={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}
