"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ChevronLeft, Crown, Dumbbell, Info, Loader2, Play, X } from "lucide-react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseProviderVideoRef } from "@/lib/exercise-video";
import { resolveVideoPoster, toEmbedUrl } from "@/lib/video-embed";

export type ReplacementOption = {
  id: string;
  name: string;
  difficulty: number | null;
  primaryMuscle: string | null;
  videoUrl: string | null;
};

type Props = {
  originalName: string;
  reasonLabel: string;
  options: ReplacementOption[];
  /** Free: quantas opções ficam bloqueadas (Premium). Premium: 0. */
  lockedCount: number;
  isPremium: boolean;
  confirming: boolean;
  error: string | null;
  onConfirm: (option: ReplacementOption, position: number) => void;
  /** Fechar = cancelar: nada é trocado. */
  onClose: () => void;
  /** Volta para a escolha do motivo. */
  onBack: () => void;
  /** Free tocou num card bloqueado ou em "Conhecer o Premium". */
  onUpsell: () => void;
};

type Slot = { kind: "option"; option: ReplacementOption; position: number } | { kind: "locked"; key: string };

/**
 * Tela de escolha do substituto (Fase 2 das substituições).
 * Premium: até 3 opções, o aluno escolhe. Free: a minha escolha no meio e as outras
 * bloqueadas nas laterais (abrem o popup Premium). O vídeo é opcional.
 */
export function ReplacementPicker({
  originalName,
  reasonLabel,
  options,
  lockedCount,
  isPremium,
  confirming,
  error,
  onConfirm,
  onClose,
  onBack,
  onUpsell
}: Props) {
  // Free: a única opção já vem escolhida. Premium: o aluno escolhe.
  const [selectedId, setSelectedId] = useState<string | null>(isPremium ? null : options[0]?.id ?? null);
  const [videoOption, setVideoOption] = useState<ReplacementOption | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const slots: Slot[] = isPremium
    ? options.map((option, position) => ({ kind: "option", option, position }))
    : buildFreeSlots(options[0], lockedCount);
  const selectedIndex = options.findIndex((option) => option.id === selectedId);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function handleConfirm() {
    if (!selected || confirming) return;
    onConfirm(selected, selectedIndex);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Escolher exercício substituto">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={confirming ? undefined : onClose} />

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#141414] px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-2xl sm:rounded-[28px]">
        <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-white/20" />

        {videoOption ? (
          <VideoView
            option={videoOption}
            isPremium={isPremium}
            onBack={() => setVideoOption(null)}
            onChoose={() => {
              setSelectedId(videoOption.id);
              setVideoOption(null);
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onBack}
                disabled={confirming}
                aria-label="Voltar ao motivo da troca"
                className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1 w-[18px] rounded-full bg-primary/45" />
                <span aria-hidden="true" className="h-1 w-[18px] rounded-full bg-primary" />
                <span className="ml-1.5 text-xs font-semibold text-white/60">Passo 2 de 2</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={confirming}
                aria-label="Fechar"
                className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-white">
                {isPremium && options.length > 1 ? "Qual você prefere fazer?" : "Seu novo exercício"}
              </h2>
              <p className="text-sm leading-5 text-white/65">
                {isPremium && options.length > 1 ? (
                  <>
                    Separei {options.length} opções para o motivo <strong className="text-white">“{reasonLabel}”</strong>. Já conhece? É só
                    escolher. Se quiser ver a execução, toque na imagem.
                  </>
                ) : (
                  <>
                    Separei a melhor opção para o motivo <strong className="text-white">“{reasonLabel}”</strong>. Se quiser ver a execução, toque
                    na imagem.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.08em] text-white/55">SAI</p>
                <p className="truncate text-[13px] font-semibold text-white/60 line-through">{originalName}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-[1.3]">
                <p className="text-[10px] font-bold tracking-[0.08em] text-white/55">ENTRA</p>
                <p className={clsx("truncate text-[13px] font-bold", selected ? "text-primary" : "text-white/60")}>
                  {selected ? selected.name : "Sua escolha"}
                </p>
              </div>
            </div>

            <div
              className={clsx(
                "grid gap-2",
                slots.length >= 3 ? "grid-cols-3" : slots.length === 2 ? "grid-cols-2" : "grid-cols-1"
              )}
            >
              {slots.map((slot) =>
                slot.kind === "locked" ? (
                  <LockedCard key={slot.key} onClick={onUpsell} />
                ) : (
                  <OptionCard
                    key={slot.option.id}
                    option={slot.option}
                    tag={slot.position === 0 ? (isPremium ? "Minha indicação" : "Minha escolha") : null}
                    selected={slot.option.id === selectedId}
                    disabled={confirming}
                    onSelect={() => {
                      if (isPremium) setSelectedId(slot.option.id);
                    }}
                    onPlay={() => setVideoOption(slot.option)}
                  />
                )
              )}
            </div>

            {isPremium ? (
              options.length > 1 ? (
                <p className="flex gap-2 text-xs leading-[17px] text-white/60">
                  <Info className="mt-px h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
                  Escolha a que fizer mais sentido para você hoje. As outras opções continuam disponíveis nos próximos treinos.
                </p>
              ) : null
            ) : lockedCount > 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-premium/30 bg-premium/[0.07] px-3.5 py-3">
                <Crown className="h-5 w-5 shrink-0 text-premium" strokeWidth={2.4} aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold leading-[18px] text-white">
                    No Premium eu te mostro 3 opções e você escolhe a que é melhor para você.
                  </p>
                  <button
                    type="button"
                    onClick={onUpsell}
                    className="text-xs font-bold text-premium underline underline-offset-2"
                  >
                    Conhecer o Premium
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
            ) : null}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selected || confirming}
              className={clsx(
                "flex h-[54px] items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-extrabold transition",
                selected ? "bg-primary text-[#052e14] hover:opacity-95" : "bg-white/[0.08] text-white/55",
                confirming && "opacity-70"
              )}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="truncate">
                {confirming ? "Trocando..." : selected ? `Trocar por ${selected.name}` : "Escolha um exercício acima"}
              </span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function buildFreeSlots(option: ReplacementOption | undefined, lockedCount: number): Slot[] {
  if (!option) return [];
  const main: Slot = { kind: "option", option, position: 0 };
  // A minha escolha fica no meio; as bloqueadas, nas laterais.
  if (lockedCount >= 2) return [{ kind: "locked", key: "locked-left" }, main, { kind: "locked", key: "locked-right" }];
  if (lockedCount === 1) return [main, { kind: "locked", key: "locked-right" }];
  return [main];
}

function resolveThumb(videoUrl: string | null) {
  const provider = parseProviderVideoRef(videoUrl);
  return provider ? provider.thumbUrl : resolveVideoPoster(videoUrl);
}

function DifficultyBars({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  if (!value) return null;
  return (
    <span className="flex gap-[3px]" aria-label={`Dificuldade ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={clsx(
            "rounded-full",
            size === "lg" ? "h-1.5 w-4" : "h-[5px] w-3",
            level <= value ? "bg-primary" : "bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

function OptionCard({
  option,
  tag,
  selected,
  disabled,
  onSelect,
  onPlay
}: {
  option: ReplacementOption;
  tag: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const thumb = resolveThumb(option.videoUrl);
  return (
    <div
      className={clsx(
        "relative flex flex-col overflow-hidden rounded-[18px] border-[1.5px] transition",
        selected ? "border-primary bg-primary/[0.08]" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={!option.videoUrl || disabled}
        aria-label={option.videoUrl ? `Assistir vídeo: ${option.name}` : `${option.name}: vídeo indisponível`}
        className="relative block h-[124px] w-full bg-[#1d1d1d] bg-cover bg-center"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        {!thumb ? <Dumbbell className="absolute left-1/2 top-[45%] h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white/25" aria-hidden="true" /> : null}
        {option.videoUrl ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 py-1 pl-1.5 pr-2 text-[11px] font-semibold text-white">
            <Play className="h-3 w-3 fill-white" aria-hidden="true" />
            Ver vídeo
          </span>
        ) : null}
      </button>
      {tag ? (
        <span className="absolute left-2 top-2 rounded-full bg-primary px-[7px] py-[3px] text-[10px] font-extrabold text-[#052e14]">{tag}</span>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`Escolher ${option.name}`}
        className="flex flex-1 flex-col gap-2 px-[9px] pb-[11px] pt-2.5 text-left"
      >
        <span className="line-clamp-3 min-h-[51px] text-[13px] font-bold leading-[17px] text-white">{option.name}</span>
        {option.difficulty ? (
          <span className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-white/55">Dificuldade</span>
            <DifficultyBars value={option.difficulty} />
          </span>
        ) : null}
        <span className="mt-0.5 flex items-center gap-1.5">
          {selected ? (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-[#052e14]" strokeWidth={3.2} aria-hidden="true" />
              </span>
              <span className="text-xs font-bold text-primary">Escolhido</span>
            </>
          ) : (
            <>
              <span className="h-5 w-5 rounded-full border-2 border-white/35" />
              <span className="text-xs font-semibold text-white/70">Escolher</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

function LockedCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Opção exclusiva do Premium"
      className="relative flex min-h-[250px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[18px] border-[1.5px] border-white/10 bg-white/[0.03] px-2 text-premium"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-premium/40 bg-premium/[0.12]">
        <Crown className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="text-xs font-extrabold">Premium</span>
      <span className="text-center text-[11px] font-medium leading-[14px] text-white/70">Toque para escolher esta opção</span>
    </button>
  );
}

function VideoView({
  option,
  isPremium,
  onBack,
  onChoose
}: {
  option: ReplacementOption;
  isPremium: boolean;
  onBack: () => void;
  onChoose: () => void;
}) {
  const provider = parseProviderVideoRef(option.videoUrl);
  const thumb = resolveThumb(option.videoUrl);
  const [providerSrc, setProviderSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(provider));
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  // Vídeo de fornecedor (YMove): busca um link novo na hora, como no card do treino.
  useEffect(() => {
    cancelled.current = false;
    if (!provider) return;
    void (async () => {
      try {
        const params = new URLSearchParams({ provider: provider.provider, id: provider.id });
        const response = await fetchWithAuth(`/api/exercise-video?${params.toString()}`);
        const payload = (await response.json().catch(() => null)) as
          | { data?: { available?: boolean; videoUrl?: string } }
          | null;
        const src = payload?.data?.available ? payload.data.videoUrl ?? null : null;
        if (cancelled.current) return;
        if (src) setProviderSrc(src);
        else setFailed(true);
      } catch {
        if (!cancelled.current) setFailed(true);
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    })();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id]);

  return (
    <>
      <div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-[14px] border border-white/10 bg-white/[0.04] pl-2.5 pr-3.5 text-[13px] font-semibold text-white transition hover:bg-white/[0.08]"
        >
          <ChevronLeft className="h-5 w-5" />
          Voltar às opções
        </button>
      </div>

      <div className="overflow-hidden rounded-[22px] bg-[#1d1d1d]">
        {provider && providerSrc ? (
          <video
            className="aspect-square w-full bg-black object-contain"
            src={providerSrc}
            poster={thumb ?? undefined}
            title={`Vídeo demonstrativo de ${option.name}`}
            autoPlay
            muted
            loop
            playsInline
            controls
            controlsList="nodownload"
            disablePictureInPicture
            onContextMenu={(event) => event.preventDefault()}
          />
        ) : !provider && option.videoUrl ? (
          <iframe
            className="aspect-video w-full"
            src={toEmbedUrl(option.videoUrl)}
            title={`Vídeo demonstrativo de ${option.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/60">
            {loading ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : failed ? "Vídeo indisponível no momento." : null}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xl font-extrabold leading-tight text-white">{option.name}</h3>
        {option.primaryMuscle ? <p className="text-[13px] capitalize text-white/65">{option.primaryMuscle}</p> : null}
        {option.difficulty ? (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-white/55">Dificuldade</span>
            <DifficultyBars value={option.difficulty} size="lg" />
          </div>
        ) : null}
      </div>

      {isPremium ? (
        <button
          type="button"
          onClick={onChoose}
          className="h-[54px] rounded-2xl bg-primary text-[15px] font-extrabold text-[#052e14] transition hover:opacity-95"
        >
          Escolher este exercício
        </button>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="h-[54px] rounded-2xl border border-white/15 text-[15px] font-bold text-white transition hover:bg-white/[0.05]"
        >
          Voltar
        </button>
      )}
    </>
  );
}
