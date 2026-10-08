"use client";

// Painel do cronômetro (abre pelo ícone do menu inferior).
// Ele só MOSTRA e comanda o cronômetro: o tempo em si fica no useRestTimer
// (lib/rest-timer-store.ts), que continua contando com o painel fechado.

import clsx from "clsx";
import { Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui";
import { RestTimerWheel } from "@/components/rest-timer-wheel";
import {
  TIMER_PRESETS,
  formatTimerClock,
  normalizeTimerSeconds,
  type RestTimerController
} from "@/lib/rest-timer-store";

export function RestTimer({
  timer,
  plannedSeconds,
  onClose,
  title = "Cronômetro"
}: {
  timer: RestTimerController;
  /** Tempo planejado do exercício aberto (descanso ou duração), quando existir. */
  plannedSeconds?: number | null;
  onClose: () => void;
  title?: string;
}) {
  const planned = normalizeTimerSeconds(plannedSeconds);
  const presets = Array.from(new Set([...TIMER_PRESETS, ...(planned ? [planned] : [])])).sort((a, b) => a - b);

  const helperText = timer.running
    ? "Pode fechar, o tempo continua"
    : timer.paused
      ? "Pausado"
      : "Gire os números ou toque num atalho";

  function handleMain() {
    if (timer.running) timer.pause();
    else if (timer.paused) timer.resume();
    else timer.start();
  }

  return (
    <div className="relative rounded-[24px] border border-primary/14 bg-[linear-gradient(180deg,rgba(14,22,14,0.92),rgba(7,10,7,0.92))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:text-white"
          aria-label="Fechar cronômetro"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="min-w-0 text-center">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/90">{title}</p>
          <p className="mt-1 text-sm text-white/56">{helperText}</p>
        </div>

        <button
          type="button"
          onClick={timer.toggleMuted}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:text-white"
          aria-label={timer.muted ? "Ativar som do cronômetro" : "Silenciar som do cronômetro"}
          aria-pressed={timer.muted}
          title={timer.muted ? "Som desligado — toque para ativar" : "Som ligado — toque para silenciar"}
        >
          {timer.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {timer.active ? (
        <div className="mt-5 text-center">
          <div
            className={clsx(
              "text-[3.4rem] font-extrabold leading-none tabular-nums tracking-tight",
              timer.paused ? "text-white/55" : "text-white"
            )}
            aria-live="off"
          >
            {formatTimerClock(timer.leftSeconds)}
          </div>
          <div className="mx-2 mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={clsx("h-full rounded-full transition-[width] duration-300 ease-linear", timer.paused ? "bg-white/40" : "bg-primary")}
              style={{ width: `${timer.progress * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {presets.map((seconds) => {
              const isPlanned = seconds === planned;
              const isSelected = seconds === timer.selectedSeconds;
              return (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => timer.select(seconds)}
                  title={isPlanned ? "Tempo planejado do exercício" : undefined}
                  aria-pressed={isSelected}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold tabular-nums transition",
                    isPlanned && "border-dashed",
                    isSelected
                      ? "border-primary/40 bg-primary/14 text-primary"
                      : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                  )}
                >
                  {formatTimerClock(seconds)}
                </button>
              );
            })}
          </div>

          <div className="mt-2">
            <RestTimerWheel value={timer.selectedSeconds} onChange={timer.select} />
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
        <Button variant="secondary" onClick={timer.reset} className="min-h-12 px-4" aria-label="Resetar cronômetro" title="Resetar">
          <RotateCcw className="h-4 w-4" />
        </Button>

        <Button onClick={handleMain} className="min-h-12">
          <span className="inline-flex items-center gap-2">
            {timer.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {timer.running ? "Pausar" : timer.paused ? "Continuar" : `Iniciar ${formatTimerClock(timer.selectedSeconds)}`}
          </span>
        </Button>

        <Button
          variant="secondary"
          onClick={() => timer.addSeconds(15)}
          disabled={!timer.active}
          className="min-h-12 px-3.5 disabled:opacity-35"
          aria-label="Adicionar 15 segundos"
        >
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Plus className="h-3.5 w-3.5" />
            15s
          </span>
        </Button>
      </div>
    </div>
  );
}
