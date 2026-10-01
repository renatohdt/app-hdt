"use client";

type SignOutClient = {
  auth?: {
    signOut: () => Promise<unknown>;
  };
} | null;

export async function signOutAndRedirect(options: {
  supabaseClient: SignOutClient;
  redirectTo?: string;
  onBeforeRedirect?: () => void;
  onError?: (error: unknown) => void;
}) {
  const { supabaseClient, redirectTo = "/login", onBeforeRedirect, onError } = options;

  // Limpa os caches de treino salvos no aparelho (não podem vazar para a
  // próxima conta que entrar neste celular).
  try {
    window.localStorage.removeItem("hdt_workout_cache_v1");
    window.localStorage.removeItem("hdt_session_logs_cache_v1");
    window.localStorage.removeItem("hdt_profile_cache_v1");
  } catch {
    // ignora
  }

  try {
    await supabaseClient?.auth?.signOut();
  } catch (error) {
    onError?.(error);
  } finally {
    onBeforeRedirect?.();

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.location.replace(redirectTo);
      }, 0);
    }
  }
}
