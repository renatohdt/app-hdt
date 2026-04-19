"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Zap } from "lucide-react";
import { trackEvent } from "@/lib/analytics-client";

type UpsellReason =
  | "replacement_limit"   // Tentou substituir o 3º exercício
  | "program_completed"   // Completou o 2º programa no free
  | "generate_workout"    // Tentou gerar novo treino sem ser premium
  | "home_banner";        // Banner da home

type UpsellModalProps = {
  reason: UpsellReason;
  onClose: () => void;
};

const CONTENT: Record<UpsellReason, { title: string; description: string; cta: string }> = {
  replacement_limit: {
    title: "Mais substituições de exercícios",
    description: "Você usou as 2 substituições do plano gratuito. Com o Premium, você tem 2 substituições em cada sessão (Treino A, B, C independentes) — e experiência sem anúncios.",
    cta: "Assinar Premium",
  },
  program_completed: {
    title: "Parabéns, você concluiu o programa! 🎉",
    description: "Incrível! Você completou todos os treinos deste ciclo. Para continuar evoluindo com um novo programa personalizado, assine o Premium.",
    cta: "Quero continuar evoluindo",
  },
  generate_workout: {
    title: "Gere treinos ilimitados",
    description: "Com o Premium você pode gerar um novo programa de treino a qualquer momento — sem precisar esperar o ciclo terminar e sem anúncios.",
    cta: "Assinar Premium",
  },
  home_banner: {
    title: "Leve seus treinos ao próximo nível",
    description: "Desbloqueie substituições ilimitadas, programas sem fim, evolução com IA e experiência sem anúncios. Por menos de R$&nbsp;10/mês.",
    cta: "Ver planos",
  },
};

export function UpsellModal({ reason, onClose }: UpsellModalProps) {
  const router = useRouter();
  const content = CONTENT[reason];

  // Bloqueia scroll do body enquanto modal está aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";
    trackEvent("cta_click", null, { source: `upsell_modal_view_${reason}` });
    return () => {
      document.body.style.overflow = "";
    };
  }, [reason]);

  function handleCTA() {
    trackEvent("cta_click", null, { source: `upsell_modal_cta_${reason}` });
    router.push("/premium");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm rounded-t-[32px] border border-white/10 bg-[#0f110f] px-6 pb-10 pt-6 shadow-2xl sm:rounded-[32px] sm:pb-8">

        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white/70"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        {/* Ícone */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Sparkles size={22} className="text-primary" />
        </div>

        {/* Conteúdo */}
        <h2 className="mb-2 text-xl font-bold leading-snug tracking-tight text-white">
          {content.title}
        </h2>
        <p
          className="mb-6 text-sm leading-relaxed text-white/60"
          dangerouslySetInnerHTML={{ __html: content.description }}
        />

        {/* Preços rápidos */}
        <div className="mb-5 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl border border-primary/20 bg-primary/8 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">Anual</p>
            <p className="text-lg font-bold text-white">R$&nbsp;9,90<span className="text-xs font-normal text-white/40">/mês</span></p>
            <p className="text-[10px] text-primary">Mais popular</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Mensal</p>
            <p className="text-lg font-bold text-white">R$&nbsp;14,90<span className="text-xs font-normal text-white/40">/mês</span></p>
            <p className="text-[10px] text-white/30">Cartão</p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleCTA}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong py-3.5 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99]"
        >
          <Zap size={15} strokeWidth={2.5} />
          {content.cta}
        </button>

        <p className="mt-3 text-center text-xs text-white/25">
          Cancele quando quiser · Garantia de 7 dias
        </p>
      </div>
    </div>
  );
}
