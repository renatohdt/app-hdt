import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AppVersionFooter } from "@/components/app-version-footer";
import { ConsentProvider } from "@/components/consent-provider";
import { GoogleTag } from "@/components/google-tag";
import { PwaRegistration } from "@/components/pwa-registration";
import { getCurrentConsentVersion } from "@/lib/consents";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  applicationName: "Hora do Treino",
  title: "Treino personalizado online gratis | Hora do Treino",
  description:
    "Tenha um treino personalizado com metodo de um personal trainer e montado por uma IA, comece agora mesmo gratis!",
  manifest: "/manifest.webmanifest",
  verification: {
    google: "beawZ799WTCV5sDrsrKLuIIAY1-EZDVqC1YH3bvHAXs"
  },
  openGraph: {
    title: "Treino personalizado online gratis | Hora do Treino",
    description:
      "Tenha um treino personalizado com metodo de um personal trainer e montado por uma IA, comece agora mesmo gratis!",
    siteName: "Hora do Treino",
    locale: "pt_BR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Treino personalizado online gratis | Hora do Treino",
    description:
      "Tenha um treino personalizado com metodo de um personal trainer e montado por uma IA, comece agora mesmo gratis!"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hora do Treino"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"]
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0b",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.className} bg-background text-white antialiased`}>
        <ConsentProvider currentVersion={getCurrentConsentVersion()}>
          <Suspense fallback={null}>
            <GoogleTag />
          </Suspense>
          <div className="flex min-h-screen flex-col">
            <PwaRegistration />
            <div className="flex-1">
              {children}
            </div>
            <AppVersionFooter />
          </div>
        </ConsentProvider>
        <Analytics />
      </body>
    </html>
  );
}
