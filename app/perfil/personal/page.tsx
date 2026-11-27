"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

// "Quem é o seu personal" — apresenta o Renato e o método por trás do app.
// Acesso pelo Perfil.

const SOCIALS = [
  { label: "Instagram", href: "https://instagram.com/horadotreino_oficial" },
  { label: "TikTok", href: "https://www.tiktok.com/@horadotreinooficial" },
  { label: "YouTube", href: "https://www.youtube.com/@HoradoTreino" }
];


export default function PersonalPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-xl space-y-5 pb-6">
        {/* Foto do estúdio indo até o topo da tela, com o "voltar" por cima */}
        <div className="relative -mx-4 -mt-[calc(0.9rem+var(--app-safe-top))] sm:mx-0 sm:-mt-[calc(1.15rem+var(--app-safe-top))]">
          <img
            src="/images/renato-estudio-v4.webp"
            alt="Renato Santiago no estúdio do Hora do Treino"
            className="w-full"
            style={{
              WebkitMaskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
              maskImage: "linear-gradient(180deg, #000 55%, transparent 100%)"
            }}
          />
          <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
          <Link
            href="/perfil"
            className="absolute left-3 top-[calc(0.6rem+var(--app-safe-top))] inline-flex min-h-11 items-center gap-1 rounded-full bg-black/35 px-3 text-sm font-semibold text-white/85 backdrop-blur-sm transition hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Perfil
          </Link>
        </div>

        <div className="relative z-10 -mt-24 space-y-4">
          <p className="text-xl font-bold leading-snug text-white">
            Prazer, eu sou o <span className="text-primary">Renato Santiago</span>, personal trainer há 15 anos.
          </p>
          <div className="space-y-3 text-[15px] leading-7 text-white/78">
            <p>
              Criei o Hora do Treino porque via muita gente se esforçando de verdade e, mesmo assim, treinando no escuro:
              exercício aleatório, treino genérico e nenhuma certeza de resultado.
            </p>
            <p>
              No app está a mesma lógica que uso com meus alunos: um plano coerente com o seu objetivo, o seu nível e o seu
              tempo. A IA personaliza e acelera, mas o método é meu, e ele segue evoluindo com quem treina todo dia.
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-bold text-white">Renato Santiago</p>
          <p className="text-xs text-white/50">Personal Trainer · CREF 0859033-G/SP</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-full border border-white/12 px-4 text-xs font-semibold text-white/80 transition hover:border-primary/50 hover:text-white"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
