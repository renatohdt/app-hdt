"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Lock, Search, TrendingUp, Trophy, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";
import { GoalCard } from "@/components/goal-card";
import { LevelModal, PHASE_COLORS } from "@/components/level-badge";
import { UpsellModal } from "@/components/upsell-modal";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getAllAchievementsUnified, type ConsistencyStats } from "@/lib/achievements";
import type { AppWorkoutData } from "@/lib/app-workout";
import { buildLevelProgress } from "@/lib/evolution";
import { normalizeUserPhase, PHASE_ORDER } from "@/lib/user-level";
import type { LoadEvolutionResponse } from "@/app/api/evolution/loads/route";

export function ProgressTab({
  data,
  consistencyStats,
  perfectWeeks,
  onOpenAchievements
}: {
  data: AppWorkoutData;
  consistencyStats: ConsistencyStats;
  perfectWeeks: number;
  onOpenAchievements: () => void;
}) {
  const level = useMemo(() => buildLevelProgress(data.levelData), [data.levelData]);

  const achievements = useMemo(() => {
    const groups = getAllAchievementsUnified(
      data.totalWorkoutsAllTime,
      data.totalWeightIncreasesAllTime,
      consistencyStats,
      data.totalGoalsCompleted,
      data.referralAchievementUnlocked
    );
    const all = groups.flatMap((g) => g.achievements);
    const unlocked = all.filter((a) => a.unlocked).length;
    return { total: all.length, unlocked, pct: all.length ? Math.round((unlocked / all.length) * 100) : 0 };
  }, [data, consistencyStats]);

  return (
    <>
      {level && data.levelData ? <LevelCard level={level} levelData={data.levelData} /> : null}

      <div className="grid grid-cols-3 gap-2">
        <StatTile value={data.totalWorkoutsAllTime} label="treinos no total" />
        <StatTile value={perfectWeeks} label={perfectWeeks === 1 ? "semana perfeita" : "semanas perfeitas"} />
        <StatTile value={data.totalWeightIncreasesAllTime} label="aumentos de carga" />
      </div>

      <LoadEvolutionCard />

      <button type="button" onClick={onOpenAchievements} className="w-full text-left">
        <Card className="space-y-3 p-5 transition hover:border-primary/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-primary/15 bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/90">Conquistas</p>
                <p className="mt-0.5 text-base font-semibold text-white">
                  {achievements.unlocked} de {achievements.total} desbloqueadas
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${achievements.pct}%` }} />
          </div>
          <p className="text-xs text-white/40">
            {achievements.unlocked === 0
              ? "Complete treinos para desbloquear suas primeiras conquistas."
              : achievements.unlocked === achievements.total
                ? "Você desbloqueou todas as conquistas disponíveis!"
                : "Toque para ver todas e descobrir as próximas."}
          </p>
        </Card>
      </button>

      <GoalCard activeGoal={data.activeGoal} readOnly />
    </>
  );
}

// Card de nível com as cores da fase (iguais às da dashboard). Toque abre o
// popup "Como evoluir", o mesmo da dashboard.
function LevelCard({
  level,
  levelData
}: {
  level: NonNullable<ReturnType<typeof buildLevelProgress>>;
  levelData: NonNullable<AppWorkoutData["levelData"]>;
}) {
  const [showModal, setShowModal] = useState(false);
  const phase = normalizeUserPhase(levelData.currentPhase);
  const colors = PHASE_COLORS[phase];
  const xp = Math.max(0, levelData.xpPoints);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`block w-full rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5 text-left transition active:scale-[0.99] ${colors.ring}`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-white/50">Seu nível</p>
          <span className="text-[11px] font-semibold text-white/40">Como evoluir ›</span>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className={`text-[24px] font-extrabold leading-tight ${colors.text}`}>{level.phaseLabel}</p>
          {!level.isMaxLevel ? (
            <div className="mb-1.5 flex gap-1.5" aria-label={`${level.dotProgress} de 3 pontos`}>
              {[1, 2, 3].map((dot) => (
                <span key={dot} className={`h-3 w-3 rounded-full ${dot <= level.dotProgress ? colors.dot : "bg-white/15"}`} />
              ))}
            </div>
          ) : (
            <span className="mb-1 text-2xl">👑</span>
          )}
        </div>

        {level.isMaxLevel ? (
          <p className="mt-2 text-sm text-white/65">Você chegou ao nível máximo. Agora é manter o topo! · {xp} XP</p>
        ) : (
          <>
            <p className="mt-4 text-xs font-semibold text-white/75">
              Rumo ao {level.nextPhaseLabel}
              {level.isReadyButWaiting ? <span className="text-green-400"> · Falta pouco para evoluir!</span> : null}
            </p>
            <div className="mt-2.5 space-y-3">
              <ProgressBar label="XP acumulado" value={`${xp} / 250 XP`} pct={level.pointsPct} barClass={colors.dot} />
              <ProgressBar
                label="Tempo na fase"
                value={`${level.monthsInPhase} de ${level.monthsRequired} meses`}
                pct={level.timePct}
                barClass={colors.dot}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              {xp === 0
                ? "Cada treino concluído soma XP. Toque aqui para ver todas as formas de evoluir."
                : "Para evoluir de fase você precisa das duas barras completas: XP e tempo."}
            </p>
          </>
        )}
      </button>

      {showModal ? (
        <LevelModal
          phase={phase}
          xpPoints={xp}
          dotProgress={levelData.dotProgress}
          isReadyButWaiting={levelData.isReadyButWaiting}
          isMax={PHASE_ORDER.indexOf(phase) === PHASE_ORDER.length - 1}
          colors={colors}
          label={level.phaseLabel}
          onClose={() => setShowModal(false)}
        />
      ) : null}
    </>
  );
}

function ProgressBar({ label, value, pct, barClass }: { label: string; value: string; pct: number; barClass: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span className={pct >= 100 ? "font-semibold text-green-400" : ""}>{pct >= 100 ? `✓ ${value}` : value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xl font-extrabold leading-none text-white">{value}</p>
      <p className="mt-1.5 text-[11px] leading-tight text-white/50">{label}</p>
    </div>
  );
}

// Evolução de carga: Premium vê o gráfico de cada exercício; Free vê só o destaque.
function LoadEvolutionCard() {
  const [result, setResult] = useState<LoadEvolutionResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [showUpsell, setShowUpsell] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/evolution/loads")
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: LoadEvolutionResponse }) => {
        if (active && json?.success && json.data) setResult(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!result) return null;

  const item = result.items[selected] ?? result.items[0];
  const gainPct = item && item.firstKg > 0 ? Math.round(((item.maxKg - item.firstKg) / item.firstKg) * 100) : 0;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
          Evolução de carga
        </p>
        {result.locked ? (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">PREMIUM</span>
        ) : null}
      </div>

      {!item ? (
        <p className="text-sm leading-relaxed text-white/60">
          Registre as cargas nos exercícios durante o treino e acompanhe aqui o quanto você está ficando mais forte.
        </p>
      ) : (
        <>
          <p className="text-sm font-bold text-white">
            {item.name}: {formatKg(item.firstKg)} → {formatKg(item.maxKg)}
            {gainPct > 0 ? <span className="text-primary"> +{gainPct}%</span> : null}
          </p>

          {result.locked ? (
            <button type="button" onClick={() => setShowUpsell(true)} className="relative block w-full overflow-hidden rounded-2xl">
              <svg viewBox="0 0 300 80" className="w-full blur-[3px]" aria-hidden>
                <polyline fill="none" stroke="#22c55e" strokeWidth="3" points="0,70 50,64 100,55 150,48 200,36 250,26 300,12" />
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-center">
                <Lock className="h-4 w-4 text-white/80" />
                <span className="text-xs font-semibold text-white">
                  {result.exercisesImproved > 1
                    ? `Você evoluiu em ${result.exercisesImproved} exercícios. Veja todos no Premium`
                    : "Veja o gráfico de cada exercício no Premium"}
                </span>
              </span>
            </button>
          ) : (
            <>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={item.points.map((p) => ({ date: shortDate(p.date), kg: p.kg }))} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                    <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      formatter={(value) => [`${value} kg`, "Carga"]}
                    />
                    <Line type="monotone" dataKey="kg" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: "#22c55e" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {result.items.length > 1 ? (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {/* Acesso rápido: os que mais evoluíram (+ o selecionado, se veio da busca). */}
                  {quickIndexes(result.items.length, selected).map((index) => (
                    <button
                      key={result.items[index]!.name}
                      type="button"
                      onClick={() => setSelected(index)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        index === selected ? "bg-primary/20 text-white" : "bg-white/[0.05] text-white/50"
                      }`}
                    >
                      {result.items[index]!.name}
                    </button>
                  ))}
                  {result.items.length > QUICK_CHIPS ? (
                    <button
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/75"
                    >
                      <Search className="h-3 w-3" />
                      Todos ({result.items.length})
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      {showUpsell ? <UpsellModal reason="load_evolution" onClose={() => setShowUpsell(false)} /> : null}
      {showPicker ? (
        <ExercisePicker
          items={result.items}
          selected={selected}
          onSelect={(index) => {
            setSelected(index);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </Card>
  );
}

const QUICK_CHIPS = 4;

function quickIndexes(total: number, selected: number) {
  const indexes = Array.from({ length: Math.min(total, QUICK_CHIPS) }, (_, i) => i);
  if (selected >= QUICK_CHIPS) indexes.unshift(selected);
  return indexes;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Lista com busca de todos os exercícios com carga registrada (ordem: maior ganho).
function ExercisePicker({
  items,
  selected,
  onSelect,
  onClose
}: {
  items: LoadEvolutionResponse["items"];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.map((item, index) => ({ item, index })).filter(({ item }) => !q || normalize(item.name).includes(q));
  }, [items, query]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-[var(--app-shell-max)] flex-col rounded-t-[30px] border-t border-primary/25 bg-[#0d0f0d] px-5 pb-[calc(1rem+var(--app-safe-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white">Escolha um exercício</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-white/45 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar exercício"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
        </label>
        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
          {filtered.length ? (
            filtered.map(({ item, index }) => {
              const gain = item.firstKg > 0 ? Math.round(((item.maxKg - item.firstKg) / item.firstKg) * 100) : 0;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onSelect(index)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                    index === selected ? "border-primary/40 bg-primary/10" : "border-white/[0.06] bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-[11px] text-white/45">
                      {formatKg(item.firstKg)} → {formatKg(item.maxKg)} · {item.sessions} {item.sessions === 1 ? "registro" : "registros"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${gain > 0 ? "text-primary" : "text-white/35"}`}>
                    {gain > 0 ? `+${gain}%` : "—"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="py-6 text-center text-sm text-white/45">Nenhum exercício encontrado.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} kg`;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
