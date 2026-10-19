"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui";
import { trackEvent } from "@/lib/analytics-client";
import {
  activatePushNotifications,
  getOptInAttempt,
  MAX_ASKS,
  PUSH_OPTIN_EVENT,
  recordOptInLater
} from "@/lib/push-optin";

// Uma frase diferente para cada vez que perguntamos (1ª, 2ª e 3ª).
const COPY: { title: string; body: string; later: string }[] = [
  {
    title: "Deixe eu te avisar sobre os próximos treinos! 💪",
    body: "Eu te lembro no dia do treino, perto do horário em que você costuma treinar. Sem spam, prometo.",
    later: "Depois"
  },
  {
    title: "Bora manter o ritmo? 🔥",
    body: "Um lembrete na hora certa ajuda a não pular treino. Quer que eu te avise?",
    later: "Depois"
  },
  {
    title: "Última vez que eu pergunto, juro 😅",
    body: "Posso te avisar do treino do dia? Se mudar de ideia, é só desligar no Perfil.",
    later: "Agora não"
  }
];

/**
 * Fica montado no layout e escuta o fechamento do popup de Treino Concluído.
 * Decide sozinho se é hora de mostrar o convite (ver lib/push-optin.ts).
 */
export function NotificationOptInHost() {
  const [attempt, setAttempt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const onOffer = () => {
      void getOptInAttempt().then((next) => {
        if (next === null) return;
        // Pequena pausa para o popup de Treino Concluído sair da tela antes.
        timer = window.setTimeout(() => {
          setAttempt(next);
          trackEvent("cta_click", null, { source: `push_optin_shown_${next + 1}` });
        }, 600);
      });
    };
    window.addEventListener(PUSH_OPTIN_EVENT, onOffer);
    return () => {
      window.removeEventListener(PUSH_OPTIN_EVENT, onOffer);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (attempt === null) return null;
  const copy = COPY[Math.min(attempt, MAX_ASKS - 1)];

  function handleLater() {
    recordOptInLater();
    trackEvent("cta_click", null, { source: `push_optin_later_${(attempt ?? 0) + 1}` });
    setAttempt(null);
  }

  async function handleActivate() {
    if (loading) return;
    setLoading(true);
    try {
      const ok = await activatePushNotifications();
      trackEvent("cta_click", null, { source: ok ? "push_optin_granted" : "push_optin_denied" });
    } catch {
      // silencioso: nunca trava o usuário
    } finally {
      setLoading(false);
      setAttempt(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <Bell className="h-7 w-7 text-primary" />
        </div>
        <p className="text-lg font-semibold leading-snug text-white">{copy.title}</p>
        <p className="mt-2 text-sm leading-6 text-white/60">{copy.body}</p>
        <div className="mt-5 flex flex-col items-center gap-3">
          <Button onClick={() => void handleActivate()} disabled={loading} className="w-full">
            {loading ? "Ativando..." : "Ativar notificações"}
          </Button>
          <button
            type="button"
            onClick={handleLater}
            className="text-xs text-white/40 transition hover:text-white/60"
          >
            {copy.later}
          </button>
        </div>
      </div>
    </div>
  );
}
