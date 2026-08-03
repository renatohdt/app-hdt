"use client";

import { useState } from "react";
import { CreditCard, Sparkles } from "lucide-react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

/**
 * Gestão de assinatura DENTRO do app (Capacitor), sem abrir o portal do Stripe.
 * Cobre apenas ações que não envolvem pagamento (cancelar / reativar), conforme
 * as regras das lojas. Troca de cartão e upgrade continuam apenas no site.
 */
type Props = {
  plan: "free" | "monthly" | "annual";
  manageable: boolean;
  initialCancelAtPeriodEnd: boolean;
  initialCancelsAt: string | null;
  initialRenewsAt: string | null;
  formatDate: (iso: string) => string;
};

export function NativeSubscriptionManager({
  plan,
  manageable,
  initialCancelAtPeriodEnd,
  initialCancelsAt,
  initialRenewsAt,
  formatDate,
}: Props) {
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(initialCancelAtPeriodEnd);
  const [cancelsAt, setCancelsAt] = useState(initialCancelsAt);
  const [renewsAt, setRenewsAt] = useState(initialRenewsAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function run(action: "cancel" | "reactivate") {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/stripe/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const json = (await response.json().catch(() => null)) as
        | { data?: { cancelAtPeriodEnd?: boolean; cancelsAt?: string | null; renewsAt?: string | null }; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Não foi possível atualizar sua assinatura.");
      }

      const d = json?.data ?? {};
      setCancelAtPeriodEnd(Boolean(d.cancelAtPeriodEnd));
      setCancelsAt(d.cancelsAt ?? null);
      setRenewsAt(d.renewsAt ?? null);
      setConfirmingCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
        <Sparkles className="h-3 w-3" />
        {plan === "annual" ? "Premium Anual" : "Premium Mensal"}
      </span>

      {cancelAtPeriodEnd && cancelsAt ? (
        <p className="text-[13px] text-white/50">⚠️ Cancela em {formatDate(cancelsAt)}</p>
      ) : renewsAt ? (
        <p className="text-[13px] text-white/50">Renova em {formatDate(renewsAt)}</p>
      ) : null}

      {error ? <p className="text-[13px] text-red-400">{error}</p> : null}

      {!manageable ? (
        <p className="text-[13px] text-white/40">
          Seu acesso Premium não tem cobrança recorrente para gerenciar.
        </p>
      ) : cancelAtPeriodEnd ? (
        <button
          type="button"
          onClick={() => void run("reactivate")}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-4 py-2.5 text-sm font-bold text-black shadow-glow transition hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "Reativando..." : "Reativar assinatura"}
        </button>
      ) : confirmingCancel ? (
        <div className="space-y-2">
          <p className="text-[13px] text-white/60">
            Tem certeza? Você mantém o Premium até o fim do período já pago.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void run("cancel")}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
            >
              {loading ? "Cancelando..." : "Sim, cancelar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/8 disabled:opacity-50"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Cancelar assinatura
        </button>
      )}
    </div>
  );
}
