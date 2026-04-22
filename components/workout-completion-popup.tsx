"use client";

import { useState } from "react";

const FUNNY_PHRASES = [
  "Tô até vendo o pump!",
  "Você conseguiu! Quem diria hein... eu não diria.",
  "A melhor parte do treino é quando acaba!",
  "Orgulho do personal!",
  "Precisamos de mais alunos como você!",
  "Esse treino foi fácil, acho que nem vou contar",
  "Bora tomar um milksh... UM WHEY! WHEY!",
  "Dizem que quanto mais você faz, mais fácil fica. Dizem...",
  "#TáPago!",
];

const PARTICLE_COLORS = [
  "#22c55e",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#f97316",
  "#a855f7",
  "#facc15",
  "#6ee7b7",
];

type Particle = {
  id: number;
  color: string;
  left: number;
  top: number;
  tx: number;
  ty: number;
  size: number;
  duration: number;
  delay: number;
  isSquare: boolean;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI + randomBetween(-0.4, 0.4);
    const dist = randomBetween(80, 160);
    return {
      id: i,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)] ?? "#22c55e",
      left: 50 + randomBetween(-6, 6),
      top: 45 + randomBetween(-6, 6),
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      size: randomBetween(5, 10),
      duration: randomBetween(0.9, 1.5),
      delay: randomBetween(0, 0.35),
      isSquare: Math.random() > 0.55,
    };
  });
}

export function WorkoutCompletionPopup({ onClose }: { onClose: () => void }) {
  const [phrase] = useState<string>(() => {
    const index = Math.floor(Math.random() * FUNNY_PHRASES.length);
    return FUNNY_PHRASES[index] ?? FUNNY_PHRASES[0]!;
  });

  const [particles] = useState<Particle[]>(() => generateParticles(30));

  return (
    <>
      <style>{`
        @keyframes wcp-burst {
          0% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: 1;
          }
          75% {
            opacity: 0.7;
          }
          100% {
            transform: translate(var(--wcp-tx), var(--wcp-ty)) scale(0.15) rotate(200deg);
            opacity: 0;
          }
        }
        @keyframes wcp-pop-in {
          0% {
            transform: scale(0.72);
            opacity: 0;
          }
          65% {
            transform: scale(1.04);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes wcp-fade-up {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
        {/* Partículas de fogos */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {particles.map((p) => (
            <div
              key={p.id}
              style={{
                position: "absolute",
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                borderRadius: p.isSquare ? "2px" : "50%",
                ["--wcp-tx" as string]: `${p.tx}px`,
                ["--wcp-ty" as string]: `${p.ty}px`,
                animation: `wcp-burst ${p.duration}s ease-out ${p.delay}s both`,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Card do popup */}
        <div
          className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-[#111] px-8 pb-8 pt-6 text-center shadow-2xl"
          style={{ animation: "wcp-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
        >
          {/* Botão X no canto superior direito */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {/* "Parabéns!" com curvatura via SVG */}
          <svg viewBox="0 0 300 72" className="w-full" aria-label="Parabéns!">
            <defs>
              <path id="wcp-arc-1" d="M 10,62 Q 150,6 290,62" />
            </defs>
            <text
              fontWeight="bold"
              fontSize="43"
              fill="white"
              fontFamily="inherit"
              letterSpacing="1"
            >
              <textPath href="#wcp-arc-1" startOffset="50%" textAnchor="middle">
                Parabéns!
              </textPath>
            </text>
          </svg>

          {/* "+1 sessão!" com curvatura via SVG */}
          <svg viewBox="0 0 300 68" className="-mt-4 w-full" aria-label="+1 sessão!">
            <defs>
              <path id="wcp-arc-2" d="M 10,58 Q 150,6 290,58" />
            </defs>
            <text
              fontWeight="bold"
              fontSize="39"
              fill="#22c55e"
              fontFamily="inherit"
              letterSpacing="0.5"
            >
              <textPath href="#wcp-arc-2" startOffset="50%" textAnchor="middle">
                +1 sessão!
              </textPath>
            </text>
          </svg>

          {/* Frase engraçada aleatória */}
          <p
            className="mt-5 text-sm italic leading-relaxed text-white/70"
            style={{ animation: "wcp-fade-up 0.5s ease-out 0.3s both" }}
          >
            &ldquo;{phrase}&rdquo;
          </p>

        </div>
      </div>
    </>
  );
}
