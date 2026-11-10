"use client";

import clsx from "clsx";
import { Check, Lock, Shield, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { BrandFooter } from "@/components/brand-footer";
import { IosPremiumPurchase } from "@/components/ios-premium-purchase";
import { useNativePlatform } from "@/lib/is-native-app";
import { getWebPricePerDayLabel, type PremiumPeriod } from "@/lib/premium-pricing";
import { useStripeCheckout } from "@/lib/use-stripe-checkout";

const FEATURES = [
  { label: "Evolução de programa de treino com IA",          free: false,         premium: true          },
  { label: "Métodos de treino",                              free: "1 método",    premium: "Combináveis" },
  { label: "Treino Extra",                                    free: false,         premium: "5 por mês"   },
  { label: "Substituições de exercício",                     free: "2 por plano", premium: "2 por treino" },
  { label: "Gerador de treino",                              free: "1 programa",  premium: "Ilimitados"  },
  { label: "Locais de treino", free: "1 local", premium: "2 ou mais" },
  { label: "Experiência sem anúncios",                       free: false,         premium: true          },
  { label: "Treino completo com IA",                         free: true,          premium: true          },
  { label: "Controle de carga e frequência de treino",       free: true,          premium: true          },
  { label: "Conquistas e Cronômetro",                        free: true,          premium: true          },
  { label: "Edição de perfil para ajuste de treino",         free: true,          premium: true          },
];

function CellValue({ value, isPremium }: { value: boolean | string; isPremium?: boolean }) {
  if (value === true)  return <Check size={isPremium ? 20 : 16} className={`mx-auto ${isPremium ? "text-primary" : "text-white/50"}`} strokeWidth={3} />;
  if (value === false) return <X     size={14} className="mx-auto text-white/25" strokeWidth={2} />;
  return <span className={isPremium ? "text-sm font-bold text-primary" : "text-xs font-semibold text-white/80"}>{value}</span>;
}

export default function EscolherPlanoPage() {
  const router = useRouter();
  const platform = useNativePlatform();
  const isNative = platform !== "web";
  const trackedRef = useRef(false);
  const [selectedPlan, setSelectedPlan] = useState<PremiumPeriod>("annual");
  const [interested, setInterested] = useState(false);
  const { startCheckout, loading, error } = useStripeCheckout("escolher-plano");

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

  // Web: vai direto para o checkout do Stripe com o plano escolhido.
  function handlePremiumCheckout() {
    if (isNative || loading) return; // dentro do app nunca usamos o Stripe (regra das lojas)
    trackEvent("plan_selected", null, { plan: "premium", period: selectedPlan });
    void startCheckout(selectedPlan);
  }

  // Android sem planos carregados: registra interesse (mesmo fallback da /premium).
  function handleInterest() {
    trackEvent("premium_interest", null, { source: "escolher-plano" });
    setInterested(true);
    void fetchWithAuth("/api/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "premium" }),
    }).catch(() => {});
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
              <span className="text-xs font-bold uppercase tracking-widest text-primary">{isNative ? "Premium" : <>R$ 9,90<span className="text-[10px] font-normal text-white/60">/mês</span></>}</span>
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
                <CellValue value={feature.premium} isPremium />
              </div>
            </div>
          ))}
        </div>

        {/* ── Assinatura Premium ── */}
        {platform === "ios" ? (
          /* App iOS: compra nativa (Apple / RevenueCat) direto aqui */
          <IosPremiumPurchase />
        ) : platform === "android" ? (
          /* App Android: compra nativa (Google Play / RevenueCat) direto aqui */
          <IosPremiumPurchase
            fallback={
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
                {!interested ? (
                  <>
                    <p className="text-sm leading-relaxed text-white/70">
                      A ativação do Premium é feita pela nossa equipe. Deixe seu
                      interesse e enviamos por e-mail as novidades e como desbloquear
                      todos os recursos.
                    </p>
                    <button
                      onClick={handleInterest}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99]"
                    >
                      <Zap size={16} strokeWidth={2.5} />
                      Tenho interesse no Premium
                    </button>
                  </>
                ) : (
                  <p className="py-2 text-sm font-semibold text-primary">
                    Recebemos seu interesse! ✨ Em breve entramos em contato por e-mail.
                  </p>
                )}
              </div>
            }
          />
        ) : (
          /* Navegador: escolhe o plano e vai direto para o Stripe */
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
              Escolha seu plano
            </p>
            <div className="mb-5 grid grid-cols-2 gap-3">
              {/* Plano Anual */}
              <button
                type="button"
                onClick={() => setSelectedPlan("annual")}
                className={clsx(
                  "relative flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
                  selectedPlan === "annual"
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-[10px] font-black text-black">
                  Mais popular
                </span>
                <div className="mt-1 w-full text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Anual</p>
                  <p className="mt-1 text-2xl font-black text-white">R$&nbsp;9,90</p>
                  <p className="text-[11px] text-white/40">/mês · R$&nbsp;118,80/ano</p>
                  <p className="mt-1.5 text-[11px] font-bold text-premium">só {getWebPricePerDayLabel("annual")} por dia</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-primary">Economize 33%</p>
                </div>
                {selectedPlan === "annual" && (
                  <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check size={11} className="text-black" strokeWidth={3} />
                  </div>
                )}
              </button>

              {/* Plano Mensal */}
              <button
                type="button"
                onClick={() => setSelectedPlan("monthly")}
                className={clsx(
                  "flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
                  selectedPlan === "monthly"
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="w-full text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Mensal</p>
                  <p className="mt-1 text-2xl font-black text-white">R$&nbsp;14,90</p>
                  <p className="text-[11px] text-white/40">/mês</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-white/55">{getWebPricePerDayLabel("monthly")} por dia</p>
                  <p className="mt-0.5 text-[11px] text-white/30">Cartão de crédito</p>
                </div>
                {selectedPlan === "monthly" && (
                  <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check size={11} className="text-black" strokeWidth={3} />
                  </div>
                )}
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handlePremiumCheckout}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  Redirecionando...
                </>
              ) : (
                <>
                  <Zap size={16} strokeWidth={2.5} />
                  {selectedPlan === "annual" ? "Assinar por R$ 118,80/ano" : "Assinar por R$ 14,90/mês"}
                </>
              )}
            </button>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-white/60">
                <Shield size={13} className="shrink-0 text-primary/70" />
                Pagamento seguro processado pelo Stripe
              </div>
              <div className="flex items-center gap-2.5 text-xs text-white/60">
                <Lock size={13} className="shrink-0 text-primary/70" />
                Garantia de 7 dias — reembolso sem burocracia
              </div>
              <div className="flex items-center gap-2.5 text-xs text-white/60">
                <Check size={13} className="shrink-0 text-primary/70" />
                Cancele quando quiser, sem multas
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] text-white/45">
              Ao assinar, você concorda com os{" "}
              <Link href="/termos-de-uso" className="underline hover:text-white/70">Termos de Uso</Link>{" "}
              e{" "}
              <Link href="/politica-de-privacidade" className="underline hover:text-white/70">Política de Privacidade</Link>.
            </p>
          </>
        )}

        {/* ── Opção gratuita ── */}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleFree}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:text-white active:scale-[0.99]"
          >
            Começar grátis agora
          </button>
          <p className="text-center text-[11px] text-white/50">
            Sem cartão de crédito · Você pode assinar depois
          </p>
        </div>

        <BrandFooter className="mt-10" />
      </div>
    </main>
  );
}
