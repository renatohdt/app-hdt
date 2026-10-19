"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { toSafeInternalPath } from "@/lib/notification-link";

type ListenerHandle = { remove?: () => Promise<void> | void };
type AddListener = (event: string, cb: (payload: unknown) => void) => Promise<ListenerHandle> | ListenerHandle;

/**
 * Registra o token de push NATIVO (FCM) do aparelho no backend.
 * Só age no app nativo (iOS/Android). No navegador não faz nada.
 *
 * NÃO pede permissão: só registra (ou atualiza) o token se a pessoa JÁ permitiu.
 * O pedido de permissão acontece no convite após o treino concluído
 * (components/notification-optin-modal.tsx),
 * com contexto, ou no botão do perfil. No iOS o sistema só pergunta UMA vez —
 * perguntar logo na abertura, sem explicação, desperdiça essa chance.
 *
 * Chama o plugin pela ponte global (window.Capacitor.Plugins.FirebaseMessaging)
 * em vez de importar @capacitor-firebase/messaging. Isso evita que o webpack
 * empacote a implementação WEB do plugin (que depende do SDK firebase/messaging),
 * mantendo o build do site limpo. No app nativo o plugin já está registrado na ponte.
 */
export function NativePushProvider() {
  const router = useRouter();

  // ── Toque na notificação → abre a tela certa ───────────────────────────────
  // O link vai junto no envio (push: data.url / local: extra.route). Os plugins
  // GUARDAM o toque até alguém escutar, então funciona mesmo quando o toque
  // abre o app do zero. No navegador quem faz isso é o service worker (sw.js).
  // Fica separado do registro do token: deve funcionar mesmo com o push desligado
  // (ex.: notificações locais do treino).
  useEffect(() => {
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: {
          FirebaseMessaging?: { addListener?: AddListener };
          LocalNotifications?: { addListener?: AddListener };
        };
      };
    };
    const cap = w.Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    let cancelled = false;
    const handles: ListenerHandle[] = [];

    const openFromNotification = (raw: unknown) => {
      const path = toSafeInternalPath(raw);
      if (!path || cancelled) return;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== path) router.push(path);
    };

    const listen = async (add: AddListener | undefined, event: string, pick: (p: unknown) => unknown) => {
      if (!add) return;
      try {
        const handle = await add(event, (payload) => openFromNotification(pick(payload)));
        if (cancelled) void handle?.remove?.();
        else handles.push(handle);
      } catch {
        // plugin ausente nesta versão do app: ignora
      }
    };

    const fm = cap.Plugins?.FirebaseMessaging;
    const ln = cap.Plugins?.LocalNotifications;

    void listen(fm?.addListener?.bind(fm), "notificationActionPerformed", (p) => {
      const data = (p as { notification?: { data?: { url?: unknown } } })?.notification?.data;
      return data?.url;
    });
    void listen(ln?.addListener?.bind(ln), "localNotificationActionPerformed", (p) => {
      const extra = (p as { notification?: { extra?: { route?: unknown; url?: unknown } } })?.notification?.extra;
      return extra?.route ?? extra?.url;
    });

    return () => {
      cancelled = true;
      handles.forEach((h) => void h?.remove?.());
    };
  }, [router]);

  // ── Registro do token do aparelho (FCM) ───────────────────────────────────
  useEffect(() => {
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        Plugins?: {
          FirebaseMessaging?: {
            checkPermissions?: () => Promise<{ receive?: string }>;
            getToken?: () => Promise<{ token?: string }>;
          };
        };
      };
    };

    const cap = w.Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    // Respeita a escolha do usuário: se ele desligou as notificações no perfil,
    // não registramos o token de novo automaticamente. (Chave IGUAL à do perfil.)
    if (window.localStorage.getItem("hdt:native-push-optout") === "1") return;

    const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    const fm = cap.Plugins?.FirebaseMessaging;
    if (!fm?.getToken) return;

    let cancelled = false;
    (async () => {
      try {
        const perm = await fm.checkPermissions?.();
        if (perm?.receive !== "granted") return;

        const res = await fm.getToken?.();
        const token = res?.token;
        if (!token || cancelled) return;

        await fetchWithAuth("/api/push/register-native", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform }),
        });
      } catch {
        // Silencioso: plugin ausente (navegador) ou usuário não logado.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
