"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigAlert } from "@/components/config-alert";
import { QuizForm } from "@/components/quiz-form";
import { Card, Container, PageShell } from "@/components/ui";
import { clientLogError } from "@/lib/client-logger";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkUser() {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) {
          setCheckingSession(false);
        }
        return;
      }

      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session) {
          setHasSession(true);
          router.replace("/dashboard");
          return;
        }
      } catch (error) {
        clientLogError("SESSION CHECK ERROR", error);
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkUser();

    return () => {
      active = false;
    };
  }, [router]);

  if (!isSupabaseConfigured()) {
    return (
      <PageShell>
        <Container className="py-12">
          <ConfigAlert />
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-primary/40 hover:bg-white/5 hover:text-white"
            >
              Entrar
            </Link>
          </div>
        </Container>
      </PageShell>
    );
  }

  if (checkingSession) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-3xl">
            <div className="flex min-h-[280px] items-center justify-center text-sm text-white/64">
              Carregando...
            </div>
          </Card>
        </Container>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Container className="flex min-h-screen flex-col justify-between py-4 sm:py-6">
        <div className="space-y-8">
          <header className="flex items-center justify-between gap-4">
            <div className="flex justify-center lg:justify-start">
              <Image
                src="https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png"
                alt="Hora do Treino"
                width={220}
                height={72}
                className="h-auto w-[160px] sm:w-[190px] lg:w-[220px]"
                priority
                unoptimized
              />
            </div>

            <Link
              href={hasSession ? "/dashboard" : "/login"}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/82 transition hover:border-primary/40 hover:bg-white/5 hover:text-white sm:min-h-11 sm:px-5"
            >
              {hasSession ? "Ir para meu treino" : "Entrar"}
            </Link>
          </header>

          <section className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-10">
            <div className="mx-auto flex w-full max-w-[20.5rem] flex-col items-center space-y-4 px-1 text-center sm:max-w-[28rem] sm:px-0 lg:mx-0 lg:max-w-[34rem] lg:items-start lg:pt-7 lg:text-left">
              <div className="space-y-3">
                <h1 className="mx-auto max-w-[11.5ch] text-[clamp(1.95rem,7.4vw,4.35rem)] font-semibold leading-[1.05] tracking-tight text-white lg:mx-0 lg:max-w-[12ch] lg:leading-[1.02]">
                  Sua sugestão de treino para fazer em casa.
                </h1>
                <p className="mx-auto max-w-[19rem] text-[1.02rem] font-medium leading-6 text-white/82 sm:max-w-[26rem] sm:text-[1.2rem] sm:leading-7 lg:mx-0 lg:max-w-[30rem] lg:text-[1.35rem] lg:leading-8">
                  Sugerido com inteligência artificial e lógica de personal trainer.
                </p>
              </div>

              <p className="mx-auto max-w-[19.5rem] text-sm leading-6 text-white/66 sm:max-w-[26rem] sm:text-base sm:leading-7 lg:mx-0 lg:max-w-[30rem]">
                Responda ao formulário e receba grátis sua sugestão inicial de treino, criada de acordo com seu objetivo,
                rotina e nível.
              </p>

              <p className="mx-auto max-w-[18.5rem] pt-0.5 text-[13px] font-medium leading-5 text-white/48 sm:max-w-[24rem] sm:text-[15px] sm:leading-6 lg:mx-0 lg:max-w-[28rem] lg:pt-1">
                Método desenvolvido por Renato Santiago, Personal Trainer.
              </p>
            </div>

            <div className="lg:sticky lg:top-6">
              <QuizForm />
              <div className="mt-4 text-center text-sm text-white/60">
                Já tem uma conta?{" "}
                <Link href="/login" className="font-semibold text-primary transition hover:text-primaryStrong">
                  Entrar
                </Link>
              </div>
            </div>
          </section>
        </div>
      </Container>
    </PageShell>
  );
}

