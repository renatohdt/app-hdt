"use client";

// Cópia do último /api/profile salva no aparelho: a tela de perfil abre na hora
// com ela e atualiza em segundo plano (stale-while-revalidate).
// O logout apaga esta chave (lib/client-signout.ts).
export const PROFILE_CACHE_STORAGE_KEY = "hdt_profile_cache_v1";
const PROFILE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type ProfileCacheEntry<T> = { userId: string; payload: T; savedAt: number };

export function readProfileCache<T>(userId: string): T | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ProfileCacheEntry<T>;
    if (!entry || entry.userId !== userId || !entry.payload) return null;
    if (Date.now() - entry.savedAt > PROFILE_CACHE_MAX_AGE_MS) return null;
    return entry.payload;
  } catch {
    return null;
  }
}

export function writeProfileCache<T>(userId: string, payload: T) {
  try {
    const entry: ProfileCacheEntry<T> = { userId, payload, savedAt: Date.now() };
    window.localStorage.setItem(PROFILE_CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // sem espaço/bloqueado: segue sem cache
  }
}
