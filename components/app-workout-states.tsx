"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";

export function AppLoadingScreen({ title = "Carregando seu app" }: { title?: string }) {
  return (
    <AppShell>
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/10 text-primary">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>

        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-primary/90">Hora do Treino</p>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-white/58">Estamos organizando sua experiencia mobile e preparando o plano atual.</p>
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
