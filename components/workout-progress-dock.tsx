"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatElapsedClock } from "@/lib/active-workout-session";

// Barra "Treino em andamento" que fica colada no menu inferior.
// - Anda a cada SÉRIE marcada (feedback frequente), com marcadores entre exercícios.
// - Começa com um pedacinho preenchido ao iniciar (efeito de progresso dotado).
// - Encolhe sozinha ao rolar para baixo e volta ao rolar para cima.
// - O cronômetro é discreto (decisão do Renato).

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
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+var(--app-safe-bottom))] z-30">
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
