"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Container, PageShell, SectionTitle } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getFriendlyAuthErrorMessage, isValidEmail } from "@/lib/auth-errors";
import { createSupabaseBrowserClient, getSupabaseBrowserSetupError } from "@/lib/supabase-browser";

type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-primary/40 focus:outline-none";
const labelClass = "block text-[12px] font-medium uppercase tracking-wide text-white/55 mb-1.5";

export function ProgramSignupForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Informe seu nome.");
    if (!isValidEmail(email)) return setError("Informe um e-mail válido.");
    if (password.length < 6) return setError("A senha deve ter ao menos 6 caracteres.");
    if (!acceptedTerms) return setError("Você precisa aceitar os Termos de Uso.");
    if (!slug) return setError("Programa não informado.");

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(getSupabaseBrowserSetupError() ?? "Falha ao inicializar a autenticação.");
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });

      if (signUpError) {
        throw new Error(getFriendlyAuthErrorMessage(signUpError));
      }

      if (!signUpData.user?.id || !signUpData.session) {
        throw new Error("Conta criada, mas a sessão não foi iniciada. Tente fazer login.");
      }

      // Cria o registro leve do usuário (sem gerar treino por IA).
      const signupRes = await fetchWithAuth("/api/account/program-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), acceptedTerms: true, consents: {} }),
      });
      const signupJson = await parseJsonResponse<ApiEnvelope<{ userId: string }>>(signupRes);
      if (!signupJson.success) {
        throw new Error(signupJson.error ?? "Não foi possível concluir o cadastro.");
      }

      // Segue direto para o checkout do programa.
      const checkoutRes = await fetchWithAuth("/api/stripe/program-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const checkoutJson = await parseJsonResponse<ApiEnvelope<{ url: string }>>(checkoutRes);
      if (!checkoutJson.success || !checkoutJson.data?.url) {
        throw new Error(checkoutJson.error ?? "Não foi possível iniciar a compra.");
      }

      window.location.href = checkoutJson.data.url;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Não foi possível concluir o cadastro."));
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <Container className="max-w-md py-10">
        <SectionTitle
          eyebrow="Programa"
          title="Crie sua conta"
          description="Cadastro rápido para liberar seu programa. Você preenche só o essencial."
        />

        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            )}

            <div>
              <label className={labelClass}>Nome</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className={labelClass}>E-mail</label>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className={labelClass}>Senha</label>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Li e aceito os{" "}
                <Link href="/termos-de-uso" className="text-primary underline" target="_blank">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link href="/politica-de-privacidade" className="text-primary underline" target="_blank">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Processando..." : "Criar conta e continuar"}
            </Button>

            <p className="text-center text-xs text-white/50">
              Já tem conta?{" "}
              <Link href={`/login?redirect=${encodeURIComponent("/programas")}`} className="text-primary underline">
                Entrar
              </Link>
            </p>
          </form>
        </Card>
      </Container>
    </PageShell>
  );
}
