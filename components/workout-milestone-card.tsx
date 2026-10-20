"use client";

// Cartão de lembrete dentro do popup de Treino Concluído (6º, 7º e 8º treinos).
// A regra de QUANDO aparece fica em lib/workout-milestones.ts.

import { useEffect, useState } from "react";
import { ShareButton } from "@/components/share-button";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { openStoreReview } from "@/lib/app-review";
import type { WorkoutMilestone } from "@/lib/workout-milestones";

// Ícones iguais aos do rodapé da marca (components/brand-footer.tsx).
const SOCIAL_LINKS = [
  {
    id: "instagram",
    label: "Instagram da Hora do Treino",
    href: "https://instagram.com/horadotreino_oficial",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    label: "TikTok da Hora do Treino",
    href: "https://www.tiktok.com/@horadotreinooficial",
    icon: (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.5 3c.3 2 1.5 3.6 3.5 4v2.6c-1.3 0-2.5-.4-3.6-1.1v5.6a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.7a2.9 2.9 0 1 0 2 2.8V3h2.8z" />
      </svg>
    ),
  },
  {
    id: "youtube",
    label: "YouTube da Hora do Treino",
    href: "https://www.youtube.com/@HoradoTreino",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15V9l5 3-5 3z" />
      </svg>
    ),
  },
];

function track(milestone: WorkoutMilestone, action: string) {
  trackEvent("cta_click", null, { source: `workout_milestone_${milestone}_${action}` });
}

const cardClass = "rounded-2xl border border-primary/25 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_65%)] p-4 text-left";
const primaryButtonClass =
  "mt-3 w-full rounded-xl bg-primary py-3 text-sm font-black text-black transition hover:opacity-95 active:scale-[0.99]";

export function WorkoutMilestoneCard({ milestone }: { milestone: WorkoutMilestone }) {
  useEffect(() => {
    track(milestone, "view");
  }, [milestone]);

  if (milestone === "referral") return <ReferralMilestone />;
  if (milestone === "review") return <ReviewMilestone />;
  return <SocialMilestone />;
}

// ── 6º treino: Indique e Ganhe (só free) ─────────────────────────────────────
function ReferralMilestone() {
  const [data, setData] = useState<{ code: string; link: string; count: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/referral/code")
      .then((res) => parseJsonResponse<{ success: true; data: { code: string; link: string; count: number } }>(res))
      .then((result) => {
        if (active && result.success) setData(result.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const shareText = data
    ? `Tô usando o Hora do Treino pra treinar e tô adorando! Usa meu cupom ${data.code} e comece grátis: ${data.link} #horadotreino`
    : undefined;

  return (
    <div className={cardClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">🎁 Indique e Ganhe</p>
      <p className="mt-2 text-[15px] font-bold leading-snug text-white">6 treinos! Tá curtindo? Leva a galera junto.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
        Indique 5 amigos e ganhe 30 dias de Premium grátis. E treinar acompanhado ajuda a não furar: eles vão te cobrar 😅
      </p>
      {data ? (
        <div className="mt-3" onClickCapture={() => track("referral", "share")}>
          <ShareButton context="workout" customText={shareText} />
          <p className="mt-2 text-center text-[11px] text-white/40">
            Seu cupom: <span className="font-mono font-semibold text-white/70">{data.code}</span>
            {data.count > 0 ? ` · ${data.count} de 5 indicações` : null}
          </p>
        </div>
      ) : (
        <div className="mt-3 h-11 animate-pulse rounded-xl bg-white/10" />
      )}
    </div>
  );
}

// ── 7º treino: avaliação na loja (só app nativo) ─────────────────────────────
function ReviewMilestone() {
  function handleClick() {
    track("review", "click");
    void openStoreReview();
  }

  return (
    <div className={cardClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">⭐ Um favor rapidinho</p>
      <p className="mt-2 text-[15px] font-bold leading-snug text-white">7 treinos! Posso te pedir uma coisa?</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
        Uma avaliação na loja ajuda o app a chegar em mais gente e deixa esse personal aqui muito feliz. Leva 10 segundos.
      </p>
      <button type="button" onClick={handleClick} className={primaryButtonClass}>
        Avaliar na loja
      </button>
    </div>
  );
}

// ── 8º treino: redes sociais (todos, inclusive Premium) ──────────────────────
function SocialMilestone() {
  return (
    <div className={cardClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">🤝 Parceiro de treino</p>
      <p className="mt-2 text-[15px] font-bold leading-snug text-white">8 treinos! Agora a gente já é parceiro de treino.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
        Me segue nas redes: lá eu posto dicas, bastidores e uns treinos que não cabem no app. — Renato
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {SOCIAL_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("social", link.id)}
            aria-label={link.label}
            className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:border-primary/40 hover:text-primary active:scale-[0.98]"
          >
            {link.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
