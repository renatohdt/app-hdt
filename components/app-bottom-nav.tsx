"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell, House, Timer, UserRound } from "lucide-react";
import { RestTimer } from "@/components/rest-timer";

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
    label: "Calendário",
    icon: CalendarDays
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

export function AppBottomNav() {
  const pathname = usePathname();
  const [timerOpen, setTimerOpen] = useState(false);
  const [suggestedSeconds, setSuggestedSeconds] = useState(60);

  useEffect(() => {
    function handleSuggestedRest(event: Event) {
      const detail = (event as CustomEvent<{ seconds?: number | null }>).detail;
      const nextValue = normalizeSuggestedSeconds(detail?.seconds);
      if (nextValue) {
        setSuggestedSeconds(nextValue);
      }
    }

    window.addEventListener("hdt-rest-suggestion", handleSuggestedRest as EventListener);
    return () => window.removeEventListener("hdt-rest-suggestion", handleSuggestedRest as EventListener);
  }, []);

  return (
    <nav aria-label="Navegacao principal do app" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      {timerOpen ? (
        <div className="pointer-events-auto mx-auto mb-3 w-full max-w-[var(--app-shell-max)] px-4">
          <div className="rounded-[28px] border border-white/10 bg-[#070907]/92 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl">
            <RestTimer title="Cronômetro" suggestedSeconds={suggestedSeconds} initialSeconds={suggestedSeconds} compact />
          </div>
        </div>
      ) : null}

      <div className="pointer-events-auto border-t border-white/12 bg-[#070907]">
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
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTimerOpen((current) => !current)}
                    className={baseClasses}
                    aria-pressed={timerOpen}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Icon className={iconClasses} />
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

function normalizeSuggestedSeconds(value?: number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
