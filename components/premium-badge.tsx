"use client";

import clsx from "clsx";
import { Crown } from "lucide-react";

// Selo "PREMIUM" dourado com brilho. Usar em qualquer ponto do app que fale do
// Premium (banner, pop-ups, recursos bloqueados) para criar uma identidade única.
export function PremiumBadge({
  className,
  shine = true,
  size = "sm"
}: {
  className?: string;
  shine?: boolean;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-premium to-premiumStrong font-black uppercase text-[#2b1d00] shadow-[0_0_18px_rgba(245,196,81,0.35)]",
        size === "xs" ? "px-2 py-0.5 text-[9px] tracking-[0.14em]" : "px-2.5 py-1 text-[10px] tracking-[0.16em]",
        shine && "premium-shine",
        className
      )}
    >
      <Crown className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.75} />
      Premium
    </span>
  );
}

// Ícone quadrado dourado (coroa), para o topo de pop-ups e cartões Premium.
export function PremiumIcon({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "flex h-12 w-12 items-center justify-center rounded-2xl border border-premium/40 bg-premium/10 shadow-[0_0_24px_rgba(245,196,81,0.2)]",
        className
      )}
    >
      <Crown size={22} className="text-premium" strokeWidth={2.25} />
    </div>
  );
}
