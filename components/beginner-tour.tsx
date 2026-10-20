"use client";

// Dicas do 1º treino (destaque + caixa de explicação). Textos e regras em
// lib/beginner-tour.ts. Os elementos destacados são marcados com o atributo
// data-tour="<target>" nas telas (treino e card do exercício).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/lib/analytics-client";
import {
  TOUR_GROUPS,
  readTourState,
  writeTourState,
  type TourContext,
  type TourGroupId,
  type TourState,
  type TourStep
} from "@/lib/beginner-tour";

const SPOT_PADDING = 6;
const TOOLTIP_GAP = 14;
const TOOLTIP_ESTIMATED_HEIGHT = 230;
/** Tempo máximo esperando o elemento aparecer na tela antes de pular a dica. */
const TARGET_WAIT_MS = 900;

type ActiveTour = { group: TourGroupId; ids: string[]; index: number };

/**
 * Controla as dicas: `request(grupo)` mostra as dicas ainda não vistas do grupo
 * (se o usuário for elegível e não tiver pulado). Uma dica que não encontra o
 * elemento na tela é pulada sem ser marcada como vista (aparece numa próxima vez).
 */
export function useBeginnerTour(userId: string, eligible: boolean) {
  const [state, setState] = useState<TourState | null>(null);
  const [active, setActive] = useState<ActiveTour | null>(null);

  useEffect(() => {
    setState(readTourState(userId));
  }, [userId]);

  const request = useCallback(
    (group: TourGroupId) => {
      if (!eligible || !state || state.skipped) return;
      const ids = TOUR_GROUPS[group].map((step) => step.id).filter((id) => !state.seen.includes(id));
      if (!ids.length) return;
      // Um grupo por vez: se já há dicas na tela, este pedido espera a próxima chance.
      setActive((current) => current ?? { group, ids, index: 0 });
    },
    [eligible, state]
  );

  const advance = useCallback(
    (markSeen: boolean) => {
      if (!active) return;
      const id = active.ids[active.index];
      if (markSeen && id && state && !state.seen.includes(id)) {
        const nextState = { ...state, seen: [...state.seen, id] };
        writeTourState(userId, nextState);
        setState(nextState);
      }
      const nextIndex = active.index + 1;
      setActive(nextIndex < active.ids.length ? { ...active, index: nextIndex } : null);
    },
    [active, state, userId]
  );

  // "Pular dicas" encerra só o conjunto da tela atual: na Home, as dicas da Home;
  // no treino, todas as dicas do treino (tela, exercício e finalizar).
  const skipAll = useCallback(() => {
    if (!active) return;
    trackEvent("cta_click", null, { source: `beginner_tour_skip_${active.ids[active.index] ?? "unknown"}` });
    const groups: TourGroupId[] = active.group === "home" ? ["home"] : ["screen", "exercise", "finish"];
    const skippedIds = groups.flatMap((group) => TOUR_GROUPS[group].map((step) => step.id));
    const seen = Array.from(new Set([...(state?.seen ?? []), ...skippedIds]));
    const nextState = { seen, skipped: state?.skipped ?? false };
    writeTourState(userId, nextState);
    setState(nextState);
    setActive(null);
  }, [active, state, userId]);

  const currentStep: TourStep | null = active
    ? TOUR_GROUPS[active.group].find((step) => step.id === active.ids[active.index]) ?? null
    : null;

  return {
    request,
    isActive: Boolean(active),
    currentStep,
    position: active ? { index: active.index, total: active.ids.length } : null,
    next: () => advance(true),
    missing: () => advance(false),
    skipAll
  };
}

export function BeginnerTourOverlay({
  tour,
  context
}: {
  tour: ReturnType<typeof useBeginnerTour>;
  context: TourContext;
}) {
  const step = tour.currentStep;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !step || !tour.position) return null;
  return createPortal(
    <CoachMark
      key={step.id}
      step={step}
      context={context}
      index={tour.position.index}
      total={tour.position.total}
      onNext={tour.next}
      onSkip={tour.skipAll}
      onMissing={tour.missing}
    />,
    document.body
  );
}

type Rect = { top: number; left: number; width: number; height: number };

function CoachMark({
  step,
  context,
  index,
  total,
  onNext,
  onSkip,
  onMissing
}: {
  step: TourStep;
  context: TourContext;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  onMissing: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;

  // Acha o elemento, rola até ele e acompanha a posição (rolagem, animações).
  useEffect(() => {
    const selector = `[data-tour="${step.target}"]`;
    let frame = 0;
    let scrolled = false;
    const startedAt = Date.now();

    const tick = () => {
      const element = document.querySelector<HTMLElement>(selector);
      const box = element?.getBoundingClientRect();
      if (!element || !box || box.width === 0 || box.height === 0) {
        if (Date.now() - startedAt > TARGET_WAIT_MS) {
          onMissingRef.current();
          return;
        }
        frame = window.requestAnimationFrame(tick);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setViewportHeight(window.innerHeight);
      setRect((prev) =>
        prev &&
        Math.abs(prev.top - box.top) < 0.5 &&
        Math.abs(prev.left - box.left) < 0.5 &&
        Math.abs(prev.width - box.width) < 0.5 &&
        Math.abs(prev.height - box.height) < 0.5
          ? prev
          : { top: box.top, left: box.left, width: box.width, height: box.height }
      );
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [step.target]);

  // Até achar o elemento, não mostra nada (evita "piscar" a tela escura).
  if (!rect) return null;

  const spot = {
    top: rect.top - SPOT_PADDING,
    left: rect.left - SPOT_PADDING,
    width: rect.width + SPOT_PADDING * 2,
    height: rect.height + SPOT_PADDING * 2
  };
  const spaceBelow = viewportHeight - (spot.top + spot.height);
  const placeBelow = spaceBelow > TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_GAP || spot.top < viewportHeight / 2;
  const tooltipPosition = placeBelow
    ? { top: Math.min(spot.top + spot.height + TOOLTIP_GAP, viewportHeight - TOOLTIP_ESTIMATED_HEIGHT) }
    : { bottom: Math.max(viewportHeight - spot.top + TOOLTIP_GAP, 16) };
  const isLast = index === total - 1;

  return (
    <div
      data-hide-admob
      role="dialog"
      aria-modal="true"
      aria-labelledby="beginner-tour-title"
      className="fixed inset-0 z-[95]"
      // Tocar fora da caixa não faz nada (de propósito): só "Pular dicas" ou "Entendi".
      onClick={(event) => event.stopPropagation()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute transition-all duration-300 ease-out"
        style={{
          ...spot,
          borderRadius: step.shape === "pill" ? 999 : 20,
          boxShadow: "0 0 0 3px #22c55e, 0 0 0 9999px rgba(0, 0, 0, 0.74)"
        }}
      />
      <div
        className="absolute inset-x-4 mx-auto max-w-sm rounded-[22px] border border-white/12 bg-[#111] p-4 shadow-2xl"
        style={tooltipPosition}
      >
        <p id="beginner-tour-title" className="text-[15px] font-semibold leading-snug text-white">
          {step.title(context)}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-white/75">{step.text(context)}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="-ml-2 min-h-11 rounded-xl px-2 text-sm font-medium text-white/55 transition hover:text-white/80"
          >
            Pular dicas
          </button>
          <div className="flex items-center gap-3">
            {total > 1 ? (
              <span className="text-xs tabular-nums text-white/45">
                {index + 1} de {total}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onNext}
              className="min-h-11 rounded-[14px] bg-primary px-5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {isLast ? "Entendi!" : "Entendi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
