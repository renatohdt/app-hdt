import Script from "next/script";
import { GoogleTagClient } from "@/components/google-tag-client";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

export function GoogleTag() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      {/* Carrega o gtag.js após a página ficar interativa (correto para analytics) */}
      <Script
        id="google-tag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      {/*
        Configura o GA4. O dataLayer, a função gtag e o Consent Mode v2 já foram
        inicializados pelo script beforeInteractive em app/layout.tsx.
      */}
      <Script id="google-tag-init" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
      <GoogleTagClient />
    </>
  );
}
