"use client";

import { useSubscription } from "@/components/use-subscription";
import { useConsentPreferences } from "@/components/consent-provider";
import GoogleAd from "@/components/GoogleAd";

// Slot "anuncio horinzontal" — formato horizontal, ideal para banner fixo
const STICKY_BANNER_SLOT = "7189522393";

export function StickyAdBanner() {
  const { subscription } = useSubscription();
  const { canUseAds } = useConsentPreferences();

  // Só exibe para usuários free com consentimento de anúncios
  if (subscription?.isPremium || !canUseAds) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto fixed left-0 right-0 z-[39] bg-[#070907]/95"
      style={{ bottom: "calc(3.5rem + var(--app-safe-bottom))" }}
      aria-label="Anúncio"
    >
      <GoogleAd slot={STICKY_BANNER_SLOT} />
    </div>
  );
}
