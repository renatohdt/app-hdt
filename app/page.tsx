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

// Script inline (sem dependências) que detecta a sessão salva do Supabase
// (chave "sb-<projeto>-auth-token" no localStorage) antes do React carregar.
const SESSION_REDIRECT_SCRIPT = `(function(){try{
  if (new URLSearchParams(location.search).get("ref")) return;
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i) || "";
    if (k.indexOf("sb-") === 0 && k.slice(-11) === "-auth-token" && localStorage.getItem(k)) {
      document.documentElement.setAttribute("data-hdt-session", "1");
      location.replace("/dashboard");
      return;
    }
  }
}catch(e){}})();`;

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
        if (session) {
          router.replace("/dashboard");
        } else {
          // Token salvo era inválido/vencido: volta a mostrar Entrar/Criar conta.
          document.documentElement.removeAttribute("data-hdt-session");
        }
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
    <>
      {/*
        Abertura rápida: roda ANTES do React carregar. Se já existe sessão salva
        do Supabase neste aparelho, marca a página e vai direto para a dashboard,
        sem desenhar os botões Entrar/Criar conta (evita o "flash" de login).
        Se a sessão estiver vencida, a dashboard manda para /login normalmente.
      */}
      <style>{`html[data-hdt-session] .hdt-welcome{display:none!important}.hdt-splash{display:none}html[data-hdt-session] .hdt-splash{display:flex}`}</style>
      <script dangerouslySetInnerHTML={{ __html: SESSION_REDIRECT_SCRIPT }} />
      <div className="hdt-splash fixed inset-0 z-50 items-center justify-center bg-[#050705]">
        <Image src="/logo-app.png" alt="Hora do Treino" width={300} height={300} priority className="w-40 max-w-[50vw] animate-pulse" />
      </div>
    <main className="hdt-welcome relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-between overflow-hidden bg-[#050705] px-6 py-10 text-white">
      {/* Foto do Renato ao fundo (já com luz verde e fundo escuro na própria imagem) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-12 flex h-[78%] justify-center [@media(max-height:820px)]:top-0 [@media(max-height:820px)]:h-[62%]">
        <img
          src="/images/login-renato-epica.webp"
          alt=""
          className="h-full w-full max-w-[640px] object-cover object-top"
          style={{
            WebkitMaskImage: "radial-gradient(ellipse 75% 85% at 50% 35%, #000 55%, transparent 100%)",
            maskImage: "radial-gradient(ellipse 75% 85% at 50% 35%, #000 55%, transparent 100%)"
          }}
        />
      </div>
      {/* Escurece a foto de baixo para cima, para o texto e os botões ficarem legíveis */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,5,0.5)_0%,rgba(5,7,5,0.35)_28%,rgba(5,7,5,0.85)_50%,#050705_64%)]"
      />
      {/* Leve brilho verde da marca embaixo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(34,197,94,0.08),transparent_70%)]"
      />

      {/* Telas baixas: não há espaço para o logo grande sem cobrir o rosto,
          então ele vai pequeno para o canto de cima. */}
      <Image
        src="/logo-app.png"
        alt=""
        aria-hidden
        width={300}
        height={300}
        className="absolute left-5 top-5 z-10 hidden w-14 drop-shadow-[0_0_20px_rgba(0,0,0,0.6)] [@media(max-height:820px)]:block"
      />

      {/* Espaço para a foto aparecer */}
      <div aria-hidden className="flex-1" />

      {/* Logo em destaque + frase curta, logo acima dos botões */}
      <div className="relative z-10 mb-7 flex w-full max-w-sm flex-col items-center text-center">
        <Image
          src="/logo-app.png"
          alt="Hora do Treino"
          width={300}
          height={300}
          priority
          className="w-36 max-w-[42vw] drop-shadow-[0_0_40px_rgba(34,197,94,0.3)] [@media(max-height:820px)]:hidden"
        />
        <h1 className="mt-5 text-balance text-[clamp(26px,7vw,40px)] font-black leading-[1.1] tracking-tight">
          Seu <span className="text-primary">treino onde você estiver</span>
          <br />
          começa aqui
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-balance text-[15px] leading-relaxed text-white/70">
          Eu criei o método. A IA monta seu treino. Você conquista o resultado.
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
    </>
  );
}
