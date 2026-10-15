"use client";

// Fluxo ÚNICO de "Gerar novo programa".
// Usado na tela de Treino (botão discreto) e no Perfil (ao salvar Dados de Treino
// com mudanças). Concentra as regras num lugar só:
//  - Free: 1 programa novo a cada 30 dias; no app (AdMob) passa por um vídeo.
//    Dentro dos 30 dias: oferece Premium ou vídeo para liberar agora.
//  - Premium: livre, e gera um programa para CADA local marcado.
//  - Mostra a tela "Montando seu treino" enquanto a IA trabalha.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { RewardedAdButton, useAdMobAvailable } from "@/components/RewardedAdButton";
import { useConsentPreferences } from "@/components/consent-provider";
import { useSubscription } from "@/components/use-subscription";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { preloadRewardedAd, showRewardedAd } from "@/lib/admob";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";

export type RegenerateReason = "manual" | "profile_changed";

type Step = "confirm" | "limit" | "generating";

const FREE_REGENERATION_DAYS = 30;

export function RegenerateProgramFlow({
  userId,
  goal,
  activeLocation,
  markedLocations,
  lastWorkoutGeneratedAt,
  reason = "manual",
  source,
  onClose,
  onGenerated
}: {
  userId: string;
  goal?: string | null;
  activeLocation?: string | null;
  markedLocations?: string[] | null;
  // undefined = não sabemos (cache antigo): o componente busca em /api/profile.
  lastWorkoutGeneratedAt?: string | null;
  reason?: RegenerateReason;
  // Identifica de onde veio (analytics): "training_button", "profile_save"...
  source: string;
  onClose: () => void;
  // Chamado depois que o programa novo foi salvo (recarregar treino, navegar...).
  onGenerated: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const isPremium = Boolean(subscription?.isPremium);
  const adMobAvailable = useAdMobAvailable();
  const { preferences: consentPreferences } = useConsentPreferences();
  const requiresVideo = !isPremium && adMobAvailable;

  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null | undefined>(lastWorkoutGeneratedAt);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const animFrameRef = useRef(0);
  const generatingRef = useRef(false);

  // Data da última geração (regra dos 30 dias do free).
  useEffect(() => {
    if (lastGeneratedAt !== undefined) return;
    fetchWithAuth("/api/profile")
      .then((res) => res.json())
      .then((payload: { data?: { lastWorkoutGeneratedAt?: string | null } }) => {
        setLastGeneratedAt(payload?.data?.lastWorkoutGeneratedAt ?? null);
      })
      .catch(() => setLastGeneratedAt(null));
  }, [lastGeneratedAt]);

  const daysLeft = daysUntilNextFreeGeneration(lastGeneratedAt);

  // Decide a primeira tela quando assinatura e data já carregaram.
  useEffect(() => {
    if (step !== null || subscriptionLoading || lastGeneratedAt === undefined) return;
    setStep(!isPremium && daysLeft > 0 ? "limit" : "confirm");
  }, [step, subscriptionLoading, lastGeneratedAt, isPremium, daysLeft]);

  // Começa a baixar o vídeo assim que a confirmação aparece.
  useEffect(() => {
    if (step === "confirm" && requiresVideo) void preloadRewardedAd(consentPreferences.ads);
  }, [step, requiresVideo, consentPreferences.ads]);

  // Barra de progresso estimada durante a montagem.
  useEffect(() => {
    if (step !== "generating") {
      window.cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const startTime = window.performance.now();
    setProgress(LOADING_INITIAL);
    const animate = () => {
      const next = getLoadingProgress(window.performance.now() - startTime);
      setProgress((current) => (next > current ? next : current));
      animFrameRef.current = window.requestAnimationFrame(animate);
    };
    animFrameRef.current = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animFrameRef.current);
  }, [step]);

  async function generate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setError(null);
    setStep("generating");

    try {
      // Premium com mais de um local marcado gera um programa para CADA local.
      // O local ativo vai por último, para continuar ativo no fim.
      const active = activeLocation ?? "home";
      const marked =
        isPremium && Array.isArray(markedLocations) && markedLocations.length
          ? Array.from(new Set<string>([...markedLocations, active]))
          : [active];
      const ordered = [...marked.filter((loc) => loc !== active), active];

      for (const loc of ordered) {
        const response = await fetchWithAuth("/api/workout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, force: true, location: loc })
        });
        const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);
        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível gerar seu treino agora.");
        }
      }

      trackEvent("workout_generated", userId, { goal: goal ?? null, source });
      setProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      invalidateWorkoutCache();
      await onGenerated();
      onClose();
    } catch (err) {
      generatingRef.current = false;
      setError(getRequestErrorMessage(err, "Não foi possível gerar seu treino agora."));
      setStep("confirm");
    }
  }

  async function generateWithVideo() {
    if (loadingVideo || generatingRef.current) return;
    setLoadingVideo(true);
    // O programa começa a ser gerado JUNTO com o vídeo: quando o vídeo termina,
    // o treino novo já está pronto (ou quase).
    const generation = generate();
    await showRewardedAd("generate_program", consentPreferences.ads);
    setLoadingVideo(false);
    await generation;
  }

  if (step === null) return null;

  if (step === "generating") {
    return <GeneratingScreen progress={progress} />;
  }

  const isProfileChange = reason === "profile_changed";

  if (step === "limit") {
    return (
      <Sheet>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12">
          <RefreshCw className="h-5 w-5 text-primary" />
        </div>
        <p className="mb-1 text-base font-semibold text-white">
          {isProfileChange ? "Dados salvos!" : "Gerar novo programa de treino?"}
        </p>
        <p className="mb-1 text-sm leading-5 text-white/56">
          {isProfileChange
            ? "No plano gratuito, um programa novo com esses dados fica disponível em "
            : "Essa função estará disponível novamente em "}
          <strong className="text-white/80">
            {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
          </strong>
          .
        </p>
        <p className="mb-5 text-sm leading-5 text-white/56">Assine o Premium e gere programas livremente.</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              trackEvent("cta_click", userId, { source: `regenerate_limit_${source}` });
              onClose();
              router.push("/premium");
            }}
            className="flex h-12 w-full items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110"
          >
            Assinar o Premium
          </button>
          {/* Só no app com AdMob: libera gerar agora em troca de um vídeo */}
          <RewardedAdButton purpose="generate_workout" label="Assistir um vídeo e gerar agora" onRewarded={() => void generate()} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
          >
            {isProfileChange ? "Agora não" : "Fechar"}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12">
        <RefreshCw className="h-5 w-5 text-primary" />
      </div>
      <p className="mb-1 text-base font-semibold text-white">
        {isProfileChange ? "Seus dados de treino mudaram" : "Gerar novo programa?"}
      </p>
      <p className="mb-5 text-sm leading-5 text-white/56">
        {isProfileChange ? "Quer um programa novo montado com eles? " : null}
        Seu programa atual será substituído e{" "}
        <strong className="text-white/80">as sessões registradas serão reiniciadas</strong>. Não dá para desfazer.
        {isProfileChange ? null : " Use quando mudar seus dados de treino (objetivo, local, equipamentos, tempo...)."}
      </p>
      {error ? (
        <p className="mb-4 rounded-[14px] border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void (requiresVideo ? generateWithVideo() : generate())}
          disabled={loadingVideo}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {requiresVideo ? (
            loadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />
          ) : null}
          {requiresVideo
            ? loadingVideo
              ? "Carregando vídeo..."
              : "Ver vídeo e gerar novo programa"
            : "Gerar novo programa"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl px-4 py-2.5 text-sm font-medium text-white/54 transition hover:text-white/80"
        >
          {isProfileChange ? "Manter o atual" : "Cancelar"}
        </button>
      </div>
    </Sheet>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-2xl">{children}</div>
    </div>
  );
}

// Tela cheia "Montando seu treino" (mesmo visual que existia na dashboard).
function GeneratingScreen({ progress }: { progress: number }) {
  const rounded = Math.round(progress);
  const stageIndex = getLoadingStageIndex(rounded);
  return (
    <div data-hide-admob className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A0A0A] px-5">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/90">Montagem do treino</p>
          <p className="text-xl font-semibold text-white">Montando seu novo treino...</p>
          <p className="text-sm leading-6 text-white/66">
            Estamos usando seus dados atualizados para criar um plano alinhado ao seu objetivo e rotina.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-4xl font-semibold text-white">{rounded}%</p>
            <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/38">Progresso estimado</p>
          </div>
          <div className="rounded-full border border-white/8 bg-white/[0.06] p-1">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-primary via-primaryStrong to-[#7BF1A8] transition-[width] duration-500 ease-out"
              style={{ width: `${rounded}%` }}
            />
          </div>
        </div>
        <div className="grid gap-2">
          {LOADING_STAGES.map((stage, index) => {
            const isDone = index < stageIndex;
            const isCurrent = index === stageIndex;
            return (
              <div
                key={stage}
                className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 transition ${
                  isCurrent
                    ? "border-primary/30 bg-primary/12 text-white"
                    : isDone
                      ? "border-primary/18 bg-white/[0.03] text-white/78"
                      : "border-white/8 bg-white/[0.02] text-white/52"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                    isCurrent
                      ? "border-primary bg-primary/18 text-primary"
                      : isDone
                        ? "border-primary/40 bg-primary text-[#052b12]"
                        : "border-white/12 text-white/38"
                  }`}
                >
                  {isDone ? "✓" : index + 1}
                </span>
                <p className={`min-w-0 flex-1 text-sm font-medium ${isCurrent ? "text-white" : ""}`}>{stage}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const LOADING_STAGES = [
  "Analisando seu perfil atualizado",
  "Selecionando os melhores exercícios",
  "Criando a estratégia de treino",
  "Montando seu plano personalizado",
  "Treino pronto!"
];

const LOADING_INITIAL = 4;
const LOADING_MAX = 97;
const LOADING_DECAY_MS = 8000;

function getLoadingProgress(elapsed: number) {
  if (elapsed <= 0) return LOADING_INITIAL;
  return LOADING_INITIAL + (LOADING_MAX - LOADING_INITIAL) * (1 - Math.exp(-elapsed / LOADING_DECAY_MS));
}

function getLoadingStageIndex(progress: number) {
  if (progress >= 100) return 4;
  if (progress >= 75) return 3;
  if (progress >= 50) return 2;
  if (progress >= 25) return 1;
  return 0;
}

// Quantos dias faltam para o free poder gerar de novo (0 = já pode).
export function daysUntilNextFreeGeneration(lastGeneratedAt: string | null | undefined): number {
  if (!lastGeneratedAt) return 0;
  const last = new Date(lastGeneratedAt).getTime();
  const diffDays = Math.ceil((last + FREE_REGENERATION_DAYS * 86_400_000 - Date.now()) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}
