"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConsentPreferences } from "@/components/consent-provider";
import { clientLogError, clientLogInfo, clientLogWarn } from "@/lib/client-logger";

declare global {
  interface Window {
    __googleAdsenseScriptLoaded?: boolean;
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_SCRIPT_EVENT = "google-adsense:loaded";
const ADSENSE_CLIENT = "ca-pub-1213559545344901";
const ADSENSE_SLOT = "7658583800";

export default function GoogleAd() {
  const pathname = usePathname();
  const { canUseAds } = useConsentPreferences();
  const adRef = useRef<HTMLModElement | null>(null);
  const pushAttemptedRef = useRef(false);
  const [scriptLoaded, setScriptLoaded] = useState(() =>
    typeof window !== "undefined" ? window.__googleAdsenseScriptLoaded === true : false
  );

  useEffect(() => {
    clientLogInfo("ADS COMPONENT MOUNTED", {
      pathname
    });

    return () => {
      clientLogInfo("ADS COMPONENT UNMOUNTED", {
        pathname
      });
    };
  }, [pathname]);

  useEffect(() => {
    clientLogInfo("ADS COMPONENT STATE", {
      pathname,
      can_use_ads: canUseAds,
      script_loaded: scriptLoaded
    });
  }, [canUseAds, pathname, scriptLoaded]);

  useEffect(() => {
    if (canUseAds) {
      return;
    }

    clientLogWarn("ADS RENDER SKIPPED", {
      pathname,
      reason: "ads_consent_disabled_or_not_ready"
    });
  }, [canUseAds, pathname]);

  useEffect(() => {
    if (!canUseAds) {
      return;
    }

    if (window.__googleAdsenseScriptLoaded === true) {
      setScriptLoaded(true);
      return;
    }

    function handleScriptLoaded() {
      setScriptLoaded(true);
    }

    window.addEventListener(ADSENSE_SCRIPT_EVENT, handleScriptLoaded);

    const timeoutId = window.setTimeout(() => {
      if (window.__googleAdsenseScriptLoaded !== true) {
        clientLogWarn("ADS SCRIPT NOT READY", {
          pathname,
          visibility_state: document.visibilityState,
          script_present: Boolean(document.getElementById("google-adsense"))
        });
      }
    }, 3000);

    return () => {
      window.removeEventListener(ADSENSE_SCRIPT_EVENT, handleScriptLoaded);
      window.clearTimeout(timeoutId);
    };
  }, [canUseAds, pathname]);

  useEffect(() => {
    if (!canUseAds) {
      pushAttemptedRef.current = false;
      return;
    }

    const adElement = adRef.current;

    if (!adElement) {
      clientLogWarn("ADS BLOCK NOT FOUND", {
        pathname
      });
      return;
    }

    let statusTimeoutId: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let canceled = false;

    const inspectAndMaybePush = () => {
      if (canceled) {
        return;
      }

      const currentElement = adRef.current;
      if (!currentElement) {
        clientLogWarn("ADS BLOCK LOST BEFORE PUSH", {
          pathname
        });
        return;
      }

      const rect = currentElement.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(currentElement);
      const parentRect = currentElement.parentElement?.getBoundingClientRect();
      const adStatus = currentElement.getAttribute("data-ad-status");
      const adsByGoogleStatus = currentElement.getAttribute("data-adsbygoogle-status");

      clientLogInfo("ADS BLOCK FOUND", {
        pathname,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        parent_width: parentRect ? Math.round(parentRect.width) : null,
        parent_height: parentRect ? Math.round(parentRect.height) : null,
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        overflow_x: computedStyle.overflowX,
        overflow_y: computedStyle.overflowY,
        visibility_state: document.visibilityState,
        data_ad_status: adStatus,
        data_adsbygoogle_status: adsByGoogleStatus,
        layout_chain: collectLayoutChain(currentElement)
      });

      if (rect.width === 0 || rect.height === 0 || computedStyle.display === "none" || computedStyle.visibility === "hidden") {
        clientLogWarn("ADS BLOCK HAS INVALID LAYOUT", {
          pathname,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: computedStyle.display,
          visibility: computedStyle.visibility
        });

        if (!resizeObserver && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            const updatedElement = adRef.current;
            if (!updatedElement) {
              return;
            }

            const updatedRect = updatedElement.getBoundingClientRect();
            if (updatedRect.width > 0 && updatedRect.height > 0) {
              resizeObserver?.disconnect();
              resizeObserver = null;
              inspectAndMaybePush();
            }
          });

          resizeObserver.observe(currentElement);
          if (currentElement.parentElement) {
            resizeObserver.observe(currentElement.parentElement);
          }
        }

        return;
      }

      if (!scriptLoaded) {
        clientLogWarn("ADS PUSH WAITING FOR SCRIPT", {
          pathname
        });
        return;
      }

      if (adsByGoogleStatus === "done" || adStatus === "filled" || adStatus === "unfilled") {
        clientLogInfo("ADS PUSH SKIPPED", {
          pathname,
          reason: "slot_already_processed",
          data_ad_status: adStatus,
          data_adsbygoogle_status: adsByGoogleStatus
        });
        logFinalAttributes(currentElement, pathname);
        return;
      }

      if (pushAttemptedRef.current) {
        clientLogInfo("ADS PUSH SKIPPED", {
          pathname,
          reason: "push_already_attempted"
        });
        return;
      }

      pushAttemptedRef.current = true;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        clientLogInfo("ADS PUSH EXECUTED", {
          pathname
        });

        statusTimeoutId = window.setTimeout(() => {
          if (adRef.current) {
            logFinalAttributes(adRef.current, pathname);
          }
        }, 1800);
      } catch (error) {
        pushAttemptedRef.current = false;
        clientLogError("ADS PUSH ERROR", error);
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        inspectAndMaybePush();
      });
    });

    return () => {
      canceled = true;
      window.cancelAnimationFrame(rafId);
      if (statusTimeoutId) {
        window.clearTimeout(statusTimeoutId);
      }
      resizeObserver?.disconnect();
    };
  }, [canUseAds, pathname, scriptLoaded]);

  if (!canUseAds) {
    return null;
  }

  return (
    <div className="mt-8 w-full overflow-visible text-center">
      <div
        className="w-full overflow-visible rounded-[20px] border border-white/8 bg-black/20 px-3 py-3"
        data-ad-shell="google-adsense"
      >
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{
            display: "block",
            width: "100%",
            minHeight: "280px"
          }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={ADSENSE_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}

function logFinalAttributes(element: HTMLModElement, pathname: string) {
  const rect = element.getBoundingClientRect();

  clientLogInfo("ADS FINAL ATTRIBUTES", {
    pathname,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    data_ad_status: element.getAttribute("data-ad-status"),
    data_adsbygoogle_status: element.getAttribute("data-adsbygoogle-status")
  });
}

function collectLayoutChain(element: HTMLElement) {
  const nodes: Array<Record<string, string | number | null>> = [];
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < 5) {
    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);

    nodes.push({
      tag: current.tagName.toLowerCase(),
      class_name: current.className || null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      display: style.display,
      overflow_x: style.overflowX,
      overflow_y: style.overflowY,
      position: style.position
    });

    current = current.parentElement;
    depth += 1;
  }

  return nodes;
}
