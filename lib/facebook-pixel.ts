export const FACEBOOK_PIXEL_ID = "1266703028209902";

export const FACEBOOK_PIXEL_NOSCRIPT_SRC = `https://www.facebook.com/tr?id=${FACEBOOK_PIXEL_ID}&ev=PageView&noscript=1`;
export const FACEBOOK_PIXEL_NOSCRIPT_HTML = `<img height="1" width="1" style="display:none" src="${FACEBOOK_PIXEL_NOSCRIPT_SRC}" alt="" />`;

type MetaPixelEventOptions = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

function trackMetaPixel(eventName: string, options?: MetaPixelEventOptions) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }

  if (options) {
    window.fbq("track", eventName, options);
    return;
  }

  window.fbq("track", eventName);
}

export function trackMetaPageView() {
  trackMetaPixel("PageView");
}

export function trackMetaLead(options?: MetaPixelEventOptions) {
  trackMetaPixel("Lead", options);
}

export function trackMetaCompleteRegistration(options?: MetaPixelEventOptions) {
  trackMetaPixel("CompleteRegistration", options);
}

export function trackMetaInitiateCheckout(options?: MetaPixelEventOptions) {
  trackMetaPixel("InitiateCheckout", options);
}
