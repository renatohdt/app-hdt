"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandFooter } from "@/components/brand-footer";
import { clientLogError } from "@/lib/client-logger";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// Chave usada para guardar o cupom de indicação no navegador até o cadastro.
// O QuizForm (tela /criar-conta) lê essa mesma chave.
const REFERRAL_STORAGE_KEY = "hdt_referral_code";

export default function HomePage() {
  const router = useRouter();
  const [referralCode, setReferralCode] = useState("");

  // Captura o ?ref= do link de indicação. Quem compartilha manda
  // https://app.horadotreino.com.br?ref=HDT-XXXX e a pessoa cai aqui na home.
  // Guardamos o código para ele "sobreviver" até a tela de criar conta.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    const cleaned = (fromUrl ?? "").trim().toUpperCase().slice(0, 8);

    if (cleaned) {
      setReferralCode(cleaned);
      try {
        window.localStorage.setItem(REFERRAL_STORAGE_KEY, cleaned);
      } catch {
        // Se o navegador bloquear o localStorage, ainda repassamos o código pelo link.
      }
      return;
    }

    // Sem ?ref= na URL: reaproveita um código guardado de uma visita anterior.
    try {
      const stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (stored) setReferralCode(stored);
    } catch {
      // ignora
    }
  }, []);

  // Repassa o cupom para a tela de cadastro pela própria URL.
  const criarContaHref = referralCode
    ? `/criar-conta?ref=${encodeURIComponent(referralCode)}`
    : "/criar-conta";

  // Se a pessoa já estiver logada, vai direto para o app (mantém o comportamento antigo).
  useEffect(() => {
    let active = true;

    async function checkUser() {
      if (!isSupabaseConfigured() || !supabase) return;
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!active) return;
        if (session) router.replace("/dashboard");
      } catch (error) {
        clientLogError("SESSION CHECK ERROR", error);
      }
    }

    void checkUser();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-between overflow-hidden bg-[#050705] px-6 py-10 text-white">
      {/* Brilho verde da marca (decorativo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(34,197,94,0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(34,197,94,0.08),transparent_70%)]"
      />

      {/* Espaçador do topo para equilibrar a centralização */}
      <div aria-hidden className="h-4 w-full" />

      {/* Miolo: logo em destaque + frase curta */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <Image
          src="/logo-app.png"
          alt="Hora do Treino"
          width={300}
          height={300}
          priority
          className="w-48 max-w-[62vw] drop-shadow-[0_0_40px_rgba(34,197,94,0.25)] sm:w-56"
        />
        <h1 className="mt-8 text-[clamp(26px,7vw,40px)] font-black leading-[1.1] tracking-tight">
          Seu <span className="text-primary">treino em casa</span>
          <br />
          começa aqui
        </h1>
        <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/60">
          Plano personalizado, montado por IA, no seu ritmo.
        </p>
      </div>

      {/* Ações principais — Entrar em destaque (maioria já tem conta) */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="space-y-3">
          <Link
            href="/login"
            className="flex h-14 w-full items-center justify-center rounded-full bg-primary text-[16px] font-bold text-[#04210f] shadow-[0_10px_30px_rgba(34,197,94,0.3)] transition active:scale-[0.98]"
          >
            Entrar
          </Link>
          <Link
            href={criarContaHref}
            className="flex h-14 w-full items-center justify-center rounded-full border border-white/15 bg-white/5 text-[16px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            Criar conta
          </Link>
        </div>

        {/* Rodapé discreto: redes sociais + dados da empresa */}
        <BrandFooter className="mt-9" />
      </div>
    </main>
  );
}
