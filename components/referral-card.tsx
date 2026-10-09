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

  return (
    <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15 text-lg">🎁</div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Indique e Ganhe</p>
          <p className="text-sm font-semibold text-white">Indique 5 amigos e ganhe 30 dias de Premium grátis!</p>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-2.5 w-2/3 rounded-full bg-white/10" />
          <div className="h-2.5 w-1/2 rounded-full bg-white/10" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: REFERRAL_GOAL }, (_, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < data.count ? "bg-primary" : "bg-white/20"}`} />
              ))}
            </div>
            <span className="text-xs text-white/50">
              {data.count} de {REFERRAL_GOAL} indicações
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-white/40">Seu link:</p>
            <p className="break-all rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-white/70">
              {data.link}
            </p>
          </div>
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
        </>
      )}
    </Card>
  );
}
