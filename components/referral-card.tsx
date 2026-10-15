"use client";

// Card "Indique e Ganhe" — fica no Dashboard e só aparece para o plano FREE
// (quem já é Premium não ganha nada indicando, então não mostramos).
// Antes ficava no /perfil.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { ShareButton } from "@/components/share-button";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";

type ReferralData = {
  code: string;
  link: string;
  count: number;
};

const REFERRAL_GOAL = 5;

export function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // Compacto por padrão: link, cupom e botões aparecem ao tocar em "Indicar".
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/referral/code")
      .then((res) => parseJsonResponse<{ success: true; data: ReferralData }>(res))
      .then((result) => {
        if (active && result.success) setData(result.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem acesso à área de transferência: ignora
    }
  }

  // Falhou ao carregar o código: não mostra um card vazio.
  if (!loading && !data) return null;

  const shareText = data
    ? `Tô usando o Hora do Treino pra treinar e tô adorando! Usa meu cupom ${data.code} e comece grátis: ${data.link} #horadotreino`
    : "";

  const count = data?.count ?? 0;

  return (
    <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none sm:p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary/15 text-lg">🎁</div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-white">Indique 5 amigos, ganhe 30 dias de Premium</p>
          {loading || !data ? (
            <div className="mt-1.5 h-2 w-24 animate-pulse rounded-full bg-white/10" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex gap-1">
                {Array.from({ length: REFERRAL_GOAL }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full ${i < count ? "bg-primary" : "bg-white/20"}`} />
                ))}
              </div>
              <span className="text-[12px] text-white/50">
                {count} de {REFERRAL_GOAL}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          disabled={!data}
          aria-expanded={expanded}
          className="min-h-9 shrink-0 rounded-full border border-primary/25 bg-primary/10 px-4 text-[12px] font-semibold text-primary transition hover:bg-primary/16 disabled:opacity-50"
        >
          {expanded ? "Fechar" : "Indicar"}
        </button>
      </div>

      {expanded && data ? (
        <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-3">
          <p className="break-all rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-white/70">
            {data.link}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/5 py-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 active:scale-[0.98]"
            >
              📋 {copied ? "Copiado! ✓" : "Copiar link"}
            </button>
            <div className="flex-1">
              <ShareButton context="workout" customText={shareText} />
            </div>
          </div>
          <p className="text-xs text-white/50">
            Ou compartilhe o cupom: <span className="font-mono font-semibold text-white/75">{data.code}</span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}
