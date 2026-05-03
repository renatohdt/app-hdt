"use client";

import { useEffect, useState } from "react";

// Quantas páginas o usuário precisa visitar antes do modal aparecer
const PAGE_VIEW_THRESHOLD = 5;

// Após enviar ou dispensar, quantos dias esperar para mostrar de novo
const COOLDOWN_DAYS = 30;

/**
 * Gera chaves do localStorage isoladas por usuário.
 * Sem userId as chaves ficam genéricas — mas userId é sempre passado pelo FeedbackModal.
 */
function storageKeys(userId: string) {
  return {
    count: `feedback_page_count:${userId}`,
    lastShown: `feedback_last_shown_at:${userId}`,
  };
}

/**
 * Controla quando o modal de feedback deve aparecer.
 *
 * Recebe o userId para isolar o contador e o cooldown por usuário —
 * evita que o login de um segundo usuário no mesmo navegador herde
 * o estado (cooldown ou contador zerado) do usuário anterior.
 *
 * Lógica:
 *  1. A cada montagem (nova página visitada), incrementa o contador do usuário.
 *  2. Quando o contador atinge PAGE_VIEW_THRESHOLD, exibe o modal.
 *  3. Após enviar ou dispensar, registra a data e zera o contador daquele usuário.
 */
export function useFeedbackPrompt(userId: string | null) {
  const [shouldShow, setShouldShow] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    // Aguarda o userId estar disponível antes de qualquer ação
    if (typeof window === "undefined" || !userId) return;

    const keys = storageKeys(userId);

    // Verifica cooldown: se já foi mostrado recentemente para este usuário, não exibe
    try {
      const lastShownRaw = localStorage.getItem(keys.lastShown);
      if (lastShownRaw) {
        const lastShown = new Date(lastShownRaw).getTime();
        const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() - lastShown < cooldownMs) {
          return;
        }
      }
    } catch {
      // Ignora falhas de localStorage
    }

    // Incrementa o contador de páginas deste usuário
    let count = 0;
    try {
      const stored = localStorage.getItem(keys.count);
      count = stored ? parseInt(stored, 10) || 0 : 0;
      count += 1;
      localStorage.setItem(keys.count, String(count));
    } catch {
      // Ignora falhas de localStorage
    }

    setPageCount(count);

    // Mostra o modal com um pequeno delay para não competir com o carregamento da página
    if (count >= PAGE_VIEW_THRESHOLD) {
      const timer = window.setTimeout(() => setShouldShow(true), 1500);
      return () => window.clearTimeout(timer);
    }
  // Roda quando o userId fica disponível ou quando monta (nova página visitada)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Chama quando o usuário envia ou dispensa o modal */
  function dismiss(uid: string) {
    setShouldShow(false);
    if (!uid) return;
    const keys = storageKeys(uid);
    try {
      localStorage.setItem(keys.lastShown, new Date().toISOString());
      localStorage.setItem(keys.count, "0");
    } catch {
      // Ignora falhas de localStorage
    }
  }

  return { shouldShow, dismiss, pageCount };
}
