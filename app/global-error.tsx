"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Chunk load error: acontece após deploy quando o browser tenta carregar
    // chunks antigos que já não existem no servidor. Recarrega silenciosamente.
    // "reading 'call'": o runtime antigo do webpack não acha um módulo do
    // deploy novo (mesmo problema, outra mensagem).
    const message = error?.message ?? "";
    const isChunkError =
      message.includes("Loading chunk") ||
      message.includes("ChunkLoadError") ||
      message.includes("is not a function") ||
      message.includes("reading 'call'") ||
      error?.name === "ChunkLoadError";

    if (isChunkError) {
      // Evita loop: recarrega no máximo 1 vez a cada 30s. Se o erro voltar logo
      // depois do reload, não é versão antiga — é bug real e vai para o Sentry.
      let recentlyReloaded = false;
      try {
        const lastReloadAt = Number(window.sessionStorage.getItem("hdt-chunk-reload-at") ?? 0);
        recentlyReloaded = Date.now() - lastReloadAt < 30_000;
        if (!recentlyReloaded) window.sessionStorage.setItem("hdt-chunk-reload-at", String(Date.now()));
      } catch {
        // sessionStorage indisponível: recarrega mesmo assim (comportamento antigo).
      }
      if (!recentlyReloaded) {
        window.location.reload();
        return;
      }
    }

    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "sans-serif",
          textAlign: "center",
          padding: "24px"
        }}
      >
        <h2 style={{ marginBottom: "16px" }}>Algo deu errado</h2>
        <p style={{ color: "#666", marginBottom: "24px" }}>
    Um erro inesperado aconteceu. Nossa equipe já foi notificada.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            backgroundColor: "#000",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px"
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
