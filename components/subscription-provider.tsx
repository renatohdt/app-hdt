"use client";

import type { ReactNode } from "react";
import { SubscriptionContext, useSubscriptionLoader } from "@/components/use-subscription";

// Faz o fetch de /api/subscription uma única vez e disponibiliza para toda a árvore.
// Todos os componentes que chamam useSubscription() vão compartilhar esse resultado
// em vez de disparar chamadas individuais à API.
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const value = useSubscriptionLoader();
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
