"use client";

import Link from "next/link";

export function ReferralExpiryPopup({ onClose }: { onClose: () => void }) {
  function handleClose() {
    localStorage.setItem("referral_expiry_seen_v1", "true");
    onClose();
  }

  return (
    <>
      <style>{`
        @keyframes rep-pop-in {
          0% { transform: scale(0.72); opacity: 0; }
          65% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rep-fade-up {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
        {/* Card do popup */}
        <div
          className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-[#111] px-8 pb-8 pt-6 text-center shadow-2xl"
          style={{ animation: "rep-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
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

          {/* Emoji */}
          <div
            className="mt-2 text-6xl"
            style={{ animation: "rep-fade-up 0.4s ease-out 0.1s both" }}
          >
            🥺
          </div>

          {/* Título */}
          <p
            className="mt-5 text-xl font-bold leading-snug text-white"
            style={{ animation: "rep-fade-up 0.5s ease-out 0.2s both" }}
          >
            Seu período Premium acabou...
          </p>

          {/* Subtítulo */}
          <p
            className="mt-3 text-sm leading-relaxed text-white/55"
            style={{ animation: "rep-fade-up 0.5s ease-out 0.3s both" }}
          >
            Queria tanto que você continuasse...🥺
          </p>

          {/* Botões */}
          <div
            className="mt-7 flex flex-col gap-3"
            style={{ animation: "rep-fade-up 0.5s ease-out 0.4s both" }}
          >
            <Link
              href="/premium"
              onClick={handleClose}
              className="flex w-full items-center justify-center rounded-[20px] bg-gradient-to-r from-primary to-primaryStrong py-3.5 text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.98]"
            >
              Assinar Premium
            </Link>

            <button
              type="button"
              onClick={handleClose}
              className="py-2 text-sm font-medium text-white/40 transition hover:text-white/70"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
