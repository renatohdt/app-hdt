"use client";

// Cronômetro do menu inferior — estado guardado no próprio aparelho (localStorage).
//
// Por que não guardar só na memória da tela? Porque:
// 1. o painel do cronômetro some quando a pessoa fecha (e levava o tempo junto);
// 2. o iOS/Android congelam o app em segundo plano, e um "diminui 1 a cada
//    segundo" atrasa. Aqui guardamos a HORA EM QUE O TEMPO ACABA (endAt) e
//    calculamos o que falta — fica sempre exato, mesmo com a tela bloqueada.
//
// Mesma ideia usada no "Treino em andamento" (lib/active-workout-session.ts).
// Nada aqui chama a rede.

import { useCallback, useEffect, useRef, useState } from "react";

export const TIMER_MIN_SECONDS = 5;
export const TIMER_MAX_SECONDS = 300;
export const TIMER_STEP_SECONDS = 5;
export const TIMER_PRESETS = [30, 45, 60, 90, 120];

const STORAGE_KEY = "hdt-rest-timer";
const CHANGE_EVENT = "hdt-rest-timer-change";
const MUTED_KEY = "horadotreino:cronometro-mudo";
/** Se o tempo acabou há mais do que isso (app estava fechado), não toca o sino ao reabrir. */
const LATE_FINISH_TOLERANCE_MS = 5000;

export type RestTimerState = {
  v: 1;
  /** Tempo escolhido na roleta/atalho (segundos). */
  selectedSeconds: number;
  /** Hora (ms) em que o tempo acaba. null = não está rodando. */
  endAt: number | null;
  /** Quanto faltava quando foi pausado (ms). null = não está pausado. */
  pausedLeftMs: number | null;
  /** Duração total da contagem atual (ms), usada no anel de progresso. */
  totalMs: number;
};

export function normalizeTimerSeconds(value?: number | null) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const stepped = Math.round(seconds / TIMER_STEP_SECONDS) * TIMER_STEP_SECONDS;
  return Math.min(Math.max(stepped, TIMER_MIN_SECONDS), TIMER_MAX_SECONDS);
}

export function formatTimerClock(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function defaultState(selectedSeconds = 60): RestTimerState {
  return { v: 1, selectedSeconds, endAt: null, pausedLeftMs: null, totalMs: selectedSeconds * 1000 };
}

function readState(): RestTimerState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<RestTimerState>;
    const selected = normalizeTimerSeconds(parsed.selectedSeconds) ?? 60;
    return {
      v: 1,
      selectedSeconds: selected,
      endAt: typeof parsed.endAt === "number" ? parsed.endAt : null,
      pausedLeftMs: typeof parsed.pausedLeftMs === "number" ? parsed.pausedLeftMs : null,
      totalMs: typeof parsed.totalMs === "number" && parsed.totalMs > 0 ? parsed.totalMs : selected * 1000
    };
  } catch {
    return defaultState();
  }
}

function writeState(state: RestTimerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // armazenamento cheio/bloqueado: segue só na memória
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iPhone não tem vibração pelo navegador; ignora
  }
}

export type RestTimerController = ReturnType<typeof useRestTimer>;

/**
 * Controla o cronômetro. Deve ser usado UMA vez, no menu inferior (que fica
 * montado mesmo com o painel fechado) — assim o tempo nunca se perde.
 */
export function useRestTimer() {
  const [state, setState] = useState<RestTimerState>(() => defaultState());
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  /** Hora em que o tempo terminou por último (para o ícone piscar). */
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Carrega o que estava salvo (inclusive um cronômetro que ficou rodando).
  useEffect(() => {
    setState(readState());
    try {
      if (window.localStorage.getItem(MUTED_KEY) === "true") setMuted(true);
    } catch {
      // mantém som ligado
    }
    const onChange = () => setState(readState());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) onChange();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const audio = new Audio("/sound/sino-boxe.mp3");
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
    };
  }, []);

  const update = useCallback((next: RestTimerState) => {
    setState(next);
    writeState(next);
  }, []);

  const finish = useCallback(
    (late: boolean) => {
      const current = stateRef.current;
      update({ ...current, endAt: null, pausedLeftMs: null, totalMs: current.selectedSeconds * 1000 });
      if (late) return; // acabou com o app fechado: só zera, sem barulho ao reabrir
      setFinishedAt(Date.now());
      vibrate([200, 100, 200]);
      const audio = audioRef.current;
      if (audio && !mutedRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // navegador pode bloquear o áudio; ignoramos sem quebrar o app
        });
      }
    },
    [update]
  );

  // Relógio: só "anda" enquanto está rodando. Também confere ao voltar do segundo plano.
  useEffect(() => {
    if (state.endAt === null) return;
    const check = () => {
      const t = Date.now();
      setNow(t);
      const endAt = stateRef.current.endAt;
      if (endAt !== null && t >= endAt) finish(t - endAt > LATE_FINISH_TOLERANCE_MS);
    };
    check();
    const id = window.setInterval(check, 250);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [state.endAt, finish]);

  // O ícone pisca por alguns segundos depois que o tempo acaba.
  useEffect(() => {
    if (finishedAt === null) return;
    const id = window.setTimeout(() => setFinishedAt(null), 4000);
    return () => window.clearTimeout(id);
  }, [finishedAt]);

  /** Libera o som dentro do toque do usuário (exigência do iPhone/Android). */
  const unlockAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
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
  }, []);

  const running = state.endAt !== null;
  const paused = state.pausedLeftMs !== null;
  const active = running || paused;
  const leftMs = running ? Math.max(0, (state.endAt as number) - now) : paused ? (state.pausedLeftMs as number) : state.selectedSeconds * 1000;
  const progress = active ? Math.min(1, Math.max(0, leftMs / state.totalMs)) : 1;

  const select = useCallback(
    (seconds: number) => {
      const value = normalizeTimerSeconds(seconds);
      if (!value) return;
      const current = stateRef.current;
      if (current.selectedSeconds === value) return;
      // Trocar o tempo não mexe numa contagem que já está rodando/pausada.
      const isActive = current.endAt !== null || current.pausedLeftMs !== null;
      update({ ...current, selectedSeconds: value, totalMs: isActive ? current.totalMs : value * 1000 });
    },
    [update]
  );

  const start = useCallback(
    (seconds?: number) => {
      unlockAudio();
      const current = stateRef.current;
      const value = normalizeTimerSeconds(seconds) ?? current.selectedSeconds;
      const t = Date.now();
      setNow(t);
      setFinishedAt(null);
      update({ ...current, selectedSeconds: value, endAt: t + value * 1000, pausedLeftMs: null, totalMs: value * 1000 });
    },
    [unlockAudio, update]
  );

  const pause = useCallback(() => {
    const current = stateRef.current;
    if (current.endAt === null) return;
    update({ ...current, endAt: null, pausedLeftMs: Math.max(0, current.endAt - Date.now()) });
  }, [update]);

  const resume = useCallback(() => {
    unlockAudio();
    const current = stateRef.current;
    if (current.pausedLeftMs === null) return;
    const t = Date.now();
    setNow(t);
    update({ ...current, endAt: t + current.pausedLeftMs, pausedLeftMs: null });
  }, [unlockAudio, update]);

  const reset = useCallback(() => {
    const current = stateRef.current;
    update({ ...current, endAt: null, pausedLeftMs: null, totalMs: current.selectedSeconds * 1000 });
  }, [update]);

  const addSeconds = useCallback(
    (seconds: number) => {
      const current = stateRef.current;
      const extra = seconds * 1000;
      if (current.endAt !== null) update({ ...current, endAt: current.endAt + extra, totalMs: current.totalMs + extra });
      else if (current.pausedLeftMs !== null)
        update({ ...current, pausedLeftMs: current.pausedLeftMs + extra, totalMs: current.totalMs + extra });
    },
    [update]
  );

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(MUTED_KEY, String(next));
      } catch {
        // ignora
      }
      return next;
    });
  }, []);

  return {
    selectedSeconds: state.selectedSeconds,
    running,
    paused,
    active,
    leftSeconds: leftMs / 1000,
    progress,
    muted,
    justFinished: finishedAt !== null,
    select,
    start,
    pause,
    resume,
    reset,
    addSeconds,
    toggleMuted
  };
}
