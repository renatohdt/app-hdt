"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Send, Users, Zap, Clock, CalendarClock, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

type Audience = "all" | "premium" | "inactive";
type Mode = "now" | "schedule";
type StatsState = { total: number | null; loading: boolean };
type SendResult = { sent: number; failed: number; total: number };
type ScheduledItem = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  scheduled_for: string;
  status: "pending" | "sent" | "canceled" | "error";
  result_sent: number | null;
  result_total: number | null;
};

const AUDIENCE_OPTIONS: { value: Audience; label: string; description: string; icon: typeof Users }[] = [
  { value: "all", label: "Todos os usuários", description: "Envia para todos que ativaram notificações", icon: Users },
  { value: "premium", label: "Somente Premium", description: "Apenas assinantes ativos do plano premium", icon: Zap },
  { value: "inactive", label: "Usuários inativos", description: "Quem não treina há 2 ou mais dias", icon: Clock }
];

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Todos",
  premium: "Premium",
  inactive: "Inativos"
};

const STATUS_LABEL: Record<ScheduledItem["status"], string> = {
  pending: "Agendada",
  sent: "Enviada",
  canceled: "Cancelada",
  error: "Erro"
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificacoesAdminPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [audience, setAudience] = useState<Audience>("all");
  const [mode, setMode] = useState<Mode>("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>({ total: null, loading: true });
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);

  useEffect(() => {
    fetch("/api/admin/push/stats")
      .then((res) => res.json())
      .then((data: { success: boolean; data?: { total: number } }) => {
        setStats({ total: data.success ? (data.data?.total ?? 0) : null, loading: false });
      })
      .catch(() => setStats({ total: null, loading: false }));
  }, []);

  const loadScheduled = useCallback(() => {
    fetch("/api/admin/push/schedule")
      .then((res) => res.json())
      .then((data: { success: boolean; data?: { items: ScheduledItem[] } }) => {
        if (data.success) setScheduled(data.data?.items ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadScheduled();
  }, [loadScheduled]);

  async function handleSubmit() {
    if (!title.trim() || !message.trim()) return;
    if (mode === "schedule" && !scheduledFor) {
      setError("Escolha a data e a hora do agendamento.");
      return;
    }

    setIsSending(true);
    setResult(null);
    setError(null);

    try {
      if (mode === "schedule") {
        const response = await fetch("/api/admin/push/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body: message,
            url,
            audience,
            scheduledFor: new Date(scheduledFor).toISOString()
          })
        });
        const data = (await response.json()) as { success: boolean; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error ?? "Erro ao agendar.");

        setTitle("");
        setMessage("");
        setScheduledFor("");
        loadScheduled();
      } else {
        const response = await fetch("/api/admin/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body: message, url, audience })
        });
        const data = (await response.json()) as { success: boolean; data?: SendResult; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error ?? "Erro ao enviar notificação.");

        setResult(data.data ?? { sent: 0, failed: 0, total: 0 });
        setTitle("");
        setMessage("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await fetch(`/api/admin/push/schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      loadScheduled();
    } catch {
      // silencioso
    }
  }

  const charCount = message.length;
  const isValid = title.trim().length > 0 && message.trim().length > 0 && (mode === "now" || scheduledFor.length > 0);
  const pending = scheduled.filter((s) => s.status === "pending");

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">Administração</p>
        <h1 className="text-[2.35rem] font-semibold tracking-tight text-white sm:text-[2.8rem]">Notificações Push</h1>
        <p className="text-sm text-white/54">Envie ou agende notificações para os dispositivos dos usuários.</p>
      </div>

      {/* Stat: usuários com notificações ativas */}
      <div className="flex items-center gap-4 rounded-[20px] border border-primary/20 bg-primary/[0.06] px-6 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/46">Usuários inscritos</p>
          {stats.loading ? (
            <p className="mt-0.5 text-2xl font-bold text-white/30">—</p>
          ) : stats.total === null ? (
            <p className="mt-0.5 text-sm text-red-400">Erro ao carregar</p>
          ) : (
            <p className="mt-0.5 text-2xl font-bold text-white">
              {stats.total.toLocaleString("pt-BR")}
              <span className="ml-2 text-sm font-normal text-white/46">
                {stats.total === 1 ? "usuário ativou notificações" : "usuários ativaram notificações"}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formulário */}
        <div className="space-y-4">
          <Card className="space-y-5 p-5">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-white">Composição da mensagem</h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Ex: Hora do treino! 💪"
                className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-primary/30"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Mensagem</label>
                <span className={`text-xs ${charCount > 140 ? "text-red-400" : "text-white/36"}`}>{charCount}/160</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Ex: Você não treina há 2 dias. Seu próximo treino está esperando."
                className="w-full resize-none rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-primary/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                URL de destino (ao tocar na notificação)
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/dashboard"
                className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-primary/30"
              />
            </div>
          </Card>

          {/* Quando enviar */}
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-white">Quando enviar</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "now" ? "border-primary/30 bg-primary/10 text-primary" : "border-white/8 bg-white/[0.02] text-white/60"
                }`}
              >
                <Send className="h-4 w-4" /> Agora
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "schedule" ? "border-primary/30 bg-primary/10 text-primary" : "border-white/8 bg-white/[0.02] text-white/60"
                }`}
              >
                <CalendarClock className="h-4 w-4" /> Agendar
              </button>
            </div>
            {mode === "schedule" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Data e hora</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none transition focus:border-primary/30 [color-scheme:dark]"
                />
              </div>
            )}
          </Card>

          {/* Audiência */}
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-white">Audiência</h2>
            <div className="space-y-2">
              {AUDIENCE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = audience === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAudience(option.value)}
                    className={`flex w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition ${
                      active ? "border-primary/30 bg-primary/10" : "border-white/8 bg-white/[0.02] hover:border-white/14"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-white/40"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${active ? "text-white" : "text-white/70"}`}>{option.label}</p>
                      <p className="text-xs text-white/40">{option.description}</p>
                    </div>
                    <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-white/20"}`} />
                  </button>
                );
              })}
            </div>
          </Card>

          <Button onClick={() => void handleSubmit()} disabled={!isValid || isSending} className="w-full">
            <span className="inline-flex items-center gap-2">
              {mode === "schedule" ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {isSending ? "Processando..." : mode === "schedule" ? "Agendar notificação" : "Enviar notificação"}
            </span>
          </Button>
        </div>

        {/* Preview + resultado + agendados */}
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-white">Preview</h2>
            <div className="rounded-[18px] border border-white/10 bg-[#1c1c1e] p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <img
                  src="/pwa/icon-72x72.png"
                  alt="ícone"
                  className="h-10 w-10 rounded-[12px]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white">{title || "Título da notificação"}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-white/60">{message || "Texto da mensagem aparece aqui."}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-white/30">app.horadotreino.com.br</p>
            </div>
          </Card>

          {result ? (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-white">Resultado do envio</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3 text-center">
                  <p className="text-2xl font-bold text-white">{result.total}</p>
                  <p className="mt-1 text-xs text-white/46">Total</p>
                </div>
                <div className="rounded-[14px] border border-primary/20 bg-primary/[0.07] p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{result.sent}</p>
                  <p className="mt-1 text-xs text-white/46">Enviados</p>
                </div>
                <div className="rounded-[14px] border border-red-500/20 bg-red-500/[0.06] p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{result.failed}</p>
                  <p className="mt-1 text-xs text-white/46">Falhas</p>
                </div>
              </div>
            </Card>
          ) : null}

          {error ? (
            <div className="rounded-[16px] border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {/* Agendadas */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-white">Agendadas ({pending.length})</h2>
            </div>
            {pending.length === 0 ? (
              <p className="text-xs text-white/40">Nenhuma notificação agendada.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs text-white/45">
                        {formatDateTime(item.scheduled_for)} · {AUDIENCE_LABEL[item.audience]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCancel(item.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 text-white/50 transition hover:border-red-500/30 hover:text-red-400"
                      aria-label="Cancelar agendamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
