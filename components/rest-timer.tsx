"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, TimerReset, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui";

const MIN_SECONDS = 10;
const MAX_SECONDS = 120;
const SLIDER_STEP = 5;

export function RestTimer({
  suggestedSeconds,
  initialSeconds,
  title = "Cronômetro",
  compact = false,
  onSelectedSecondsChange
}: {
  suggestedSeconds?: number | null;
  initialSeconds?: number | null;
  title?: string;
  compact?: boolean;
  onSelectedSecondsChange?: (seconds: number) => void;
}) {
  const fallbackSeconds = normalizePreset(initialSeconds) ?? normalizePreset(suggestedSeconds) ?? 60;
  const [remainingSeconds, setRemainingSeconds] = useState(fallbackSeconds);
  const [selectedSeconds, setSelectedSeconds] = useState(fallbackSeconds);
  const [running, setRunning] = useState(false);
  const selectionChangeRef = useRef(onSelectedSecondsChange);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);

  useEffect(() => {
    const audio = new Audio("/sound/sino-boxe.mp3");
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("horadotreino:cronometro-mudo");
      if (stored === "true") {
        setMuted(true);
      }
    } catch {
      // Sem acesso ao armazenamento; mantém o som ligado por padrão.
    }
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (!running || remainingSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds, running]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      setRunning(false);

      const audio = audioRef.current;
      if (audio && !mutedRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Navegador pode bloquear o áudio; ignoramos sem quebrar o app.
        });
      }
    }
  }, [remainingSeconds]);

  useEffect(() => {
    selectionChangeRef.current = onSelectedSecondsChange;
  }, [onSelectedSecondsChange]);

  useEffect(() => {
    const nextValue = normalizePreset(initialSeconds) ?? normalizePreset(suggestedSeconds);
    if (!nextValue) {
      return;
    }

    setSelectedSeconds(nextValue);
    if (!running) {
      setRemainingSeconds(nextValue);
    }
  }, [initialSeconds, running, suggestedSeconds]);

  useEffect(() => {
    selectionChangeRef.current?.(selectedSeconds);
  }, [selectedSeconds]);

  const helperText = useMemo(() => {
    if (remainingSeconds === 0) {
      return "Tempo finalizado";
    }

    if (running) {
      return "Contagem regressiva em andamento";
    }

    return "Escolha um tempo rápido e inicie quando quiser";
  }, [remainingSeconds, running]);

  function handleSelectPreset(value: number) {
    setSelectedSeconds(value);
    if (!running) {
      setRemainingSeconds(value);
    }
  }

  function handleStartOrPause() {
    if (running) {
      setRunning(false);
      return;
    }

    // "Destrava" o áudio dentro do toque do usuário (necessário no iPhone/Android):
    // tocamos em silêncio por um instante para o som funcionar quando o tempo zerar.
    const audio = audioRef.current;
    if (audio) {
      audio.muted = true;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    }

    setRemainingSeconds(selectedSeconds);
    setRunning(true);
  }

  function handleReset() {
    setRunning(false);
    setRemainingSeconds(selectedSeconds);
  }

  function handleToggleMuted() {
    setMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("horadotreino:cronometro-mudo", String(next));
      } catch {
        // Ignora se o armazenamento não estiver disponível.
      }
      return next;
    });
  }

  function handleSuggestedSelect() {
    const nextSeconds = normalizePreset(suggestedSeconds);
    if (!nextSeconds) {
      return;
    }

    handleSelectPreset(nextSeconds);
  }

  function handleSliderChange(value: number) {
    handleSelectPreset(value);
  }

  return (
    <div
      className={clsx(
        "relative rounded-[26px] border border-primary/14 bg-[linear-gradient(180deg,rgba(14,22,14,0.92),rgba(7,10,7,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        compact && "rounded-[24px] p-3.5"
      )}
    >
      <button
        type="button"
        onClick={handleToggleMuted}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:text-white"
        aria-label={muted ? "Ativar som do cronômetro" : "Silenciar som do cronômetro"}
        aria-pressed={muted}
        title={muted ? "Som desligado — toque para ativar" : "Som ligado — toque para silenciar"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <div className="flex flex-col items-center text-center">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/90">{title}</p>
          <p className="mt-1 text-sm text-white/56">{helperText}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-3 text-center">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/36">Tempo atual</p>
          <div className="mt-1 text-[2rem] font-semibold leading-none text-white">{formatTime(remainingSeconds)}</div>
        </div>

        {suggestedSeconds ? (
          <button
            type="button"
            onClick={handleSuggestedSelect}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/74 transition hover:text-white"
            aria-label="Usar descanso planejado"
            title="Usar descanso planejado"
          >
            <TimerReset className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        <input
          type="range"
          min={MIN_SECONDS}
          max={MAX_SECONDS}
          step={SLIDER_STEP}
          value={selectedSeconds}
          onChange={(event) => handleSliderChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
          aria-label="Ajustar cronômetro"
        />

        <div className="flex items-center justify-between text-[11px] font-medium text-white/42">
          <span>{MIN_SECONDS}s</span>
          <span>{MAX_SECONDS}s</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-[minmax(0,1fr)_auto]">
        <Button onClick={handleStartOrPause} className="min-h-12">
          <span className="inline-flex items-center gap-2">
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pausar" : "Iniciar"}
          </span>
        </Button>

        <Button variant="secondary" onClick={handleReset} className="min-h-12 px-4">
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Resetar
          </span>
        </Button>
      </div>

      {!compact ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-white/42">
          <TimerReset className="h-3.5 w-3.5 text-primary/80" />
          O tempo fica pronto para ser reutilizado na próxima série ou isometria.
        </div>
      ) : null}
    </div>
  );
}

function normalizePreset(value?: number | null) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.min(Math.max(Math.round(seconds), MIN_SECONDS), MAX_SECONDS);
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
