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

// Tabela comparativa Free vs Premium
const COMPARISON = [
  { label: "Treino completo com IA",                 free: true,          premium: true          },
  { label: "Substituições de exercício",             free: "2 por plano", premium: "Ilimitadas"  },
  { label: "Gerador de treino",                      free: "1 programa",  premium: "Ilimitados"  },
  { label: "Controle de carga",                      free: true,          premium: true          },
  { label: "Controle de frequência de treino",       free: true,          premium: true          },
  { label: "Conquistas",                             free: true,          premium: true          },
  { label: "Cronômetro",                             free: true,          premium: true          },
  { label: "Edição de perfil para ajuste de treino", free: true,          premium: true          },
  { label: "Experiência sem anúncios",               free: false,         premium: true          },
];

function CellValue({ value, isPremium }: { value: boolean | string; isPremium?: boolean }) {
  if (value === true)  return <Check size={16} className={clsx("mx-auto", isPremium ? "text-primary" : "text-white/50")} strokeWidth={3} />;
  if (value === false) return <X     size={14} className="mx-auto text-white/20" strokeWidth={2} />;
  return (
    <span className={clsx("text-xs font-semibold", isPremium ? "text-primary" : "text-white/60")}>
      {value}
    </span>
  );
}

function formatCPF(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  return true;
}

function isValidFullName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 5) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ '-]+$/.test(trimmed)) return false;
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

    const value = selectedPlan === "annual" ? 118.9 : 14.9;
    trackEvent("checkout_started", null, { plan: selectedPlan, value });
    trackMetaInitiateCheckout({ value, currency: "BRL", content_name: `Premium ${selectedPlan}` });

    try {
      const response = await fetchWithAuth("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, customerName: name.trim(), customerCpf: cpfNumbers }),
      });

      let data: { data?: { url?: string }; error?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        throw new Error("Não foi possível iniciar o pagamento. Tente novamente em instantes.");
      }

      if (!response.ok || !data?.data?.url) {
        throw new Error(data?.error ?? "Não foi possível iniciar o pagamento. Tente novamente.");
      }

      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen min-h-[100dvh] bg-[#080808] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto w-full max-w-lg">

        {/* Voltar */}
        <Link
          href="/perfil"
          className="mb-6 inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
        >
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
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles size={12} />
            Hora do Treino Premium
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Evolua sem limites
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Treinos personalizados que crescem com você.
          </p>
        </div>

        {/* ── Tabela comparativa ── */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-white/10">

          {/* Cabeçalho */}
          <div className="grid grid-cols-3 border-b border-white/10 bg-white/5">
            <div className="px-3 py-3" />
            <div className="flex flex-col items-center justify-center border-l border-white/10 px-2 py-3 text-center">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">Grátis</span>
              <span className="mt-0.5 text-xs font-semibold text-white/50">R$ 0</span>
            </div>
            <div className="relative flex flex-col items-center justify-center border-l border-primary/30 bg-primary/5 px-2 pb-3 pt-7 text-center">
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-black text-black whitespace-nowrap">
                ✨ PREMIUM
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Premium</span>
              <span className="mt-0.5 text-xs font-semibold text-primary/90">R$ 9,90<span className="text-[10px] font-normal text-white/60">/mês</span></span>
            </div>
          </div>

          {/* Linhas */}
          {COMPARISON.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}
            >
              <div className="flex items-center px-3 py-3 text-xs leading-snug text-white/80">
                {row.label}
              </div>
              <div className="flex items-center justify-center border-l border-white/10 px-2 py-3">
                <CellValue value={row.free} isPremium={false} />
              </div>
              <div className="flex items-center justify-center border-l border-primary/20 bg-primary/[0.03] px-2 py-3">
                <CellValue value={row.premium} isPremium={true} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Seletor de plano ── */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Escolha seu plano
        </p>
        <div className="mb-6 grid grid-cols-2 gap-3">

          {/* Plano Anual */}
          <button
            onClick={() => setSelectedPlan("annual")}
            className={clsx(
              "relative flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
              selectedPlan === "annual"
                ? "border-primary bg-primary/10 shadow-glow"
                : "border-white/10 bg-white/5 hover:border-white/20"
            )}
          >
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-black text-black whitespace-nowrap">
              Mais popular
            </span>
            <div className="mt-1 w-full text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Anual</p>
              <p className="mt-1 text-2xl font-black text-white">R$&nbsp;9,90</p>
              <p className="text-[11px] text-white/40">/mês · R$&nbsp;118,80/ano</p>
              <p className="mt-1.5 text-[11px] font-semibold text-primary">Economize 33%</p>
            </div>
            {selectedPlan === "annual" && (
              <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={11} className="text-black" strokeWidth={3} />
              </div>
            )}
          </button>

          {/* Plano Mensal */}
          <button
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
              <p className="mt-1.5 text-[11px] text-white/30">Cartão de crédito</p>
            </div>
            {selectedPlan === "monthly" && (
              <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={11} className="text-black" strokeWidth={3} />
              </div>
            )}
          </button>
        </div>

        {/* ── Formulário de dados ── */}
        <div className="mb-6 space-y-4 rounded-3xl border border-white/10 bg-[#101010]/80 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Seus dados para emissão de NF
          </p>

          <div>
            <label className="mb-1.5 block text-xs text-white/60">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como está no seu CPF"
              autoComplete="name"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Botão de checkout ── */}
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
              {selectedPlan === "annual" ? "Assinar por R$ 118,80/ano" : "Assinar por R$ 14,90/mês"}
            </>
          )}
        </button>

        {/* Garantias */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs text-white/60">
            <Shield size={13} className="shrink-0 text-primary/70" />
            Pagamento seguro processado pelo Stripe
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/60">
            <Lock size={13} className="shrink-0 text-primary/70" />
            Seus dados são protegidos com criptografia
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/60">
            <Check size={13} className="shrink-0 text-primary/70" />
            Garantia de 7 dias — reembolso sem burocracia
          </div>
          <div className="flex items-center gap-2.5 text-xs text-white/60">
            <Check size={13} className="shrink-0 text-primary/70" />
            Cancele quando quiser, sem multas
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
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
