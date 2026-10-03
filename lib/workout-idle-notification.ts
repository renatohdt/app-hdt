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
import { WORKOUT_IDLE_PROMPT_MS } from "@/lib/active-workout-session";

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
const PERMISSION_ASKED_KEY = "hdt-idle-notification-permission-asked";

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

async function hasPermission(askIfNeeded: boolean) {
  const current = await withTimeout(LocalNotifications.checkPermissions());
  if (current.display === "granted") return true;
  if (current.display === "denied" || !askIfNeeded) return false;
  // Pede uma única vez (no início do treino). Se a pessoa já respondeu, não insistimos.
  try {
    if (window.localStorage.getItem(PERMISSION_ASKED_KEY)) return false;
    window.localStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    // ignora
  }
  const requested = await withTimeout(LocalNotifications.requestPermissions(), 60000);
  return requested.display === "granted";
}

/**
 * (Re)agenda o lembrete para 15 min após a última atividade.
 * askPermission = true só quando o treino está começando.
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
    await withTimeout(LocalNotifications.cancel({ notifications: [{ id: IDLE_NOTIFICATION_ID }] })).catch(() => {});
    if (at <= Date.now()) return;
    await withTimeout(
      LocalNotifications.schedule({
        notifications: [
          {
            id: IDLE_NOTIFICATION_ID,
            title: "Ainda está treinando? 💪",
            body: `Seu ${input.workoutTitle} continua aberto. Se já terminou, finalize para ele contar na sua sequência.`,
            schedule: { at: new Date(at), allowWhileIdle: true },
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
    await withTimeout(LocalNotifications.cancel({ notifications: [{ id: IDLE_NOTIFICATION_ID }] }));
  } catch {
    // ignora
  }
}
