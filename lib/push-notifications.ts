import "server-only";
import webpush from "web-push";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

export type SendPushPayload = {
  title: string;
  body: string;
  url?: string;
};

// ── VAPID config ──────────────────────────────────────────────────────────────

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@horadotreino.com.br";

  if (!publicKey || !privateKey) {
    throw new Error("Chaves VAPID não configuradas. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.");
  }

  return { publicKey, privateKey, subject };
}

// ── Envio individual ──────────────────────────────────────────────────────────

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: SendPushPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const { publicKey, privateKey, subject } = getVapidConfig();

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      },
      JSON.stringify(payload)
    );

    return { ok: true, status: result.statusCode };
  } catch (error: unknown) {
    const status =
      error != null && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : undefined;

    return {
      ok: false,
      status,
      error: error instanceof Error ? error.message : "Erro desconhecido ao enviar push"
    };
  }
}

// ── Envio em massa ────────────────────────────────────────────────────────────

export async function sendPushToMany(
  subscriptions: PushSubscriptionRecord[],
  payload: SendPushPayload
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload))
  );

  let sent = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.ok) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
