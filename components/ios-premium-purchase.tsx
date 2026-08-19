"use client";

import clsx from "clsx";
import { Check, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics-client";
import {
  configureRevenueCat,
  getPremiumPackages,
  purchasePremium,
  restorePremium,
  type RcPackage,
} from "@/lib/revenuecat-native";

type Plan = "annual" | "monthly";

/**
 * Tela de assinatura Premium DENTRO do app iOS (compra nativa via RevenueCat).
 * Os preços vêm da App Store (não são fixos no código).
 */
export function IosPremiumPurchase() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [packages, setPackages] = useState<{ monthly?: RcPackage; annual?: RcPackage }>({});
  const [selected, setSelected] = useState<Plan>("annual");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dbg, setDbg] = useState("carregando...");

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        if (!supabase) {
          if (active) setDbg("sem cliente supabase");
          return;
        }
        setDbg("a) buscando sessao...");
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        if (!active) return;
        setUserId(uid);
        setDbg("b) uid=" + (uid ? uid.slice(0, 8) : "null"));

        if (!uid) {
          setDbg("sem login (userId nulo)");
          return;
        }

        setDbg("c) configurando RevenueCat...");
        const cfg = await configureRevenueCat(uid);
        if (!active) return;
        setDbg("d) configure=" + cfg + " -> buscando offerings...");
        const pkgs = await getPremiumPackages();
        if (!active) return;
        setPackages(pkgs);
        setDbg(
          `e) configure=${cfg} | mensal=${pkgs.monthly?.product.priceString ?? "-"} anual=${pkgs.annual?.product.priceString ?? "-"}`
        );
      } catch (e) {
        if (active) setDbg("erro: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleBuy() {
    setError(null);

    // Precisa estar logado pra vincular a compra à conta (senão o premium não
    // é liberado no servidor). Sem sessão, manda pro login e volta pra cá.
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }

    const pkg = selected === "annual" ? packages.annual : packages.monthly;
    if (!pkg) {
      setError("Não foi possível carregar os planos. Tente novamente em instantes.");
      return;
    }

    setBusy(true);
    trackEvent("checkout_started", null, { plan: selected, source: "ios_iap" });
    const res = await purchasePremium(pkg);
    setBusy(false);

    if (res.ok) {
      trackEvent("purchase", null, { plan: selected, source: "ios_iap" });
      setDone(true);
    } else if (res.canceled) {
      // usuário fechou o pop-up da Apple: não é erro
    } else {
      setError("Não foi possível concluir a assinatura. Tente novamente.");
    }
  }

  async function handleRestore() {
    setError(null);
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }

    setBusy(true);
    const res = await restorePremium();
    setBusy(false);

    if (res.ok) {
      setDone(true);
    } else {
      setError("Nenhuma assinatura anterior encontrada nesta conta Apple.");
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
        <p className="text-sm font-semibold text-primary">Premium ativado! ✨</p>
        <p className="mt-1 text-sm text-white/70">Aproveite todos os recursos do Hora do Treino.</p>
        <button
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black"
        >
          Continuar
        </button>
      </div>
    );
  }

  const annualPrice = packages.annual?.product.priceString;
  const monthlyPrice = packages.monthly?.product.priceString;
  const selectedPrice = selected === "annual" ? annualPrice : monthlyPrice;
  const selectedPeriod = selected === "annual" ? "ano" : "mês";

  return (
    <>
      {/* PAINEL DE DEBUG TEMPORÁRIO — remover depois que o IAP funcionar */}
      {typeof window !== "undefined" && (
        <div className="mb-4 break-words rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-[11px] leading-relaxed text-yellow-200">
          <p className="font-bold">🔧 DEBUG (temporário)</p>
          <p>platform: {String((window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? "?")}</p>
          <p>Purchases disponível: {String((window as unknown as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } }).Capacitor?.isPluginAvailable?.("Purchases") ?? false)}</p>
          <p>Firebase disponível: {String((window as unknown as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } }).Capacitor?.isPluginAvailable?.("FirebaseMessaging") ?? false)}</p>
          <p>plugins: {(() => { const p = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins; return p ? Object.keys(p).join(", ") : "(nenhum)"; })()}</p>
          <p className="mt-1 font-semibold">status: {dbg}</p>
        </div>
      )}

      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Escolha seu plano</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Anual */}
        <button
          onClick={() => setSelected("annual")}
          className={clsx(
            "relative flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
            selected === "annual" ? "border-primary bg-primary/10 shadow-glow" : "border-white/10 bg-white/5"
          )}
        >
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-black text-black whitespace-nowrap">
            Mais popular
          </span>
          <div className="mt-1 w-full text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Anual</p>
            <p className="mt-1 text-2xl font-black text-white">{annualPrice ?? "—"}</p>
            <p className="text-[11px] text-white/40">/ano</p>
          </div>
          {selected === "annual" && (
            <div className="mt-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check size={11} className="text-black" strokeWidth={3} />
            </div>
          )}
        </button>

        {/* Mensal */}
        <button
          onClick={() => setSelected("monthly")}
          className={clsx(
            "flex flex-col items-center rounded-3xl border-2 p-4 transition-all",
            selected === "monthly" ? "border-primary bg-primary/10 shadow-glow" : "border-white/10 bg-white/5"
          )}
        >
          <div className="w-full text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Mensal</p>
            <p className="mt-1 text-2xl font-black text-white">{monthlyPrice ?? "—"}</p>
            <p className="text-[11px] text-white/40">/mês</p>
          </div>
          {selected === "monthly" && (
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
        onClick={handleBuy}
        disabled={busy || loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-5 py-4 text-sm font-bold text-black shadow-glow transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Zap size={16} strokeWidth={2.5} />
        {busy ? "Processando..." : loading ? "Carregando..." : "Assinar Premium"}
      </button>

      <button
        onClick={handleRestore}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white/70 transition hover:text-white disabled:opacity-60"
      >
        <RotateCcw size={14} />
        Restaurar compras
      </button>

      {/* Texto obrigatório de assinatura (Apple 3.1.2) */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-white/40">
        {selectedPrice
          ? `Assinatura ${selected === "annual" ? "anual" : "mensal"} de ${selectedPrice}/${selectedPeriod}. `
          : ""}
        A assinatura renova automaticamente por igual período, a menos que seja cancelada até 24h antes do fim do período atual, nos Ajustes da App Store. O pagamento é processado pela Apple.{" "}
        <Link href="/termos-de-uso" className="underline hover:text-white/60">
          Termos de Uso
        </Link>{" "}
        ·{" "}
        <Link href="/politica-de-privacidade" className="underline hover:text-white/60">
          Política de Privacidade
        </Link>
      </p>
    </>
  );
}
