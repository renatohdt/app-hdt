"use client";

// Dicas do Renato (regras e textos em lib/coach-tips.ts).
//  • CoachTipSheet: card que aparece ao tocar em "Iniciar treino".
//  • CoachTipInline: dica de carga dentro do exercício (treino em andamento).
// Cada dica mostrada fica escondida por 14 dias neste aparelho.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics-client";
import { parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { SNOOZE_DAYS, type CoachTip } from "@/lib/coach-tips";
import { normalizeExerciseName } from "@/lib/exercise-weight-store";

// ── Memória de dicas já mostradas (por usuário, neste aparelho) ─────────────

const storageKey = (userId: string) => `hdt:coach-tips:v1:${userId}`;

function readShown(userId: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeShown(userId: string, shown: Record<string, number>) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(shown));
  } catch {
    // Sem armazenamento: a dica só não fica lembrada.
  }
}

function isSnoozed(shown: Record<string, number>, id: string) {
  const at = shown[id];
  return typeof at === "number" && Date.now() - at < SNOOZE_DAYS * 86_400_000;
}

// ── Hook: busca as dicas do treino atual ────────────────────────────────────

export function useCoachTips({
  userId,
  enabled,
  workoutKey,
  exercises,
  workoutOrder,
  weeklyTarget,
  remainingSessions,
  followsWeeklyPlan
}: {
  userId: string;
  enabled: boolean;
  workoutKey: string;
  exercises: { name: string; reps: string }[];
  workoutOrder: string[];
  weeklyTarget: number;
  remainingSessions: number | null;
  followsWeeklyPlan: boolean;
}) {
  const [sessionTips, setSessionTips] = useState<CoachTip[]>([]);
  const [exerciseTips, setExerciseTips] = useState<Record<string, CoachTip>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  // true quando a busca desta tela terminou (com ou sem dicas).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setShown(readShown(userId));
  }, [userId]);

  // Chave estável dos exercícios para não buscar de novo a cada renderização.
  const exercisesKey = exercises.map((item) => `${item.name}|${item.reps}`).join(";");

  useEffect(() => {
    if (!enabled || !exercises.length) {
      setSessionTips([]);
      setExerciseTips({});
      setLoaded(true);
      return;
    }
    let active = true;
    setLoaded(false);
    fetchWithAuth("/api/coach/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercises, workoutOrder, weeklyTarget, remainingSessions, followsWeeklyPlan })
    })
      .then((response) =>
        parseJsonResponse<
          | { success: true; data: { sessionTips: CoachTip[]; exerciseTips: Record<string, CoachTip> } }
          | { success: false }
        >(response)
      )
      .then((result) => {
        if (!active || !result.success) return;
        setSessionTips(Array.isArray(result.data.sessionTips) ? result.data.sessionTips : []);
        setExerciseTips(result.data.exerciseTips ?? {});
      })
      .catch(() => {
        // Sem dicas desta vez: o treino segue normal.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workoutKey, exercisesKey, weeklyTarget, remainingSessions, followsWeeklyPlan]);

  const markShown = useCallback(
    (id: string) => {
      setShown((prev) => {
        const next = { ...prev, [id]: Date.now() };
        writeShown(userId, next);
        return next;
      });
    },
    [userId]
  );

  /** A dica mais importante que não está escondida (para o card ao iniciar). */
  const pickSessionTip = useCallback(
    () => sessionTips.find((tip) => !isSnoozed(shown, tip.id)) ?? null,
    [sessionTips, shown]
  );

  /** Dica de carga do exercício, se houver e não estiver escondida. */
  const exerciseTipFor = useCallback(
    (exerciseName: string) => {
      const tip = exerciseTips[normalizeExerciseName(exerciseName)];
      return tip && !isSnoozed(shown, tip.id) ? tip : null;
    },
    [exerciseTips, shown]
  );

  return { loaded, pickSessionTip, exerciseTipFor, markShown };
}

// ── Assinatura ───────────────────────────────────────────────────────────────

export function CoachSignature() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold tracking-normal text-primary">
        R
      </span>
      Dica do Renato
    </span>
  );
}

// ── Card ao iniciar o treino ─────────────────────────────────────────────────

export function CoachTipSheet({ tip, onClose }: { tip: CoachTip; onClose: () => void }) {
  useEffect(() => {
    trackEvent("cta_click", null, { source: `coach_tip_shown_${tip.kind}` });
  }, [tip.kind]);

  return (
    <div
      data-hide-admob
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-tip-title"
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
        <CoachSignature />
        <p id="coach-tip-title" className="mt-3 text-lg font-semibold leading-snug text-white">
          {tip.title}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/72">{tip.text}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
          >
            Bora treinar!
          </button>
          {tip.action ? (
            <Link
              href={tip.action.href}
              onClick={() => trackEvent("cta_click", null, { source: `coach_tip_action_${tip.kind}` })}
              className="flex h-11 w-full items-center justify-center rounded-[16px] border border-white/12 text-sm font-semibold text-white/80 transition hover:border-primary/40 hover:text-white"
            >
              {tip.action.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Dica de carga dentro do exercício ───────────────────────────────────────

export function CoachTipInline({ tip, onDismiss }: { tip: CoachTip; onDismiss: () => void }) {
  return (
    <div className="rounded-[18px] border border-primary/25 bg-primary/[0.08] p-3.5">
      <CoachSignature />
      <p className="mt-2 text-sm font-semibold text-white">{tip.title}</p>
      <p className="mt-1 text-[13px] leading-5 text-white/72">{tip.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2.5 min-h-10 rounded-[12px] bg-primary/15 px-4 text-[13px] font-semibold text-primary transition hover:bg-primary/25"
      >
        Entendi
      </button>
    </div>
  );
}
