"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { getFriendlyAuthErrorMessage, isValidEmail } from "@/lib/auth-errors";
import { createSupabaseBrowserClient, getSupabaseBrowserSetupError } from "@/lib/supabase-browser";
import { clientLogError } from "@/lib/client-logger";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!isValidEmail(email)) {
        throw new Error("Digite um e-mail válido.");
      }

      if (password.trim().length < 6) {
        throw new Error("Sua senha precisa ter pelo menos 6 caracteres.");
      }

      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(getSupabaseBrowserSetupError() ?? "Falha ao inicializar o cliente de autenticação.");
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError || !data.session || !data.user) {
        throw new Error("Usuário não encontrado ou credenciais inválidas.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (submissionError) {
      clientLogError("LOGIN FLOW ERROR", submissionError);
      const friendlyMessage = getFriendlyAuthErrorMessage(submissionError);
      setError(
        friendlyMessage === "E-mail ou senha inválidos."
          ? "Usuário não encontrado ou credenciais inválidas."
          : friendlyMessage
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError("Digite seu e-mail para recuperar a senha.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Digite um e-mail válido para recuperar a senha.");
      return;
    }

    setResetLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(getSupabaseBrowserSetupError() ?? "Falha ao inicializar o cliente de autenticação.");
      }

      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (resetError) {
        throw resetError;
      }

      setSuccessMessage("Enviamos um link para redefinir sua senha no seu e-mail.");
    } catch (resetRequestError) {
      clientLogError("RESET FLOW ERROR", resetRequestError);
      setError(getFriendlyAuthErrorMessage(resetRequestError));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl rounded-[32px]">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Login</p>
        <h1 className="text-3xl font-semibold">Entre para acessar seu treino</h1>
        <p className="text-sm text-white/64">Use o mesmo e-mail e senha cadastrados no formulário inicial.</p>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
          {successMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
          placeholder="você@exemplo.com"
        />

        <div className="space-y-3">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
            placeholder="Sua senha"
          />

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetLoading}
            className="text-sm font-medium text-white/68 transition hover:text-primary disabled:opacity-60"
          >
            {resetLoading ? "Enviando..." : "Esqueci a senha"}
          </button>
        </div>

        <Button className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-white/60">
        Não tem conta?{" "}
        <Link href="/" className="font-semibold text-primary">
          Criar conta
        </Link>
      </p>
      <p className="mt-3 text-sm text-white/56">
        Consulte a{" "}
        <Link href="/politica-de-privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
          política de privacidade
        </Link>{" "}
        ou gerencie seus direitos na{" "}
        <Link href="/privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
          central de privacidade
        </Link>
        .
      </p>
    </Card>
  );
}
