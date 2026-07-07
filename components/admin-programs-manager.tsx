"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";

// ── Tipos ────────────────────────────────────────────────────────────────────

type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };

type ExerciseOption = { id: string; name: string };

type ProgramRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  goal: string;
  level: string;
  duration_weeks: number;
  sessions_per_week: number;
  fixed_profile: Record<string, unknown> | null;
  content: { weeks?: WeekDraft[] } | null;
  cover_image_url: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  stripe_price_id: string | null;
  access_days: number;
  status: "draft" | "published";
};

type ExerciseDraft = {
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
  rest_sec: number;
  block: string;
  notes: string;
};

type SessionDraft = {
  key: string;
  title: string;
  tip?: string;
  exercises: ExerciseDraft[];
};

type WeekDraft = {
  week: number;
  label: string;
  sessions: SessionDraft[];
};

type FormState = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  goal: string;
  level: string;
  duration_weeks: number;
  sessions_per_week: number;
  price_reais: string;
  compare_at_reais: string;
  access_days: number;
  stripe_price_id: string;
  cover_image_url: string;
  status: "draft" | "published";
  // Perfil fixo herdado pelo comprador
  pf_goal: string;
  pf_days: number;
  pf_time: number;
  pf_equipment: string;
  pf_location: string;
  pf_focus: string;
  // Conteúdo
  weeks: WeekDraft[];
};

// ── Constantes ───────────────────────────────────────────────────────────────

const BLOCK_OPTIONS = [
  "normal",
  "superset",
  "bi-set",
  "tri-set",
  "drop-set",
  "circuit",
  "mobility",
  "warmup",
];

const GOAL_OPTIONS = [
  { value: "fat_loss", label: "Emagrecimento" },
  { value: "hypertrophy", label: "Hipertrofia" },
  { value: "definition", label: "Definição" },
  { value: "conditioning", label: "Condicionamento" },
];

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-primary/40 focus:outline-none";
const labelClass = "block text-[12px] font-medium uppercase tracking-wide text-white/55 mb-1.5";

function emptyForm(): FormState {
  return {
    id: null,
    slug: "",
    title: "",
    description: "",
    goal: "fat_loss",
    level: "beginner",
    duration_weeks: 12,
    sessions_per_week: 4,
    price_reais: "99,90",
    compare_at_reais: "149,90",
    access_days: 90,
    stripe_price_id: "",
    cover_image_url: "",
    status: "draft",
    pf_goal: "lose_weight",
    pf_days: 4,
    pf_time: 45,
    pf_equipment: "nenhum",
    pf_location: "casa",
    pf_focus: "balanced",
    weeks: [],
  };
}

function nextSessionKey(count: number): string {
  return String.fromCharCode(65 + count); // 0 -> A, 1 -> B ...
}

function reaisToCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function centsToReais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AdminProgramsManager() {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [programsRes, exercisesRes] = await Promise.all([
        fetchWithAuth("/api/admin/programs"),
        fetchWithAuth("/api/admin/exercises"),
      ]);

      const programsJson = await parseJsonResponse<ApiEnvelope<ProgramRow[]>>(programsRes);
      if (!programsJson.success) throw new Error(programsJson.error ?? "Falha ao carregar programas.");
      setPrograms(programsJson.data ?? []);

      const exercisesJson = await parseJsonResponse<ApiEnvelope<ExerciseOption[]>>(exercisesRes);
      if (exercisesJson.success) {
        const list = (exercisesJson.data ?? []).map((e) => ({ id: e.id, name: e.name }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setExercises(list);
      }
    } catch (err) {
      setError(getRequestErrorMessage(err, "Não foi possível carregar os dados."));
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setStatus(null);
    setError(null);
    setForm(emptyForm());
  }

  function startEdit(program: ProgramRow) {
    setStatus(null);
    setError(null);
    const pf = program.fixed_profile ?? {};
    setForm({
      id: program.id,
      slug: program.slug,
      title: program.title,
      description: program.description ?? "",
      goal: program.goal,
      level: program.level,
      duration_weeks: program.duration_weeks,
      sessions_per_week: program.sessions_per_week,
      price_reais: centsToReais(program.price_cents),
      compare_at_reais: centsToReais(program.compare_at_cents),
      access_days: program.access_days,
      stripe_price_id: program.stripe_price_id ?? "",
      cover_image_url: program.cover_image_url ?? "",
      status: program.status,
      pf_goal: String(pf["goal"] ?? "lose_weight"),
      pf_days: Number(pf["days"] ?? 4),
      pf_time: Number(pf["time"] ?? 45),
      pf_equipment: Array.isArray(pf["equipment"]) ? (pf["equipment"] as string[]).join(", ") : String(pf["equipment"] ?? ""),
      pf_location: String(pf["location"] ?? "casa"),
      pf_focus: String(pf["focusRegion"] ?? "balanced"),
      weeks: Array.isArray(program.content?.weeks) ? (program.content!.weeks as WeekDraft[]) : [],
    });
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // ── Semanas ────────────────────────────────────────────────────────────────

  function addWeek() {
    setForm((prev) => {
      if (!prev) return prev;
      const week = prev.weeks.length + 1;
      return { ...prev, weeks: [...prev.weeks, { week, label: `Semana ${week}`, sessions: [] }] };
    });
  }

  function copyLastWeek() {
    setForm((prev) => {
      if (!prev || prev.weeks.length === 0) return prev;
      const last = prev.weeks[prev.weeks.length - 1];
      const week = prev.weeks.length + 1;
      const cloned: WeekDraft = {
        week,
        label: `Semana ${week}`,
        sessions: last.sessions.map((s) => ({
          key: s.key,
          title: s.title,
          tip: s.tip,
          exercises: s.exercises.map((e) => ({ ...e })),
        })),
      };
      return { ...prev, weeks: [...prev.weeks, cloned] };
    });
  }

  function removeWeek(weekIndex: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const weeks = prev.weeks.filter((_, i) => i !== weekIndex).map((w, i) => ({ ...w, week: i + 1 }));
      return { ...prev, weeks };
    });
  }

  function mutateWeek(weekIndex: number, mutate: (week: WeekDraft) => WeekDraft) {
    setForm((prev) => {
      if (!prev) return prev;
      const weeks = prev.weeks.map((w, i) => (i === weekIndex ? mutate(w) : w));
      return { ...prev, weeks };
    });
  }

  function addSession(weekIndex: number) {
    mutateWeek(weekIndex, (w) => ({
      ...w,
      sessions: [...w.sessions, { key: nextSessionKey(w.sessions.length), title: `Treino ${nextSessionKey(w.sessions.length)}`, exercises: [] }],
    }));
  }

  function removeSession(weekIndex: number, sessionIndex: number) {
    mutateWeek(weekIndex, (w) => ({ ...w, sessions: w.sessions.filter((_, i) => i !== sessionIndex) }));
  }

  function mutateSession(weekIndex: number, sessionIndex: number, mutate: (s: SessionDraft) => SessionDraft) {
    mutateWeek(weekIndex, (w) => ({
      ...w,
      sessions: w.sessions.map((s, i) => (i === sessionIndex ? mutate(s) : s)),
    }));
  }

  function addExercise(weekIndex: number, sessionIndex: number) {
    mutateSession(weekIndex, sessionIndex, (s) => ({
      ...s,
      exercises: [
        ...s.exercises,
        { exercise_id: "", name: "", sets: 3, reps: "12", rest_sec: 60, block: "normal", notes: "" },
      ],
    }));
  }

  function removeExercise(weekIndex: number, sessionIndex: number, exIndex: number) {
    mutateSession(weekIndex, sessionIndex, (s) => ({ ...s, exercises: s.exercises.filter((_, i) => i !== exIndex) }));
  }

  function updateExercise(weekIndex: number, sessionIndex: number, exIndex: number, patch: Partial<ExerciseDraft>) {
    mutateSession(weekIndex, sessionIndex, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i === exIndex ? { ...e, ...patch } : e)),
    }));
  }

  // ── Salvar ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const payload = {
        id: form.id ?? undefined,
        slug: form.slug,
        title: form.title,
        description: form.description,
        goal: form.goal,
        level: form.level,
        duration_weeks: form.duration_weeks,
        sessions_per_week: form.sessions_per_week,
        price_cents: reaisToCents(form.price_reais),
        compare_at_cents: form.compare_at_reais.trim() ? reaisToCents(form.compare_at_reais) : null,
        access_days: form.access_days,
        stripe_price_id: form.stripe_price_id.trim() || null,
        cover_image_url: form.cover_image_url.trim() || null,
        status: form.status,
        fixed_profile: {
          goal: form.pf_goal,
          days: form.pf_days,
          time: form.pf_time,
          equipment: form.pf_equipment.split(",").map((s) => s.trim()).filter(Boolean),
          location: form.pf_location,
          focusRegion: form.pf_focus,
        },
        content: { weeks: form.weeks },
      };

      const res = await fetchWithAuth("/api/admin/programs", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await parseJsonResponse<ApiEnvelope<ProgramRow>>(res);
      if (!json.success) throw new Error(json.error ?? "Não foi possível salvar.");

      setStatus("Programa salvo com sucesso.");
      await loadAll();
      if (json.data) startEdit(json.data);
    } catch (err) {
      setError(getRequestErrorMessage(err, "Não foi possível salvar o programa."));
    } finally {
      setSaving(false);
    }
  }

  const totalSessions = useMemo(
    () => (form ? form.weeks.reduce((acc, w) => acc + w.sessions.length, 0) : 0),
    [form]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <Card className="p-6 text-white/70">Carregando programas...</Card>;
  }

  return (
    <div className="space-y-6">
      {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</Card>}
      {status && <Card className="border-primary/30 bg-primary/10 p-4 text-sm text-primary">{status}</Card>}

      {!form && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">{programs.length} programa(s) cadastrado(s)</p>
            <Button onClick={startNew}>+ Novo programa</Button>
          </div>

          <div className="grid gap-3">
            {programs.map((program) => (
              <Card key={program.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{program.title}</p>
                  <p className="truncate text-xs text-white/50">
                    {program.slug} · {program.duration_weeks} semanas · R$ {centsToReais(program.price_cents)} ·{" "}
                    <span className={program.status === "published" ? "text-primary" : "text-white/50"}>
                      {program.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </p>
                </div>
                <Button variant="secondary" onClick={() => startEdit(program)}>
                  Editar
                </Button>
              </Card>
            ))}
            {programs.length === 0 && (
              <Card className="p-6 text-sm text-white/55">Nenhum programa ainda. Clique em "Novo programa".</Card>
            )}
          </div>
        </div>
      )}

      {form && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setForm(null)}>
              ← Voltar para a lista
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>

          {/* Dados do programa */}
          <Card className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">Dados do programa</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Título</label>
                <input className={inputClass} value={form.title} onChange={(e) => updateForm("title", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Slug (identificador)</label>
                <input className={inputClass} value={form.slug} onChange={(e) => updateForm("slug", e.target.value)} placeholder="emagrecimento-12-semanas" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Descrição</label>
                <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => updateForm("description", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Objetivo</label>
                <select className={inputClass} value={form.goal} onChange={(e) => updateForm("goal", e.target.value)}>
                  {GOAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Nível</label>
                <select className={inputClass} value={form.level} onChange={(e) => updateForm("level", e.target.value)}>
                  <option value="beginner">Iniciante</option>
                  <option value="intermediate">Intermediário</option>
                  <option value="advanced">Avançado</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Duração (semanas)</label>
                <input type="number" className={inputClass} value={form.duration_weeks} onChange={(e) => updateForm("duration_weeks", Number(e.target.value))} />
              </div>
              <div>
                <label className={labelClass}>Treinos por semana</label>
                <input type="number" className={inputClass} value={form.sessions_per_week} onChange={(e) => updateForm("sessions_per_week", Number(e.target.value))} />
              </div>
              <div>
                <label className={labelClass}>Preço (R$)</label>
                <input className={inputClass} value={form.price_reais} onChange={(e) => updateForm("price_reais", e.target.value)} placeholder="99,90" />
              </div>
              <div>
                <label className={labelClass}>Preço "de" (R$, opcional)</label>
                <input className={inputClass} value={form.compare_at_reais} onChange={(e) => updateForm("compare_at_reais", e.target.value)} placeholder="149,90" />
              </div>
              <div>
                <label className={labelClass}>Dias de acesso</label>
                <input type="number" className={inputClass} value={form.access_days} onChange={(e) => updateForm("access_days", Number(e.target.value))} />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={form.status} onChange={(e) => updateForm("status", e.target.value as "draft" | "published")}>
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Imagem de capa (URL)</label>
                <input
                  className={inputClass}
                  value={form.cover_image_url}
                  onChange={(e) => updateForm("cover_image_url", e.target.value)}
                  placeholder="https://..."
                />
                {form.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.cover_image_url} alt="Capa" className="mt-2 h-32 w-full rounded-xl object-cover" />
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Stripe Price ID (opcional)</label>
                <input className={inputClass} value={form.stripe_price_id} onChange={(e) => updateForm("stripe_price_id", e.target.value)} placeholder="price_..." />
              </div>
            </div>
          </Card>

          {/* Perfil fixo */}
          <Card className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">Perfil fixo do comprador</h3>
            <p className="text-xs text-white/50">Aplicado automaticamente a quem compra (sem questionário longo).</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Objetivo (perfil)</label>
                <select className={inputClass} value={form.pf_goal} onChange={(e) => updateForm("pf_goal", e.target.value)}>
                  <option value="lose_weight">Emagrecer</option>
                  <option value="gain_muscle">Ganhar músculo</option>
                  <option value="body_recomposition">Recomposição</option>
                  <option value="improve_conditioning">Condicionamento</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Dias/semana</label>
                <input type="number" className={inputClass} value={form.pf_days} onChange={(e) => updateForm("pf_days", Number(e.target.value))} />
              </div>
              <div>
                <label className={labelClass}>Tempo (min)</label>
                <input type="number" className={inputClass} value={form.pf_time} onChange={(e) => updateForm("pf_time", Number(e.target.value))} />
              </div>
              <div>
                <label className={labelClass}>Local</label>
                <select className={inputClass} value={form.pf_location} onChange={(e) => updateForm("pf_location", e.target.value)}>
                  <option value="casa">Casa</option>
                  <option value="academia">Academia</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Foco</label>
                <input className={inputClass} value={form.pf_focus} onChange={(e) => updateForm("pf_focus", e.target.value)} placeholder="balanced" />
              </div>
              <div>
                <label className={labelClass}>Equipamentos (separe por vírgula)</label>
                <input className={inputClass} value={form.pf_equipment} onChange={(e) => updateForm("pf_equipment", e.target.value)} placeholder="nenhum" />
              </div>
            </div>
          </Card>

          {/* Construtor de semanas */}
          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Semanas e treinos</h3>
                <p className="text-xs text-white/50">{form.weeks.length} semana(s) · {totalSessions} treino(s) no total</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addWeek}>+ Adicionar semana</Button>
                <Button variant="secondary" onClick={copyLastWeek} disabled={form.weeks.length === 0}>
                  Copiar semana anterior
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {form.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <input
                      className={inputClass + " max-w-xs"}
                      value={week.label}
                      onChange={(e) => mutateWeek(weekIndex, (w) => ({ ...w, label: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => addSession(weekIndex)}>+ Treino</Button>
                      <Button variant="ghost" onClick={() => removeWeek(weekIndex)} className="text-red-300">Remover semana</Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {week.sessions.map((session, sessionIndex) => (
                      <div key={sessionIndex} className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            className={inputClass + " max-w-sm"}
                            value={session.title}
                            onChange={(e) => mutateSession(weekIndex, sessionIndex, (s) => ({ ...s, title: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => addExercise(weekIndex, sessionIndex)}>+ Exercício</Button>
                            <Button variant="ghost" onClick={() => removeSession(weekIndex, sessionIndex)} className="text-red-300">Remover</Button>
                          </div>
                        </div>

                        <textarea
                          className={inputClass + " mt-2"}
                          rows={2}
                          placeholder="Dica do treinador para este treino (opcional) — aparece para o aluno"
                          value={session.tip ?? ""}
                          onChange={(e) => mutateSession(weekIndex, sessionIndex, (s) => ({ ...s, tip: e.target.value }))}
                        />

                        <div className="mt-3 space-y-2">
                          {session.exercises.map((ex, exIndex) => (
                            <div key={exIndex} className="grid gap-2 rounded-lg border border-white/8 p-2 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
                              <select
                                className={inputClass}
                                value={ex.exercise_id}
                                onChange={(e) => {
                                  const picked = exercises.find((o) => o.id === e.target.value);
                                  updateExercise(weekIndex, sessionIndex, exIndex, {
                                    exercise_id: e.target.value,
                                    name: picked?.name ?? "",
                                  });
                                }}
                              >
                                <option value="">Selecione o exercício</option>
                                {exercises.map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </select>
                              <input type="number" className={inputClass} value={ex.sets} title="Séries" onChange={(e) => updateExercise(weekIndex, sessionIndex, exIndex, { sets: Number(e.target.value) })} />
                              <input className={inputClass} value={ex.reps} title="Repetições" onChange={(e) => updateExercise(weekIndex, sessionIndex, exIndex, { reps: e.target.value })} />
                              <input type="number" className={inputClass} value={ex.rest_sec} title="Descanso (s)" onChange={(e) => updateExercise(weekIndex, sessionIndex, exIndex, { rest_sec: Number(e.target.value) })} />
                              <select className={inputClass} value={ex.block} title="Tipo de bloco" onChange={(e) => updateExercise(weekIndex, sessionIndex, exIndex, { block: e.target.value })}>
                                {BLOCK_OPTIONS.map((b) => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                              </select>
                              <Button variant="ghost" onClick={() => removeExercise(weekIndex, sessionIndex, exIndex)} className="text-red-300">✕</Button>
                            </div>
                          ))}
                          {session.exercises.length === 0 && (
                            <p className="text-xs text-white/40">Nenhum exercício. Clique em "+ Exercício".</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {week.sessions.length === 0 && (
                      <p className="text-xs text-white/40">Nenhum treino nesta semana. Clique em "+ Treino".</p>
                    )}
                  </div>
                </div>
              ))}
              {form.weeks.length === 0 && (
                <p className="text-sm text-white/55">Nenhuma semana ainda. Clique em "Adicionar semana" para começar.</p>
              )}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar programa"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
