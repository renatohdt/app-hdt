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
  const { supabaseClient, redirectTo = "/", onBeforeRedirect, onError } = options;

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
