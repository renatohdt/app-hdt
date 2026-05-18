import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Captura 10% das transações para performance
  tracesSampleRate: 0.1,

  // Grava replay de sessão apenas quando há erro
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,

  integrations: [Sentry.replayIntegration()],

  debug: false
});

// Necessário para o Sentry rastrear navegações entre páginas
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
