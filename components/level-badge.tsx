"use client";

import { useState } from "react";
import {
  ALMOST_THERE_MESSAGE,
  PHASE_LABELS,
  PHASE_ORDER,
  REGRESSION_MESSAGE,
  type UserPhase,
} from "@/lib/user-level";

// ── Cores por fase ──────────────────────────────────────────────────────────

const PHASE_COLORS: Record<UserPhase, { ring: string; dot: string; badge: string; text: string }> = {
  iniciante:         { ring: "border-zinc-500",   dot: "bg-zinc-400",   badge: "bg-zinc-800",    text: "text-zinc-300" },
  pre_intermediario: { ring: "border-blue-500",   dot: "bg-blue-400",   badge: "bg-blue-900/40", text: "text-blue-300" },
  intermediario:     { ring: "border-yellow-400", dot: "bg-yellow-400", badge: "bg-yellow-900/30", text: "text-yellow-300" },
  pre_avancado:      { ring: "border-orange-400", dot: "bg-orange-400", badge: "bg-orange-900/30", text: "text-orange-300" },
  avancado:          { ring: "border-red-400",    dot: "bg-red-400",    badge: "bg-red-900/30",  text: "text-red-300" },
};

// ── Tipos ──────────────────────────────────────────────────────────────────

export type LevelBadgeData = {
  xpPoints: number;
  currentPhase: UserPhase;
  dotProgress: 0 | 1 | 2 | 3;
  isReadyButWaiting: boolean;
  decayRegressed?: boolean;
  regressionMessage?: string | null;
};

type LevelBadgeProps = {
  data: LevelBadgeData;
};

// ── Componente principal ───────────────────────────────────────────────────

export function LevelBadge({ data }: LevelBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const colors   = PHASE_COLORS[data.currentPhase];
  const label    = PHASE_LABELS[data.currentPhase];
  const phaseIdx = PHASE_ORDER.indexOf(data.currentPhase);
  const isMax    = phaseIdx === PHASE_ORDER.length - 1;

  const balloon =
    data.decayRegressed
      ? REGRESSION_MESSAGE
      : data.isReadyButWaiting
        ? ALMOST_THERE_MESSAGE
        : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex flex-col items-center gap-1 transition hover:brightness-110 active:scale-95"
        aria-label={`Nível: ${label}. Toque para ver detalhes.`}
      >
        <span className={`text-sm font-bold tracking-wide leading-none ${colors.text}`}>
          {label}
        </span>
        {!isMax && (
          <span className="flex items-center gap-[5px]">
            {[1, 2, 3].map((dot) => (
              <span
                key={dot}
                className={`h-[6px] w-[6px] rounded-full transition-all duration-300 ${
                  data.dotProgress >= dot ? colors.dot : "bg-white/15"
                }`}
              />
            ))}
          </span>
        )}
      </button>

      {balloon && (
        <p className={`mt-1 text-xs italic leading-snug ${data.decayRegressed ? "text-red-400" : "text-green-400"}`}>
          {balloon}
        </p>
      )}

      {showModal && (
        <LevelModal
          phase={data.currentPhase}
          xpPoints={data.xpPoints}
          dotProgress={data.dotProgress}
          isReadyButWaiting={data.isReadyButWaiting}
          isMax={isMax}
          colors={colors}
          label={label}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────

function LevelModal({
  phase,
  xpPoints,
  dotProgress,
  isReadyButWaiting,
  isMax,
  colors,
  label,
  onClose,
}: {
  phase: UserPhase;
  xpPoints: number;
  dotProgress: 0 | 1 | 2 | 3;
  isReadyButWaiting: boolean;
  isMax: boolean;
  colors: { ring: string; dot: string; badge: string; text: string };
  label: string;
  onClose: () => void;
}) {
  const phaseDescriptions: Record<UserPhase, string> = {
    iniciante:         "Você está começando sua jornada. Cada treino conta!",
    pre_intermediario: "Seu corpo está se adaptando e os treinos ficando mais eficientes.",
    intermediario:     "Você acessa técnicas avançadas como drop-set, bi-set e mais.",
    pre_avancado:      "Treinos de alta performance com técnicas de intensificação completas.",
    avancado:          "Faixa preta! Você tem acesso ao melhor que o app pode oferecer.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[320px] max-h-[80vh] overflow-y-auto rounded-[20px] border bg-[#111] p-4 shadow-2xl ${colors.ring}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="mb-2.5 flex items-center justify-between">
          <span className={`text-base font-bold ${colors.text}`}>{label}</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition"
            aria-label="Fechar"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Descrição */}
        <p className="mb-3 text-xs leading-relaxed text-white/70">
          {phaseDescriptions[phase]}
        </p>

        {/* Progresso */}
        {!isMax && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-white/50">Progresso para a próxima fase</span>
              <span className={`text-xs font-semibold ${colors.text}`}>{xpPoints} / 250 XP</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${colors.dot}`}
                style={{ width: `${Math.min((xpPoints / 250) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-around">
              {[1, 2, 3].map((dot) => (
                <span
                  key={dot}
                  className={`h-1.5 w-1.5 rounded-full ${dotProgress >= dot ? colors.dot : "bg-white/15"}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Mensagem de estado */}
        {isMax ? (
          <p className="text-center text-sm font-semibold text-yellow-400">
            🏆 Nível máximo alcançado!
          </p>
        ) : isReadyButWaiting ? (
          <p className="rounded-lg border border-green-500/30 bg-white/5 px-3 py-2 text-center text-xs text-green-400">
            ✅ {ALMOST_THERE_MESSAGE}
          </p>
        ) : (
          <div>
            <p className="mb-1 text-center text-xs text-white/40">Como evoluir:</p>
            <ul className="space-y-0.5 text-xs text-white/60">
              <li>🏋️ Conclua treinos <span className="font-medium text-white/80">+2 XP</span></li>
              <li>📅 Semana perfeita <span className="font-medium text-white/80">+5 XP</span></li>
              <li>📆 Mês consistente (≥50%) <span className="font-medium text-white/80">+3 XP</span></li>
              <li>⚖️ Aumente a carga <span className="font-medium text-white/80">+1 XP</span></li>
              <li>🔥 Sequência de 7 dias <span className="font-medium text-white/80">+5 XP</span></li>
            </ul>
            <p className="mt-2 text-center text-xs text-white/30">
              Avanço liberado após 6 meses na fase + 250 XP
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LevelPopup ─────────────────────────────────────────────────────────────

export type LevelPopupProps = {
  emoji: string;
  title: string;
  message: string;
  onClose: () => void;
};

export function LevelPopup({ emoji, title, message, onClose }: LevelPopupProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-[20px] border border-white/10 bg-[#111] p-6 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-5xl">{emoji}</p>
        <p className="mb-2 text-lg font-bold text-white">{title}</p>
        <p className="mb-5 text-sm leading-relaxed text-white/70">{message}</p>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          Entendido!
        </button>
      </div>
    </div>
  );
}
