import Script from "next/script";
import { GoogleTagClient } from "@/components/google-tag-client";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

export function GoogleTag() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

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
          window['ga-disable-${GA_MEASUREMENT_ID}'] = true;
          window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);}
          window.gtag('js', new Date());
          window.gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
      <GoogleTagClient />
    </>
  );
}
