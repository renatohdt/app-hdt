"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ARTICLE_PLACEHOLDER_IMAGE, type ArticleRecommendation } from "@/lib/articles";
import GoogleAd from "@/components/GoogleAd";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { formatBodyTypeLabel } from "@/lib/body-type";
import { normalizePtBrUiText } from "@/lib/pt-br-text";
import { buildWorkoutSectionItems } from "@/lib/workout-section-items";
import { formatBlockTypeLabel, isAdvancedBlockType, isCombinedBlockType } from "@/lib/workout-strategy";
import { Badge, BadgeGroup, Button, Card, Container, PageShell } from "@/components/ui";
import type {
  WorkoutCombinedBlockItem,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutSection,
  WorkoutSectionItem,
  WorkoutSingleItem
} from "@/lib/types";

const DASHBOARD_CTA_URL =
  "https://horadotreino.com.br/consultoria-de-treino-personalizado/?utm_source=hora-do-treino-app&utm_medium=cta-dashboard&utm_campaign=consultoria";

type WorkoutScreenData = {
  user: {
    id?: string;
    name: string;
    goal?: string;
    level?: string;
    body_type?: string;
    location?: string;
    gender?: string;
    days?: string;
    time?: string;
    equipment?: string[];
  };
  workouts: Record<string, WorkoutSection & { day?: string }>;
  plan?: Pick<WorkoutPlan, "splitType" | "rationale" | "progressionNotes" | "sessionCount">;
};

const fallbackArticles: ArticleRecommendation[] = [
  {
    title: "Treino para iniciantes: como manter consistência em casa",
    url: "https://horadotreino.com.br/treino-para-iniciantes-em-casa/",
    image: ARTICLE_PLACEHOLDER_IMAGE,
    tags: ["popular"],
    author: "Hora do Treino",
    readingTime: 3
  },
  {
    title: "Como ganhar massa muscular treinando em casa",
    url: "https://horadotreino.com.br/como-ganhar-massa-muscular-treinando-em-casa/",
    image: ARTICLE_PLACEHOLDER_IMAGE,
    tags: ["popular"],
    author: "Hora do Treino",
    readingTime: 4
  },
  {
    title: "4 dicas de como perder barriga treinando em casa",
    url: "https://horadotreino.com.br/4-dicas-de-como-perder-barriga/",
    image: ARTICLE_PLACEHOLDER_IMAGE,
    tags: ["popular"],
    author: "Hora do Treino",
    readingTime: 3
  }
];

export function WorkoutPremiumScreen({ data }: { data: WorkoutScreenData | null }) {
  const [screenData, setScreenData] = useState<WorkoutScreenData | null>(data);
  const [activeSection, setActiveSection] = useState<string>(data ? Object.keys(data.workouts)[0] ?? "" : "");
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleRecommendation[]>([]);

  useEffect(() => {
    setScreenData(data);
  }, [data]);

  const workoutKeys = useMemo(() => {
    if (!screenData) return [];
    return Object.keys(screenData.workouts);
  }, [screenData]);

  useEffect(() => {
    if (!workoutKeys.length) {
      setActiveSection("");
      return;
    }

    if (!activeSection || !screenData?.workouts[activeSection]) {
      setActiveSection(workoutKeys[0]);
    }
  }, [activeSection, screenData, workoutKeys]);

  const workout = screenData ? screenData.workouts[activeSection] ?? screenData.workouts[workoutKeys[0]] : null;
  const plan = screenData?.plan ?? null;

  const sectionItems = useMemo(() => {
    if (!workout) return [];

    return workout.items?.length ? workout.items : buildWorkoutSectionItems(workout.mobility, workout.exercises);
  }, [workout]);

  const exerciseCount = useMemo(
    () =>
      sectionItems.reduce((total, item) => total + (item.type === "combined_block" ? item.exercises.length : 1), 0),
    [sectionItems]
  );

  const combinedCount = useMemo(
    () => sectionItems.filter((item) => item.type === "combined_block").length,
    [sectionItems]
  );

  const hasAdvancedTechnique = useMemo(
    () =>
      sectionItems.some((item) =>
        item.type === "combined_block"
          ? false
          : isAdvancedBlockType(item.blockType ?? item.trainingTechnique ?? item.technique)
      ),
    [sectionItems]
  );

  useEffect(() => {
    if (!screenData) return;

    trackEvent("workout_viewed", screenData.user.id ?? null, {
      workout_count: workoutKeys.length,
      goal: screenData.user.goal ?? null
    });
  }, [screenData, workoutKeys.length]);

  useEffect(() => {
    if (!screenData) return;

    const controller = new AbortController();

    async function loadArticles() {
      try {
        const response = await fetchWithAuth("/api/articles", {
          signal: controller.signal
        });
        const payload = (await response.json()) as { success: boolean; data?: ArticleRecommendation[] };

        if (!response.ok || !payload.success) {
          throw new Error("Não foi possível carregar os artigos.");
        }

        setArticles(payload.data ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("ARTICLES LOAD ERROR:", error);
          setArticles([]);
        }
      }
    }

    void loadArticles();

    return () => controller.abort();
  }, [screenData]);

  function handleCTAClick() {
    trackEvent("cta_click", screenData?.user.id ?? null, {
      source: "dashboard_cta",
      goal: screenData?.user.goal ?? null
    });
  }

  function handleArticleClick(article: ArticleRecommendation) {
    trackEvent("article_click", screenData?.user.id ?? null, {
      source: "dashboard_articles",
      goal: screenData?.user.goal ?? null,
      article: article.title,
      url: article.url
    });
  }

  if (!screenData || !workout) {
    return <div>Loading...</div>;
  }

  const firstName = screenData.user.name.trim().split(/\s+/)[0] || screenData.user.name;
  const workoutTitle = formatWorkoutDisplayTitle(workout.title, workout.day);
  const progressionTip = workout.progressionTip ?? plan?.progressionNotes ?? null;

  return (
    <PageShell>
      <Container className="max-w-4xl space-y-4 py-4 sm:py-6">
        <Card className="overflow-hidden border-white/12 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white sm:text-xl">{firstName}</p>
              <p className="mt-0.5 text-sm text-white/58">Bom treino!</p>
            </div>

            <Link
              href="/perfil"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/12 px-3 py-1.5 text-sm font-medium text-white/74 transition hover:border-primary/30 hover:bg-white/5 hover:text-white"
            >
              Meu perfil
            </Link>
          </div>

          <BadgeGroup className="mt-3 min-w-0">
            <Tag>{formatGoal(screenData.user.goal)}</Tag>
            <Tag>{formatLevel(screenData.user.level)}</Tag>
            <Tag>{formatBodyType(screenData.user.body_type)}</Tag>
          </BadgeGroup>
        </Card>

        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
          {workoutKeys.map((key) => {
            const section = screenData.workouts[key];
            const active = key === activeSection;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveSection(key);
                  setOpenExercise(null);
                  setOpenVideo(null);
                  setOpenBlock(null);
                }}
                className={`min-w-fit rounded-full px-5 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-primary text-white shadow-glow"
                    : "border border-white/10 bg-white/[0.04] text-white/62"
                }`}
              >
                {formatWorkoutDisplayTitle(section.title, section.day)}
              </button>
            );
          })}
        </div>

        <Card className="space-y-4 p-4 sm:p-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">{workoutTitle}</h1>
            <p className="text-sm text-white/60">
              {exerciseCount} exercícios {"\u2022"} {formatGoal(screenData.user.goal)} {"\u2022"}{" "}
              {combinedCount} bloco{combinedCount === 1 ? "" : "s"} combinado{combinedCount === 1 ? "" : "s"}
              {hasAdvancedTechnique ? " \u2022 técnicas intensificadoras pontuais" : ""}
            </p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Foco da sessão</p>
            <p className="mt-2 text-sm leading-6 text-white/62">
              {formatCoachCopy(
                workout.rationale ??
                  plan?.rationale ??
                  "Sessão montada para equilibrar eficiência, coerência muscular e boa recuperação."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-white/62">
            <div className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              Exercício normal
            </div>
            <div className="inline-flex items-center gap-2 text-cyan-300">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
              Mobilidade
            </div>
            <div className="inline-flex items-center gap-2 text-yellow-300">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
              Bloco combinado
            </div>
            <div className="inline-flex items-center gap-2 text-orange-300">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-300" />
              Técnica avançada
            </div>
          </div>

          <div className="space-y-3">
            {sectionItems.map((item, index) =>
              item.type === "combined_block" ? (
                <CombinedBlockCard
                  key={`${activeSection}-block-${index}`}
                  block={item}
                  sectionKey={activeSection}
                  blockIndex={index}
                  openBlock={openBlock}
                  openExercise={openExercise}
                  openVideo={openVideo}
                  onToggleBlock={setOpenBlock}
                  onToggleExercise={setOpenExercise}
                  onToggleVideo={setOpenVideo}
                />
              ) : (
                <ExerciseAccordionCard
                  key={`${activeSection}-${item.name}-${index}`}
                  exercise={item}
                  sectionKey={activeSection}
                  itemIndex={index}
                  openExercise={openExercise}
                  openVideo={openVideo}
                  onToggleExercise={setOpenExercise}
                  onToggleVideo={setOpenVideo}
                  indexLabel={String(index + 1)}
                />
              )
            )}
          </div>

          {progressionTip ? (
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Progressão</p>
              <p className="mt-2 text-sm text-white/64">{formatCoachCopy(progressionTip)}</p>
            </div>
          ) : null}
        </Card>

        <div
          className="overflow-hidden rounded-[16px] border border-white/10 bg-cover bg-center shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
          style={{
            backgroundImage:
              'url("https://horadotreino.com.br/wp-content/uploads/2026/03/cta-consultoria.png")'
          }}
        >
          <div className="flex min-h-[340px] flex-col justify-end bg-gradient-to-t from-black/85 to-black/40 p-6 sm:min-h-[380px] sm:p-8">
            <span className="mb-4 inline-flex w-fit rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              EXCLUSIVO
            </span>
            <h2 className="max-w-xl text-2xl font-semibold text-white sm:text-3xl">
              Quer acompanhamento profissional para evoluir com mais clareza?
            </h2>
            <p className="mt-3 max-w-xl text-sm text-white/78 sm:text-base">
              Treine com um personal que entende seus objetivos e monta seu plano do zero.
            </p>
            <a
              href={DASHBOARD_CTA_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleCTAClick}
              className="mt-5 block w-full sm:w-fit"
            >
              <Button className="min-h-14 w-full px-6 text-base sm:w-auto">Quero transformar meu corpo agora</Button>
            </a>
          </div>
        </div>

        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Conteúdo recomendado</p>
            <h2 className="text-2xl font-semibold text-white">Conteúdos para acelerar seus resultados</h2>
          </div>

          <div className="grid gap-3">
            {(articles.length ? articles : fallbackArticles).map((article) => (
              <a
                key={article.url}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleArticleClick(article)}
                className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/20 p-3 transition hover:border-primary/30 hover:bg-white/[0.04]"
              >
                <div className="h-[70px] w-[70px] shrink-0 overflow-hidden rounded-[8px] bg-white/5">
                  <img
                    src={article.image || ARTICLE_PLACEHOLDER_IMAGE}
                    alt={article.title}
                    style={{ width: "70px", height: "70px", objectFit: "cover", borderRadius: "8px" }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white sm:text-base">{article.title}</p>
                  <p className="mt-1 text-xs text-white/58">{formatArticleMeta(article)}</p>
                </div>
              </a>
            ))}
          </div>
        </Card>

        <GoogleAd />
      </Container>
    </PageShell>
  );
}

function Tag({ children }: { children: string }) {
  return <Badge className="min-h-7 text-white/58">{children}</Badge>;
}

function MetaBadge({ children, className }: { children: string; className?: string }) {
  return <Badge className={`border-white/12 bg-white/[0.05] text-white/68 ${className ?? ""}`}>{children}</Badge>;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[20px] border border-white/10 bg-black/20 px-2 py-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-white/45 sm:text-[11px]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white sm:text-base">{value}</p>
    </div>
  );
}

function ExerciseAccordionCard({
  exercise,
  sectionKey,
  itemIndex,
  openExercise,
  openVideo,
  onToggleExercise,
  onToggleVideo,
  indexLabel
}: {
  exercise: WorkoutSingleItem;
  sectionKey: string;
  itemIndex: number;
  openExercise: string | null;
  openVideo: string | null;
  onToggleExercise: (value: string | null) => void;
  onToggleVideo: (value: string | null) => void;
  indexLabel: string;
}) {
  return (
    <ExerciseDisclosureCard
      exercise={exercise}
      disclosureKey={`${sectionKey}-item-${itemIndex}`}
      indexLabel={indexLabel}
      openExercise={openExercise}
      openVideo={openVideo}
      onToggleExercise={onToggleExercise}
      onToggleVideo={onToggleVideo}
    />
  );
}

function CombinedBlockCard({
  block,
  sectionKey,
  blockIndex,
  openBlock,
  openExercise,
  openVideo,
  onToggleBlock,
  onToggleExercise,
  onToggleVideo
}: {
  block: WorkoutCombinedBlockItem;
  sectionKey: string;
  blockIndex: number;
  openBlock: string | null;
  openExercise: string | null;
  openVideo: string | null;
  onToggleBlock: (value: string | null) => void;
  onToggleExercise: (value: string | null) => void;
  onToggleVideo: (value: string | null) => void;
}) {
  const typeLabel = formatBlockTypeLabel(block.blockType);
  const blockKey = `${sectionKey}-block-panel-${blockIndex}`;
  const isExpanded = openBlock === blockKey;
  const blockTechniqueText = shouldShowTechniqueExplanation(block.blockType) ? buildTechniqueExplanation(block.blockType) : null;
  const blockDetails = [
    {
      label: "Como funciona o bloco",
      content: buildBlockExecutionText(block)
    },
    {
      label: "Descanso",
      content: buildBlockRestText(block)
    },
    ...(blockTechniqueText
      ? [
          {
            label: "Como fazer a técnica",
            content: blockTechniqueText
          }
        ]
      : [])
  ].filter((detail) => Boolean(detail.content));
  const hasBlockDetails = blockDetails.length > 0;

  function handleToggleBlock() {
    onToggleBlock(isExpanded ? null : blockKey);
  }

  return (
    <div className="rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(250,204,21,0.08),rgba(255,255,255,0.02))] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MetaBadge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-300">{typeLabel}</MetaBadge>
            <MetaBadge>{formatRoundsValue(block.rounds)}</MetaBadge>
            <MetaBadge>{`${block.restAfterRound} ao final`}</MetaBadge>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-white sm:text-xl">{block.blockLabel}</h3>

          <p className="mt-2 text-sm text-yellow-200/78">{buildBlockSummary(block)}</p>
        </div>

        <div className="space-y-3 sm:min-w-[260px]">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Tipo" value={typeLabel} />
            <MetricCard label="Voltas" value={block.rounds} />
            <MetricCard label="Descanso" value={block.restAfterRound} />
            <MetricCard label="Exercícios" value={String(block.exercises.length)} />
          </div>

          {hasBlockDetails ? (
            <button
              type="button"
              onClick={handleToggleBlock}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/68 transition hover:border-yellow-400/30 hover:bg-white/[0.05] hover:text-white"
            >
              {isExpanded ? "Ocultar detalhes do bloco" : "Detalhes do bloco"}
            </button>
          ) : null}
        </div>
      </div>

      {isExpanded && hasBlockDetails ? (
        <div className="mt-4 space-y-4 rounded-[22px] border border-yellow-500/15 bg-black/20 p-4">
          {blockDetails.map((detail) => (
            <div key={`${blockKey}-${detail.label}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{detail.label}</p>
              <p className="mt-2 text-sm text-white/72">{detail.content}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {block.exercises.map((exercise, exerciseIndex) => (
          <ExerciseDisclosureCard
            key={`${sectionKey}-block-${blockIndex}-${exercise.order ?? exercise.name}-${exerciseIndex}`}
            exercise={exercise}
            disclosureKey={`${sectionKey}-block-${blockIndex}-${exercise.order ?? exerciseIndex}`}
            indexLabel={exercise.order ?? `${String.fromCharCode(65 + blockIndex)}${exerciseIndex + 1}`}
            openExercise={openExercise}
            openVideo={openVideo}
            onToggleExercise={onToggleExercise}
            onToggleVideo={onToggleVideo}
            compact
            showStructureBadge={false}
            showMethodBadge={false}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseDisclosureCard({
  exercise,
  disclosureKey,
  indexLabel,
  openExercise,
  openVideo,
  onToggleExercise,
  onToggleVideo,
  compact = false,
  showStructureBadge = true,
  showMethodBadge = true
}: {
  exercise: WorkoutExercise | WorkoutSingleItem;
  disclosureKey: string;
  indexLabel: string;
  openExercise: string | null;
  openVideo: string | null;
  onToggleExercise: (value: string | null) => void;
  onToggleVideo: (value: string | null) => void;
  compact?: boolean;
  showStructureBadge?: boolean;
  showMethodBadge?: boolean;
}) {
  const blockType = normalizeBlockTypeFallback(exercise);
  const isMobility = blockType === "mobility" || exercise.type === "mobility";
  const isAdvancedTechnique = isAdvancedBlockType(blockType) && !isCombinedBlockType(blockType);
  const isExpanded = openExercise === disclosureKey;
  const isVideoOpen = openVideo === disclosureKey;
  const structureLabel = getExerciseStructureLabel(blockType);
  const techniqueLabel = getExerciseMethodLabel(exercise, blockType);
  const summaryText = buildExerciseSummary(exercise, blockType);
  const techniqueText = shouldShowTechniqueExplanation(blockType) ? buildTechniqueExplanation(blockType) : null;
  const observationText = buildExerciseObservation(exercise, blockType, [
    exercise.name,
    summaryText,
    structureLabel,
    techniqueLabel,
    techniqueText
  ]);
  const detailSections = [
    ...(techniqueText
      ? [
          {
            label: "Como fazer a técnica",
            content: techniqueText
          }
        ]
      : []),
    ...(observationText
      ? [
          {
            label: "Observacao",
            content: observationText
          }
        ]
      : [])
  ];
  const hasDetails = detailSections.length > 0;
  const shouldShowExpandedPanel = (hasDetails && isExpanded) || Boolean(exercise.videoUrl && isVideoOpen);
  const cardBorderClass = isMobility
    ? "border-cyan-400/20"
    : isAdvancedTechnique
      ? "border-orange-500/20"
      : "border-white/10";
  const indexToneClass = isMobility
    ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
    : isAdvancedTechnique
      ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
      : "border-primary/20 bg-primary/10 text-primary";

  function handleToggleExercise() {
    if (isExpanded) {
      onToggleExercise(null);
      if (isVideoOpen) {
        onToggleVideo(null);
      }
      return;
    }

    onToggleExercise(disclosureKey);
  }

  function handleToggleVideo() {
    onToggleExercise(hasDetails ? disclosureKey : null);
    onToggleVideo(isVideoOpen ? null : disclosureKey);
  }

  return (
    <div className={`rounded-[24px] border ${cardBorderClass} ${compact ? "bg-black/25" : "bg-black/20"} p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-w-10 items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.14em] ${indexToneClass}`}
            >
              {indexLabel}
            </span>
            {showStructureBadge ? (
              <MetaBadge className={getExerciseBadgeTone(blockType)}>{structureLabel}</MetaBadge>
            ) : null}
            {showMethodBadge && techniqueLabel ? <MetaBadge>{techniqueLabel}</MetaBadge> : null}
            {isAdvancedTechnique ? (
              <MetaBadge className="border-orange-500/20 bg-orange-500/10 text-orange-300">Técnica avançada</MetaBadge>
            ) : null}
          </div>

          <h3 className="mt-3 text-base font-semibold text-white sm:text-lg">{exercise.name}</h3>
          <p className={`mt-1 text-sm ${getBlockTextTone(blockType)}`}>{summaryText}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {exercise.videoUrl ? (
            <button
              type="button"
              onClick={handleToggleVideo}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/68 transition hover:border-primary/30 hover:bg-white/[0.05] hover:text-white"
            >
              {isVideoOpen ? "Fechar vídeo" : "Ver vídeo"}
            </button>
          ) : null}
          {hasDetails ? (
            <button
              type="button"
              onClick={handleToggleExercise}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/68 transition hover:border-primary/30 hover:bg-white/[0.05] hover:text-white"
            >
              {isExpanded ? "Ocultar" : "Detalhes"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricCard label="Séries" value={exercise.sets || "-"} />
        <MetricCard label={isMobility ? "Duração" : "Reps"} value={exercise.reps || "-"} />
        <MetricCard label="Descanso" value={exercise.rest || "-"} />
      </div>

      {shouldShowExpandedPanel ? (
        <div className="mt-4 space-y-4 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          {hasDetails && isExpanded
            ? detailSections.map((detail) => (
                <div key={`${disclosureKey}-${detail.label}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{detail.label}</p>
                  <p className="mt-2 text-sm text-white/72">{detail.content}</p>
                </div>
              ))
            : null}

          {exercise.videoUrl && isVideoOpen ? (
            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-black/30">
              <iframe
                className="aspect-video w-full"
                src={toEmbedUrl(exercise.videoUrl)}
                title={`Video demonstrativo de ${exercise.name}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getExerciseBadgeTone(value?: string | null) {
  const normalized = normalizeText(value);

  if (normalized.includes("mobility")) {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  }

  if (
    normalized.includes("superset") ||
    normalized.includes("bi-set") ||
    normalized.includes("tri-set") ||
    normalized.includes("circuit")
  ) {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-400";
  }

  if (
    normalized.includes("drop-set") ||
    normalized.includes("rest-pause") ||
    normalized.includes("cluster") ||
    normalized.includes("pre-exaustao") ||
    normalized.includes("pos-exaustao")
  ) {
    return "border-orange-500/20 bg-orange-500/10 text-orange-300";
  }

  return "border-primary/20 bg-primary/10 text-primary";
}

function getBlockTextTone(value?: string | null) {
  const normalized = normalizeText(value);

  if (normalized.includes("mobility")) return "text-cyan-300";
  if (normalized.includes("drop-set") || normalized.includes("rest-pause") || normalized.includes("cluster")) {
    return "text-orange-300";
  }
  if (isCombinedBlockType(value)) return "text-yellow-300";
  return "text-primary";
}

function buildExerciseSummary(exercise: WorkoutExercise | WorkoutSingleItem, blockType: ReturnType<typeof normalizeBlockTypeFallback>) {
  if (exercise.notes?.trim()) {
    return formatCoachCopy(exercise.notes);
  }

  if (blockType === "mobility") {
    return "Prepare a mobilidade e o controle do movimento antes do bloco principal.";
  }

  if (shouldShowTechniqueExplanation(blockType)) {
    return "Mantenha a técnica proposta com controle e sem acelerar a execução.";
  }

  return "Execute com postura estável, amplitude segura e ritmo consistente.";
}

function buildExerciseExecutionText(
  exercise: WorkoutExercise | WorkoutSingleItem,
  blockType: ReturnType<typeof normalizeBlockTypeFallback>
) {
  if (exercise.notes?.trim()) {
    return formatCoachCopy(exercise.notes);
  }

  if (blockType === "mobility") {
    return "Faça o movimento de forma fluida, buscando amplitude confortável e controle corporal do início ao fim.";
  }

  if (blockType === "tempo_controlado") {
    return "Controle a velocidade de cada repetição, principalmente na fase de descida, sem perder alinhamento nem tensão muscular.";
  }

  if (blockType === "isometria") {
    return "Mantenha a posição indicada com tensão constante, postura estável e respiração controlada durante todo o tempo prescrito.";
  }

  return "Execute o movimento com amplitude segura, controle do ritmo e boa postura durante toda a série.";
}

function buildExerciseObservation(
  exercise: WorkoutExercise | WorkoutSingleItem,
  blockType: ReturnType<typeof normalizeBlockTypeFallback>,
  comparisonTexts: Array<string | null | undefined>
) {
  const usefulNote = pickUsefulAdditionalDetail(exercise.notes, comparisonTexts);

  if (shouldShowTechniqueExplanation(blockType)) {
    return usefulNote ?? buildTechniqueObservation(blockType, comparisonTexts);
  }

  return usefulNote;

  if (exercise.notes?.trim()) {
    return formatCoachCopy(exercise.notes);
  }
  if (blockType === "drop-set") {
    return "Reduza a carga apenas se conseguir manter amplitude, controle e padrão de movimento.";
  }

  if (blockType === "rest-pause") {
    return "Interrompa a sequência se perder postura, ritmo ou controle técnico.";
  }

  if (blockType === "tempo_controlado") {
    return "Conte o ritmo mentalmente para evitar acelerar a repetição nos trechos mais difíceis.";
  }

  if (blockType === "isometria") {
    return "Ative o abdômen e mantenha a respiração contínua para sustentar a posição com qualidade.";
  }

  if (blockType === "parciais") {
    return "Use a mesma trajetória do exercício e evite compensações ao reduzir a amplitude.";
  }

  if (blockType === "pre-exaustao" || blockType === "pos-exaustao") {
    return "Priorize a qualidade do movimento e ajuste a carga se a fadiga comprometer a execução.";
  }

  if (exercise.type === "mobility") {
    return "Pare se houver desconforto fora do padrao ou se precisar compensar a postura para completar o movimento.";
  }

  return null;
}

function buildExerciseSafetyText(
  exercise: WorkoutExercise | WorkoutSingleItem,
  blockType: ReturnType<typeof normalizeBlockTypeFallback>
) {
  if (blockType === "drop-set") {
    return "Reduza a carga apenas se conseguir manter amplitude, controle e padrão de movimento.";
  }

  if (blockType === "rest-pause") {
    return "Interrompa a sequência se perder postura, ritmo ou controle técnico.";
  }

  if (exercise.type === "mobility") {
    return "Pare se houver desconforto fora do padrao ou se precisar compensar a postura para completar o movimento.";
  }

  return null;
}

function shouldShowTechniqueExplanation(blockType: ReturnType<typeof normalizeBlockTypeFallback>) {
  return (
    blockType === "drop-set" ||
    blockType === "rest-pause" ||
    blockType === "superset" ||
    blockType === "bi-set" ||
    blockType === "tri-set" ||
    blockType === "circuit" ||
    blockType === "tempo_controlado" ||
    blockType === "isometria" ||
    blockType === "parciais" ||
    blockType === "pre-exaustao" ||
    blockType === "pos-exaustao"
  );
}

function buildTechniqueExplanation(blockType: ReturnType<typeof normalizeBlockTypeFallback>) {
  if (blockType === "drop-set") {
    return "Faça a série normalmente, reduza a carga e continue o exercício com novas repetições até atingir o alvo proposto ou a falha técnica.";
  }

  if (blockType === "rest-pause") {
    return "Faça a série, descanse por um curto período de 10 a 20 segundos e continue o mesmo exercício para completar repetições adicionais.";
  }

  if (blockType === "superset") {
    return "Execute os dois exercícios em sequência, com pouco ou nenhum descanso entre eles. Descanse apenas ao final da combinação.";
  }

  if (blockType === "bi-set") {
    return "Realize dois exercícios seguidos para o mesmo foco ou para focos complementares, descansando apenas ao final da volta.";
  }

  if (blockType === "tri-set") {
    return "Execute três exercícios em sequência, sem descanso entre eles ou com pausas mínimas. Descanse apenas no fim da volta.";
  }

  if (blockType === "circuit") {
    return "Complete todos os exercícios do circuito na ordem proposta. Ao terminar a sequência completa, faça o descanso indicado antes de reiniciar.";
  }

  if (blockType === "tempo_controlado") {
    return "Controle a velocidade de cada repetição, principalmente na fase de descida, evitando pressa e perda de técnica.";
  }

  if (blockType === "isometria") {
    return "Segure a posição indicada pelo tempo prescrito, mantendo tensão muscular e controle postural.";
  }

  if (blockType === "parciais") {
    return "Após as repetições completas, realize repetições curtas em parte da amplitude para prolongar o estímulo muscular.";
  }

  if (blockType === "pre-exaustao") {
    return "Faça primeiro um exercício mais isolado para fadigar o músculo alvo e, em seguida, execute o exercício principal.";
  }

  if (blockType === "pos-exaustao") {
    return "Faça primeiro o exercício principal e, em seguida, complemente com um exercício mais isolado para estender o estímulo com controle.";
  }

  return null;
}

function buildBlockSummary(block: WorkoutCombinedBlockItem) {
  return buildBlockExecutionText(block);
}

function buildBlockExecutionText(block: WorkoutCombinedBlockItem) {
  const orders = block.exercises.map((exercise) => exercise.order).filter(Boolean) as string[];
  const sequenceLabel = joinDisplayLabels(orders);

  if (block.blockType === "circuit") {
    return formatCoachCopy(
      sequenceLabel
        ? `Complete ${sequenceLabel} na ordem proposta, mantendo o ritmo do circuito até fechar a volta.`
        : "Complete os exercícios do circuito na ordem proposta até fechar a volta."
    );
  }

  return formatCoachCopy(
    sequenceLabel
      ? `Execute ${sequenceLabel} em sequência, sem descanso entre os exercícios.`
      : "Execute os exercícios do bloco em sequência, sem descanso entre eles."
  );
}

function buildBlockRestText(block: WorkoutCombinedBlockItem) {
  return formatCoachCopy(`Descanse ${block.restAfterRound} apenas ao final da volta.`);
}

function getExerciseStructureLabel(blockType: ReturnType<typeof normalizeBlockTypeFallback>) {
  if (blockType === "normal") {
    return "Exercício";
  }

  if (blockType === "mobility") {
    return "Mobilidade";
  }

  return formatBlockTypeLabel(blockType);
}

function getExerciseMethodLabel(exercise: WorkoutExercise | WorkoutSingleItem, blockType: ReturnType<typeof normalizeBlockTypeFallback>) {
  if (blockType !== "normal") {
    return null;
  }

  const rawMethod = exercise.method ?? exercise.trainingTechnique ?? exercise.technique;
  const normalizedMethod = normalizeText(rawMethod);

  if (!rawMethod || !normalizedMethod || normalizedMethod === "tradicional" || normalizedMethod === "normal") {
    return null;
  }

  if (normalizedMethod === "mobilidade") {
    return null;
  }

  return rawMethod;
}

function formatRoundsValue(value?: string | null) {
  const raw = value?.trim();

  if (!raw) {
    return "3 voltas";
  }

  return normalizeText(raw).includes("volta") ? raw : `${raw} voltas`;
}

function formatCoachCopy(value?: string | null) {
  const raw = normalizePtBrUiText(value);

  if (!raw) {
    return "";
  }

  let text = raw;

  const replacements: Array<[RegExp, string]> = [
    [/\bsessao\b/gi, "sessão"],
    [/\bsessoes\b/gi, "sessões"],
    [/\bexecucao\b/gi, "execução"],
    [/\btecnica\b/gi, "técnica"],
    [/\btecnicas\b/gi, "técnicas"],
    [/\bexercicio\b/gi, "exercício"],
    [/\bexercicios\b/gi, "exercícios"],
    [/\bfuncao\b/gi, "função"],
    [/\bprogressao\b/gi, "progressão"],
    [/\bpreparacao\b/gi, "preparação"],
    [/\barticulacoes\b/gi, "articulações"],
    [/\brespiracao\b/gi, "respiração"],
    [/\bgluteos\b/gi, "glúteos"],
    [/\bquadriceps\b/gi, "quadríceps"],
    [/\bseries\b/gi, "séries"],
    [/\brepeticoes\b/gi, "repetições"],
    [/\bcontracao\b/gi, "contração"],
    [/\bposicao\b/gi, "posição"],
    [/\bestavel\b/gi, "estável"],
    [/\bproxima\b/gi, "próxima"],
    [/\bnao\b/gi, "não"],
    [/\bso\b/gi, "só"]
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  return text;
}

function joinDisplayLabels(values: string[]) {
  if (!values.length) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

function normalizeBlockTypeFallback(exercise: WorkoutExercise) {
  const raw = exercise.blockType ?? exercise.type ?? exercise.trainingTechnique ?? exercise.technique ?? "normal";
  const normalized = normalizeText(raw);

  if (normalized.includes("mobil")) return "mobility";
  if (normalized.includes("superset") || normalized.includes("superserie")) return "superset";
  if (normalized.includes("bi-set") || normalized.includes("biset")) return "bi-set";
  if (normalized.includes("tri-set") || normalized.includes("triset")) return "tri-set";
  if (normalized.includes("drop")) return "drop-set";
  if (normalized.includes("rest")) return "rest-pause";
  if (normalized.includes("cluster")) return "cluster";
  if (normalized.includes("circuit")) return "circuit";
  if (normalized.includes("isometr")) return "isometria";
  if (normalized.includes("tempo")) return "tempo_controlado";
  if (normalized.includes("parcia")) return "parciais";
  if (normalized.includes("pre")) return "pre-exaustao";
  if (normalized.includes("pos")) return "pos-exaustao";
  return "normal";
}

function formatWorkoutDisplayTitle(title?: string | null, day?: string | null) {
  const candidates = [title, day];

  for (const candidate of candidates) {
    const raw = normalizePtBrUiText(candidate)?.trim();
    if (!raw) {
      continue;
    }

    const treinoMatch = raw.match(/treino\s+[a-z0-9]+/i);
    if (treinoMatch?.[0]) {
      const label = treinoMatch[0].replace(/\s+/g, " ").trim();
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    const normalized = raw.replace(/^treino\s+/i, "").split(/[\s–—-]/)[0]?.trim();
    if (normalized) {
      return `Treino ${normalized.toUpperCase()}`;
    }
  }

  return "Treino";
}

function formatGoal(goal?: string) {
  const labels: Record<string, string> = {
    lose_weight: "Emagrecimento",
    gain_muscle: "Hipertrofia",
    body_recomposition: "Definição",
    improve_conditioning: "Condicionamento"
  };

  return goal ? labels[goal] ?? "Objetivo" : "Objetivo";
}

function formatLevel(level?: string) {
  const labels: Record<string, string> = {
    no_training: "Iniciante",
    lt_6_months: "Iniciante",
    "6_to_12_months": "Intermediário",
    gt_1_year: "Avançado"
  };

  return level ? labels[level] ?? "Nivel" : "Nivel";
}

function formatBodyType(bodyType?: string) {
  return bodyType ? formatBodyTypeLabel(bodyType) : "Biotipo";
}

function formatFocus(focus: string) {
  const labels: Record<string, string> = {
    chest: "Peito",
    back: "Costas",
    quadriceps: "Quadríceps",
    hamstrings: "Posterior",
    glutes: "Glúteos",
    shoulders: "Ombros",
    full_body: "Corpo inteiro",
    conditioning: "Condicionamento"
  };

  return labels[focus] ?? focus;
}

function toEmbedUrl(url: string) {
  if (url.includes("youtube.com/embed/")) return url;
  if (url.includes("watch?v=")) return url.replace("watch?v=", "embed/");
  if (url.includes("youtu.be/")) return url.replace("youtu.be/", "youtube.com/embed/");
  return url;
}

function formatArticleMeta(article: ArticleRecommendation) {
  const author = article.author?.trim() || "Hora do Treino";
  const readingTime = Math.max(Number(article.readingTime) || 1, 1);
  return `${author} - ${readingTime} min de leitura`;
}

function pickUsefulAdditionalDetail(
  value: string | null | undefined,
  comparisonTexts: Array<string | null | undefined>
) {
  const formatted = formatCoachCopy(value);

  if (!formatted) {
    return null;
  }

  if (isGenericObservationText(formatted)) {
    return null;
  }

  if (comparisonTexts.some((comparison) => isEquivalentDetailText(formatted, comparison))) {
    return null;
  }

  return formatted;
}

function buildTechniqueObservation(
  blockType: ReturnType<typeof normalizeBlockTypeFallback>,
  comparisonTexts: Array<string | null | undefined>
) {
  const fallbackByTechnique: Partial<Record<ReturnType<typeof normalizeBlockTypeFallback>, string>> = {
    "drop-set": "Evite acelerar a fase excêntrica durante o drop-set.",
    "rest-pause": "Interrompa a sequência se perder postura, ritmo ou controle técnico.",
    tempo_controlado: "Interrompa a série se perder o ritmo proposto ou o controle da amplitude.",
    isometria: "Interrompa a permanência se não conseguir sustentar postura e respiração estáveis.",
    parciais: "Use a mesma trajetória do exercício e pare se começar a compensar com o corpo.",
    "pre-exaustao": "Reduza a carga se a fadiga comprometer amplitude, alinhamento ou controle técnico.",
    "pos-exaustao": "Reduza a carga se a fadiga comprometer amplitude, alinhamento ou controle técnico."
  };

  return pickUsefulAdditionalDetail(fallbackByTechnique[blockType] ?? null, comparisonTexts);
}

function isGenericObservationText(value: string) {
  const normalized = normalizeSemanticText(value);
  const genericPatterns = [
    "exercício básico",
    "movimento para",
    "movimento de",
    "movimento basico",
    "exercício complementar",
    "exercício para",
    "fortalecimento",
    "cadeia posterior",
    "membros inferiores",
    "membros superiores",
    "prepare a mobilidade",
    "ritmo consistente",
    "amplitude segura",
    "postura estavel",
    "técnica proposta",
    "tensao continua"
  ];

  return genericPatterns.some((pattern) => normalized.includes(pattern));
}

function isEquivalentDetailText(candidate: string, comparison: string | null | undefined) {
  const normalizedCandidate = normalizeSemanticText(candidate);
  const normalizedComparison = normalizeSemanticText(comparison);

  if (!normalizedCandidate || !normalizedComparison) {
    return false;
  }

  if (
    normalizedCandidate === normalizedComparison ||
    normalizedCandidate.includes(normalizedComparison) ||
    normalizedComparison.includes(normalizedCandidate)
  ) {
    return true;
  }

  const candidateTokens = getMeaningfulTokens(normalizedCandidate);
  const comparisonTokens = getMeaningfulTokens(normalizedComparison);

  if (!candidateTokens.length || !comparisonTokens.length) {
    return false;
  }

  const overlap = candidateTokens.filter((token) => comparisonTokens.includes(token)).length;
  const threshold = Math.min(candidateTokens.length, comparisonTokens.length);

  return threshold > 0 && overlap >= threshold;
}

function normalizeSemanticText(value?: string | null) {
  return normalizeText(value)
    .replace(/[.,;:!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningfulTokens(value: string) {
  const stopWords = new Set([
    "a",
    "ao",
    "as",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "no",
    "o",
    "os",
    "para",
    "por",
    "sem",
    "um",
    "uma"
  ]);

  return value
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}
