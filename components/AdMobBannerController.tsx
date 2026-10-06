"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useConsentPreferences } from "@/components/consent-provider";
import { useSubscription } from "@/components/use-subscription";
import { hideAdMobBanner, isAdMobAvailable, showAdMobBanner } from "@/lib/admob";
import { clientLogError } from "@/lib/client-logger";

// Elementos que "cobrem" a tela (pop-ups, folhas que sobem de baixo, aviso de
// privacidade, cronômetro aberto...). Enquanto algum existir, o banner nativo
// fica escondido — ele é desenhado POR CIMA do app e taparia botões.
// Para esconder o banner em um elemento novo, basta adicionar `data-hide-admob`.
const OVERLAY_SELECTOR = ".fixed.inset-0, [data-hide-admob], [role='dialog'], [aria-modal='true']";

let cachedSafeBottom: number | null = null;
function readSafeAreaBottom(): number {
  if (cachedSafeBottom !== null) return cachedSafeBottom;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom, 0px);";
  document.body.appendChild(probe);
  cachedSafeBottom = probe.getBoundingClientRect().height || 0;
  probe.remove();
  return cachedSafeBottom;
}

/**
 * Banner do AdMob preso logo ACIMA do menu inferior, só para o plano free e
 * só no app com o plugin (versões antigas do app seguem com o AdSense).
 * Fica dentro do AppBottomNav: some automaticamente nas telas sem menu.
 */
export function AdMobBannerController({ barRef }: { barRef: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const { subscription, loading } = useSubscription();
  const { ready, preferences } = useConsentPreferences();
  const [available] = useState(() => isAdMobAvailable());
  const [overlayOpen, setOverlayOpen] = useState(false);
  const checkTimer = useRef<number | null>(null);

  const isFreePlan = !loading && !subscription?.isPremium;

  // Observa a página para saber se algum pop-up/folha está aberto.
  useEffect(() => {
    if (!available) return;

    const check = () => {
      checkTimer.current = null;
      setOverlayOpen(Boolean(document.querySelector(OVERLAY_SELECTOR)));
    };
    const schedule = () => {
      if (checkTimer.current === null) checkTimer.current = window.setTimeout(check, 80);
    };

    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-hide-admob", "role", "aria-modal"]
    });
    return () => {
      observer.disconnect();
      if (checkTimer.current !== null) window.clearTimeout(checkTimer.current);
    };
  }, [available]);

  useEffect(() => {
    if (!available) return;

    if (!isFreePlan || !ready || overlayOpen) {
      void hideAdMobBanner();
      return;
    }

    const bar = barRef.current;
    if (!bar) return;

    // O plugin mede a distância a partir da borda segura inferior da tela;
    // o menu do app já inclui essa borda, então descontamos.
    const margin = bar.getBoundingClientRect().height - readSafeAreaBottom();
    showAdMobBanner(margin, preferences.ads).catch((error) => clientLogError("ADMOB SHOW BANNER ERROR", error));
  }, [available, barRef, isFreePlan, overlayOpen, pathname, preferences.ads, ready]);

  // Saiu das telas com menu (ex.: login, checkout): esconde o banner.
  useEffect(() => {
    if (!available) return;
    return () => {
      void hideAdMobBanner();
    };
  }, [available]);

  return null;
}
