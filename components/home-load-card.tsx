"use client";

// Premium: mini resumo da evolução de carga na Home (os maiores ganhos).
// Mostra todo dia o valor do Premium. Toque leva ao gráfico na Evolução.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import type { LoadEvolutionResponse } from "@/app/api/evolution/loads/route";

export function HomeLoadCard() {
  const [result, setResult] = useState<LoadEvolutionResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/evolution/loads?summary=1")
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: LoadEvolutionResponse }) => {
        if (active && json?.success && json.data) setResult(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!result || result.locked) return null;

  return (
    <Link href="/calendario?tab=progresso" className="block">
      <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none transition hover:border-white/12 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-premium">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Evolução de carga
          </p>
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-white/45">
            Ver gráfico <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>

        {result.items.length ? (
          <ul className="mt-2.5 space-y-1.5">
            {result.items.slice(0, 2).map((item) => {
              const gainPct = item.firstKg > 0 ? Math.round(((item.maxKg - item.firstKg) / item.firstKg) * 100) : 0;
              return (
                <li key={item.name} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-white/80">{item.name}</span>
                  <span className="shrink-0 font-semibold text-white">
                    {formatKg(item.firstKg)} → {formatKg(item.maxKg)}
                    <span className="ml-1.5 text-primary">+{gainPct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-snug text-white/55">
            Registre as cargas durante o treino e acompanhe aqui o quanto você está ficando mais forte.
          </p>
        )}
      </Card>
    </Link>
  );
}

function formatKg(kg: number) {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace(".", ",")} kg`;
}
