"use client";

import { useEffect, useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";
import { supabase } from "@/lib/supabase";
import { useFeedbackPrompt } from "@/components/use-feedback-prompt";

// Labels amigáveis para cada opção de melhoria
const IMPROVEMENT_OPTIONS = [
  { value: "treinos_nao_sao_para_mim", label: "Os treinos não são para mim" },
  { value: "dificil_de_usar", label: "Difícil de usar" },
  { value: "falta_algo_que_preciso", label: "Falta algo que preciso" },
  { value: "outro", label: "Outro motivo" },
] as const;

type Step = "rating" | "details" | "done";

export function FeedbackModal() {
  // Busca o userId da sessão Supabase para isolar o contador por usuário
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);

  const { shouldShow, dismiss, pageCount } = useFeedbackPrompt(userId);

  const [step, setStep] = useState<Step>("rating");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [improvementReason, setImprovementReason] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  if (!shouldShow) return null;

  // ─── Handlers ────────────────────────────────────────────────────

  function handleStarClick(value: number) {
    setRating(value);
  }

  function handleRatingContinue() {
    if (!rating) return;
    setStep("details");
  }

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        rating,
        page_count_at_trigger: pageCount,
      };

      // Motivo só é enviado se rating <= 3 e foi selecionado
      if (rating <= 3 && improvementReason) {
        body.improvement_reason = improvementReason;
      }

      // Comentário livre para todos
      if (comment.trim()) {
        body.comment = comment.trim();
      }

      const response = await fetchWithAuth("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`feedback-${response.status}`);
      }

      setStep("done");
      // Fecha automaticamente após 2 segundos
      setTimeout(() => dismiss(userId ?? ""), 2000);
    } catch (error) {
      clientLogError("FEEDBACK SUBMIT ERROR", {
        error: error instanceof Error ? error.message : "unknown",
      });
      // Fecha mesmo com erro para não travar o usuário
      dismiss(userId ?? "");
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">

        {/* Ícone */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <MessageSquare className="h-7 w-7 text-primary" />
        </div>

        {/* ── Etapa 1: Avaliação com estrelas ── */}
        {step === "rating" && (
          <>
            <p className="text-lg font-semibold leading-snug text-white">
              O que você está achando do app? ⭐
            </p>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Sua opinião nos ajuda a melhorar. Leva menos de 1 minuto.
            </p>

            {/* Estrelas */}
            <div className="mt-5 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                  aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className="h-10 w-10"
                    fill={(hovered || rating) >= star ? "#FBBF24" : "transparent"}
                    stroke={(hovered || rating) >= star ? "#FBBF24" : "rgba(255,255,255,0.3)"}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>

            {/* Label da nota selecionada */}
            <p className="mt-2 h-5 text-center text-sm text-white/50">
              {rating > 0 ? STAR_LABELS[rating] : ""}
            </p>

            <div className="mt-5 flex flex-col items-center gap-3">
              <Button
                onClick={handleRatingContinue}
                disabled={!rating}
                className="w-full"
              >
                Continuar
              </Button>
              <button
                type="button"
                onClick={() => dismiss(userId ?? "")}
                className="text-xs text-white/36 transition hover:text-white/60"
              >
                Agora não
              </button>
            </div>
          </>
        )}

        {/* ── Etapa 2: Detalhes (motivo + comentário livre) ── */}
        {step === "details" && (
          <>
            <p className="text-lg font-semibold leading-snug text-white">
              {rating <= 3 ? "O que podemos melhorar?" : "Quer nos contar mais?"}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/60">
              {rating <= 3
                ? "Selecione o que mais se aplica à sua situação."
                : "Sua experiência positiva nos motiva muito! Se quiser, deixe um comentário."}
            </p>

            {/* Opções de melhoria — visíveis apenas para notas <= 3 */}
            {rating <= 3 && (
              <div className="mt-4 flex flex-col gap-2">
                {IMPROVEMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setImprovementReason(
                        improvementReason === opt.value ? "" : opt.value
                      )
                    }
                    className={[
                      "rounded-xl border px-4 py-3 text-left text-sm transition",
                      improvementReason === opt.value
                        ? "border-primary bg-primary/10 text-white"
                        : "border-white/10 text-white/70 hover:border-white/30",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Campo de texto livre — visível para todos */}
            <div className="mt-4">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Deixe um comentário... (opcional)"
                maxLength={1000}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-primary/50 focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-white/30">
                {comment.length}/1000
              </p>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3">
              <Button
                onClick={() => void handleSubmit()}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Enviando..." : "Enviar feedback"}
              </Button>
              <button
                type="button"
                onClick={() => dismiss(userId ?? "")}
                className="text-xs text-white/36 transition hover:text-white/60"
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* ── Etapa 3: Confirmação ── */}
        {step === "done" && (
          <div className="flex flex-col items-center py-4 text-center">
            <p className="text-4xl">🙏</p>
            <p className="mt-3 text-lg font-semibold text-white">
              Obrigado pelo feedback!
            </p>
            <p className="mt-2 text-sm text-white/60">
              Sua opinião é muito importante para continuarmos melhorando.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// Textos de apoio para cada nota de estrelas
const STAR_LABELS: Record<number, string> = {
  1: "Muito insatisfeito",
  2: "Insatisfeito",
  3: "Regular",
  4: "Satisfeito",
  5: "Muito satisfeito 🎉",
};
