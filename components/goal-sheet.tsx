"use client";

// Gaveta "Criar meta": opções prontas pelo ritmo do plano (1 toque) ou
// personalizada (até 365 treinos em até 365 dias — metas de começo de ano).
// Usada na Home (card Sua semana) e na Evolução > Progresso.

import { useMemo, useState } from "react";
import { Loader2, Target, X } from "lucide-react";
import clsx from "clsx";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import type { ActiveGoalShape } from "@/components/goal-card";

type Preset = { id: string; title: string; target: number; days: number; tag?: string };

const MAX_VALUE = 365;
const QUICK_DAYS = [30, 90, 180, 365];

function buildPresets(weeklyTarget: number, now = new Date()): Preset[] {
  const perWeek = Math.min(Math.max(Math.round(weeklyTarget) || 3, 1), 7);
  const presets: Preset[] = [
    { id: "rhythm", title: "Seguir meu ritmo", target: perWeek * 4, days: 30, tag: "Recomendado" },
    { id: "challenge", title: "Desafio do mês", target: Math.min(perWeek + 1, 7) * 4, days: 30 },
    { id: "quarter", title: "Projeto 90 dias", target: perWeek * 12, days: 90 },
    { id: "year", title: "Meta do ano", target: Math.min(perWeek * 48, MAX_VALUE), days: 365 }
  ];
  // Janeiro: a meta do ano vira a primeira opção (época de metas de ano novo).
  if (now.getMonth() === 0) {
    const year = presets.pop()!;
    presets.unshift({ ...year, tag: "Ano novo" });
    presets[1] = { ...presets[1], tag: undefined };
  }
  return presets;
}

export function GoalSheet({
  weeklyTarget,
  onClose,
  onCreated
}: {
  weeklyTarget: number;
  onClose: () => void;
  onCreated: (goal: NonNullable<ActiveGoalShape>) => void;
}) {
  const presets = useMemo(() => buildPresets(weeklyTarget), [weeklyTarget]);
  const [selected, setSelected] = useState<string>(presets[0].id);
  const [customTarget, setCustomTarget] = useState("");
  const [customDays, setCustomDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = selected === "custom";
  const chosen = isCustom
    ? { target: Number(customTarget), days: Number(customDays) }
    : (() => {
        const preset = presets.find((p) => p.id === selected) ?? presets[0];
        return { target: preset.target, days: preset.days };
      })();
  const isValid =
    Number.isInteger(chosen.target) &&
    Number.isInteger(chosen.days) &&
    chosen.target >= 1 &&
    chosen.target <= MAX_VALUE &&
    chosen.days >= 1 &&
    chosen.days <= MAX_VALUE;

  async function handleCreate() {
    if (!isValid) {
      setError(`Escolha entre 1 e ${MAX_VALUE} treinos e entre 1 e ${MAX_VALUE} dias.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: chosen.target, periodDays: chosen.days })
      });
      const json = (await res.json()) as { success?: boolean; data?: NonNullable<ActiveGoalShape>; error?: string };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? "Não foi possível criar a meta.");
      invalidateWorkoutCache();
      onCreated(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#0f0f0f] px-5 pb-[calc(1.25rem+var(--app-safe-bottom,0px))] pt-4 shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/12 text-primary">
              <Target className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-semibold text-white">Criar meta</p>
              <p className="text-xs text-white/50">Quantos treinos e em quanto tempo?</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {presets.map((preset) => (
            <OptionRow
              key={preset.id}
              active={selected === preset.id}
              onClick={() => setSelected(preset.id)}
              title={preset.title}
              tag={preset.tag}
              detail={`${preset.target} treinos em ${formatDays(preset.days)}`}
            />
          ))}
          <OptionRow
            active={isCustom}
            onClick={() => setSelected("custom")}
            title="Personalizar"
            detail="Você escolhe (até 365 dias)"
          />
        </div>

        {isCustom ? (
          <div className="mt-3 space-y-3 rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Treinos" value={customTarget} onChange={setCustomTarget} placeholder="12" />
              <NumberField label="Dias" value={customDays} onChange={setCustomDays} placeholder="30" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCustomDays(String(days))}
                  className={clsx(
                    "min-h-8 rounded-full border px-3 text-xs font-semibold transition",
                    customDays === String(days)
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-white/10 bg-white/[0.03] text-white/55"
                  )}
                >
                  {formatDays(days)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-semibold text-[#041a0b] transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving
            ? "Criando..."
            : isValid
              ? `Criar meta: ${chosen.target} treinos em ${formatDays(chosen.days)}`
              : "Criar meta"}
        </button>
      </div>
    </div>
  );
}

function OptionRow({
  active,
  onClick,
  title,
  detail,
  tag
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] border px-4 py-2.5 text-left transition",
        active ? "border-primary/45 bg-primary/[0.09]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          {title}
          {tag ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
              {tag}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-white/50">{detail}</p>
      </div>
      <span
        className={clsx(
          "h-5 w-5 shrink-0 rounded-full border-2 transition",
          active ? "border-primary bg-primary shadow-[inset_0_0_0_3px_#0f0f0f]" : "border-white/20"
        )}
      />
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_VALUE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-base font-semibold text-white outline-none focus:border-primary/40"
      />
    </label>
  );
}

function formatDays(days: number) {
  if (days === 365) return "1 ano";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}
