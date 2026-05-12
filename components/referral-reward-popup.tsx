"use client";

import { useState } from "react";

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
    const dist = randomBetween(80, 180);
    return {
      id: i,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)] ?? "#22c55e",
      left: 50 + randomBetween(-6, 6),
      top: 45 + randomBetween(-6, 6),
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      size: randomBetween(5, 11),
      duration: randomBetween(0.9, 1.6),
      delay: randomBetween(0, 0.4),
      isSquare: Math.random() > 0.5,
    };
  });
}

export function ReferralRewardPopup({ onClose }: { onClose: () => void }) {
  const [particles] = useState<Particle[]>(() => generateParticles(36));

  function handleClose() {
    localStorage.setItem("referral_reward_seen_v1", "true");
    onClose();
  }

  return (
    <>
      <style>{`
        @keyframes rrp-burst {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          75% { opacity: 0.7; }
          100% { transform: translate(var(--rrp-tx), var(--rrp-ty)) scale(0.15) rotate(200deg); opacity: 0; }
        }
        @keyframes rrp-pop-in {
          0% { transform: scale(0.72); opacity: 0; }
          65% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rrp-fade-up {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
        {/* Partículas de confete */}
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
                ["--rrp-tx" as string]: `${p.tx}px`,
                ["--rrp-ty" as string]: `${p.ty}px`,
                animation: `rrp-burst ${p.duration}s ease-out ${p.delay}s both`,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Card do popup */}
        <div
          className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-[#111] px-8 pb-8 pt-6 text-center shadow-2xl"
          style={{ animation: "rrp-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
        >
          {/* Botão X */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* "Parabéns!" curvado — mesmo padrão do WorkoutCompletionPopup */}
          <svg viewBox="0 0 300 72" className="w-full" aria-label="Parabéns!">
            <defs>
              <path id="rrp-arc-1" d="M 10,62 Q 150,6 290,62" />
            </defs>
            <text fontWeight="bold" fontSize="43" fill="white" fontFamily="inherit" letterSpacing="1">
              <textPath href="#rrp-arc-1" startOffset="50%" textAnchor="middle">
                Parabéns!
              </textPath>
            </text>
          </svg>

          {/* "30 dias de Premium!" curvado em verde */}
          <svg viewBox="0 0 340 62" className="-mt-3 w-full" aria-label="30 dias de Premium!">
            <defs>
              <path id="rrp-arc-2" d="M 10,54 Q 170,6 330,54" />
            </defs>
            <text fontWeight="bold" fontSize="28" fill="#22c55e" fontFamily="inherit" letterSpacing="0.5">
              <textPath href="#rrp-arc-2" startOffset="50%" textAnchor="middle">
                30 dias de Premium! 🎉
              </textPath>
            </text>
          </svg>

          {/* Linhas da mensagem */}
          <p
            className="mt-4 text-base font-semibold leading-snug text-white"
            style={{ animation: "rrp-fade-up 0.5s ease-out 0.25s both" }}
          >
            Você falou tanto de mim! 😍
          </p>

          <p
            className="mt-2 text-sm text-white/60"
            style={{ animation: "rrp-fade-up 0.5s ease-out 0.35s both" }}
          >
            Aqui está seu prêmio!
          </p>

          <p
            className="mt-4 text-[13px] italic leading-relaxed text-white/45"
            style={{ animation: "rrp-fade-up 0.5s ease-out 0.45s both" }}
          >
            10 burpees no seu treino...<br />
            e 30 dias de Premium! 🎉
          </p>

          {/* Botão CTA */}
          <button
            type="button"
            onClick={handleClose}
            className="mt-6 w-full rounded-[20px] bg-gradient-to-r from-primary to-primaryStrong py-3.5 text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.98]"
            style={{ animation: "rrp-fade-up 0.5s ease-out 0.55s both" }}
          >
            Aceito o Premium, recuso os burpees! 😤
          </button>
        </div>
      </div>
    </>
  );
}
