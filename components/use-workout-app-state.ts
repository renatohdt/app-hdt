"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { signOutAndRedirect } from "@/lib/client-signout";
import { buildAppWorkoutData, type AppWorkoutPayload } from "@/lib/app-workout";
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from "@/lib/supabase";

export function useWorkoutAppState({ searchUserId }: { searchUserId?: string | null } = {}) {
  const router = useRouter();
  const [payload, setPayload] = useState<AppWorkoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noWorkout, setNoWorkout] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [generatingWorkout, setGeneratingWorkout] = useState(false);

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

    async function fetchWorkout(userId: string) {
      const response = await fetchWithAuth(`/api/workout?userId=${userId}`);

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        const normalizedError = normalizeText(result.error);

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
          const {
            data: { user }
          } = await supabase.auth.getUser();

          if (!user?.id) {
            router.replace("/login");
            return;
          }

          userId = user.id;
        }

        if (active) {
          setCurrentUserId(userId);
        }

        const data = await fetchWorkout(userId);
        if (!data) {
          return;
        }

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
    data,
    handleGenerateWorkoutNow
  };
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}
