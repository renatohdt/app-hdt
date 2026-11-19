import "server-only";

import { logWarn } from "@/lib/server-logger";

/**
 * Conversa com a API da YMove (vídeos de exercícios licenciados).
 * SÓ roda no servidor: a chave (YMOVE_API_KEY) nunca vai para o app.
 *
 * Regras da YMove que este arquivo respeita:
 *  - Os links de vídeo vencem em 48h e NÃO podem ser salvos: buscamos um novo a cada play.
 *  - As capas (thumbnails) não vencem e podem ser salvas no banco.
 *  - Ao passar do limite do plano, a API devolve os dados SEM os campos de vídeo
 *    (com um "_warning"). Nesse caso devolvemos "unavailable" e o app mostra só a capa.
 */

const BASE_URL = "https://exercise-api.ymove.app/api/v2";
const TIMEOUT_MS = 8000;

export type YmoveVideoResult =
  | { status: "ok"; videoUrl: string; hlsUrl: string | null; thumbUrl: string | null }
  | { status: "unavailable"; reason: "no_key" | "not_found" | "over_limit" | "error" };

export type YmoveExerciseSummary = {
  id: string;
  name: string;
  thumbUrl: string | null;
  muscleGroup: string | null;
  equipment: string[];
};

function getApiKey() {
  return process.env.YMOVE_API_KEY?.trim() || null;
}

async function ymoveGet(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = getApiKey();
  if (!key) return { ok: false, status: 0, body: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
      signal: controller.signal
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A resposta pode vir como o exercício direto ou dentro de "data"/"exercise". */
function unwrapExercise(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  return asRecord(root?.data) ?? asRecord(root?.exercise) ?? root;
}

// A capa pode vir como texto (link) ou como objeto ({ url, width, height }).
function readImageUrl(value: unknown): string | null {
  if (typeof value === "string") return /^https:\/\//i.test(value.trim()) ? value.trim() : null;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["url", "src", "href", "landscape", "default"]) {
    const found = readImageUrl(record[key]);
    if (found) return found;
  }
  return null;
}

function extractThumb(exercise: Record<string, unknown> | null): string | null {
  if (!exercise) return null;
  const thumbs = exercise.thumbnails;
  // Preferência: paisagem (16:9, igual à caixa do vídeo no app).
  const thumbRecord = asRecord(thumbs);
  for (const key of ["landscape", "default", "original", "square", "portrait"]) {
    const found = readImageUrl(thumbRecord?.[key]);
    if (found) return found;
  }
  if (Array.isArray(thumbs)) {
    for (const item of thumbs) {
      const found = readImageUrl(item);
      if (found) return found;
    }
  }
  for (const key of ["thumbnailUrl", "thumbnail", "posterUrl", "poster", "imageUrl", "image"]) {
    const found = readImageUrl(exercise[key]);
    if (found) return found;
  }
  const firstVideo = Array.isArray(exercise.videos) ? asRecord(exercise.videos[0]) : null;
  if (firstVideo) {
    for (const key of ["thumbnailUrl", "thumbnail", "thumbnails", "posterUrl", "poster"]) {
      const found = key === "thumbnails" ? extractThumb(firstVideo) : readImageUrl(firstVideo[key]);
      if (found) return found;
    }
  }
  return null;
}

/** Busca um link NOVO do vídeo de um exercício da YMove (pelo ID estável). */
export async function getYmoveVideo(id: string): Promise<YmoveVideoResult> {
  if (!getApiKey()) return { status: "unavailable", reason: "no_key" };
  try {
    const { ok, status, body } = await ymoveGet(`/exercises/${encodeURIComponent(id)}`);
    if (status === 404) return { status: "unavailable", reason: "not_found" };
    if (!ok) {
      logWarn("ymove", "Falha ao buscar vídeo", { id, status });
      return { status: "unavailable", reason: "error" };
    }
    const exercise = unwrapExercise(body);
    const firstVideo = Array.isArray(exercise?.videos) ? asRecord(exercise?.videos[0]) : null;
    const videoUrl = pickString(exercise, "videoUrl") ?? pickString(firstVideo, "videoUrl") ?? pickString(firstVideo, "url");
    const hlsUrl = pickString(exercise, "videoHlsUrl") ?? pickString(firstVideo, "videoHlsUrl");
    if (!videoUrl) {
      const warned = Boolean(asRecord(body)?._warning ?? exercise?._warning);
      if (warned) logWarn("ymove", "Limite do plano atingido: vídeo sem link", { id });
      return { status: "unavailable", reason: warned ? "over_limit" : "error" };
    }
    return { status: "ok", videoUrl, hlsUrl, thumbUrl: extractThumb(exercise) };
  } catch (error) {
    logWarn("ymove", "Erro de rede ao buscar vídeo", { id, error: error instanceof Error ? error.message : String(error) });
    return { status: "unavailable", reason: "error" };
  }
}

/** Busca exercícios na YMove pelo nome (para o admin). Não puxa vídeos: não gasta o limite. */
export async function searchYmoveExercises(query: string, limit = 20): Promise<YmoveExerciseSummary[] | null> {
  if (!getApiKey()) return null;
  const params = new URLSearchParams({ search: query, q: query, limit: String(limit), excludeVideos: "1" });
  const { ok, body } = await ymoveGet(`/exercises?${params.toString()}`);
  if (!ok) return null;
  const root = asRecord(body);
  const list = Array.isArray(body)
    ? body
    : Array.isArray(root?.data)
      ? root?.data
      : Array.isArray(root?.exercises)
        ? root?.exercises
        : [];
  return (list as unknown[])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: String(item.id ?? item.slug ?? ""),
      name: pickString(item, "name") ?? pickString(item, "title") ?? "",
      thumbUrl: extractThumb(item),
      muscleGroup: pickString(item, "muscleGroup"),
      equipment: Array.isArray(item.equipment)
        ? item.equipment.filter((e): e is string => typeof e === "string")
        : typeof item.equipment === "string"
          ? [item.equipment]
          : []
    }))
    .filter((item) => item.id && item.name);
}
