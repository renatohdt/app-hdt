"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Card } from "@/components/ui";

type ResultState = {
  tone: "success" | "error";
  message: string;
} | null;

export default function AdminSetPlanPage() {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"free" | "monthly" | "annual">("annual");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ tone: "error", message: data?.error ?? "Erro ao definir plano." });
      } else {
        setResult({ tone: "success", message: data?.data?.message ?? "Plano atualizado com sucesso!" });
      }
    } catch {
      setResult({ tone: "error", message: "Erro de conexão. Verifique se o servidor está rodando." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
          Administração
        </p>
        <h1 className="text-[2rem] font-semibold tracking-tight text-white">
          Definir Plano (Testes)
        </h1>
        <p className="text-sm text-white/50">
          Use para simular planos premium sem passar pelo Stripe. Apenas para desenvolvimento.
        </p>
      </div>

      <Card className="max-w-md space-y-5 p-5">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

          {/* E-mail */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              E-mail do usuário
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition"
            />
          </div>

          {/* Plano */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Plano
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["free", "monthly", "annual"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                    plan === p
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80"
                  }`}
                >
                  {p === "free" ? "Free" : p === "monthly" ? "Mensal" : "Anual"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/30">
              {plan === "free"
                ? "Remove a assinatura — volta ao plano gratuito."
                : plan === "monthly"
                  ? "Simula plano premium mensal (R$ 14,90)."
                  : "Simula plano premium anual (R$ 118,80)."}
            </p>
          </div>

          {/* Resultado */}
          {result && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                result.tone === "success"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
              }`}
            >
              {result.message}
            </div>
          )}

          {/* Botão */}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-2xl bg-gradient-to-r from-primary to-primaryStrong py-3 text-sm font-bold text-black shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Aplicando..." : `Aplicar plano ${plan === "free" ? "free" : plan === "monthly" ? "mensal" : "anual"}`}
          </button>
        </form>
      </Card>

      <p className="text-xs text-white/20">
        ⚠️ Esta página é exclusiva para testes. Não usar em produção com usuários reais.
      </p>
    </section>
  );
}
