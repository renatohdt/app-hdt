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

          <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div className="space-y-5 text-center lg:pt-10 lg:text-left">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Treino personalizado para fazer em casa, com método, estratégia e inteligência artificial.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
                Responda ao formulário e receba um plano de treino criado com base no seu objetivo, rotina, nível de
                experiência e limitações. Nada de treino genérico. Aqui você recebe uma estrutura pensada para a sua
                realidade, para evoluir com mais segurança, consistência e resultado.
              </p>
              <div className="max-w-2xl space-y-4 text-sm leading-6 text-white/64 sm:text-base sm:leading-7">
                <p>
                  Nosso método combina a lógica de um personal trainer com a agilidade da inteligência artificial para
                  montar treinos mais inteligentes, organizados e adaptados ao que você realmente precisa. Seja para
                  emagrecer, ganhar massa muscular, definir o corpo ou melhorar o condicionamento, o plano é
                  construído para funcionar na prática, dentro da sua rotina e com foco em treino em casa.
                </p>
                <p className="hidden sm:block">
                  Treinar em casa não precisa significar improviso. Quando existe método, progressão e personalização,
                  o treino deixa de ser aleatório e passa a ter direção. É isso que aumenta a chance de manter
                  constância, evitar erros e alcançar resultado de verdade.
                </p>
              </div>
              <p className="max-w-2xl pt-1 text-sm font-medium text-white/84">
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

