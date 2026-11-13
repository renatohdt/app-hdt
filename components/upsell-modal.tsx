"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { trackEvent } from "@/lib/analytics-client";
import { PremiumBadge, PremiumIcon } from "@/components/premium-badge";
import { PremiumCheckoutPanel } from "@/components/premium-checkout-panel";

export type UpsellReason =
  | "replacement_limit"   // Tentou substituir o 3º exercício
  | "program_completed"   // Completou o 2º programa no free (fim de ciclo)
  | "generate_workout"    // Tentou gerar novo treino sem ser premium
  | "combine_styles"         // Tentou combinar 2+ estilos de treino sem ser premium
  | "combine_styles_locked"  // Clicou em estilo bloqueado no perfil
  | "home_banner"         // Banner da home
  | "unlock_location"     // Free tentou trocar para outro local de treino
  | "load_evolution"      // Free tocou na evolução de cargas (página Evolução)
  | "weekly_plan"         // Free tocou na "Minha semana" (página Evolução)
  | "extra_workout"       // Free tocou em "Treino Extra"
  | "next_program"        // Calendário: próximo programa bloqueado no free
  | "remove_ads"          // "Remover anúncios" embaixo dos anúncios
  | "workout_tabs"        // Trava das abas B, C… do treino
  | "workout_complete"    // Convite no popup de treino concluído
  | "profile_card"        // Cartão de assinatura no Perfil
  | "referral_courtesy";  // Perfil: cortesia do Indique e Ganhe acabando

type UpsellModalProps = {
  reason: UpsellReason;
  onClose: () => void;
};

// Textos curtos de propósito: o popup também mostra os planos e o botão de
// pagamento, então a descrição precisa caber sem rolar a tela.
const CONTENT: Record<UpsellReason, { title: string; description: string; cta: string }> = {
  replacement_limit: {
    title: "Mais trocas de exercício",
    description: "Você usou as 2 trocas do plano gratuito. No Premium são 2 trocas em cada treino (A, B, C…), e sem anúncios.",
    cta: "Assinar Premium",
  },
  program_completed: {
    title: "Parabéns, você concluiu o programa! 🎉",
    description: "Você completou todos os treinos deste ciclo. Assine o Premium para a IA montar seu próximo programa e continuar evoluindo.",
    cta: "Quero continuar evoluindo",
  },
  generate_workout: {
    title: "Gere treinos ilimitados",
    description: "Gere um novo programa quando quiser, sem esperar o ciclo terminar, e sem anúncios.",
    cta: "Assinar Premium",
  },
  combine_styles: {
    title: "Combine estilos de treino",
    description: "Misture estilos no mesmo programa (ex.: Musculação + Funcional) e a IA distribui pelos treinos. No gratuito é 1 estilo.",
    cta: "Assinar Premium",
  },
  combine_styles_locked: {
    title: "Libere mais modalidades para o seu treino!",
    description: "Com o Premium você desbloqueia Funcional, HIIT, Calistenia e pode combinar vários estilos no mesmo programa — a IA distribui pelos treinos.",
    cta: "Assinar Premium",
  },
  home_banner: {
    title: "Leve seus treinos ao próximo nível",
    description: "Programas sem fim com evolução da IA, mais trocas de exercício, vários estilos e locais, e sem anúncios.",
    cta: "Assinar Premium",
  },
  weekly_plan: {
    title: "Monte sua semana como um personal",
    description: "Escolha seus dias de treino e o app organiza a ordem ideal, com day off na hora certa. Perdeu um dia? A semana se reorganiza.",
    cta: "Assinar Premium",
  },
  load_evolution: {
    title: "Veja sua força crescer",
    description: "Acompanhe a evolução de carga de cada exercício em gráfico. A prova de que o treino está funcionando.",
    cta: "Assinar Premium",
  },
  unlock_location: {
    title: "Seja Premium e treine em diferentes locais",
    description: "Tenha treinos para mais de um local (ex.: casa e condomínio) e alterne quando quiser. No gratuito é 1 local.",
    cta: "Assinar Premium",
  },
  extra_workout: {
    title: "Treino Extra",
    description: "Crie um treino extra quando estiver em outro local, com outros materiais ou outro tempo disponível. Ele sai do seu programa após 4 horas.",
    cta: "Assinar Premium",
  },
  next_program: {
    title: "Seu próximo programa te espera",
    description: "No plano gratuito você já usou seus 2 programas. No Premium a IA monta um novo programa a cada ciclo, a partir da sua evolução.",
    cta: "Quero continuar evoluindo",
  },
  remove_ads: {
    title: "Treine sem anúncios",
    description: "No Premium o app fica sem anúncios e você ainda libera evolução de carga, Minha semana e programas ilimitados.",
    cta: "Assinar Premium",
  },
  workout_tabs: {
    title: "Veja todos os treinos, sempre",
    description: "No Premium você vê todos os treinos da semana quando quiser, sem vídeos e sem anúncios.",
    cta: "Assinar Premium",
  },
  workout_complete: {
    title: "Continue nesse ritmo com o Premium",
    description: "Veja sua força crescendo em gráfico, monte sua semana e treine sem anúncios.",
    cta: "Assinar Premium",
  },
  profile_card: {
    title: "Leve seus treinos ao próximo nível",
    description: "Evolução de carga em gráfico, Minha semana, programas ilimitados e treino sem anúncios.",
    cta: "Assinar Premium",
  },
  referral_courtesy: {
    title: "Continue Premium depois da cortesia",
    description: "Mantenha evolução de carga, Minha semana, programas ilimitados e treino sem anúncios quando a cortesia acabar.",
    cta: "Assinar Premium",
  },
};

/**
 * Popup PADRÃO de assinatura Premium: motivo + planos + botão verde que vai
 * DIRETO ao pagamento (o bloco de compra fica em PremiumCheckoutPanel).
 */
export function UpsellModal({ reason, onClose }: UpsellModalProps) {
  const content = CONTENT[reason];
  const [locked, setLocked] = useState(false);
  const handleLockChange = useCallback((value: boolean) => setLocked(value), []);

  // Bloqueia scroll do body enquanto modal está aberto
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    trackEvent("cta_click", null, { source: `upsell_modal_view_${reason}` });
    return () => {
      document.body.style.overflow = previous;
    };
  }, [reason]);

  // Portal no <body> e z-index alto: abre por cima de outros popups
  // (ex.: fim de ciclo, treino concluído) sem ficar escondido atrás deles.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={locked ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative z-10 max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[32px] border border-white/10 bg-[#0f110f] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:rounded-[32px] sm:pb-8">

        {/* Botão fechar */}
        {!locked && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white/70"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        )}

        {/* Ícone + selo dourado: identidade visual única do Premium */}
        <div className="mb-4 flex items-center gap-3">
          <PremiumIcon />
          <PremiumBadge />
        </div>

        <h2 className="mb-2 pr-8 text-xl font-bold leading-snug tracking-tight text-white">
          {content.title}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-white/60">{content.description}</p>

        <PremiumCheckoutPanel
          origin={`upsell_modal_${reason}`}
          ctaSource={`upsell_modal_cta_${reason}`}
          ctaLabel={content.cta}
          onNavigate={onClose}
          onDone={onClose}
          onLockChange={handleLockChange}
        />
      </div>
    </div>,
    document.body
  );
}
