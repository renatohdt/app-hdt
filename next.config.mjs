import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "horadotreino.com.br"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ]
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          }
        ]
      }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  org: "hora-do-treino-ho",
  project: "javascript-nextjs",

  // Faz o upload dos source maps para o Sentry no build (necessário para stack traces legíveis)
  silent: !process.env.CI,
  widenClientFileUpload: true,

  // Oculta os source maps do bundle público (segurança)
  hideSourceMaps: true,

  // Remove logs do SDK do Sentry do bundle de produção
  disableLogger: true,

  // Não cria Vercel Cron Monitors automaticamente
  automaticVercelMonitors: false
});
