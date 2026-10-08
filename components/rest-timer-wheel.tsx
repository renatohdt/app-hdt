"use client";

// Roleta de minutos e segundos (tipo o despertador do iPhone).
// Feita só com rolagem nativa + "scroll-snap" do navegador, sem biblioteca:
// cada número "encaixa" no centro quando a pessoa solta o dedo.

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { TIMER_MAX_SECONDS, TIMER_MIN_SECONDS, TIMER_STEP_SECONDS } from "@/lib/rest-timer-store";

const ITEM_HEIGHT = 40; // altura de cada número (px) — precisa bater com h-10
const VISIBLE = 5; // quantos números aparecem na roleta (ímpar, para ter um no meio)
const PAD = Math.floor(VISIBLE / 2);

const MINUTES = Array.from({ length: Math.floor(TIMER_MAX_SECONDS / 60) + 1 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 / TIMER_STEP_SECONDS }, (_, i) => i * TIMER_STEP_SECONDS);

export function RestTimerWheel({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  function handleColumn(nextMinutes: number, nextSeconds: number) {
    let next = nextMinutes * 60 + nextSeconds;
    if (next > TIMER_MAX_SECONDS) next = TIMER_MAX_SECONDS;
    if (next < TIMER_MIN_SECONDS) next = TIMER_MIN_SECONDS;
    onChange(next);
  }

  return (
    <div className="relative flex items-center justify-center gap-1" style={{ height: ITEM_HEIGHT * VISIBLE }} data-no-swipe>
      {/* faixa que marca o número escolhido */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[14%] rounded-xl border border-primary/25 bg-white/[0.06]"
        style={{ top: ITEM_HEIGHT * PAD, height: ITEM_HEIGHT }}
      />
      <WheelColumn label="Minutos" items={MINUTES} value={minutes} onChange={(m) => handleColumn(m, m * 60 >= TIMER_MAX_SECONDS ? 0 : seconds)} />
      <span className="w-6 text-[0.7rem] tracking-wide text-white/36">min</span>
      <span className="text-[1.6rem] font-bold text-white/55">:</span>
      <WheelColumn label="Segundos" items={SECONDS} value={seconds} onChange={(s) => handleColumn(minutes, s)} />
      <span className="w-6 text-[0.7rem] tracking-wide text-white/36">s</span>
    </div>
  );
}

function WheelColumn({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<number | null>(null);
  const lastIndex = useRef<number>(-1);
  const userScrolling = useRef(false);
  const selectedIndex = Math.max(0, items.indexOf(value));
  // Número destacado enquanto a roleta gira (antes de confirmar).
  const [liveIndex, setLiveIndex] = useState(selectedIndex);

  // Quando o valor muda por fora (atalho tocado, limite 5:00), gira a roleta até ele.
  useEffect(() => {
    const el = ref.current;
    if (!el || userScrolling.current) return;
    const top = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTo({ top, behavior: lastIndex.current === -1 ? "auto" : "smooth" });
    }
    lastIndex.current = selectedIndex;
    setLiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    },
    []
  );

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    userScrolling.current = true;
    const index = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      setLiveIndex(index);
      try {
        navigator.vibrate?.(4); // "tique" leve a cada número (Android)
      } catch {
        // ignora
      }
    }
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    // Só confirma o valor quando a roleta para de girar.
    settleTimer.current = window.setTimeout(() => {
      userScrolling.current = false;
      const finalIndex = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));
      onChange(items[finalIndex]);
    }, 120);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(items.length - 1, Math.max(0, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)));
      onChange(items[next]);
    }
  }

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={items[0]}
      aria-valuemax={items[items.length - 1]}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className="relative w-[84px] snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-scrollbar]:hidden"
      style={{
        height: ITEM_HEIGHT * VISIBLE,
        touchAction: "pan-y",
        WebkitMaskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)",
        maskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)"
      }}
    >
      {Array.from({ length: PAD }, (_, i) => (
        <div key={`top-${i}`} className="h-10" aria-hidden />
      ))}
      {items.map((item, index) => (
        <div
          key={item}
          className={clsx(
            "grid h-10 snap-center place-items-center text-[1.6rem] font-bold tabular-nums transition",
            index === liveIndex ? "scale-105 text-white" : "text-white/36"
          )}
        >
          {String(item).padStart(2, "0")}
        </div>
      ))}
      {Array.from({ length: PAD }, (_, i) => (
        <div key={`bottom-${i}`} className="h-10" aria-hidden />
      ))}
    </div>
  );
}
