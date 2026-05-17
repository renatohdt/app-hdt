"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { clientLogError } from "@/lib/client-logger";

type Step = "verifying" | "form" | "success" | "error";

export function ResetPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Lê o access_token do hash da URL e inicia a sessão de recuperação
  useEffect(() => {
    const hash = window.location.hash;

    if (!hash) {
      setStep("error");
      return;
    }

    const params = new URLSearchParams(hash.replace("#", ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken || type !== "recovery") {
      setStep("error");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setStep("error");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          clientLogError("RESET PASSWORD SESSION ERROR", sessionError);
          setStep("error");
        } else {
          setStep("form");
        }
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Falha ao inicializar o cliente de autenticação.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setStep("success");
      setTimeout(() => router.push("/dashboard"), 3000);
    } catch (updateError) {
      clientLogError("RESET PASSWORD UPDATE ERROR", updateError);
      setError("Não foi possível atualizar a senha. Tente solicitar um novo link.");
    } finally {
      setLoading(false);
    }
  }

  // ── Estados visuais ──────────────────────────────────────────────

  if (step === "verifying") {
    return (
      <Card className="mx-auto max-w-xl rounded-[32px]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Aguarde</p>
          <h1 className="text-3xl font-semibold">Verificando seu link...</h1>
          <p className="text-sm text-white/64">Estamos validando sua solicitação de redefinição de senha.</p>
        </div>
        <div className="mt-8 flex items-center gap-3 text-white/50 text-sm">
          <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Verificando...
        </div>
      </Card>
    );
  }

  if (step === "error") {
    return (
      <Card className="mx-auto max-w-xl rounded-[32px]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-400">Link inválido</p>
          <h1 className="text-3xl font-semibold">Esse link não funciona mais</h1>
          <p className="text-sm text-white/64">
            O link de redefinição de senha expirou ou já foi utilizado. Solicite um novo link pela tela de login.
          </p>
        </div>
        <div className="mt-8">
          <Link href="/login">
            <Button className="w-full">Voltar para o login</Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (step === "success") {
    return (
      <Card className="mx-auto max-w-xl rounded-[32px]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Tudo certo!</p>
          <h1 className="text-3xl font-semibold">Senha atualizada com sucesso</h1>
          <p className="text-sm text-white/64">
            Sua nova senha foi salva. Você será redirecionado para o dashboard em instantes.
          </p>
        </div>
        <div className="mt-8 flex items-center gap-3 text-white/50 text-sm">
          <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Redirecionando...
        </div>
      </Card>
    );
  }

  // ── Formulário de nova senha ─────────────────────────────────────

  return (
    <Card className="mx-auto max-w-xl rounded-[32px]">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Nova senha</p>
        <h1 className="text-3xl font-semibold">Redefina sua senha</h1>
        <p className="text-sm text-white/64">Escolha uma senha forte com pelo menos 6 caracteres.</p>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
          placeholder="Nova senha"
        />

        <input
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
          placeholder="Confirmar nova senha"
        />

        <Button className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-white/60">
        Lembrou a senha?{" "}
        <Link href="/login" className="font-semibold text-primary">
          Voltar para o login
        </Link>
      </p>
    </Card>
  );
}
