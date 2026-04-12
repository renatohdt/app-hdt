import Script from "next/script";
import { GoogleTagClient } from "@/components/google-tag-client";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { CONSENT_STORAGE_KEY } from "@/lib/consent-constants";
import { getCurrentConsentVersion } from "@/lib/consents";

export function GoogleTag() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  const consentVersion = getCurrentConsentVersion();

  return (
    <>
      <Script
        id="google-tag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="beforeInteractive"
      />
      <Script id="google-tag-init" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          (function () {
            var analyticsEnabled = false;
            try {
              var raw = window.localStorage.getItem('${CONSENT_STORAGE_KEY}');
              if (raw) {
                var parsed = JSON.parse(raw);
                analyticsEnabled = Boolean(
                  parsed &&
                  parsed.version === '${consentVersion}' &&
                  parsed.hasInteracted === true &&
                  parsed.preferences &&
                  parsed.preferences.analytics === true
                );
              }
            } catch (error) {
              analyticsEnabled = false;
            }
            window.__hdtAnalyticsConsentBootstrap = analyticsEnabled;
            window['ga-disable-${GA_MEASUREMENT_ID}'] = !analyticsEnabled;
          })();
          window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);}
          window.gtag('js', new Date());
          window.gtag('consent', 'default', {
            analytics_storage: window.__hdtAnalyticsConsentBootstrap ? 'granted' : 'denied'
          });
          window.gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
      <GoogleTagClient />
    </>
  );
}
