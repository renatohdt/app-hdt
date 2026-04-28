import "server-only";

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

// ── VAPID helpers ─────────────────────────────────────────────────────────────

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@horadotreino.com.br";

  if (!publicKey || !privateKey) {
    throw new Error("Chaves VAPID não configuradas. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.");
  }

  return { publicKey, privateKey, subject };
}

// ── Envio de notificação push (implementação nativa, sem web-push) ────────────
// Usa a Web Push Protocol via fetch + JWT assinado com ECDSA P-256

async function importPrivateKey(privateKeyB64url: string): Promise<CryptoKey> {
  const raw = base64urlToUint8Array(privateKeyB64url);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function base64urlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return view;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function createVapidJwt(endpoint: string, subject: string, privateKey: CryptoKey, publicKeyB64url: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  const header = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const payload = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiry, sub: subject }))
  );

  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: SendPushPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const { publicKey, privateKey: privateKeyB64, subject } = getVapidConfig();

    const cryptoKey = await importPrivateKey(privateKeyB64);
    const jwt = await createVapidJwt(subscription.endpoint, subject, cryptoKey, publicKey);

    const body = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const encodedBody = encoder.encode(body);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(encodedBody.byteLength),
        Authorization: `vapid t=${jwt},k=${publicKey}`,
        TTL: "86400"
      },
      body: encodedBody
    });

    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao enviar push"
    };
  }
}

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
