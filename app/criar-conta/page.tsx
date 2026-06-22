import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandFooter } from "@/components/brand-footer";
import { ConfigAlert } from "@/components/config-alert";
import { QuizForm } from "@/components/quiz-form";
import { PageShell } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Crie sua conta | Hora do Treino",
  description:
    "Responda algumas perguntas e receba seu treino em casa personalizado montado por IA. Comece grátis, sem cartão.",
  robots: {
    index: false,
    follow: false
  }
};

export default function CriarContaPage() {
  return (
    <PageShell className="py-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        {/* Cabeçalho estilo app: logo + chamada curta */}
        <header className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Hora do Treino — página inicial" className="mb-6 inline-flex">
            <Image
              src="/logo-branco.png"
              alt="Hora do Treino"
              width={160}
              height={42}
              priority
              className="h-9 w-auto"
            />
          </Link>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Gratuito · Sem cartão
          </div>

          <h1 className="text-[clamp(24px,5vw,34px)] font-black leading-tight tracking-tight text-white">
            Crie seu <span className="text-primary">treino em casa</span> grátis
          </h1>
          <p className="mt-2 max-w-md text-sm text-white/60">
            Leva menos de 2 minutos. Seu treino personalizado fica pronto na hora.
          </p>
        </header>

        {isSupabaseConfigured() ? <QuizForm /> : <ConfigAlert />}

        <p className="mt-5 text-center text-sm text-white/50">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-semibold text-primary transition hover:text-primaryStrong">
            Entrar
          </Link>
        </p>

        <BrandFooter className="mt-10" />
      </div>
    </PageShell>
  );
}
