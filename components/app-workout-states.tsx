"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Sparkles } from "lucide-react";
import clsx from "clsx";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";

const LOADING_EMOJIS = ["🏋️‍♂️", "🤸‍♂️", "🚴‍♂️", "🤾‍♂️", "🏃‍♂️", "💪"];

const LOADING_TITLES = [
  "Aguarde...",
  "Já vai, já vai!",
  "Trabalhando",
  "Um segundo...",
  "Quase lá...",
];

const LOADING_SUBTEXTS = [
  "O bom do app ser lento é que você pode descansar mais",
  "A IA está por trás, mas a velocidade de raciocínio é igual à do personal que criou",
  "O app poderia ser mais rápido se o personal trabalhasse mais ao invés de treinar tanto",
  "Enquanto isso, aproveita e faz um alongamento",
  "Carregando na velocidade de 1 burpee por segundo",
  "Pior que treino de perna? Esse carregamento — mas você aguenta",
  "A IA tá calculando. O personal tá na academia. Alguém tem que trabalhar aqui",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AppLoadingScreen({ title: _title }: { title?: string } = {}) {
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [title, setTitle] = useState(LOADING_TITLES[0]);
  const [subtext, setSubtext] = useState(LOADING_SUBTEXTS[0]);

  useEffect(() => {
    setTitle(pickRandom(LOADING_TITLES));
    setSubtext(pickRandom(LOADING_SUBTEXTS));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setEmojiIndex((i) => (i + 1) % LOADING_EMOJIS.length);
        setVisible(true);
      }, 200);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell>
      <Card className="space-y-5 p-5 sm:p-6">
        <div
          className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/10 text-3xl transition-all duration-200"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.7)" }}
        >
          {LOADING_EMOJIS[emojiIndex]}
        </div>

        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-primary/90">Hora do Treino</p>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-white/58">{subtext}</p>
        </div>
      </Card>
    </AppShell>
  );
}

export function AppWorkoutUnavailableScreen({
  error,
  generatingWorkout,
  onGenerateWorkoutNow,
  autoRedirect = true
}: {
  error?: string | null;
  generatingWorkout: boolean;
  onGenerateWorkoutNow: () => Promise<void>;
  autoRedirect?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoRedirect) {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.push("/perfil");
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [autoRedirect, router]);

  return (
    <AppShell>
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/12 bg-white/[0.04] text-primary">
          <AlertCircle className="h-5 w-5" />
        </div>

        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-primary/90">Plano ainda não pronto</p>
          <h1 className="text-2xl font-semibold text-white">Precisamos revisar seus dados antes de seguir</h1>
          <p className="text-sm text-white/58">
            Ajuste o perfil ou gere uma nova sugestão para liberar a nova home e a tela de treino.
          </p>
        </div>

        {error ? (
          <div className="rounded-[22px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid gap-3">
          <Button variant="secondary" onClick={() => router.push("/perfil")}>
            Ajustar meu perfil
          </Button>
          <Button onClick={() => void onGenerateWorkoutNow()} disabled={generatingWorkout}>
            {generatingWorkout ? "Gerando sugestão..." : "Gerar sugestão agora"}
          </Button>
        </div>

        <div className="rounded-[22px] border border-primary/15 bg-primary/8 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-primary/15 bg-primary/12 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                {autoRedirect ? "Redirecionamento automático" : "Ajuste manualmente se precisar"}
              </p>
              <p className="text-sm text-white/58">
                {autoRedirect
                  ? "Se preferir, você será levado ao perfil em alguns segundos."
                  : "Você pode revisar seus dados ou tentar gerar o plano novamente quando quiser."}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Componente auxiliar de bloco skeleton
// ---------------------------------------------------------------------------

function Sk({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-white/[0.08]", className)} />;
}

// ---------------------------------------------------------------------------
// Skeleton da Home (Dashboard)
// ---------------------------------------------------------------------------

export function DashboardLoadingScreen() {
  return (
    <AppShell className="space-y-4">
      {/* Hero card */}
      <Card className="space-y-5 rounded-[24px] border-white/[0.06] p-5">
        <Sk className="mx-auto h-6 w-36" />
        <div className="space-y-3 text-center">
          <Sk className="mx-auto h-6 w-40" />
          <Sk className="mx-auto h-4 w-64" />
          <Sk className="mx-auto h-4 w-52" />
        </div>
        <Sk className="h-12 w-full rounded-[16px]" />
      </Card>

      {/* Evolucao */}
      <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px]">
        <Sk className="h-4 w-28" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-[88px] flex-col justify-between rounded-[15px] border border-white/[0.05] bg-black/18 p-[14px]">
              <Sk className="h-4 w-4" />
              <div className="space-y-1.5">
                <Sk className="h-5 w-10" />
                <Sk className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ciclo do plano */}
      <Card className="space-y-3 rounded-[24px] border-white/[0.06] p-[18px]">
        <Sk className="h-3 w-24" />
        <Sk className="h-6 w-32" />
        <Sk className="h-4 w-full" />
        <Sk className="h-4 w-4/5" />
        <Sk className="h-2 w-full rounded-full" />
      </Card>

      {/* Acoes */}
      <Card className="space-y-4 rounded-[24px] border-white/[0.06] p-[18px]">
        <div className="space-y-2">
          <Sk className="h-3 w-16" />
          <Sk className="h-5 w-56" />
          <Sk className="h-4 w-full" />
          <Sk className="h-4 w-3/4" />
        </div>
        <Sk className="h-11 w-full rounded-[14px]" />
      </Card>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Skeleton da tela de Treino
// ---------------------------------------------------------------------------

export function TreinoLoadingScreen() {
  return (
    <AppShell className="space-y-4">
      {/* Header do treino */}
      <Card className="space-y-4 rounded-[24px] border-white/[0.06] p-5">
        <div className="space-y-2">
          <Sk className="h-3 w-20" />
          <Sk className="h-7 w-48" />
          <Sk className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Sk className="h-8 w-24 rounded-full" />
          <Sk className="h-8 w-24 rounded-full" />
        </div>
      </Card>

      {/* Cards de exercicios */}
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="space-y-3 rounded-[24px] border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <Sk className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-40" />
              <Sk className="h-3 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Sk className="h-14 rounded-xl" />
            <Sk className="h-14 rounded-xl" />
            <Sk className="h-14 rounded-xl" />
          </div>
        </Card>
      ))}
    </AppShell>
  );
}
