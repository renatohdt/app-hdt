"use client";

import { useState } from "react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { trackEvent } from "@/lib/analytics-client";
import { CANCELLATION_REASONS, type CancellationReason } from "@/lib/cancellation-feedback";

/**
 * Questionário de cancelamento do Premium.
 * Aparece depois do "Tem certeza?" e antes do cancelamento real.
 *
 * Ele mesmo salva a resposta (/api/cancellation-feedback) e depois chama
 * `onDone`, que faz o cancelamento de verdade (Stripe) ou abre a loja.
 * Se salvar a resposta falhar, segue mesmo assim: o questionário nunca
 * pode impedir a pessoa de cancelar.
 */
type Props = {
  // Texto do botão principal: muda entre Stripe ("cancelar") e lojas ("ir para a loja").
  submitLabel: string;
  // Executa o próximo passo (cancelar no Stripe ou abrir a loja).
  onDone: () => void | Promise<void>;
  // Bloqueia os botões enquanto o próximo passo roda.
  busy?: boolean;
};

export function CancellationSurvey({ submitLabel, onDone, busy = false }: Props) {
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resposta já gravada: se o cancelamento falhar e a pessoa clicar de novo,
  // só tentamos cancelar outra vez, sem gravar uma segunda resposta.
  const [saved, setSaved] = useState(false);

  const needsComment = reason === "outro";
  const canSubmit = reason !== null && (!needsComment || comment.trim().length > 0);
  const disabled = saving || busy;
  const locked = disabled || saved;

  async function send(skipped: boolean) {
    setError(null);

    if (!saved) {
      await saveAnswer(skipped);
    }

    try {
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    }
  }

  async function saveAnswer(skipped: boolean) {
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/cancellation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skipped ? { reason: null } : { reason, comment: comment.trim() || null })
      });
      if (response.ok) setSaved(true);
      trackEvent("cta_click", null, {
        source: skipped ? "cancellation_survey_skip" : "cancellation_survey_submit",
        reason: skipped ? null : reason
      });
    } catch {
      // Sem conexão ou erro no servidor: não trava o cancelamento.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="space-y-1">
        <p className="text-[14px] font-bold text-white">Antes de ir, conta pra gente: por que está cancelando?</p>
        <p className="text-[12px] text-white/45">Sua resposta ajuda a deixar o Hora do Treino melhor. Leva 10 segundos.</p>
      </div>

      <div className="space-y-1.5" role="radiogroup" aria-label="Motivo do cancelamento">
        {CANCELLATION_REASONS.map((option) => {
          const selected = reason === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => setReason(option.value)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition disabled:opacity-50 ${
                selected
                  ? "border-white/40 bg-white/10 font-semibold text-white"
                  : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-white" : "border-white/30"
                }`}
              >
                {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>

      {reason ? (
        <div className="space-y-1">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 1000))}
            disabled={locked}
            rows={3}
            placeholder={needsComment ? "Conta o motivo pra gente (obrigatório)" : "Quer contar mais? (opcional)"}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[13px] text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none disabled:opacity-50"
          />
          {needsComment && comment.trim().length === 0 ? (
            <p className="text-[11.5px] text-white/40">Escreva o motivo para continuar.</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-red-400">{error}</p> : null}

      <button
        type="button"
        onClick={() => void send(false)}
        disabled={(!canSubmit && !saved) || disabled}
        className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-40"
      >
        {disabled ? "Aguarde..." : saved ? "Tentar novamente" : submitLabel}
      </button>
      {saved ? null : (
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={disabled}
          className="w-full py-1.5 text-[12px] text-white/35 transition hover:text-white/60 disabled:opacity-40"
        >
          Pular
        </button>
      )}
    </div>
  );
}
