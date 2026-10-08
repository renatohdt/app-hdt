"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChartLine, Dumbbell, House, Timer, UserRound } from "lucide-react";
import { RestTimer } from "@/components/rest-timer";
import { AdMobBannerController } from "@/components/AdMobBannerController";
import { formatTimerClock, normalizeTimerSeconds, useRestTimer } from "@/lib/rest-timer-store";

const NAV_ITEMS = [
  {
    key: "home",
    href: "/dashboard",
    label: "Inicio",
    icon: House
  },
  {
    key: "calendar",
    href: "/calendario",
    label: "Evolução",
    icon: ChartLine
  },
  {
    key: "training",
    href: "/treino",
    label: "Treino",
    icon: Dumbbell
  },
  {
    key: "timer",
    label: "Cronômetro",
    icon: Timer
  },
  {
    key: "profile",
    href: "/perfil",
    label: "Perfil",
    icon: UserRound
  }
] as const;

// Anel de progresso do ícone do cronômetro
const RING_RADIUS = 23;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function AppBottomNav() {
  const pathname = usePathname();
  const [timerOpen, setTimerOpen] = useState(false);
  const [plannedSeconds, setPlannedSeconds] = useState<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  // O cronômetro vive aqui (e não dentro do painel): assim ele continua
  // contando com o painel fechado.
  const timer = useRestTimer();
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    // Ao abrir um exercício, a tela avisa o tempo planejado dele.
    // Se o cronômetro estiver parado, já deixa esse tempo escolhido;
    // se estiver contando, não mexe na contagem.
    function handleSuggestedRest(event: Event) {
      const detail = (event as CustomEvent<{ seconds?: number | null }>).detail;
      const nextValue = normalizeTimerSeconds(detail?.seconds);
      if (!nextValue) return;
      setPlannedSeconds(nextValue);
      if (!timerRef.current.active) timerRef.current.select(nextValue);
    }

    window.addEventListener("hdt-rest-suggestion", handleSuggestedRest as EventListener);
    return () => window.removeEventListener("hdt-rest-suggestion", handleSuggestedRest as EventListener);
  }, []);

  // Arrastar para baixo fecha — menos quando o dedo começou na roleta.
  function startSwipe(y: number, target: EventTarget | null) {
    const fromWheel = target instanceof Element && target.closest("[data-no-swipe]");
    swipeStartY.current = fromWheel ? null : y;
  }
  function endSwipe(y: number) {
    if (swipeStartY.current === null) return;
    if (y - swipeStartY.current > 60) setTimerOpen(false);
    swipeStartY.current = null;
  }

  const showTimerBadge = timer.active && !timerOpen;

  return (
    <nav aria-label="Navegação principal do app" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      {timerOpen ? (
        <>
          {/* Tocar fora do painel fecha o cronômetro */}
          <div
            aria-hidden
            onClick={() => setTimerOpen(false)}
            className="pointer-events-auto fixed inset-0 bg-black/40"
          />
          <div
            data-hide-admob
            className="pointer-events-auto relative mx-auto mb-3 w-full max-w-[var(--app-shell-max)] px-4"
            onTouchStart={(e) => startSwipe(e.touches[0].clientY, e.target)}
            onTouchEnd={(e) => endSwipe(e.changedTouches[0].clientY)}
            onMouseDown={(e) => startSwipe(e.clientY, e.target)}
            onMouseUp={(e) => endSwipe(e.clientY)}
          >
            <div className="rounded-[28px] border border-white/10 bg-[#070907]/92 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl">
              <RestTimer timer={timer} plannedSeconds={plannedSeconds} onClose={() => setTimerOpen(false)} />
            </div>
          </div>
        </>
      ) : null}

      {/* Banner do AdMob (só app com plugin + plano free) fica logo acima desta barra */}
      <AdMobBannerController barRef={barRef} />
      <div ref={barRef} className="pointer-events-auto relative border-t border-white/12 bg-[#070907]">
        <div className="mx-auto w-full max-w-[var(--app-shell-max)] px-4 pb-[calc(0.35rem+var(--app-safe-bottom))] pt-2">
          <div className="grid grid-cols-5 gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isTraining = item.key === "training";
              const isTimer = item.key === "timer";
              const active = isTimer
                ? timerOpen
                : Boolean(item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)));

              const baseClasses = clsx(
                "pointer-events-auto inline-flex min-h-[4.25rem] items-center justify-center rounded-[20px] px-1 py-2 transition",
                active
                  ? "bg-primary/14 text-primary shadow-[inset_0_0_0_1px_rgba(34,197,94,0.18)]"
                  : "text-white/42 hover:bg-white/[0.04] hover:text-white/82",
                isTraining && "min-h-[4.6rem]"
              );

              const iconClasses = clsx(
                isTraining ? "h-[2.35rem] w-[2.35rem]" : "h-7 w-7",
                active && "drop-shadow-[0_0_14px_rgba(34,197,94,0.45)]"
              );

              if (isTimer) {
                const label = showTimerBadge
                  ? `Cronômetro: faltam ${formatTimerClock(timer.leftSeconds)}${timer.paused ? " (pausado)" : ""}`
                  : item.label;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTimerOpen((current) => !current)}
                    className={clsx(
                      baseClasses,
                      "relative",
                      timer.justFinished && !timerOpen && "animate-pulse bg-primary/25 text-primary"
                    )}
                    aria-pressed={timerOpen}
                    aria-label={label}
                    title={label}
                  >
                    {showTimerBadge ? (
                      <>
                        <svg viewBox="0 0 52 52" className="absolute inset-0 m-auto h-[3.25rem] w-[3.25rem]" aria-hidden>
                          <circle cx="26" cy="26" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-primary/20" />
                          <circle
                            cx="26"
                            cy="26"
                            r={RING_RADIUS}
                            fill="none"
                            strokeWidth="3"
                            strokeLinecap="round"
                            className={clsx(
                              "origin-center -rotate-90 transition-[stroke-dashoffset] duration-300 ease-linear",
                              timer.paused ? "stroke-white/45" : "stroke-primary"
                            )}
                            strokeDasharray={RING_LENGTH}
                            strokeDashoffset={RING_LENGTH * (1 - timer.progress)}
                          />
                        </svg>
                        <span
                          className={clsx(
                            "text-[0.82rem] font-extrabold tabular-nums",
                            timer.paused ? "text-white/55" : "text-primary"
                          )}
                        >
                          {formatTimerClock(timer.leftSeconds)}
                        </span>
                      </>
                    ) : (
                      <Icon className={iconClasses} />
                    )}
                  </button>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={baseClasses}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className={iconClasses} />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
