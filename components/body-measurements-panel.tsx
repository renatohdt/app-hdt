"use client";

import clsx from "clsx";
import { HeartPulse, Plus, Ruler, Trash2, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card } from "@/components/ui";
import { parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { computeKarvonenZones } from "@/lib/heart-rate";

const PRIMARY = "#22c55e";

// Cores das zonas de FC: azul (leve) → verde → amarelo → laranja → vermelho (máximo).
const ZONE_COLORS: Record<string, string> = {
  recovery: "#3b82f6",
  fat_burn: "#22c55e",
  aerobic: "#eab308",
  anaerobic: "#f97316",
  maximal: "#ef4444"
};

// Uma linha do histórico de medições (espelha a API /api/measurements).
type Measurement = {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_pct: number | null;
  resting_hr: number | null;
  neck_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  forearm_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;
  notes: string | null;
  created_at: string;
};

type FieldKey =
  | "weight_kg" | "body_fat_pct" | "lean_mass_pct" | "resting_hr" | "neck_cm" | "chest_cm"
  | "waist_cm" | "hip_cm" | "arm_cm" | "forearm_cm" | "thigh_cm" | "calf_cm";

type FieldDef = {
  key: FieldKey;
  label: string;
  unit: string;
  // Quando true, uma queda no valor é "boa" (verde). Ex.: cintura, % gordura.
  lowerIsBetter?: boolean;
  hint?: string;
};

const FIELDS: FieldDef[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "body_fat_pct", label: "% Gordura", unit: "%", lowerIsBetter: true, hint: "Deixe em branco para estimarmos pelo método US Navy" },
  { key: "lean_mass_pct", label: "% Massa magra", unit: "%", hint: "Opcional — preencha se tiver bioimpedância" },
  { key: "resting_hr", label: "FC repouso", unit: "bpm", lowerIsBetter: true },
  { key: "neck_cm", label: "Pescoço", unit: "cm", hint: "Ajuda a estimar o % de gordura" },
  { key: "chest_cm", label: "Peito", unit: "cm" },
  { key: "waist_cm", label: "Cintura", unit: "cm", lowerIsBetter: true },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "arm_cm", label: "Braço", unit: "cm" },
  { key: "forearm_cm", label: "Antebraço", unit: "cm" },
  { key: "thigh_cm", label: "Coxa", unit: "cm" },
  { key: "calf_cm", label: "Panturrilha", unit: "cm" }
];

// Métricas em destaque no "snapshot" atual.
const SNAPSHOT_KEYS: FieldKey[] = ["weight_kg", "body_fat_pct", "waist_cm", "arm_cm"];

type FormState = Record<FieldKey, string> & { measured_at: string; notes: string };

function emptyForm(): FormState {
  const base = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<FieldKey, string>;
  return { ...base, measured_at: new Date().toISOString().slice(0, 10), notes: "" };
}

function formFromMeasurement(m: Measurement): FormState {
  const form = emptyForm();
  form.measured_at = m.measured_at;
  form.notes = m.notes ?? "";
  for (const f of FIELDS) {
    const value = m[f.key];
    form[f.key] = value == null ? "" : String(value);
  }
  return form;
}

export function BodyMeasurementsPanel({ age }: { age?: number | null }) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<FieldKey>("weight_kg");

  async function load() {
    try {
      const res = await fetchWithAuth("/api/measurements");
      const result = await parseJsonResponse<{ success: boolean; data?: { measurements: Measurement[] } }>(res);
      if (result.success && result.data) {
        setMeasurements(result.data.measurements);
      }
    } catch {
      // silencioso — mostra estado vazio
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(m: Measurement) {
    setForm(formFromMeasurement(m));
    setEditingId(m.id);
    setError(null);
    setShowForm(true);
  }

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving) return;
    // Precisa ter pelo menos um valor preenchido além da data.
    const hasValue = FIELDS.some((f) => form[f.key].trim() !== "");
    if (!hasValue) {
      setError("Preencha ao menos uma medida antes de salvar.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, string> = { measured_at: form.measured_at, notes: form.notes };
    for (const f of FIELDS) payload[f.key] = form[f.key].trim();

    try {
      const url = editingId ? `/api/measurements/${editingId}` : "/api/measurements";
      const res = await fetchWithAuth(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await parseJsonResponse<{ success: boolean; error?: string }>(res);
      if (!res.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível salvar.");
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/api/measurements/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMeasurements((current) => current.filter((m) => m.id !== id));
      }
    } catch {
      // silencioso
    } finally {
      setDeletingId(null);
    }
  }

  const latest = measurements.length ? measurements[measurements.length - 1] : null;
  const first = measurements.length ? measurements[0] : null;

  // Dados do gráfico para a métrica selecionada (só pontos preenchidos).
  const chartDef = FIELDS.find((f) => f.key === chartMetric)!;
  const chartData = measurements
    .filter((m) => typeof m[chartMetric] === "number")
    .map((m) => ({ date: shortDate(m.measured_at), value: m[chartMetric] as number }));

  // FC de repouso mais recente informada + zonas de Karvonen (usa a idade do perfil).
  const latestRestingHr = [...measurements].reverse().find((m) => m.resting_hr != null)?.resting_hr ?? null;
  const karvonen = computeKarvonenZones(age ?? null, latestRestingHr);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-white">Evolução corporal</p>
        </div>
        {!showForm && (
          <Button onClick={openNew} className="min-h-9 gap-1.5 px-3 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Registrar
          </Button>
        )}
      </div>

      {/* Snapshot atual + variação desde o 1º registro */}
      {latest && !showForm && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Hoje</p>
            <p className="text-[11px] text-white/45">{formatDate(latest.measured_at)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SNAPSHOT_KEYS.map((key) => {
              const def = FIELDS.find((f) => f.key === key)!;
              const value = latest[key];
              const start = first ? first[key] : null;
              const delta = typeof value === "number" && typeof start === "number" ? round1(value - start) : null;
              return (
                <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] text-white/45">{def.label}</p>
                  <p className="mt-1 text-lg font-semibold leading-none text-white">
                    {value == null ? "—" : `${value}`}
                    <span className="ml-0.5 text-[11px] font-normal text-white/40">{value == null ? "" : def.unit}</span>
                  </p>
                  {delta != null && delta !== 0 && (
                    <p className={clsx("mt-1 text-[11px] font-medium", deltaColor(delta, def.lowerIsBetter))}>
                      {delta > 0 ? "+" : ""}{delta} {def.unit}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {latest.lean_mass_pct != null && (
            <p className="mt-3 text-[11px] text-white/45">Massa magra: {latest.lean_mass_pct}%</p>
          )}
        </Card>
      )}

      {/* Gráfico de evolução */}
      {!showForm && measurements.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-white">Evolução</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setChartMetric(f.key)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                  chartMetric === f.key
                    ? "border-primary/40 bg-primary/12 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {chartData.length >= 2 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                    formatter={(value) => [`${value} ${chartDef.unit}`, chartDef.label]}
                  />
                  <Line type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2} dot={{ r: 3, fill: PRIMARY }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[12px] text-white/45">Registre pelo menos 2 medições com “{chartDef.label}” para ver o gráfico.</p>
          )}
        </Card>
      )}

      {/* Zona de treino (Karvonen) */}
      {!showForm && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-white">Zona de treino (FC)</p>
          </div>
          {karvonen ? (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-white/60">
                <span>FC máx: <span className="font-semibold text-white">{karvonen.maxHr} bpm</span></span>
                <span>FC repouso: <span className="font-semibold text-white">{karvonen.restingHr} bpm</span></span>
              </div>
              <div className="space-y-1.5">
                {karvonen.zones.map((z) => {
                  const color = ZONE_COLORS[z.key] ?? PRIMARY;
                  return (
                    <div
                      key={z.key}
                      className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <span className="flex items-center gap-2 text-[12px] text-white/70">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        {z.label} <span className="text-white/35">({Math.round(z.intensityLow * 100)}–{Math.round(z.intensityHigh * 100)}%)</span>
                      </span>
                      <span className="text-[12px] font-semibold" style={{ color }}>{z.bpmLow}–{z.bpmHigh} bpm</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] leading-tight text-white/35">
                Estimativa (Tanaka + Karvonen) para pessoas saudáveis. Medicações e condições cardíacas alteram esses valores — na dúvida, siga orientação médica.
              </p>
            </>
          ) : (
            <p className="text-[12px] text-white/45">
              {age
                ? "Registre sua FC de repouso numa medição para calcular suas zonas de treino."
                : "Informe sua data de nascimento em Minha Conta e registre a FC de repouso para calcular suas zonas."}
            </p>
          )}
        </Card>
      )}

      {/* Formulário de registrar/editar */}
      {showForm && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{editingId ? "Editar medição" : "Nova medição"}</p>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/50 transition hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-white/50">Data da coleta</p>
            <input
              type="date"
              value={form.measured_at}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => updateField("measured_at", e.target.value)}
              className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <p className="text-xs text-white/50">{f.label} <span className="text-white/30">({f.unit})</span></p>
                <input
                  type="number"
                  inputMode="decimal"
                  step={f.key === "resting_hr" ? "1" : "0.1"}
                  value={form[f.key]}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  placeholder="—"
                  className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition focus:border-primary"
                />
                {f.hint && <p className="text-[10px] leading-tight text-white/35">{f.hint}</p>}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-white/50">Observações</p>
            <input
              type="text"
              value={form.notes}
              maxLength={500}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Opcional"
              className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition focus:border-primary"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <p className="text-[10px] leading-tight text-white/35">
            O % de gordura estimado é uma aproximação e não substitui avaliação profissional.
          </p>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditingId(null); }} disabled={saving} className="min-h-11 flex-1 text-sm">
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="min-h-11 flex-1 text-sm">
              {saving ? "Salvando..." : "Salvar medição"}
            </Button>
          </div>
        </Card>
      )}

      {/* Histórico */}
      {!showForm && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Histórico</p>
          {loading ? (
            <Card className="p-4 text-sm text-white/50">Carregando...</Card>
          ) : measurements.length === 0 ? (
            <Card className="p-4 text-sm leading-6 text-white/54">
              Nenhuma medição ainda. Toque em “Registrar” para adicionar a primeira e acompanhar sua evolução.
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              {[...measurements].reverse().map((m, index, arr) => (
                <div
                  key={m.id}
                  className={clsx("flex items-center gap-3 px-4 py-3", index !== arr.length - 1 && "border-b border-white/8")}
                >
                  <button type="button" onClick={() => openEdit(m)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-white">{formatDate(m.measured_at)}</p>
                    <p className="mt-0.5 truncate text-xs text-white/46">{summarize(m)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    disabled={deletingId === m.id}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/40 transition hover:border-red-400/30 hover:text-red-400 disabled:opacity-40"
                    aria-label="Excluir medição"
                  >
                    {deletingId === m.id ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function deltaColor(delta: number, lowerIsBetter?: boolean): string {
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return good ? "text-primary" : "text-white/50";
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
  } catch {
    return iso;
  }
}

// Data curta (dd/mm) para o eixo X do gráfico.
function shortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T00:00:00`));
  } catch {
    return iso;
  }
}

function summarize(m: Measurement): string {
  const parts: string[] = [];
  if (m.weight_kg != null) parts.push(`${m.weight_kg} kg`);
  if (m.body_fat_pct != null) parts.push(`${m.body_fat_pct}% gord.`);
  if (m.waist_cm != null) parts.push(`cintura ${m.waist_cm} cm`);
  if (m.resting_hr != null) parts.push(`FC ${m.resting_hr}`);
  return parts.length ? parts.join(" · ") : "Sem dados";
}
