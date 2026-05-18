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
