import * as Sentry from "@sentry/nextjs";
import { initPostHog } from "@/lib/posthog-client";

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
    // Erro interno do Supabase Auth com Web Locks — não afeta o usuário.
    // Duas variações de texto do mesmo mecanismo: outra requisição "rouba" o
    // lock do token durante um getSession(); o lock é readquirido e a sessão
    // não é perdida (classe NavigatorLockAcquireTimeoutError).
    "Lock broken by another request with the 'steal' option",
    "was released because another request stole it",
    // Erro de SW em navegadores que não suportam update() corretamente
    "Cannot update a null/nonexistent service worker registration",
    // Ruído do navegador in-app do Instagram/Facebook (Meta) no Android.
    // O script injetado "navigation_performance_logger_android" tenta enviar
    // dados à camada nativa via bridge e falha. Não é código nosso e não
    // afeta o usuário — apenas polui o Sentry.
    "Error invoking postMessage",
    "Java exception was raised during method invocation",
    // Ruído benigno de layout: o callback do ResizeObserver dispara outro
    // resize e o browser adia a entrega pro próximo frame. Não trava nada e
    // não afeta o usuário — comum em WebView antigo (Capacitor/Android).
    // "ResizeObserver loop" cobre as duas variações de texto do navegador.
    "ResizeObserver loop"
  ]
});

// Necessário para o Sentry rastrear navegações entre páginas
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Inicializa o PostHog (product analytics) no client.
initPostHog();
