/**
 * Vídeo do exercício: próprio (YouTube Hora do Treino) ou de fornecedor externo (YMove).
 *
 * Regra: o vídeo próprio (video_url) SEMPRE tem prioridade. O vídeo do fornecedor só
 * aparece quando o exercício ainda não tem vídeo próprio.
 *
 * Para não mexer em todos os tipos do treino, o vídeo do fornecedor viaja no mesmo
 * campo "videoUrl" como uma referência curta:
 *   provider:ymove/<id>?thumb=<capa codificada>
 * O link real do vídeo NUNCA é salvo (os links da YMove vencem em 48h). O card pede
 * um link novo para /api/exercise-video na hora em que o usuário toca no play.
 *
 * Este arquivo roda no servidor e no navegador (não tem chave nem segredo).
 */

export type ExerciseVideoProvider = "ymove";

/** Tag do cache do catálogo de exercícios (app/api/workout). O admin limpa ao salvar. */
export const EXERCISES_CATALOG_CACHE_TAG = "exercises-catalog";

export type ProviderVideoRef = {
  provider: ExerciseVideoProvider;
  id: string;
  thumbUrl: string | null;
};

type ExerciseVideoSource = {
  video_url?: string | null;
  video_provider?: string | null;
  video_provider_id?: string | null;
  video_thumb_url?: string | null;
};

const REF_PREFIX = "provider:";
const SUPPORTED_PROVIDERS: ExerciseVideoProvider[] = ["ymove"];

// IDs aceitos: letras, números, hífen, sublinhado e ponto (evita injeção na URL da API).
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/;

export function isSupportedVideoProvider(value: unknown): value is ExerciseVideoProvider {
  return typeof value === "string" && (SUPPORTED_PROVIDERS as string[]).includes(value);
}

export function isSafeProviderVideoId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

/** Monta a referência que vai no campo videoUrl do treino. */
export function buildProviderVideoRef(provider: ExerciseVideoProvider, id: string, thumbUrl?: string | null) {
  const base = `${REF_PREFIX}${provider}/${encodeURIComponent(id)}`;
  return thumbUrl ? `${base}?thumb=${encodeURIComponent(thumbUrl)}` : base;
}

/** Lê a referência do fornecedor. Retorna null se for um link normal (ex.: YouTube). */
export function parseProviderVideoRef(value?: string | null): ProviderVideoRef | null {
  if (!value || !value.startsWith(REF_PREFIX)) return null;
  const rest = value.slice(REF_PREFIX.length);
  const [path, query = ""] = rest.split("?");
  const [provider, rawId] = path.split("/");
  if (!isSupportedVideoProvider(provider) || !rawId) return null;
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  if (!isSafeProviderVideoId(id)) return null;
  const thumbParam = new URLSearchParams(query).get("thumb");
  const thumbUrl = thumbParam && /^https:\/\//i.test(thumbParam) ? thumbParam : null;
  return { provider, id, thumbUrl };
}

/**
 * Vídeo a usar para um exercício do catálogo: o próprio (YouTube) ou a referência do
 * fornecedor. Usar em todo lugar onde antes se lia exercise.video_url para montar o treino.
 */
export function resolveExerciseVideoUrl(exercise?: ExerciseVideoSource | null): string | null {
  if (!exercise) return null;
  const own = exercise.video_url?.trim();
  if (own) return own;
  if (isSupportedVideoProvider(exercise.video_provider) && isSafeProviderVideoId(exercise.video_provider_id)) {
    return buildProviderVideoRef(exercise.video_provider, exercise.video_provider_id, exercise.video_thumb_url ?? null);
  }
  return null;
}
