"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigAlert } from "@/components/config-alert";
import { QuizForm } from "@/components/quiz-form";
import { Card, Container, PageShell } from "@/components/ui";
import { clientLogError } from "@/lib/client-logger";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ─── FAQ item ────────────────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080808]">
      <button
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <h3 className="text-[15px] font-bold">{question}</h3>
        <span
          className="shrink-0 text-xl text-primary transition-transform duration-200"
          style={{ transform: open ? "rotate(45deg)" : "none" }}
        >
          +
        </span>
      </button>
      {open && (
        <p className="px-6 pb-5 text-sm leading-7 text-white/60">{answer}</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const quizRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;

    async function checkUser() {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) setCheckingSession(false);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        if (session) {
          setHasSession(true);
          router.replace("/dashboard");
          return;
        }
      } catch (error) {
        clientLogError("SESSION CHECK ERROR", error);
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void checkUser();
    return () => { active = false; };
  }, [router]);

  function scrollToQuiz(e: React.MouseEvent) {
    e.preventDefault();
    quizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Config error ──
  if (!isSupabaseConfigured()) {
    return (
      <PageShell>
        <Container className="py-12">
          <ConfigAlert />
          <div className="mt-6 text-center">
            <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-primary/40 hover:bg-white/5 hover:text-white">
              Entrar
            </Link>
          </div>
        </Container>
      </PageShell>
    );
  }

  // ── Loading session ──
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

  // ── Landing page ──
  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#080808]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Hora do Treino">
            <Image
              src="https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png"
              alt="Hora do Treino"
              width={180}
              height={60}
              className="h-auto w-[130px] sm:w-[155px]"
              priority
              unoptimized
            />
          </Link>

          <ul className="hidden items-center gap-8 text-sm text-white/60 lg:flex">
            <li><a href="#como-funciona" className="transition hover:text-white">Como funciona</a></li>
            <li><a href="#funcionalidades" className="transition hover:text-white">Funcionalidades</a></li>
            <li><Link href="/premium" className="transition hover:text-white">Premium</Link></li>
            <li><a href="#faq" className="transition hover:text-white">FAQ</a></li>
          </ul>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Entrar
            </Link>
            <a
              href="#criar-treino"
              onClick={scrollToQuiz}
              className="inline-flex min-h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-black transition hover:bg-primaryStrong sm:px-5"
            >
              <span className="sm:hidden">Criar Treino</span>
              <span className="hidden sm:inline">Criar Treino</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        className="px-4 pb-6 pt-14 text-center sm:pt-20"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,197,94,0.15), transparent)" }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Treino personalizado com IA
          </div>

          <h1 className="mb-5 text-[clamp(2rem,7vw,4rem)] font-black leading-[1.08] tracking-tight">
            Seu <em className="not-italic text-primary">treino em casa</em>
            <br />personalizado em
            <br />poucos minutos
          </h1>

          <p className="mx-auto mb-8 max-w-xl text-[clamp(15px,2.5vw,18px)] leading-7 text-white/60">
            Responda algumas perguntas e receba um plano de{" "}
            <strong className="text-white/80">exercícios em casa</strong> adaptado ao seu
            objetivo, nível, tempo disponível e equipamentos.
          </p>

          <a
            href="#criar-treino"
            onClick={scrollToQuiz}
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-base font-bold text-black transition hover:bg-primaryStrong hover:-translate-y-0.5"
          >
            Criar Meu Treino
          </a>

          {/* Imagem colada logo abaixo do botão, sem contorno */}
          <div className="relative mx-auto mt-3 max-w-[260px] sm:max-w-[300px]">
            <Image
              src="https://horadotreino.com.br/wp-content/uploads/2026/04/app-treino-em-casa.webp"
              alt="App de treino em casa Hora do Treino — tela do treino personalizado"
              width={320}
              height={580}
              className="w-full rounded-3xl"
              priority
              unoptimized
            />
            <div className="absolute -bottom-3 -right-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-xs font-bold text-black shadow-[0_8px_24px_rgba(34,197,94,0.4)]">
              ✓ Treino gerado!
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS — fundo branco ── */}
      <section className="bg-white px-4 py-[70px]" aria-labelledby="pain-title">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Você se identifica?
            </div>
            <h2 id="pain-title" className="mb-3 text-[clamp(22px,5vw,38px)] font-black tracking-tight text-gray-900">
              Treinando no improviso?
            </h2>
            <p className="mx-auto max-w-md text-gray-500">
              Muita gente treina com esforço, mas sem direção. Isso muda agora.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "❓", title: "Você treina, mas não sabe se está fazendo o certo?", desc: "Sem orientação clara, o esforço pode não gerar os resultados que você espera." },
              { icon: "🤖", title: "Monta seus treinos com IA?", desc: "Recebe treinos sem direção, exercícios que não são para o seu nível e ainda precisa ficar pesquisando para saber como faz." },
              { icon: "🎯", title: "Não sabe quais exercícios combinam com seu objetivo?", desc: "Cada meta exige uma abordagem diferente. Sem isso, você pode estar treinando ao contrário." },
              { icon: "📊", title: "Falta organização para evoluir?", desc: "Sem estrutura, fica difícil medir progresso e manter a consistência ao longo do tempo." },
            ].map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-6 transition hover:border-primary/30 hover:shadow-sm"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                  {card.icon}
                </div>
                <h3 className="mb-2 text-[15px] font-bold leading-snug text-gray-900">{card.title}</h3>
                <p className="text-sm leading-6 text-gray-500">{card.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="como-funciona" className="bg-[#111] px-4 py-[70px]" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Como funciona
              </div>
              <h2 id="how-title" className="mb-4 text-[clamp(22px,5vw,38px)] font-black tracking-tight">
                O app de treino que monta tudo por você
              </h2>
              <p className="text-white/60">
                Chega de pegar treino aleatório. Em poucos minutos, você tem um plano de{" "}
                <strong className="text-white/80">exercícios em casa</strong> alinhado ao seu objetivo, nível e realidade.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {[
                { n: "1", title: "Responda seu perfil", desc: "Informe seu objetivo, nível de condicionamento, equipamentos disponíveis e tempo que você tem." },
                { n: "2", title: "Receba seu treino personalizado", desc: "O app monta um treino completo por dia, com exercícios, séries, repetições e descanso." },
                { n: "3", title: "Treine com clareza e veja resultado", desc: "Siga com confiança, acompanhe sua evolução e ajuste conforme avança. Sem improviso." },
              ].map((step) => (
                <div key={step.n} className="flex gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-black text-black">
                    {step.n}
                  </div>
                  <div>
                    <h3 className="mb-1 text-[17px] font-bold">{step.title}</h3>
                    <p className="text-sm leading-6 text-white/60">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── QUIZ ── */}
      <section
        ref={quizRef}
        id="criar-treino"
        className="px-4 py-[70px]"
        aria-labelledby="quiz-title"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.1), transparent)" }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Gratuito · Sem cartão
            </div>
            <h2 id="quiz-title" className="mb-3 text-[clamp(22px,5vw,38px)] font-black tracking-tight">
              Crie seu <span className="text-primary">treino em casa</span> grátis agora
            </h2>
            <p className="text-white/60">
              Leva menos de 2 minutos. Seu treino personalizado fica pronto na hora.
            </p>
          </div>

          <QuizForm />

          <p className="mt-5 text-center text-sm text-white/50">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-semibold text-primary transition hover:text-primaryStrong">
              Entrar
            </Link>
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="funcionalidades" className="bg-white px-4 py-[70px]" aria-labelledby="features-title">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              O que você encontra
            </div>
            <h2 id="features-title" className="mb-3 text-[clamp(22px,5vw,38px)] font-black tracking-tight text-gray-900">
              Tudo que você precisa para{" "}
              <span className="text-primary">exercícios em casa</span> de verdade
            </h2>
            <p className="mx-auto max-w-lg text-gray-500">
              Módulos projetados para hipertrofia, emagrecimento ou condicionamento — com clareza do primeiro ao último exercício.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "🤖", title: "Treino com apoio de IA", desc: "Tecnologia que adapta o treino ao seu perfil, objetivo e disponibilidade.", highlight: true },
              { icon: "📅", title: "Exercícios por dia", desc: "Treino organizado por dia da semana, com estrutura clara e fácil de seguir." },
              { icon: "⏱️", title: "Cronômetro para o seu treino", desc: "Controle o tempo de descanso e o volume de carga para evoluir a cada sessão." },
              { icon: "🔄", title: "Substituição de exercício", desc: "Não tem o aparelho, achou fácil ou difícil demais? Faça a substituição inteligente na hora." },
              { icon: "🎯", title: "Todos os objetivos", desc: "Hipertrofia, emagrecimento, definição e condicionamento físico." },
              { icon: "📈", title: "Evolução e conquistas", desc: "Acompanhe seu progresso, bata metas e celebre cada conquista." },
              { icon: "🎓", title: "Conteúdo educativo", desc: "Aprenda sobre treino, nutrição e hábitos com conteúdos da Hora do Treino." },
              { icon: "🆓", title: "Gratuito e Premium", desc: "Comece grátis e desbloqueie recursos avançados quando quiser evoluir mais." },
            ].map((card) => (
              <article
                key={card.title}
                className={`rounded-2xl border p-5 transition ${
                  card.highlight
                    ? "border-primary bg-primary text-black"
                    : "border-gray-100 bg-gray-50 hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                <div className="mb-3 text-2xl">{card.icon}</div>
                <h3 className={`mb-1.5 text-[15px] font-bold ${card.highlight ? "" : "text-gray-900"}`}>{card.title}</h3>
                <p className={`text-sm leading-5 ${card.highlight ? "text-black/70" : "text-gray-500"}`}>
                  {card.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-[#111] px-4 py-[70px]" aria-labelledby="faq-title">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Dúvidas frequentes
            </div>
            <h2 id="faq-title" className="text-[clamp(22px,5vw,38px)] font-black tracking-tight">
              Perguntas sobre treino em casa
            </h2>
          </div>

          <div className="mx-auto max-w-2xl space-y-3">
            <FaqItem question="Preciso de equipamentos para treinar em casa?" answer="Não! O app cria treinos 100% adaptados ao que você tem disponível. Pode ser sem nenhum equipamento, apenas com seu corpo, ou utilizando o que você já tem em casa." />
            <FaqItem question="O app de treino é realmente gratuito?" answer="Sim! Você pode criar seu treino personalizado e começar a treinar em casa completamente grátis. O plano Premium oferece funcionalidades avançadas para quem quer ir mais fundo na evolução." />
            <FaqItem question="Funciona para iniciantes em exercícios em casa?" answer="Com certeza. O app pergunta seu nível de condicionamento e monta um treino adequado para você. Iniciantes recebem planos progressivos, seguros e eficazes." />
            <FaqItem question="Consigo resultado treinando em casa sem academia?" answer="Sim! Com um treino bem estruturado e consistência, o treino em casa pode ser tão eficaz quanto a academia. O segredo está em seguir um plano pensado para você — e é exatamente isso que o Hora do Treino faz." />
            <FaqItem question="Quanto tempo por dia preciso treinar?" answer="Você informa quanto tempo tem disponível e o app adapta o treino a isso. Você pode treinar de 20 a 60 minutos — o que couber na sua rotina." />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section
        className="px-4 py-[70px] text-center"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(34,197,94,0.12), transparent)" }}
        aria-labelledby="final-cta-title"
      >
        <div className="mx-auto max-w-2xl">
          <h2 id="final-cta-title" className="mb-4 text-[clamp(26px,6vw,46px)] font-black tracking-tight">
            Chega de improvisar.<br />
            <span className="text-primary">Comece hoje.</span>
          </h2>
          <p className="mb-8 text-white/60">
            Seu treino em casa personalizado está a 2 minutos de distância.
          </p>
          <a
            href="#criar-treino"
            onClick={scrollToQuiz}
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-base font-bold text-black transition hover:bg-primaryStrong hover:-translate-y-0.5"
          >
            Criar Meu Treino
          </a>
        </div>
      </section>

    </div>
  );
}
