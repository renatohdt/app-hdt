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

  debug: false,

  // Ignora erros internos de bibliotecas que não podemos controlar
  ignoreErrors: [
    // Erro interno do Supabase Auth com Web Locks — não afeta o usuário
    "Lock broken by another request with the 'steal' option",
    // Erro de SW em navegadores que não suportam update() corretamente
    "Cannot update a null/nonexistent service worker registration"
  ]
});

// Necessário para o Sentry rastrear navegações entre páginas
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
