import type { PostHog } from "posthog-js";
import { getNativePlatformNow, isNativeAppNow } from "@/lib/is-native-app";

// Chave e host vem das variaveis de ambiente (NEXT_PUBLIC_*, expostas ao client).
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

// O SDK do PostHog (~300 KB) e carregado DEPOIS que a tela aparece (carregamento
// preguicoso). Chamadas feitas antes disso (identify, capture...) ficam numa
// fila e sao enviadas assim que o SDK termina de carregar — nada se perde.
const LOAD_DELAY_MS = 2500;

let instance: PostHog | null = null;
let scheduled = false;
let loading = false;
const queue: Array<(posthog: PostHog) => void> = [];

// So habilita no browser e quando ha chave configurada.
export function isPostHogEnabled() {
  return typeof window !== "undefined" && POSTHOG_KEY.length > 0;
}

function loadPostHog() {
  if (loading || instance) {
    return;
  }
  loading = true;

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Padroes modernos do PostHog: pageview em mudanca de rota (SPA) + autocapture.
        defaults: "2026-05-30",
        // So cria perfil de pessoa para usuarios identificados (economiza cota, first-party).
        person_profiles: "identified_only",
        // Ja gravamos sessao com Microsoft Clarity - nao duplicar aqui.
        disable_session_recording: true,
      });

      // Carimba todo evento com a plataforma (ios/android/web) e se e app nativo,
      // para segmentar funil/retencao por plataforma no PostHog.
      try {
        posthog.register({
          platform: getNativePlatformNow(),
          is_native_app: isNativeAppNow(),
        });
      } catch {
        // registro de super properties e best-effort; nunca deve quebrar o app.
      }

      instance = posthog;
      while (queue.length) {
        const fn = queue.shift();
        try {
          fn?.(posthog);
        } catch {
          // analytics nunca deve quebrar o app
        }
      }
    })
    .catch(() => {
      // sem rede/bloqueador: segue sem PostHog
      loading = false;
    });
}

// Agenda o carregamento do PostHog para depois da primeira tela (idempotente).
export function initPostHog() {
  if (scheduled || !isPostHogEnabled()) {
    return;
  }
  scheduled = true;

  const start = () => window.setTimeout(loadPostHog, LOAD_DELAY_MS);
  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
}

function withPostHog(fn: (posthog: PostHog) => void) {
  if (!isPostHogEnabled()) {
    return;
  }
  if (instance) {
    fn(instance);
    return;
  }
  queue.push(fn);
  initPostHog();
}

// Associa os eventos a um usuario conhecido (chamado no login).
export function identifyUser(distinctId: string, properties?: Record<string, unknown>) {
  withPostHog((posthog) => posthog.identify(distinctId, properties));
}

// Atualiza propriedades da pessoa (ex.: plano free/premium) sem novo identify.
export function setUserProperties(properties: Record<string, unknown>) {
  withPostHog((posthog) => posthog.setPersonProperties(properties));
}

// Encerra a sessao do usuario identificado (chamado no logout).
export function resetUser() {
  withPostHog((posthog) => posthog.reset());
}

// Envia um evento ao PostHog (usado pela camada central de analytics).
export function capturePostHog(event: string, properties?: Record<string, unknown>) {
  withPostHog((posthog) => posthog.capture(event, properties));
}
