"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics-client";

/**
 * Moldura padrão dos anúncios: identifica como "Publicidade" e oferece o
 * atalho "Remover anúncios" (leva ao Premium). Se o Google não tiver anúncio
 * para mostrar (status "unfilled"), a moldura inteira some via CSS
 * (.hdt-ad-frame em app/globals.css).
 */
export function AdFrame({
  children,
  placement,
  showRemoveLink = true,
  className
}: {
  children: ReactNode;
  /** Onde o anúncio está (vai para o analytics do clique em "Remover anúncios"). */
  placement: string;
  showRemoveLink?: boolean;
  className?: string;
}) {
  return (
    <div className={["hdt-ad-frame w-full", className].filter(Boolean).join(" ")}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">Publicidade</span>
        {showRemoveLink ? (
          <Link
            href="/premium"
            onClick={() => trackEvent("cta_click", null, { source: "remove_ads_link", placement })}
            className="text-[11px] font-semibold text-primary/80 transition hover:text-primary"
          >
            Remover anúncios
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}
