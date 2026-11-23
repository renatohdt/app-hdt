/**
 * Helpers de vídeo do YouTube (link de incorporação e capa), usados pelo card do
 * exercício e pela tela de escolha de substituto.
 */

export function toEmbedUrl(url: string) {
  if (url.includes("youtube.com/embed/")) return url;
  if (url.includes("watch?v=")) return url.replace("watch?v=", "embed/");
  if (url.includes("youtu.be/")) return url.replace("youtu.be/", "youtube.com/embed/");
  return url;
}

export function resolveVideoPoster(url?: string | null) {
  if (!url) {
    return null;
  }

  const youtubeId = resolveYoutubeId(url);
  if (!youtubeId) {
    return null;
  }

  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

function resolveYoutubeId(url: string) {
  const watchMatch = url.match(/[?&]v=([^&]+)/i);
  if (watchMatch?.[1]) {
    return watchMatch[1];
  }

  const shortMatch = url.match(/youtu\.be\/([^?]+)/i);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }

  const embedMatch = url.match(/embed\/([^?]+)/i);
  return embedMatch?.[1] ?? null;
}
