"use client";

import { CheckCircle, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-client";
import { trackEvent as trackGA4 } from "@/lib/analytics";

// Dispara eventos de conversão uma única vez após o pagamento.
// Serve tanto para assinatura (plan mensal/anual) quanto para compra de programa.
function fireConversionEvents(plan: string | null, isProgram: boolean) {
  if (isProgram) {
    // Compra de programa (pagamento único). Registra internamente para o
    // dashboard de analytics; o valor monetário exato pode ser adicionado
    // futuramente via parâmetro na URL de sucesso.
    trackEvent("purchase", null, { type: "program" });
    return;
  }

  const isAnnual = plan === "annual";
  const value = isAnnual ? 118.9 : 14.9;
  const planLabel = isAnnual ? "annual" : "monthly";

  // GA4 — evento padrão de e-commerce "purchase"
  trackGA4("purchase", {
    transaction_id: `sub_${Date.now()}`,
    value,
    currency: "BRL",
    item_id: `premium_${planLabel}`,
    item_name: `Hora do Treino Premium ${isAnnual ? "Anual" : "Mensal"}`,
    item_category: "subscription",
    quantity: 1,
  });

  // Evento interno do app (para o dashboard de analytics do admin)
  trackEvent("purchase", null, { plan: planLabel, value });

  // Meta Pixel — evento padrão "Purchase"
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "Purchase", {
      value,
      currency: "BRL",
      content_name: `Premium ${isAnnual ? "Anual" : "Mensal"}`,
      content_type: "product",
    });
  }
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const isProgram = Boolean(searchParams.get("program"));
  const firedRef = useRef(false);

  useEffect(() => {
    // Garante que os eventos disparam apenas uma vez mesmo em StrictMode
    if (!firedRef.current) {
      firedRef.current = true;
      fireConversionEvents(plan, isProgram);
    }
  }, [plan, isProgram]);

  return (
    <main className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-spotlight px-4 py-12">
      <div className="mx-auto w-full max-w-sm text-center">
        {/* Ícone de sucesso */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <CheckCircle size={40} className="text-primary" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Mensagem principal — genérica para assinatura e programa */}
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles size={12} />
          Acesso ativado!
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Pagamento confirmado 🎉</h1>
        <p className="mt-2 text-sm text-white/60">
          Tudo certo! Seu acesso já está liberado. É só abrir seu treino e começar. 💪
        </p>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99]"
        >
          Ir para meu treino
          <ChevronRight size={16} strokeWidth={2.5} />
        </Link>

        <p className="mt-5 text-xs text-white/30">
          Você receberá um recibo por e-mail. Gerencie sua conta em{" "}
          <Link href="/perfil" className="underline hover:text-white/50">
            Perfil
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
