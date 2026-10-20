"use client";

// Reavaliação de nível (Perfil > Dados de Treino > Rever nível).
// 6 perguntas, uma por tela → o servidor calcula o nível indicado → o usuário
// aplica ou mantém o atual. Ao aplicar, oferece gerar um programa novo
// (fluxo único RegenerateProgramFlow, com as regras do free/premium).

import { useState } from "react";
import { ChevronLeft, Gauge, Loader2, X } from "lucide-react";
import { RegenerateProgramFlow } from "@/components/regenerate-program-flow";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { LEVEL_QUESTIONS } from "@/lib/level-assessment";

type ReassessResult = {
  score: number;
  phase: string;
  phaseLabel: string;
  trainingLevel: "beginner" | "intermediate" | "advanced";
  previousPhase: string;
  previousPhaseLabel: string;
  capped: boolean;
  changed: boolean;
  applied: boolean;
};

type Step = "questions" | "result" | "applied" | "regenerate";

const TRAINING_LEVEL_TEXT: Record<ReassessResult["trainingLevel"], string> = {
  beginner: "exercícios e métodos de iniciante",
  intermediate: "exercícios e métodos de nível intermediário",
  advanced: "exercícios e métodos avançados"
};

export function LevelReassessment({
  userId,
  currentPhaseLabel,
  goal,
  activeLocation,
  markedLocations,
  lastWorkoutGeneratedAt,
  onClose,
  onApplied,
  onGenerated
}: {
  userId: string;
  currentPhaseLabel: string;
  goal?: string | null;
  activeLocation?: string | null;
  markedLocations?: string[] | null;
  lastWorkoutGeneratedAt?: string | null;
  onClose: () => void;
  /** Nível gravado no servidor: atualiza o Perfil/caches. */
  onApplied: (phase: string, phaseLabel: string) => void;
  /** Programa novo gerado depois da reavaliação. */
  onGenerated: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("questions");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReassessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = LEVEL_QUESTIONS[index];
  const total = LEVEL_QUESTIONS.length;

  async function send(nextAnswers: Record<string, string>, apply: boolean) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth("/api/level/reassess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: nextAnswers, apply })
      });
      const data = await parseJsonResponse<{ success: false; error?: string } | { success: true; data: ReassessResult }>(response);
      if (!response.ok || !data.success) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Não foi possível reavaliar seu nível agora.");
      }
      return data.data;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Não foi possível reavaliar seu nível agora."));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function choose(value: string) {
    if (!question || loading) return;
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);
    if (index < total - 1) {
      setIndex(index + 1);
      return;
    }
    const preview = await send(nextAnswers, false);
    if (preview) {
      setResult(preview);
      setStep("result");
    }
  }

  async function apply() {
    const saved = await send(answers, true);
    if (saved) {
      setResult(saved);
      onApplied(saved.phase, saved.phaseLabel);
      setStep("applied");
    }
  }

  function goBack() {
    if (step === "result") {
      setStep("questions");
      setIndex(total - 1);
      return;
    }
    if (index > 0) setIndex(index - 1);
  }

  if (step === "regenerate") {
    return (
      <RegenerateProgramFlow
        reason="profile_changed"
        source="level_reassess"
        userId={userId}
        goal={goal ?? null}
        activeLocation={activeLocation ?? "home"}
        markedLocations={markedLocations ?? null}
        lastWorkoutGeneratedAt={lastWorkoutGeneratedAt}
        onClose={onClose}
        onGenerated={onGenerated}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          {(step === "questions" && index > 0) || step === "result" ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Voltar"
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "questions" && question ? (
          <>
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Rever meu nível</span>
                <span>
                  {index + 1} de {total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${((index + 1) / total) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-lg font-semibold leading-snug text-white">{question.title}</p>
            {question.description ? <p className="mt-1.5 text-sm leading-5 text-white/56">{question.description}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => void choose(option.value)}
                    disabled={loading}
                    className={
                      "flex min-h-12 w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left text-sm font-semibold transition disabled:opacity-60 " +
                      (selected
                        ? "border-primary bg-primary/12 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/90 hover:border-white/25")
                    }
                  >
                    {option.label}
                    {loading && selected ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {step === "result" && result ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/90">Seu nível indicado</p>
            <p className="mt-2 text-3xl font-semibold text-white">{result.phaseLabel}</p>
            <p className="mt-3 text-sm leading-5 text-white/64">
              {result.changed
                ? `Hoje você está como ${result.previousPhaseLabel}. Com ${result.phaseLabel}, seus próximos treinos usam ${TRAINING_LEVEL_TEXT[result.trainingLevel]}.`
                : "Seu nível atual já combina com suas respostas. Bora continuar evoluindo!"}
            </p>
            {result.capped ? (
              <p className="mt-3 rounded-[14px] bg-primary/[0.08] px-3 py-2.5 text-sm leading-5 text-white/80">
                Como você está há mais de 6 meses sem treinar, começamos pelo Pré-Intermediário. O corpo destreina, e voltar com calma evita lesão.
                Treinando com constância, você sobe rapidinho.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-[14px] border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300">{error}</p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              {result.changed ? (
                <>
                  <button
                    type="button"
                    onClick={() => void apply()}
                    disabled={loading}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Aplicar nível {result.phaseLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
                  >
                    Manter {result.previousPhaseLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Fechar
                </button>
              )}
            </div>
          </>
        ) : null}

        {step === "applied" && result ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/90">Nível atualizado</p>
            <p className="mt-2 text-3xl font-semibold text-white">{result.phaseLabel}</p>
            <p className="mt-3 text-sm leading-5 text-white/64">
              Seu programa atual continua igual. Quer um programa novo montado para o nível {result.phaseLabel}?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep("regenerate")}
                className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
              >
                Gerar programa para o meu nível
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
              >
                Depois
              </button>
            </div>
          </>
        ) : null}

        {step === "questions" && error ? (
          <p className="mt-4 rounded-[14px] border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}

        {step === "questions" && index === 0 ? (
          <p className="mt-4 text-xs leading-5 text-white/40">
            Atual: {currentPhaseLabel}. Responda com sinceridade: o nível define os exercícios do seu treino.
          </p>
        ) : null}
      </div>
    </div>
  );
}
