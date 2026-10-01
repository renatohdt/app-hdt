"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Abas que trocam tocando no rótulo OU deslizando o conteúdo para o lado.
// Usa o scroll-snap nativo (sem biblioteca): fluido no celular e leve.
// A altura acompanha a aba ativa, para uma aba curta não herdar o espaço da longa.
export function SwipeTabs({
  tabs,
  activeIndex,
  onChange,
  children
}: {
  tabs: Array<{ key: string; label: string }>;
  activeIndex: number;
  onChange: (index: number) => void;
  children: ReactNode[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const settleTimer = useRef<number | null>(null);
  // Enquanto o scroll é disparado por um toque na aba, ignoramos os índices
  // intermediários da animação (senão a aba "pisca" entre as vizinhas).
  const programmatic = useRef(false);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // Toque na aba → rola até o painel.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.clientWidth * activeIndex;
    if (Math.abs(scroller.scrollLeft - target) > 4) {
      programmatic.current = true;
      scroller.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [activeIndex]);

  // Altura do container = altura do painel ativo.
  useEffect(() => {
    const panel = panelRefs.current[activeIndex];
    if (!panel) return;
    const update = () => setHeight(panel.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [activeIndex]);

  const handleScroll = useCallback(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller || !scroller.clientWidth) return;
      programmatic.current = false;
      const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
      if (index !== activeIndex && index >= 0 && index < tabs.length) onChange(index);
    }, 90);
  }, [activeIndex, onChange, tabs.length]);

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        className="grid rounded-2xl border border-white/10 bg-white/[0.04] p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            onClick={() => onChange(index)}
            className={clsx(
              "rounded-xl py-2 text-[13px] font-semibold transition",
              index === activeIndex ? "bg-primary text-black" : "text-white/55 hover:text-white/80"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="-mx-1 flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain transition-[height] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height }}
      >
        {children.map((child, index) => (
          <div
            key={tabs[index]?.key ?? index}
            ref={(el) => {
              panelRefs.current[index] = el;
            }}
            role="tabpanel"
            aria-hidden={index !== activeIndex}
            className="w-full shrink-0 snap-start snap-always space-y-4 px-1"
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
