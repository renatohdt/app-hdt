import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// ── Firebase Admin (singleton) ──────────────────────────────────────────────
// Envia push NATIVO (FCM) para os apps Android/iOS. O iOS é entregue via APNs
// pelo próprio Firebase (basta subir a chave APNs no console do Firebase).
//
// Requer a variável de ambiente FIREBASE_SERVICE_ACCOUNT com o JSON da conta de
// serviço (Configurações do projeto → Contas de serviço → Gerar nova chave).
// NUNCA versionar essa chave — ela é secreta.

function getApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado.");
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export type FcmPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Envia uma notificação para muitos tokens FCM (Android + iOS).
 * Faz em lotes de 500 (limite do FCM). Retorna contagem e os tokens inválidos
 * (que podem ser removidos do banco depois).
 */
export async function sendFcmToTokens(
  tokens: string[],
  payload: FcmPayload
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const messaging = getMessaging(getApp());
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);

    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
    });

    sent += response.successCount;
    failed += response.failureCount;

    response.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        // Token não existe mais / inválido → marcar para limpeza
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          invalidTokens.push(batch[idx]);
        }
      }
    });
  }

  return { sent, failed, invalidTokens };
}
