"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { FREE_CYCLE_LIMIT_ERROR_CODE } from "@/lib/cycle-renewal";
import type { CycleSummary } from "@/lib/cycle-summary";

// ─────────────────────────────────────────────────────────────────────────────
// Fim de ciclo do programa de treino (fluxo de IA).
//
//  - CycleCompleteCelebration: tela cheia de celebração. Abre sozinha ao
//    finalizar a última sessão e também a partir do card abaixo.
//  - CycleCompleteCard: card de destaque que fica na tela de Treino e na Home
//    enquanto o próximo programa não é montado.
//
// Modos:
//  - "renew"        → Premium (ilimitado) ou Free com o 2º programa disponível:
//                     botão "Montar meu próximo programa" (POST /api/workout).
//  - "upsell"       → Free que já usou os 2 programas: convite ao Premium.
// ─────────────────────────────────────────────────────────────────────────────

export type CycleCompleteMode = "renew" | "upsell";

export function resolveCycleCompleteMode(isPremium: boolean, freeRenewalAvailable: boolean): CycleCompleteMode {
  return isPremium || freeRenewalAvailable ? "renew" : "upsell";
}

type CycleStats = {
  completedSessions: number;
  weeks: number;
};

type CelebrationProps = CycleStats & {
  userId: string;
  isPremium: boolean;
  freeRenewalAvailable: boolean;
  source: "training_auto" | "training_card" | "dashboard_card";
  onClose: () => void;
  // Recarrega o treino depois que o novo programa foi gerado.
  onRenewed: () => Promise<void> | void;
};

export function CycleCompleteCelebration({
  userId,
  isPremium,
  freeRenewalAvailable,
  completedSessions,
  weeks,
  source,
  onClose,
  onRenewed
}: CelebrationProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CycleCompleteMode>(resolveCycleCompleteMode(isPremium, freeRenewalAvailable));
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFreeRenewal = !isPremium && mode === "renew";
  // Resumo do ciclo (cargas, nível, conquistas). Carrega ao abrir; se falhar,
  // a tela segue só com sessões e semanas.
  const [summary, setSummary] = useState<CycleSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/workout/cycle-summary")
      .then((res) => parseJsonResponse<{ success: boolean; data?: CycleSummary }>(res))
      .then((result) => {
        if (active && result.success && result.data) setSummary(result.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Só mostramos evolução quando ela existe: zero desmotiva. Cargas e conquistas
  // aparecem apenas se > 0; o nível, apenas se há algo positivo para contar.
  const loadIncreases = summary?.exercisesWithLoadIncrease ?? 0;
  const showLoadTile = !summaryLoading && loadIncreases > 0;
  const showLevel =
    summary !== null && (summary.level.status !== "progressing" || summary.level.dotProgress > 0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    trackEvent("cta_click", userId, { source: `cycle_complete_view_${mode}_${source}` });
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRenew() {
    if (renewing) return;
    setRenewing(true);
    setError(null);
    trackEvent("cta_click", userId, { source: `cycle_complete_renew_${source}`, plan: isPremium ? "premium" : "free" });

    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const result = await parseJsonResponse<{ success: boolean; error?: string; code?: string }>(response);

      if (result.code === FREE_CYCLE_LIMIT_ERROR_CODE) {
        setMode("upsell");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível montar seu próximo programa agora.");
      }

      trackEvent("workout_generated", userId, { source: "cycle_renewal" });
      await onRenewed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível montar seu próximo programa agora.");
    } finally {
      setRenewing(false);
    }
  }

  function handleUpsell() {
    trackEvent("cta_click", userId, { source: `cycle_complete_upsell_cta_${source}` });
    router.push("/premium");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="relative max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-[32px] border border-primary/25 bg-[#0b0d0b] shadow-[0_-12px_60px_rgba(34,197,94,0.25)] sm:rounded-[32px]">
        {/* Brilho de fundo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.35),transparent_70%)]" />

        {renewing ? (
          <div className="relative flex flex-col items-center px-6 pb-12 pt-14 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-6 text-xl font-bold text-white">Montando seu próximo programa…</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/65">
              Usando a sua evolução deste ciclo para criar novos estímulos. Leva só alguns segundos.
            </p>
          </div>
        ) : (
          <div className="relative px-6 pb-6 pt-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/15 shadow-[0_0_40px_rgba(34,197,94,0.45)]">
              <Trophy className="h-8 w-8 text-primary" strokeWidth={2.2} />
            </div>

            <p className="mt-4 text-[0.7rem] font-bold uppercase tracking-[0.28em] text-primary">Ciclo encerrado</p>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight text-white">Programa concluído!</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/70">
              Eu estou tão orgulhoso de você! Parabéns!
            </p>

            {/* Resumo do ciclo */}
            <div className={`mt-6 grid gap-2 ${showLoadTile ? "grid-cols-3" : "grid-cols-2"}`}>
              <StatTile value={completedSessions} label={completedSessions === 1 ? "sessão" : "sessões"} />
              <StatTile value={weeks > 0 ? weeks : "—"} label={weeks === 1 ? "semana" : "semanas"} />
              {showLoadTile ? (
                <StatTile
                  value={loadIncreases}
                  label={loadIncreases === 1 ? "exercício com + carga" : "exercícios com + carga"}
                />
              ) : null}
            </div>

            {summary && showLevel ? <LevelStrip level={summary.level} /> : null}
            {summary && summary.achievements.length > 0 ? <CycleAchievements achievements={summary.achievements} /> : null}

            {/* Próximo passo */}
            <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary/90">Próximo passo</p>
              {mode === "renew" ? (
                <>
                  <p className="mt-1 text-base font-bold text-white">Novo ciclo, novos estímulos</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    Seu corpo se adaptou a este programa. O próximo parte do que você já evoluiu, com novos exercícios e uma nova progressão.
                  </p>
                  {isFreeRenewal ? (
                    <p className="mt-2 text-xs leading-relaxed text-white/45">
                      Este é o seu 2º programa gratuito. Com o Premium, você renova sem limite.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-1 text-base font-bold text-white">Continue evoluindo com o Premium</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    Você já concluiu seus 2 programas gratuitos. Assine o Premium e receba um novo programa personalizado a cada ciclo.
                  </p>
                </>
              )}
            </div>

            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

            {/* Botões fixos no rodapé: o CTA fica sempre visível, mesmo com muitas conquistas. */}
            <div className="sticky bottom-0 -mx-6 mt-4 flex flex-col gap-2 bg-gradient-to-t from-[#0b0d0b] via-[#0b0d0b] to-transparent px-6 pb-1 pt-6">
              {mode === "renew" ? (
                <button
                  type="button"
                  onClick={() => void handleRenew()}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong text-base font-bold text-black shadow-[0_8px_28px_rgba(34,197,94,0.35)] transition active:scale-[0.99]"
                >
                  <RefreshCw className="h-5 w-5" />
                  {error ? "Tentar novamente" : "Montar meu próximo programa"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUpsell}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong text-base font-bold text-black shadow-[0_8px_28px_rgba(34,197,94,0.35)] transition active:scale-[0.99]"
                >
                  <Sparkles className="h-5 w-5" />
                  Quero continuar evoluindo
                </button>
              )}

              {mode === "renew" ? (
                <Link
                  href="/perfil"
                  onClick={() => trackEvent("cta_click", userId, { source: `cycle_complete_review_profile_${source}` })}
                  className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Mudou algo? Revisar meus dados antes
                </Link>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl px-4 py-2 text-sm font-medium text-white/45 transition hover:text-white/70"
              >
                Agora não
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Faixa de nível: fase atual + 3 pontinhos + mensagem conforme a situação.
function LevelStrip({ level }: { level: CycleSummary["level"] }) {
  const message =
    level.status === "phased_up"
      ? `Você subiu para ${level.phaseLabel} neste ciclo! 🚀`
      : level.status === "max_level"
        ? "Nível máximo. Agora é manter o topo!"
        : level.status === "almost_there"
          ? "Falta pouco para evoluir!"
          : `${level.dotProgress} de 3 pontos rumo ao ${level.nextPhaseLabel}`;
  const highlight = level.status === "phased_up" || level.status === "almost_there";
  const showDots = level.status !== "phased_up" && level.status !== "max_level";

  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
        highlight ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/45">Seu nível</p>
        <p className="text-sm font-bold text-white">{level.phaseLabel}</p>
        <p className={`mt-0.5 text-xs leading-snug ${highlight ? "font-semibold text-primary" : "text-white/60"}`}>{message}</p>
      </div>
      {showDots ? (
        <div className="flex shrink-0 gap-1.5" aria-label={`${level.dotProgress} de 3 pontos`}>
          {[1, 2, 3].map((dot) => (
            <span
              key={dot}
              className={`h-3 w-3 rounded-full ${
                dot <= level.dotProgress ? "bg-primary shadow-[0_0_8px_rgba(34,197,94,0.7)]" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      ) : (
        <span className="shrink-0 text-2xl">{level.status === "phased_up" ? "🏆" : "👑"}</span>
      )}
    </div>
  );
}

const ACHIEVEMENT_EMOJI: Record<string, string> = {
  workout: "💪",
  weight: "🏋️",
  consistency: "🔥",
  goal: "🎯"
};
const MAX_ACHIEVEMENT_CHIPS = 4;

// Selos das conquistas desbloqueadas durante o ciclo.
function CycleAchievements({ achievements }: { achievements: CycleSummary["achievements"] }) {
  const visible = achievements.slice(0, MAX_ACHIEVEMENT_CHIPS);
  const hidden = achievements.length - visible.length;
  return (
    <div className="mt-3 text-left">
      <p className="px-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/45">
        {achievements.length === 1 ? "Conquista deste ciclo" : "Conquistas deste ciclo"}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visible.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <span>{ACHIEVEMENT_EMOJI[a.category] ?? "⭐"}</span>
            {a.title}
          </span>
        ))}
        {hidden > 0 ? (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/60">
            +{hidden}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.07] px-2 py-3">
      <p className="text-2xl font-extrabold leading-none text-white">{value}</p>
      <p className="mt-1.5 text-[11px] font-medium leading-tight text-white/55">{label}</p>
    </div>
  );
}

// Card de destaque (Treino e Home) — fica visível enquanto o ciclo está concluído.
export function CycleCompleteCard({
  mode,
  completedSessions,
  onOpen,
  className = ""
}: {
  mode: CycleCompleteMode;
  completedSessions: number;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-primary/35 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.22),transparent_60%),linear-gradient(180deg,rgba(34,197,94,0.10),rgba(255,255,255,0.02))] p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary">Ciclo encerrado</p>
          <p className="mt-0.5 text-lg font-extrabold leading-tight text-white">Programa concluído! 🏆</p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            {mode === "renew"
              ? `Você fechou as ${completedSessions} sessões. Hora de começar um novo ciclo com novos estímulos.`
              : `Você fechou as ${completedSessions} sessões. Continue evoluindo com um novo programa no Premium.`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong text-sm font-bold text-black transition active:scale-[0.99]"
      >
        {mode === "renew" ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {mode === "renew" ? "Montar meu próximo programa" : "Quero continuar evoluindo"}
      </button>
    </div>
  );
}
