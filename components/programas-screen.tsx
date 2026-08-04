"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { BrandFooter } from "@/components/brand-footer";
import { Button, Card, Container, PageShell, SectionTitle } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics-client";
import { useIsNativeApp } from "@/lib/is-native-app";

type PublicProgram = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  goal: string;
  level: string;
  duration_weeks: number;
  sessions_per_week: number;
  price_cents: number;
  compare_at_cents: number | null;
  cover_image_url: string | null;
};

type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProgramasScreen() {
  const router = useRouter();
  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingSlug, setBuyingSlug] = useState<string | null>(null);
  const isNative = useIsNativeApp();
  const [interestedSlugs, setInterestedSlugs] = useState<string[]>([]);
  // null = ainda verificando; true = logado (mostra menu do app); false = deslogado (rodapé limpo).
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/public/programs");
        const json = await parseJsonResponse<ApiEnvelope<PublicProgram[]>>(res);
        if (!json.success) throw new Error(json.error ?? "Falha ao carregar.");
        if (active) setPrograms(json.data ?? []);
      } catch (err) {
        if (active) setError(getRequestErrorMessage(err, "Não foi possível carregar os programas."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Descobre se o visitante está logado (define qual rodapé mostrar).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) setIsLoggedIn(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (active) setIsLoggedIn(Boolean(data.session));
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleInterest(slug: string) {
    trackEvent("program_interest", null, { slug });
    setInterestedSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
  }

  async function handleBuy(slug: string) {
    setBuyingSlug(slug);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/stripe/program-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      if (res.status === 401) {
        // Não está logado: leva ao cadastro enxuto, que já segue para o checkout.
        router.push(`/criar-conta-programa?program=${encodeURIComponent(slug)}`);
        return;
      }

      const json = await parseJsonResponse<ApiEnvelope<{ url: string }>>(res);
      if (!json.success || !json.data?.url) {
        throw new Error(json.error ?? "Não foi possível iniciar a compra.");
      }

      window.location.href = json.data.url;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Não foi possível iniciar a compra."));
      setBuyingSlug(null);
    }
  }

  return (
    <PageShell
      className={`relative overflow-x-hidden px-4 pt-8 sm:px-6 ${
        isLoggedIn ? "pb-[var(--app-nav-offset)]" : "pb-10"
      }`}
    >
      <Container className="max-w-xl space-y-6">
      <SectionTitle
        eyebrow="Programas"
        title="Programas de treino"
        description="Programas completos montados pelo Renato. Acesso por 3 meses, com o app completo incluso no período."
      />

      {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</Card>}

      {loading ? (
        <Card className="p-6 text-white/70">Carregando programas...</Card>
      ) : programs.length === 0 ? (
        <Card className="p-6 text-sm text-white/60">Nenhum programa disponível no momento.</Card>
      ) : (
        <div className="grid gap-4">
          {programs.map((program) => (
            <Card key={program.id} className="overflow-hidden p-0">
              {program.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={program.cover_image_url} alt={program.title} className="h-40 w-full object-cover" />
              )}
              <div className="space-y-3 p-5">
                <h3 className="text-lg font-semibold text-white">{program.title}</h3>
                {program.description && <p className="text-sm text-white/60">{program.description}</p>}
                <p className="text-xs text-white/45">
                  {program.duration_weeks} semanas · {program.sessions_per_week}x por semana
                </p>
                {isNative ? (
                  interestedSlugs.includes(program.slug) ? (
                    <p className="text-sm font-semibold text-primary">
                      Interesse registrado! ✨ Enviaremos novidades por e-mail.
                    </p>
                  ) : (
                    <Button onClick={() => handleInterest(program.slug)} className="w-full">
                      Tenho interesse
                    </Button>
                  )
                ) : (
                  <>
                    <div className="flex items-end gap-2">
                      {program.compare_at_cents && program.compare_at_cents > program.price_cents && (
                        <span className="text-sm text-white/40 line-through">{formatBRL(program.compare_at_cents)}</span>
                      )}
                      <span className="text-2xl font-bold text-primary">{formatBRL(program.price_cents)}</span>
                    </div>
                    <Button
                      onClick={() => handleBuy(program.slug)}
                      disabled={buyingSlug === program.slug}
                      className="w-full"
                    >
                      {buyingSlug === program.slug ? "Redirecionando..." : "Comprar programa"}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

        {isLoggedIn === false ? <BrandFooter className="mt-10 pb-4" /> : null}
      </Container>

      {isLoggedIn ? <AppBottomNav /> : null}
    </PageShell>
  );
}
