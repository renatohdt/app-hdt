"use client";

import { Card } from "@/components/ui";
import { trackEvent } from "@/lib/analytics-client";
import { COMMUNITY_URL } from "@/lib/community";

/** Ícone oficial do WhatsApp (mesmo desenho do botão de compartilhar). */
export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.887a.5.5 0 0 0 .611.61l6.098-1.598A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.37l-.361-.214-3.735.979.996-3.648-.235-.374A9.862 9.862 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1c5.466 0 9.9 4.434 9.9 9.9 0 5.466-4.434 9.9-9.9 9.9z" />
    </svg>
  );
}

/**
 * Card "Comunidade no WhatsApp" na tela de Perfil (abaixo do "Avalie o app").
 * Aparece para todo mundo (app e navegador).
 */
export function CommunityCard() {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#25D366]/15">
          <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Comunidade no WhatsApp
        </p>
      </div>
      <p className="text-[13px] leading-5 text-white/62">
        Dicas, novidades do app e vídeos novos direto no seu WhatsApp. Entre na
        comunidade do Hora do Treino.
      </p>
      <a
        href={COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("cta_click", null, { source: "profile_community" })}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:text-primary/80"
      >
        Entrar na comunidade →
      </a>
    </Card>
  );
}
