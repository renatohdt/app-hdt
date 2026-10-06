"use client";

import GoogleAd from "@/components/GoogleAd";

/**
 * Anúncio entre os exercícios na tela de treino.
 *
 * Antes era um banner fixo 320x50 — o formato com MENOS anunciantes, que
 * muitas vezes vinha preenchido com o bloco "Descobrir mais" (termos de
 * pesquisa) em vez de um anúncio de verdade. Agora usa o formato responsivo:
 * o Google escolhe o tamanho com mais oferta (300x250, 320x100...).
 *
 * Sem "Remover anúncios" aqui: no meio do treino não tiramos a pessoa da tela.
 * Só renderiza para usuários free com anúncios liberados (regras no GoogleAd).
 */
export function TrainingInlineAd() {
  return (
    <div className="w-full py-1">
      <GoogleAd placement="treino" showRemoveLink={false} />
    </div>
  );
}
