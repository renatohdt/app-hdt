import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Sem medição de performance no servidor (custava CPU em toda requisição na Vercel).
  // Erros continuam sendo enviados normalmente.
  tracesSampleRate: 0,

  debug: false
});
