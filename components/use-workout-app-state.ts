"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { signOutAndRedirect } from "@/lib/client-signout";
import { buildAppWorkoutData, type AppWorkoutPayload } from "@/lib/app-workout";
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from "@/lib/supabase";

// Cache do payload do treino, compartilhado entre as páginas (dashboard,
// treino, calendário...).
// - Memória: navegação SPA dentro do TTL não refaz o GET /api/workout.
// - localStorage: ao REABRIR o app, a última versão aparece na hora e uma
//   versão nova é buscada em segundo plano (stale-while-revalidate).
const WORKOUT_CACHE_TTL_MS = 60_000;
const WORKOUT_CACHE_STORAGE_KEY = "hdt_workout_cache_v1";
// Não mostra cópia salva mais velha que isso (evita dado muito defasado).
const WORKOUT_CACHE_MAX_STALE_MS = 3 * 24 * 60 * 60 * 1000;

type WorkoutCacheEntry = { userId: string; payload: AppWorkoutPayload; fetchedAt: number };

let workoutCache: WorkoutCacheEntry | null = null;

// Chame após qualquer ação que mude o treino/progresso fora deste hook
// (ex.: concluir treino, regenerar treino no perfil, salvar "Minha semana").
export function invalidateWorkoutCache() {
  workoutCache = null;
  try {
    window.localStorage.removeItem(WORKOUT_CACHE_STORAGE_KEY);
  } catch {
    // localStorage indisponível: só a memória é limpa.
  }
}

function readWorkoutCache(userId: string): AppWorkoutPayload | null {
  if (!workoutCache || workoutCache.userId !== userId) {
    return null;
  }

  if (Date.now() - workoutCache.fetchedAt > WORKOUT_CACHE_TTL_MS) {
    return null;
  }

  return workoutCache.payload;
}

// Última cópia salva no aparelho (pode estar "velha"; serve para mostrar na
// hora enquanto a versão nova chega).
function readStoredWorkoutCache(userId: string): AppWorkoutPayload | null {
  if (workoutCache && workoutCache.userId === userId) {
    return workoutCache.payload;
  }

  try {
    const raw = window.localStorage.getItem(WORKOUT_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as WorkoutCacheEntry;
    if (!entry || entry.userId !== userId || !entry.payload) return null;
    if (Date.now() - entry.fetchedAt > WORKOUT_CACHE_MAX_STALE_MS) return null;
    return entry.payload;
  } catch {
    return null;
  }
}

function writeWorkoutCache(userId: string, payload: AppWorkoutPayload) {
  workoutCache = { userId, payload, fetchedAt: Date.now() };
  try {
    window.localStorage.setItem(WORKOUT_CACHE_STORAGE_KEY, JSON.stringify(workoutCache));
  } catch {
    // Sem espaço/bloqueado: segue só com o cache em memória.
  }
}

export function useWorkoutAppState({ searchUserId }: { searchUserId?: string | null } = {}) {
  const router = useRouter();
  const [payload, setPayload] = useState<AppWorkoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noWorkout, setNoWorkout] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [generatingWorkout, setGeneratingWorkout] = useState(false);
  const [changingWeek, setChangingWeek] = useState(false);

  async function fetchWorkout(userId: string) {
    const response = await fetchWithAuth(`/api/workout?userId=${userId}`);

    if (!response.ok) {
      const result = await parseJsonResponse<{ success: false; error?: string }>(response);
      throw new Error(result.error ?? "Não foi possível carregar o treino.");
    }

    const result = await parseJsonResponse<{ success: true; data: AppWorkoutPayload }>(response);
    return result.data;
  }

  async function fetchWorkoutNoCache(userId: string) {
    const response = await fetchWithAuth(`/api/workout?userId=${userId}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
    });

    if (!response.ok) {
      const result = await parseJsonResponse<{ success: false; error?: string }>(response);
      throw new Error(result.error ?? "Não foi possível carregar o treino.");
    }

    const result = await parseJsonResponse<{ success: true; data: AppWorkoutPayload }>(response);
    return result.data;
  }

  function applyWorkoutUpdate(updatedWorkout: import("@/lib/types").WorkoutPlan) {
    setPayload((current) => {
      if (!current) return current;
      const next = { ...current, workout: updatedWorkout };
      if (currentUserId) {
        writeWorkoutCache(currentUserId, next);
      }
      return next;
    });
  }

  async function reloadWorkout() {
    if (!currentUserId) return;

    try {
      const data = await fetchWorkoutNoCache(currentUserId);
      if (data) {
        writeWorkoutCache(currentUserId, data);
        setPayload(data);
        setNoWorkout(data.hasWorkout === false || !data.workout);
      }
    } catch (reloadError) {
      clientLogError("RELOAD_WORKOUT_ERROR", reloadError);
    }
  }

  // Modo programa: troca a semana exibida, buscando o conteúdo daquela semana.
  async function changeProgramWeek(week: number) {
    if (!currentUserId) return;

    setChangingWeek(true);
    setError(null);

    try {
      const response = await fetchWithAuth(`/api/workout?userId=${currentUserId}&week=${week}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
      });

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        throw new Error(result.error ?? "Não foi possível carregar a semana.");
      }

      const result = await parseJsonResponse<{ success: true; data: AppWorkoutPayload }>(response);
      writeWorkoutCache(currentUserId, result.data);
      setPayload(result.data);
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, "Não foi possível carregar a semana."));
    } finally {
      setChangingWeek(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function logoutAndRedirectLogin() {
      await signOutAndRedirect({
        supabaseClient: supabase,
        redirectTo: "/login",
        onBeforeRedirect: () => {
          if (active) {
            setPayload(null);
            setError(null);
            setNoWorkout(false);
            setLoading(false);
          }
        },
        onError: (signOutError) => {
          clientLogError("WORKOUT APP SIGN OUT ERROR", signOutError);
        }
      });
    }

    async function fetchWorkoutInitial(userId: string) {
      const response = await fetchWithAuth(`/api/workout?userId=${userId}`);

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        const normalizedError = normalizeText(result.error);

        // Sessão salva no aparelho não vale mais (ex.: senha trocada em outro
        // aparelho): sai e manda para o login, como o getUser() fazia antes.
        if (response.status === 401) {
          invalidateWorkoutCache();
          await logoutAndRedirectLogin();
          return null;
        }

        if (response.status === 404 && normalizedError.includes("usuario nao encontrado")) {
          await logoutAndRedirectLogin();
          return null;
        }

        throw new Error(result.error ?? "Não foi possível carregar o treino.");
      }

      const result = await parseJsonResponse<{ success: true; data: AppWorkoutPayload }>(response);
      return result.data;
    }

    async function run() {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) {
          setError(getSupabaseConfigError() ?? "Falha ao inicializar o Supabase.");
          setLoading(false);
        }
        return;
      }

      try {
        let userId = searchUserId ?? undefined;

        if (!userId) {
          // getSession() lê a sessão salva no aparelho (sem ida à rede, renova o
          // token sozinho se precisar). Quem valida de verdade é o servidor em
          // /api/workout — se o token for inválido ele responde 401.
          const {
            data: { session }
          } = await supabase.auth.getSession();

          if (!session?.user?.id) {
            router.replace("/login");
            return;
          }

          userId = session.user.id;
        }

        if (active) {
          setCurrentUserId(userId);
        }

        // Se o treino já foi buscado há pouco (outra página), reaproveita
        // sem fazer novo request.
        const cached = readWorkoutCache(userId);
        if (cached) {
          if (active) {
            setPayload(cached);
            setNoWorkout(cached.hasWorkout === false || !cached.workout);
            setError(null);
          }
          return;
        }

        // Reabertura do app: mostra na hora a última versão salva e busca a
        // nova em segundo plano (a tela atualiza sozinha quando chegar).
        const stored = readStoredWorkoutCache(userId);
        if (stored && active) {
          setPayload(stored);
          setNoWorkout(stored.hasWorkout === false || !stored.workout);
          setError(null);
          setLoading(false);
        }

        let data: AppWorkoutPayload | null;
        try {
          data = await fetchWorkoutInitial(userId);
        } catch (fetchError) {
          // Já há algo na tela: falha silenciosa do refresh em segundo plano.
          if (stored) {
            clientLogError("WORKOUT_BACKGROUND_REFRESH_ERROR", fetchError);
            return;
          }
          throw fetchError;
        }
        if (!data) {
          return;
        }

        writeWorkoutCache(userId, data);

        if (active) {
          setPayload(data);
          setNoWorkout(data.hasWorkout === false || !data.workout);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Não foi possível carregar o treino."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [router, searchUserId]);

  async function handleGenerateWorkoutNow() {
    if (!currentUserId) {
      router.push("/perfil");
      return;
    }

    setGeneratingWorkout(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: currentUserId })
      });

      const result = await parseJsonResponse<
        | { success: false; error?: string }
        | { success: true; data: AppWorkoutPayload }
      >(response);

      if (!response.ok || !result.success) {
        throw new Error(("error" in result ? result.error : undefined) ?? "Não foi possível gerar o treino agora.");
      }

      writeWorkoutCache(currentUserId, result.data);
      setPayload(result.data);
      setNoWorkout(result.data.hasWorkout === false || !result.data.workout);
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, "Não foi possível gerar o treino agora."));
    } finally {
      setGeneratingWorkout(false);
    }
  }

  const data = useMemo(() => buildAppWorkoutData(payload), [payload]);

  return {
    loading,
    error,
    noWorkout,
    currentUserId,
    generatingWorkout,
    changingWeek,
    data,
    handleGenerateWorkoutNow,
    changeProgramWeek,
    reloadWorkout,
    applyWorkoutUpdate
  };
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}
