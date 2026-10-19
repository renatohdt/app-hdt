"use client";

// Notificação LOCAL "Ainda está treinando?" — agendada no próprio celular para
// 15 min depois da última série marcada. A cada nova série ela é reagendada;
// ao finalizar o treino, é cancelada. Não passa por servidor.
//
// Só funciona no app nativo que já tiver o plugin @capacitor/local-notifications
// (precisa de uma nova versão do app nas lojas). Em versões antigas do app e no
// navegador, tudo aqui vira "não faz nada" — sem erro.
//
// Usamos o registerPlugin do @capacitor/core (já instalado) em vez de importar o
// pacote do plugin: assim o site continua compilando e funcionando mesmo antes
// de o app novo chegar às lojas.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { WORKOUT_AUTO_FINISH_MS, WORKOUT_IDLE_PROMPT_MS } from "@/lib/active-workout-session";

type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

type LocalNotificationsPlugin = {
  checkPermissions: () => Promise<{ display: PermissionState }>;
  requestPermissions: () => Promise<{ display: PermissionState }>;
  schedule: (options: {
    notifications: {
      id: number;
      title: string;
      body: string;
      schedule?: { at: Date; allowWhileIdle?: boolean };
      extra?: Record<string, unknown>;
    }[];
  }) => Promise<unknown>;
  cancel: (options: { notifications: { id: number }[] }) => Promise<void>;
};

const LocalNotifications = registerPlugin<LocalNotificationsPlugin>("LocalNotifications");

const IDLE_NOTIFICATION_ID = 7315;
// "Treino finalizado": no mesmo momento em que o app finaliza sozinho (50 min parado).
const AUTO_FINISH_NOTIFICATION_ID = 7317;

let lastScheduledFor: number | null = null;

function pluginAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

// NÃO pede permissão aqui (out/2026). O pedido do sistema só pode aparecer uma
// vez no iOS, então ele acontece com explicação: no popup depois do treino
// concluído (components/notification-optin-modal.tsx) ou no botão do Perfil.
// A permissão é a mesma do push: quem aceitou lá já recebe estas também.
// O parâmetro fica só por compatibilidade com quem chama.
async function hasPermission(_askIfNeeded: boolean) {
  const current = await withTimeout(LocalNotifications.checkPermissions());
  return current.display === "granted";
}

/**
 * (Re)agenda o lembrete para 15 min após a última atividade.
 * Também agenda o "Treino finalizado" para os 50 min (mesmo horário do auto-finalizar).
 * askPermission não pede mais nada (ver hasPermission).
 */
export async function scheduleIdleWorkoutNotification(input: {
  lastActivityAt: number;
  workoutTitle: string;
  askPermission?: boolean;
}) {
  if (!pluginAvailable()) return;
  const at = input.lastActivityAt + WORKOUT_IDLE_PROMPT_MS;
  if (lastScheduledFor === at) return;
  try {
    if (!(await hasPermission(Boolean(input.askPermission)))) return;
    await withTimeout(
      LocalNotifications.cancel({ notifications: [{ id: IDLE_NOTIFICATION_ID }, { id: AUTO_FINISH_NOTIFICATION_ID }] })
    ).catch(() => {});
    if (at <= Date.now()) return;
    const autoFinishAt = input.lastActivityAt + WORKOUT_AUTO_FINISH_MS;
    await withTimeout(
      LocalNotifications.schedule({
        notifications: [
          {
            id: IDLE_NOTIFICATION_ID,
            title: "Ainda está treinando? 💪",
            body: `Seu ${input.workoutTitle} continua aberto. Se já terminou, finalize para ele contar na sua sequência.`,
            schedule: { at: new Date(at), allowWhileIdle: true },
            extra: { route: "/treino" }
          },
          {
            id: AUTO_FINISH_NOTIFICATION_ID,
            title: "Treino finalizado ✅",
            body: `Encerramos seu ${input.workoutTitle} por você. Toque para salvar e manter sua sequência.`,
            schedule: { at: new Date(autoFinishAt), allowWhileIdle: true },
            extra: { route: "/treino" }
          }
        ]
      })
    );
    lastScheduledFor = at;
  } catch {
    // notificação é um extra: nunca atrapalha o treino
  }
}

/** Cancela o lembrete (treino finalizado ou descartado). */
export async function cancelIdleWorkoutNotification() {
  lastScheduledFor = null;
  if (!pluginAvailable()) return;
  try {
    await withTimeout(
      LocalNotifications.cancel({ notifications: [{ id: IDLE_NOTIFICATION_ID }, { id: AUTO_FINISH_NOTIFICATION_ID }] })
    );
  } catch {
    // ignora
  }
}

// ── Cronômetro: "Tempo finalizado" ──────────────────────────────────────────
// Mesmo plugin e mesma permissão do lembrete acima. Agendado quando o
// cronômetro começa (para tocar mesmo com o celular bloqueado ou em outro app)
// e cancelado ao pausar/resetar.

const TIMER_NOTIFICATION_ID = 7316;
let timerScheduledFor: number | null = null;

function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export async function scheduleTimerFinishedNotification(input: { at: number; totalSeconds: number }) {
  if (!pluginAvailable()) return;
  if (timerScheduledFor === input.at) return;
  timerScheduledFor = input.at;
  try {
    // Só agenda se a pessoa já permitiu notificações (não pede aqui).
    if (!(await hasPermission(false))) return;
    await withTimeout(LocalNotifications.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] })).catch(() => {});
    if (input.at <= Date.now() || timerScheduledFor !== input.at) return;
    await withTimeout(
      LocalNotifications.schedule({
        notifications: [
          {
            id: TIMER_NOTIFICATION_ID,
            title: "Tempo finalizado ⏱️",
            body: `Seu cronômetro de ${formatClock(input.totalSeconds)} terminou. Bora!`,
            schedule: { at: new Date(input.at), allowWhileIdle: true }
          }
        ]
      })
    );
  } catch {
    // notificação é um extra: nunca atrapalha o cronômetro
  }
}

export async function cancelTimerFinishedNotification() {
  timerScheduledFor = null;
  if (!pluginAvailable()) return;
  try {
    await withTimeout(LocalNotifications.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] }));
  } catch {
    // ignora
  }
}
