"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";
import { getFriendlyAuthErrorMessage, isValidEmail } from "@/lib/auth-errors";
import { clientLogError } from "@/lib/client-logger";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      try {
        const response = await fetchWithAuth("/api/admin/session");

        if (response.ok) {
          router.replace("/admin");
          return;
        }

        if (response.status === 401 || response.status === 403) {
          if (active) {
            setCheckingSession(false);
          }
          return;
        }
      } catch (sessionError) {
        clientLogError("ADMIN SESSION CHECK ERROR", sessionError);
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!isValidEmail(email)) {
        throw new Error("Digite um e-mail válido.");
      }

      if (password.trim().length < 6) {
        throw new Error("Sua senha precisa ter pelo menos 6 caracteres.");
      }

      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const payload = await parseJsonResponse<{ success?: boolean; error?: string }>(response);

      if (response.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }

      throw new Error(payload.error ?? "Não foi possível validar o acesso admin.");
    } catch (submissionError) {
      clientLogError("ADMIN LOGIN FLOW ERROR", submissionError);
      setError(getFriendlyAuthErrorMessage(submissionError));
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <Card className="mx-auto max-w-xl rounded-[32px]">
        <div className="flex min-h-[240px] items-center justify-center text-sm text-white/64">Carregando...</div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl rounded-[32px]">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold">Entrar no painel administrativo</h1>
        <p className="text-sm text-white/64">Use suas credenciais de admin para acessar o ambiente administrativo.</p>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
          placeholder="admin@exemplo.com"
        />

        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
          placeholder="Sua senha"
        />

        <Button className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar no admin"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-white/60">
        Acesso de usuário comum?{" "}
        <Link href="/login" className="font-semibold text-primary">
          Ir para login normal
        </Link>
      </p>
    </Card>
  );
}
