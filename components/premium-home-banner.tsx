"use client";

import { ChevronRight } from "lucide-react";
import { PremiumBadge } from "@/components/premium-badge";
import { getWebPricePerDayLabel, WEB_PREMIUM_PRICES, formatBRL } from "@/lib/premium-pricing";

// Banner Premium da home (só para o plano free), logo abaixo do cartão principal.
// Dourado + brilho = identidade do Premium. Preço por dia como destaque, com o
// valor cobrado sempre visível ao lado (regra da Apple 3.1.2).
export function PremiumHomeBanner({ isNative, onOpen }: { isNative: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="premium-shine w-full rounded-[24px] border border-premium/30 bg-[radial-gradient(circle_at_top_right,rgba(245,196,81,0.16),transparent_60%),linear-gradient(135deg,rgba(245,196,81,0.08),rgba(255,255,255,0.015))] p-[18px] text-left shadow-[0_12px_40px_rgba(245,196,81,0.08)] transition hover:border-premium/50 active:scale-[0.995]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <PremiumBadge size="xs" shine={false} />
          <p className="mt-2 text-[16px] font-bold leading-snug text-white">
            {isNative ? (
              <>Menos que uma dose de whey por dia (e bem mais gostoso 😄)</>
            ) : (
              <>
                Seu personal completo por <span className="text-premium">{getWebPricePerDayLabel("annual")}</span> por dia, menos que uma dose de whey 😄
              </>
            )}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-white/50">
            {isNative ? "Seu personal completo: programas ilimitados, evolução de carga, Minha semana e sem anúncios" : "Programas ilimitados, evolução de carga, Minha semana e sem anúncios"}
            {isNative ? null : <> · plano anual de {formatBRL(WEB_PREMIUM_PRICES.annual)}</>}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-premium to-premiumStrong text-[#2b1d00]">
          <ChevronRight className="h-5 w-5" strokeWidth={2.75} />
        </span>
      </div>
    </button>
  );
}
