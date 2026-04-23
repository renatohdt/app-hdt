"use client";

import { Check, Sparkles, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-client";

const FEATURES = [
  { label: "Treino completo com IA",                free: true,        premium: true        },
  { label: "Substituições de exercício",            free: "2 por plano", premium: "Ilimitadas" },
  { label: "Gerador de treino",                     free: "1 programa",  premium: "Ilimitados" },
  { label: "Controle de carga",                     free: true,        premium: true        },
  { label: "Controle de frequência de treino",      free: true,        premium: true        },
  { label: "Conquistas",                            free: true,        premium: true        },
  { label: "Cronômetro",                            free: true,        premium: true        },
  { label: "Edição de perfil para ajuste de treino",free: true,        premium: true        },
  { label: "Experiência sem anúncios",              free: false,       premium: true        },
];

function CellValue({ value }: { value: boolean | string }) {
  if (value === true)  return <Check size={16} className="mx-auto text-primary" strokeWidth={3} />;
  if (value === false) return <X     size={14} className="mx-auto text-white/25" strokeWidth={2} />;
  return <span className="text-xs font-semibold text-white/80">{value}</span>;
}

export default function EscolherPlanoPage() {
  const router = useRouter();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true;
      trackEvent("plan_selection_view");
    }
  }, []);

  function handleFree() {
    trackEvent("plan_selected", null, { plan: "free" });
    router.push("/dashboard");
  }

  function handlePremium() {
    trackEvent("plan_selected", null, { plan: "premium" });
    router.push("/premium");
  }

  return (
    <main className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-start bg-[#080808] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-md">

        {/* Cabeçalho */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles size={12} />
            Seu treino está pronto!
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Escolha como <span className="text-primary">continuar</span>
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Você pode começar gratuitamente ou desbloquear o Premium agora.
          </p>
        </div>

        {/* Tabela comparativa */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/10">

          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-3 border-b border-white/10 bg-white/5">
            <div className="px-3 py-3 text-xs font-semibold text-white/40" />
            <div className="flex flex-col items-center justify-center border-l border-white/10 px-2 py-3 text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-white/70">Grátis</span>
            </div>
            <div className="relative flex flex-col items-center justify-center border-l border-primary/30 bg-primary/5 px-2 pb-3 pt-7 text-center">
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-black text-black whitespace-nowrap">
                ✨ PREMIUM
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-primary">R$ 9,90<span className="text-[10px] font-normal text-white/60">/mês</span></span>
            </div>
          </div>

          {/* Linhas de features */}
          {FEATURES.map((feature, i) => (
            <div
              key={feature.label}
              className={`grid grid-cols-3 border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}
            >
              <div className="flex items-center px-3 py-3 text-xs leading-snug text-white/80">
                {feature.label}
              </div>
              <div className="flex items-center justify-center border-l border-white/10 px-2 py-3">
                <CellValue value={feature.free} />
              </div>
              <div className="flex items-center justify-center border-l border-primary/20 bg-primary/[0.03] px-2 py-3">
                <CellValue value={feature.premium} />
              </div>
            </div>
          ))}
        </div>

        {/* Botões de ação */}
        <div className="space-y-3">

          {/* Botão Premium — destaque */}
          <button
            onClick={handlePremium}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99]"
          >
            <Zap size={16} strokeWidth={2.5} />
            Assinar Premium — R$&nbsp;9,90/mês
          </button>
          <p className="text-center text-[11px] text-white/60">
            Plano anual · R$ 118,80/ano · Economize 33%
          </p>

          {/* Botão Grátis — secundário */}
          <button
            onClick={handleFree}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:text-white active:scale-[0.99]"
          >
            Começar grátis agora
          </button>
          <p className="text-center text-[11px] text-white/50">
            Sem cartão de crédito · Você pode assinar depois
          </p>
        </div>

      </div>
    </main>
  );
}
