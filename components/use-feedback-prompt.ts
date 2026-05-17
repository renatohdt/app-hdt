"use client";

import { useEffect, useState } from "react";

// Quantos dias o usuário precisa usar o app antes do modal aparecer
const DAYS_UNTIL_PROMPT = 5;

// Após enviar ou dispensar, quantos dias esperar para mostrar de novo
const COOLDOWN_DAYS = 30;

/**
 * Gera chaves do localStorage isoladas por usuário.
 * Sem userId as chaves ficam genéricas — mas userId é sempre passado pelo FeedbackModal.
 */
function storageKeys(userId: string) {
  return {
    count: `feedback_page_count:${userId}`,
    firstAccess: `feedback_first_access:${userId}`,
    lastShown: `feedback_last_shown_at:${userId}`,
  };
}

/**
 * Controla quando o modal de feedback deve aparecer.
 *
 * Recebe o userId para isolar o estado por usuário —
 * evita que o login de um segundo usuário no mesmo navegador herde
 * o estado (cooldown ou datas) do usuário anterior.
 *
 * Lógica:
 *  1. No primeiro acesso, registra a data de início de uso do app.
 *  2. A cada montagem (nova página visitada), incrementa o contador (para análise).
 *  3. Quando DAYS_UNTIL_PROMPT dias tiverem passado desde o primeiro acesso, exibe o modal.
 *  4. Após enviar ou dispensar, registra a data e o modal só reaparece após COOLDOWN_DAYS dias.
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

    // Registra a data do primeiro acesso (se ainda não estiver salva)
    try {
      if (!localStorage.getItem(keys.firstAccess)) {
        localStorage.setItem(keys.firstAccess, new Date().toISOString());
      }
    } catch {
      // Ignora falhas de localStorage
    }

    // Incrementa o contador de páginas deste usuário (mantido para análise)
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

    // Verifica se já passaram DAYS_UNTIL_PROMPT dias desde o primeiro acesso
    let daysElapsed = 0;
    try {
      const firstAccessRaw = localStorage.getItem(keys.firstAccess);
      if (firstAccessRaw) {
        const firstAccess = new Date(firstAccessRaw).getTime();
        daysElapsed = (Date.now() - firstAccess) / (1000 * 60 * 60 * 24);
      }
    } catch {
      // Ignora falhas de localStorage
    }

    // Mostra o modal com um pequeno delay para não competir com o carregamento da página
    if (daysElapsed >= DAYS_UNTIL_PROMPT) {
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
