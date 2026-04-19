"use client";

import clsx from "clsx";
import { Check, Lock, Shield, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics-client";
import { trackMetaInitiateCheckout } from "@/lib/facebook-pixel";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

type Plan = "annual" | "monthly";

const FEATURES_FREE = [
  "Treino personalizado com IA",
  "Frequência de treino",
  "Metas",
  "Controle de carga",
  "Cronômetro",
  "2 substituições de exercício por programa",
  "Até 2 programas de treino",
];

const FEATURES_PREMIUM = [
  "Tudo do plano gratuito",
  "Mais substituições de exercício por treino",
  "Programas de treino ilimitados",
  "Geração de novo treino a qualquer momento",
  "Experiência sem anúncios",
];

const FEATURES_BLOCKED_FREE = [
  "Mais substituições por treino",
  "Programas ilimitados",
  "Evolução com IA",
  "Sem anúncios",
];

function formatCPF(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Valida CPF usando o algoritmo dos dígitos verificadores da Receita Federal
function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");

  if (digits.length !== 11) return false;

  // Rejeita CPFs com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Valida primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  // Valida segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;

  return true;
}

// Valida nome completo: mínimo 2 palavras, só letras e espaços, sem números
function isValidFullName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 5) return false;

  // Permite letras (incluindo acentuadas), espaços e hífens
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ '-]+$/.test(trimmed)) return false;

  // Exige pelo menos duas palavras com no mínimo 2 letras cada
  const parts = trimmed.split(/\s+/).filter((p) => p.length >= 2);
  return parts.length >= 2;
}

function PremiumPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "true";

  const [selectedPlan, setSelectedPlan] = useState<Plan>("annual");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true;
      trackEvent("premium_page_view");
    }
  }, []);

  async function handleCheckout() {
    setError(null);

    if (!isValidFullName(name)) {
      setError("Informe seu nome completo (nome e sobrenome, sem números).");
      return;
    }

    const cpfNumbers = cpf.replace(/\D/g, "");
    if (!isValidCPF(cpfNumbers)) {
      setError("CPF inválido. Verifique e tente novamente.");
      return;
    }

    setLoading(true);

    // Dispara eventos de analytics antes do redirect
    const value = selectedPlan === "annual" ? 118.9 : 14.9;
    trackEvent("checkout_started", null, { plan: selectedPlan, value });
    trackMetaInitiateCheckout({ value, currency: "BRL", content_name: `Premium ${selectedPlan}` });

    try {
      const response = await fetchWithAuth("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, customerName: name.trim(), customerCpf: cpfNumbers }),
      });

      // Trata resposta não-JSON (ex: erro de servidor antes da rota processar)
      let data: { data?: { url?: string }; error?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        throw new Error("Não foi possível iniciar o pagamento. Tente novamente em instantes.");
      }

      if (!response.ok || !data?.data?.url) {
        throw new Error(data?.error ?? "Não foi possível iniciar o pagamento. Tente novamente.");
      }

      // Redireciona para o Stripe Checkout
      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen min-h-[100dvh] bg-spotlight px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-lg">

        {/* Voltar */}
        <Link href="/perfil" className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
          ← Voltar
        </Link>

        {/* Aviso de checkout cancelado */}
        {canceled && (
          <div className="mb-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            Pagamento não concluído. Você pode tentar novamente quando quiser.
          </div>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles size={12} />
            Hora do Treino Premium
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Evolua sem limites
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Treinos personalizados que crescem com você.
          </p>
        </div>

        {/* Seletor de plano */}
        <div className="mb-6 grid grid-cols-2 gap-3">

          {/* Plano Anual — destaque */}
          <button
            onClick={() => setSelectedPlan("annual")}
            className={clsx(
              "relative flex flex-col items-center rounded-3xl border-2 p-4 text-left transition-all",
              selectedPlan === "annual"
                ? "border-primary bg-primary/10 shadow-glow"
                : "border-white/10 bg-white/5 hover:border-white/20"
            )}
          >
            {/* Badge "Mais popular" */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-black">
              Mais popular
            </span>
            <div className="mt-1 w-full text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Anual</p>
              <p className="mt-1 text-2xl font-bold text-white">R$&nbsp;9,90</p>
              <p className="text-xs text-white/40">/mês · R$&nbsp;118,80/ano</p>
              <p className="mt-2 text-xs font-medium text-primary">Economize 33%</p>
            </div>
            {selectedPlan === "annual" && (
              <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={12} className="text-black" strokeWidth={3} />
              </div>
            )}
          </button>

          {/* Plano Mensal */}
          <button
            onClick={() => setSelectedPlan("monthly")}
            className={clsx(
              "flex flex-col items-center rounded-3xl border-2 p-4 text-left transition-all",
              selectedPlan === "monthly"
                ? "border-primary bg-primary/10 shadow-glow"
                : "border-white/10 bg-white/5 hover:border-white/20"
            )}
          >
            <div className="w-full text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Mensal</p>
              <p className="mt-1 text-2xl font-bold text-white">R$&nbsp;14,90</p>
              <p className="text-xs text-white/40">/mês</p>
              <p className="mt-2 text-xs text-white/30">Cartão de crédito</p>
            </div>
            {selectedPlan === "monthly" && (
              <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={12} className="text-black" strokeWidth={3} />
              </div>
            )}
          </button>
        </div>

        {/* O que está incluído */}
        <div className="mb-6 rounded-3xl border border-white/10 bg-[#101010]/80 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Incluído no Premium
          </p>
          <ul className="space-y-2.5">
            {FEATURES_PREMIUM.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <Check size={10} className="text-primary" strokeWidth={3} />
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="my-4 h-px bg-white/8" />

          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">
            Não disponível no gratuito
          </p>
          <ul className="space-y-2">
            {FEATURES_BLOCKED_FREE.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-white/40">
                <X size={12} className="shrink-0 text-white/25" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Formulário de dados */}
        <div className="mb-6 rounded-3xl border border-white/10 bg-[#101010]/80 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Seus dados
          </p>

          <div>
            <label className="mb-1.5 block text-xs text-white/60">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como está no seu CPF"
              autoComplete="name"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-white/60">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              autoComplete="off"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition"
            />
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Botão de checkout */}
        <button
          onClick={handleCheckout}
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
              Assinar {selectedPlan === "annual" ? "por R$ 118,80/ano" : "por R$ 14,90/mês"}
            </>
          )}
        </button>

        {/* Garantias */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs text-white/40">
            <Shield size={13} className="shrink-0 text-primary/60" />
            <span>Pagamento seguro processado pelo Stripe</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/40">
            <Lock size={13} className="shrink-0 text-primary/60" />
            <span>Seus dados são protegidos com criptografia</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/40">
            <Check size={13} className="shrink-0 text-primary/60" />
            <span>Garantia de 7 dias — reembolso sem burocracia</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/40">
            <Check size={13} className="shrink-0 text-primary/60" />
            <span>Cancele quando quiser, sem multas</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/20">
          Ao assinar, você concorda com os{" "}
          <Link href="/termos-de-uso" className="underline hover:text-white/40">
            Termos de Uso
          </Link>{" "}
          e{" "}
          <Link href="/politica-de-privacidade" className="underline hover:text-white/40">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

export default function PremiumPage() {
  return (
    <Suspense>
      <PremiumPageContent />
    </Suspense>
  );
}
