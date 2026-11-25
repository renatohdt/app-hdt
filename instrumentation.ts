import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,

      // Sem medição de performance no servidor (custava CPU em toda requisição na Vercel).
      // Erros continuam sendo enviados normalmente.
      tracesSampleRate: 0,

      debug: false
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,

      tracesSampleRate: 0,

      debug: false
    });
  }
}

// Next 15: envia ao Sentry os erros de Server Components, rotas e middleware.
export const onRequestError = Sentry.captureRequestError;
