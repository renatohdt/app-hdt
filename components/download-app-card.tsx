"use client";

// Card "Baixe o app" no /perfil — só para quem está usando pelo NAVEGADOR.
// Dentro do app instalado (Android/iOS) ele não aparece.
// No celular, a loja do aparelho da pessoa aparece primeiro e em destaque.

import clsx from "clsx";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Card } from "@/components/ui";
import { trackEvent } from "@/lib/analytics-client";

export const APP_STORE_URL = "https://apps.apple.com/us/app/hora-do-treino-treino-com-ia/id6799299314";
export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.horadotreino.app";

type Store = "ios" | "android";

// Mesmos ícones dos botões da landing (horadotreino.com.br).
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M4.5 3.3v17.4c0 .6.65.98 1.17.66l14-8.7a.78.78 0 0 0 0-1.32l-14-8.7A.78.78 0 0 0 4.5 3.3z"
        fill="currentColor"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M16.2 12.8c0-2.5 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.15-2.9.87-3.6.87-.75 0-1.9-.85-3.1-.83-1.6.02-3.05.93-3.87 2.36-1.65 2.86-.42 7.1 1.18 9.42.78 1.13 1.7 2.4 2.92 2.36 1.17-.05 1.62-.76 3.03-.76 1.4 0 1.8.76 3.03.73 1.25-.02 2.04-1.15 2.8-2.29.88-1.31 1.24-2.58 1.26-2.65-.03-.01-2.42-.93-2.44-3.69z"
        fill="currentColor"
      />
      <path
        d="M14.3 5.8c.65-.79 1.09-1.88.97-2.98-.94.04-2.07.63-2.74 1.41-.6.7-1.13 1.81-.99 2.88 1.05.08 2.11-.53 2.76-1.31z"
        fill="currentColor"
      />
    </svg>
  );
}

function detectDevice(): Store | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  // iPadOS se apresenta como Mac; o toque denuncia que é iPad.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return null;
}

export function DownloadAppCard({ userId }: { userId?: string | null }) {
  const [device, setDevice] = useState<Store | null>(null);

  useEffect(() => {
    setDevice(detectDevice());
  }, []);

  const stores: { key: Store; label: string; href: string; Icon: typeof PlayIcon }[] = [
    { key: "android", label: "Google Play", href: GOOGLE_PLAY_URL, Icon: PlayIcon },
    { key: "ios", label: "App Store", href: APP_STORE_URL, Icon: AppleIcon }
  ];
  if (device === "ios") stores.reverse();

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Treine pelo app</p>
          <p className="text-[13px] leading-5 text-white/60">Cronômetro, avisos de treino e acesso mais rápido no celular.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stores.map((store) => {
          const highlighted = device === store.key;
          return (
            <a
              key={store.key}
              href={store.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("cta_click", userId ?? null, { source: `profile_download_${store.key}` })}
              aria-label={`Baixar na ${store.label}`}
              className={clsx(
                "flex min-w-0 items-center gap-2.5 rounded-[14px] border bg-white/[0.04] px-3 py-2.5 text-white transition hover:border-primary/60 active:scale-[0.98]",
                highlighted ? "border-primary/50" : "border-white/10"
              )}
            >
              <store.Icon className="h-6 w-6 shrink-0 text-primary" />
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-[10px] uppercase tracking-[0.03em] text-white/50">Disponível na</span>
                <span className="block truncate text-[15px] font-bold">{store.label}</span>
              </span>
            </a>
          );
        })}
      </div>
    </Card>
  );
}
