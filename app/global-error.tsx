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
    const isChunkError =
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("ChunkLoadError") ||
      error?.message?.includes("is not a function") ||
      error?.name === "ChunkLoadError";

    if (isChunkError) {
      window.location.reload();
      return;
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
