"use client";

import { useState } from "react";

// ─── Frases engraçadas para compartilhar após o treino ───────────────────────
const WORKOUT_SHARE_PHRASES = [
  "Treino feito, missão comprida! Comprida mesmo, achei que nunca ia acabar! #horadotreino",
  "Treino feito! Tá Pago! O treino, porque o app eu uso free mesmo! hahaha #horadotreino",
  "No app da Hora do Treino diz que se você treina e posta vale o dobro. Eu duvido, mas tá aí! #horadotreino",
  "Só tem duas coisas boas no treino, quando acaba e o resultado! #horadotreino",
  "Treino feito! Na Hora do Treino tava dizendo que agora eu posso tomar duas cervejas... ahh não, é cerejas 😒 #horadotreino",
];

// ─── Frases para conquistas ───────────────────────────────────────────────────
const ACHIEVEMENT_SHARE_PHRASES = [
  "Acabei de desbloquear uma conquista no Hora do Treino! Tô me sentindo o Thor. #horadotreino",
  "Conquista desbloqueada na Hora do Treino, quando a conquista do shape chega, hein?!? #horadotreino",
  "Nova conquista no Hora do Treino! O app reconhece meu esforço. Minha família, nem tanto. #horadotreino",
  "Consegui uma conquista! Treino não tá fácil, mas recompensa tá vindo! #horadotreino",
];

// ─── URLs curtas via rota /go ─────────────────────────────────────────────────
const BASE_URL = "https://app.horadotreino.com.br";

// Parâmetros curtos que a rota /go entende:
//   s: threads | x | wa | bsky
//   m: treino | conquista
function buildShortUrl(source: "threads" | "x" | "wa" | "bsky", medium: "treino" | "conquista") {
  return `${BASE_URL}/go?s=${source}&m=${medium}`;
}

function randomPhrase(phrases: string[]): string {
  const idx = Math.floor(Math.random() * phrases.length);
  return phrases[idx] ?? phrases[0]!;
}

// ─── Funções de compartilhamento ──────────────────────────────────────────────
function shareToX(text: string, url: string) {
  const encoded = encodeURIComponent(`${text}\n${url}`);
  window.open(`https://twitter.com/intent/tweet?text=${encoded}`, "_blank", "noopener,noreferrer");
}

function shareToWhatsApp(text: string, url: string) {
  const encoded = encodeURIComponent(`${text}\n${url}`);
  // Usa o esquema nativo whatsapp:// para abrir o app diretamente,
  // evitando a página web que pede download no iOS e não distingue
  // WhatsApp pessoal de Business no Android.
  window.location.href = `whatsapp://send?text=${encoded}`;
}

function shareToBluesky(text: string, url: string) {
  const encoded = encodeURIComponent(`${text}\n${url}`);
  window.open(`https://bsky.app/intent/compose?text=${encoded}`, "_blank", "noopener,noreferrer");
}

function shareToThreads(text: string, url: string) {
  // Threads usa o mesmo intent de compartilhamento que o Instagram via Web
  const encoded = encodeURIComponent(`${text}\n${url}`);
  window.open(`https://www.threads.net/intent/post?text=${encoded}`, "_blank", "noopener,noreferrer");
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ShareContext = "workout" | "achievement";

interface ShareButtonProps {
  context: ShareContext;
  /** Texto personalizado da conquista (opcional) */
  achievementTitle?: string;
  /** Substitui todas as frases geradas pelo componente */
  customText?: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ShareButton({ context, achievementTitle, customText }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const phrases = context === "workout" ? WORKOUT_SHARE_PHRASES : ACHIEVEMENT_SHARE_PHRASES;

  // Monta o texto base, incluindo o título da conquista se fornecido
  const basePhrase = randomPhrase(phrases);
  const shareText = customText ?? (achievementTitle
    ? `🏆 ${achievementTitle}! ${basePhrase}`
    : basePhrase);

  function handleShare(platform: "threads" | "twitter" | "whatsapp" | "bluesky") {
    const medium = context === "workout" ? "treino" : "conquista";

    if (platform === "threads") {
      shareToThreads(shareText, buildShortUrl("threads", medium));
    } else if (platform === "twitter") {
      shareToX(shareText, buildShortUrl("x", medium));
    } else if (platform === "whatsapp") {
      shareToWhatsApp(shareText, buildShortUrl("wa", medium));
    } else {
      shareToBluesky(shareText, buildShortUrl("bsky", medium));
    }

    setOpen(false);
  }

  async function handleCopy() {
    const medium = context === "workout" ? "treino" : "conquista";
    const url = buildShortUrl("threads", medium);
    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="relative w-full">
      {/* Botão principal */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-primary/30 bg-primary/10 py-3 text-sm font-semibold text-primary transition hover:bg-primary/20 active:scale-[0.98]"
      >
        <ShareIcon />
        Compartilhar
      </button>

      {/* Painel de opções */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[16px] border border-white/10 bg-[#1a1a1a] p-3 shadow-2xl">
          <p className="mb-2 px-1 text-xs text-white/40">Compartilhar via</p>

          <div className="flex flex-col gap-2">
            {/* Threads */}
            <button
              type="button"
              onClick={() => handleShare("threads")}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
            >
              <ThreadsIcon />
              <span>Threads</span>
            </button>

            {/* X (Twitter) */}
            <button
              type="button"
              onClick={() => handleShare("twitter")}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
            >
              <XIcon />
              <span>X (Twitter)</span>
            </button>

            {/* WhatsApp */}
            <button
              type="button"
              onClick={() => handleShare("whatsapp")}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
            >
              <WhatsAppIcon />
              <span>WhatsApp</span>
            </button>

            {/* Bluesky */}
            <button
              type="button"
              onClick={() => handleShare("bluesky")}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
            >
              <BlueskyIcon />
              <span>Bluesky</span>
            </button>

            {/* Copiar link */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
            >
              <CopyIcon />
              <span>{copied ? "Copiado! ✓" : "Copiar texto"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ícones inline (SVG) ──────────────────────────────────────────────────────
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.887a.5.5 0 0 0 .611.61l6.098-1.598A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.37l-.361-.214-3.735.979.996-3.648-.235-.374A9.862 9.862 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1c5.466 0 9.9 4.434 9.9 9.9 0 5.466-4.434 9.9-9.9 9.9z" />
    </svg>
  );
}

function BlueskyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.01c.028-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.293-.883-2.32-.887h-.03c-.788 0-1.84.226-2.518 1.276l-1.735-1.183c.94-1.47 2.464-2.281 4.253-2.281h.043c3.088.017 4.998 1.913 5.038 5.09.01.285-.002.568-.035.848.793.498 1.478 1.163 2.003 1.999.963 1.54 1.123 3.529.435 5.42C19.716 21.996 17.07 24 12.186 24z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
