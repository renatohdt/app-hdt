"use client";

import { useEffect, useState } from "react";
import { X, TrendingUp } from "lucide-react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

type HistoryPoint = {
  date: string;
  maxWeightKg: number;
};

function formatDate(isoDate: string) {
  const d = new Date(isoDate);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function WeightLineChart({ data }: { data: HistoryPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-white/40">
        Registre mais sessões para ver o gráfico.
      </div>
    );
  }

  const W = 280;
  const H = 120;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

  const weights = data.map((p) => p.maxWeightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  const xStep = (W - PAD.left - PAD.right) / (data.length - 1);
  const points = data.map((p, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + ((maxW - p.maxWeightKg) / range) * (H - PAD.top - PAD.bottom),
    weight: p.maxWeightKg,
    date: formatDate(p.date)
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${points[points.length - 1]!.x},${H - PAD.bottom} L${points[0]!.x},${H - PAD.bottom} Z`;

  const yTicks = [minW, (minW + maxW) / 2, maxW];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: 120 }}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid lines */}
      {yTicks.map((tick, i) => {
        const y = PAD.top + ((maxW - tick) / range) * (H - PAD.top - PAD.bottom);
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">
              {tick % 1 === 0 ? tick : tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* area fill */}
      <path d={areaD} fill="url(#wg)" />

      {/* line */}
      <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* dots + tooltip-like labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#22c55e" stroke="#0d100d" strokeWidth="1.5" />
        </g>
      ))}

      {/* x-axis date labels — first and last only */}
      <text x={points[0]!.x} y={H - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.38)">
        {points[0]!.date}
      </text>
      <text x={points[points.length - 1]!.x} y={H - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.38)">
        {points[points.length - 1]!.date}
      </text>
    </svg>
  );
}

export function WeightChartModal({
  exerciseName,
  onClose
}: {
  exerciseName: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth(`/api/exercise-weight?exercise=${encodeURIComponent(exerciseName)}&mode=history`)
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled && result?.data?.history) {
          setHistory(result.data.history);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [exerciseName]);

  const maxKg = history.length ? Math.max(...history.map((p) => p.maxWeightKg)) : null;
  const lastKg = history.length ? history[history.length - 1]!.maxWeightKg : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[26px] border border-white/10 bg-[#0d100d] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-semibold text-white">Evolução de Carga</p>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-white/50">{exerciseName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-white/40 transition hover:text-white/70"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {maxKg !== null ? (
          <div className="mb-4 flex gap-3">
            <div className="flex-1 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">Maior carga</p>
              <p className="mt-1 text-lg font-semibold text-white">{maxKg} <span className="text-sm font-normal text-white/50">kg</span></p>
            </div>
            <div className="flex-1 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">Último treino</p>
              <p className="mt-1 text-lg font-semibold text-white">{lastKg} <span className="text-sm font-normal text-white/50">kg</span></p>
            </div>
          </div>
        ) : null}

        <div className="rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-sm text-white/40">
              Carregando...
            </div>
          ) : history.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-center text-sm text-white/40">
              Nenhum registro ainda.<br />Conclua um treino com carga para começar.
            </div>
          ) : (
            <WeightLineChart data={history} />
          )}
        </div>

        {history.length > 0 ? (
          <p className="mt-3 text-center text-[10px] text-white/30">{history.length} {history.length === 1 ? "registro" : "registros"}</p>
        ) : null}
      </div>
    </div>
  );
}
