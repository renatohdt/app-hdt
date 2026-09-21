import posthog from "posthog-js";

// Chave e host vem das variaveis de ambiente (NEXT_PUBLIC_*, expostas ao client).
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let initialized = false;

// So habilita no browser e quando ha chave configurada.
export function isPostHogEnabled() {
  return typeof window !== "undefined" && POSTHOG_KEY.length > 0;
}

// Inicializa o PostHog uma unica vez (idempotente).
export function initPostHog() {
  if (initialized || !isPostHogEnabled()) {
    return;
  }
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Padroes modernos do PostHog: pageview em mudanca de rota (SPA) + autocapture.
    defaults: "2026-05-30",
    // So cria perfil de pessoa para usuarios identificados (economiza cota, first-party).
    person_profiles: "identified_only",
    // Ja gravamos sessao com Microsoft Clarity e Sentry - nao duplicar aqui.
    disable_session_recording: true,
  });
}

// Associa os eventos a um usuario conhecido (chamado no login).
export function identifyUser(distinctId: string, properties?: Record<string, unknown>) {
  if (!isPostHogEnabled()) {
    return;
  }
  if (!initialized) {
    initPostHog();
  }
  posthog.identify(distinctId, properties);
}

// Atualiza propriedades da pessoa (ex.: plano free/premium) sem novo identify.
export function setUserProperties(properties: Record<string, unknown>) {
  if (!isPostHogEnabled() || !initialized) {
    return;
  }
  posthog.setPersonProperties(properties);
}

// Encerra a sessao do usuario identificado (chamado no logout).
export function resetUser() {
  if (!isPostHogEnabled() || !initialized) {
    return;
  }
  posthog.reset();
}

// Envia um evento ao PostHog (usado pela camada central de analytics).
export function capturePostHog(event: string, properties?: Record<string, unknown>) {
  if (!isPostHogEnabled()) {
    return;
  }
  if (!initialized) {
    initPostHog();
  }
  posthog.capture(event, properties);
}
