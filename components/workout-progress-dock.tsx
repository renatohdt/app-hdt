"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { formatElapsedClock } from "@/lib/active-workout-session";
import {
  SET_COMPLETED_EVENT,
  formatTimerClock,
  sendRestTimerCommand,
  useRestTimerStatus
} from "@/lib/rest-timer-store";

// Barra "Treino em andamento" que fica colada no menu inferior.
// - Anda a cada SÉRIE marcada (feedback frequente), com marcadores entre exercícios.
// - Começa com um pedacinho preenchido ao iniciar (efeito de progresso dotado).
// - Encolhe sozinha ao rolar para baixo e volta ao rolar para cima.
// - O cronômetro é discreto (decisão do Renato).
// - Ao marcar uma série, oferece iniciar o cronômetro com 1 toque (nunca começa sozinho,
//   por causa de bi-set/circuito). No Treino Extra (que cobre o menu), mostra o tempo correndo.

const OFFER_VISIBLE_MS = 20000;

type WorkoutProgressDockProps = {
  title: string;
  startedAt: number;
  setsDone: number;
  setsTotal: number;
  exercisesDone: number;
  exercisesTotal: number;
  /** Número de séries de cada exercício, na ordem — usado para os marcadores. */
  segments: number[];
  onFinish: () => void;
  /** "fixed" = colada no menu inferior; "inline" = dentro de outra tela (ex.: rodapé do Treino Extra). */
  variant?: "fixed" | "inline";
};

export function WorkoutProgressDock({
  title,
  startedAt,
  setsDone,
  setsTotal,
  exercisesDone,
  exercisesTotal,
  segments,
  onFinish,
  variant = "fixed"
}: WorkoutProgressDockProps) {
  const inline = variant === "inline";
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const timer = useRestTimerStatus();
  const timerActiveRef = useRef(timer.active);
  timerActiveRef.current = timer.active;
  /** Oferta "Série feita! Cronômetro 1:30 · Iniciar" (segundos) */
  const [offerSeconds, setOfferSeconds] = useState<number | null>(null);

  useEffect(() => {
    function handleSetCompleted(event: Event) {
      const seconds = (event as CustomEvent<{ seconds: number | null }>).detail?.seconds;
      if (!seconds || timerActiveRef.current) return;
      setOfferSeconds(seconds);
      setCollapsed(false);
    }
    window.addEventListener(SET_COMPLETED_EVENT, handleSetCompleted);
    return () => window.removeEventListener(SET_COMPLETED_EVENT, handleSetCompleted);
  }, []);

  // Some sozinha depois de um tempo, ou quando o cronômetro começa por outro caminho.
  useEffect(() => {
    if (offerSeconds === null) return;
    if (timer.active) {
      setOfferSeconds(null);
      return;
    }
    const id = window.setTimeout(() => setOfferSeconds(null), OFFER_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [offerSeconds, timer.active]);

  const showOffer = offerSeconds !== null && !timer.active && setsDone < setsTotal;
  const offer = showOffer ? (
    <TimerOffer
      seconds={offerSeconds as number}
      onStart={() => {
        sendRestTimerCommand({ type: "start", seconds: offerSeconds });
        setOfferSeconds(null);
      }}
      onDismiss={() => setOfferSeconds(null)}
    />
  ) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (inline) return;
    lastScrollY.current = window.scrollY;
    function handleScroll() {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;
      if (delta > 8 && y > 80) setCollapsed(true);
      else if (delta < -8) setCollapsed(false);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [inline]);

  const total = Math.max(setsTotal, 1);
  const pct = Math.min(100, Math.round(((Math.min(setsDone, total) + 1) / (total + 1)) * 100));
  const ticks: number[] = [];
  let cumulative = 0;
  ticks.push((1 / (total + 1)) * 100);
  segments.slice(0, -1).forEach((count) => {
    cumulative += count;
    ticks.push(((1 + cumulative) / (total + 1)) * 100);
  });
  const clock = formatElapsedClock(now - startedAt);

  if (inline) {
    return (
      <div>
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">
              {title} · em andamento
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {exercisesDone} de {exercisesTotal} exercícios
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-white/45" aria-label={`Tempo de treino ${clock}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {clock}
          </span>
          <button
            type="button"
            onClick={onFinish}
            className="h-9 rounded-full border border-white/15 px-3.5 text-xs font-semibold text-white/75 transition hover:border-primary/40 hover:text-white"
          >
            Finalizar
          </button>
        </div>
        <ProgressBar pct={pct} ticks={ticks} />
        {offer}
        {/* O Treino Extra cobre o menu inferior: o tempo do cronômetro aparece aqui. */}
        {timer.active ? <InlineTimer running={timer.running} leftSeconds={timer.leftSeconds} /> : null}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+var(--app-safe-bottom)+var(--admob-banner-h))] z-30">
      <div className="mx-auto w-full max-w-[var(--app-shell-max)] px-2.5">
        <div className="pointer-events-auto rounded-t-[22px] border border-b-0 border-white/10 bg-[#0c110c]/95 shadow-[0_-14px_34px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Mostrar progresso do treino"
              className="flex w-full items-center gap-3 px-4 pb-[1.1rem] pt-2.5"
            >
              <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-[11px] tabular-nums text-white/45">{clock}</span>
              <ChevronUp className="h-4 w-4 text-white/55" />
            </button>
          ) : (
            <div className="px-4 pb-[1.15rem] pt-3">
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">
                    {title} · em andamento
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {exercisesDone} de {exercisesTotal} exercícios
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-white/45" aria-label={`Tempo de treino ${clock}`}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  {clock}
                </span>
                <button
                  type="button"
                  onClick={onFinish}
                  className="h-9 rounded-full border border-white/15 px-3.5 text-xs font-semibold text-white/75 transition hover:border-primary/40 hover:text-white"
                >
                  Finalizar
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Recolher progresso do treino"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.05] text-white/60"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <ProgressBar pct={pct} ticks={ticks} />
              {offer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, ticks }: { pct: number; ticks: number[] }) {
  return (
    <div
      className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Progresso do treino"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primaryStrong to-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
      {ticks.map((left, index) => (
        <span key={index} className="absolute inset-y-0 w-[2px] bg-[#0c110c]" style={{ left: `${left}%` }} />
      ))}
    </div>
  );
}

function TimerOffer({ seconds, onStart, onDismiss }: { seconds: number; onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 py-1.5 pl-3 pr-1.5 text-[0.8rem] text-white/80" role="status">
      <Timer className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        Série feita! Cronômetro <b className="tabular-nums text-white">{formatTimerClock(seconds)}</b>
      </span>
      <button type="button" onClick={onDismiss} className="h-8 rounded-xl px-2 text-xs font-medium text-white/55 hover:text-white">
        Agora não
      </button>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex h-8 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-black transition hover:brightness-110"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Iniciar
      </button>
    </div>
  );
}

function InlineTimer({ running, leftSeconds }: { running: boolean; leftSeconds: number }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-1.5 pl-3 pr-1.5 text-[0.8rem]">
      <Timer className={running ? "h-4 w-4 text-primary" : "h-4 w-4 text-white/45"} aria-hidden />
      <span className="flex-1 text-white/60">
        Cronômetro{" "}
        <b className={running ? "tabular-nums text-primary" : "tabular-nums text-white/55"}>{formatTimerClock(leftSeconds)}</b>
        {running ? null : " · pausado"}
      </span>
      <button
        type="button"
        onClick={() => sendRestTimerCommand({ type: running ? "pause" : "resume" })}
        aria-label={running ? "Pausar cronômetro" : "Continuar cronômetro"}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-white/75 hover:text-white"
      >
        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => sendRestTimerCommand({ type: "reset" })}
        aria-label="Parar cronômetro"
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-white/75 hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
